import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { QdrantClient } from "@qdrant/js-client-rest";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");

dotenv.config({ path: join(projectRoot, ".env.local") });

const COLLECTION = "noorpath_tafsir";
const VECTOR_SIZE = 384;
const MODEL = "sentence-transformers/all-MiniLM-L6-v2";
// Without the explicit task suffix, this model defaults to sentence-similarity
// and returns scores rather than the 384-dimension feature-extraction vectors.
const HF_ENDPOINT = `https://router.huggingface.co/hf-inference/models/${MODEL}/pipeline/feature-extraction`;
const EMBED_BATCH_SIZE = Number(process.env.EMBED_BATCH_SIZE ?? 8);
const UPSERT_BATCH_SIZE = Number(process.env.UPSERT_BATCH_SIZE ?? 64);

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Add it to .env.local.`);
  return value;
}

function ayahRange(start, end) {
  return start === end ? String(start) : `${start}-${end}`;
}

// Qdrant point IDs must be integers or UUIDs. The payload keeps the readable ID.
function pointId(chunkId) {
  const bytes = createHash("sha256").update(chunkId).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function makeChunk(surah, records, quranAyahs) {
  const start = records[0].ayah;
  const end = records.at(-1).ayah;
  const range = ayahRange(start, end);
  const sourceAyahs = records.map(({ ayah }) => {
    const source = quranAyahs.get(`${surah}:${ayah}`);
    if (!source) throw new Error(`No Quran text found for ${surah}:${ayah}.`);
    return source;
  });

  return {
    id: `${surah}:${range}`,
    surah,
    ayahRange: range,
    arabic: sourceAyahs.map(({ arabic }) => arabic),
    translation: sourceAyahs.map(({ translations }) => translations.en),
    tafsir: records[0].tafsir,
  };
}

/**
 * Groups only adjacent ayahs with byte-for-byte identical tafsir text.
 * A missing ayah or a different text always ends the current chunk.
 */
export function groupConsecutiveTafsir(surah, tafsirByAyah, quranAyahs) {
  const entries = Object.entries(tafsirByAyah)
    .map(([ayah, record]) => ({ ayah: Number(ayah), ...record }))
    .sort((a, b) => a.ayah - b.ayah);

  const chunks = [];
  let current = [];

  for (const entry of entries) {
    if (!entry.tafsir?.trim()) {
      if (current.length) chunks.push(makeChunk(surah, current, quranAyahs));
      current = [];
      continue;
    }

    const previous = current.at(-1);
    const continuesCurrentChunk =
      previous && entry.ayah === previous.ayah + 1 && entry.tafsir === previous.tafsir;

    if (current.length && !continuesCurrentChunk) {
      chunks.push(makeChunk(surah, current, quranAyahs));
      current = [];
    }
    current.push(entry);
  }

  if (current.length) chunks.push(makeChunk(surah, current, quranAyahs));
  return chunks;
}

async function loadChunks() {
  const quran = JSON.parse(await readFile(join(projectRoot, "data", "quran.json"), "utf8"));
  const quranAyahs = new Map(quran.ayahs.map((ayah) => [ayah.id, ayah]));
  const tafsirDirectory = join(projectRoot, "data", "tafsir");
  const files = (await readdir(tafsirDirectory))
    .filter((file) => extname(file) === ".json")
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

  const chunks = [];
  for (const file of files) {
    const surah = Number.parseInt(file, 10);
    const tafsirByAyah = JSON.parse(await readFile(join(tafsirDirectory, file), "utf8"));
    chunks.push(...groupConsecutiveTafsir(surah, tafsirByAyah, quranAyahs));
  }
  return chunks;
}

function batches(items, size) {
  if (!Number.isInteger(size) || size < 1) throw new Error("Batch sizes must be positive integers.");
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

async function embed(texts, token) {
  const response = await fetch(HF_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: texts }),
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(`Hugging Face embedding request failed (${response.status}): ${JSON.stringify(body)}`);
  }

  const vectors = Array.isArray(body?.[0]) ? body : [body];
  if (vectors.length !== texts.length || vectors.some((vector) => vector?.length !== VECTOR_SIZE)) {
    throw new Error(`Expected ${texts.length} ${VECTOR_SIZE}-dimension embeddings from ${MODEL}.`);
  }
  return vectors;
}

async function ensureCollection(client) {
  const { collections } = await client.getCollections();
  if (!collections.some(({ name }) => name === COLLECTION)) {
    await client.createCollection(COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: "Cosine" },
    });
  }
  await client.createPayloadIndex(COLLECTION, {
    field_name: "surah",
    field_schema: "integer",
    wait: true
  });
}

async function main() {
  const token = requiredEnvironment("HF_TOKEN");
  const client = new QdrantClient({
    url: process.env.QDRANT_URL ?? "http://localhost:6333",
    apiKey: process.env.QDRANT_API_KEY,
  });
  const chunks = await loadChunks();
  await ensureCollection(client);

  console.log(`Embedding and upserting ${chunks.length} tafsir chunks into ${COLLECTION}...`);
  let completed = 0;
  for (const chunkBatch of batches(chunks, EMBED_BATCH_SIZE)) {
    const vectors = await embed(chunkBatch.map(({ tafsir }) => tafsir), token);
    const points = chunkBatch.map((chunk, index) => ({
      id: pointId(chunk.id),
      vector: vectors[index],
      payload: chunk,
    }));

    for (const pointBatch of batches(points, UPSERT_BATCH_SIZE)) {
      await client.upsert(COLLECTION, { wait: true, points: pointBatch });
    }
    completed += chunkBatch.length;
    console.log(`Upserted ${completed}/${chunks.length} chunks.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
