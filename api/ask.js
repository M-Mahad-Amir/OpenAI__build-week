import { QdrantClient } from "@qdrant/js-client-rest";

const COLLECTION = "noorpath_tafsir";
const MODEL = "sentence-transformers/all-MiniLM-L6-v2";
const VECTOR_SIZE = 384;
const HF_ENDPOINT = `https://router.huggingface.co/hf-inference/models/${MODEL}/pipeline/feature-extraction`;
const GEMINI_MODEL = "gemini-3.5-flash";

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured on the server.`);
  return value;
}

function rangeContainsAny(ayahRange, ayahs) {
  const [start, end = start] = String(ayahRange).split("-").map(Number);
  return ayahs.some(ayah => ayah >= start && ayah <= end);
}

async function embedQuery(text, token) {
  const response = await fetch(HF_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ inputs: [text] })
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(`Embedding request failed (${response.status}).`);

  const vector = Array.isArray(body?.[0]) ? body[0] : body;
  if (!Array.isArray(vector) || vector.length !== VECTOR_SIZE) {
    throw new Error("Embedding service returned an unexpected vector.");
  }
  return vector;
}

async function retrieve(question, scope) {
  const qdrant = new QdrantClient({
    url: requiredEnvironment("QDRANT_URL"),
    apiKey: requiredEnvironment("QDRANT_API_KEY")
  });
  const vector = await embedQuery(question, requiredEnvironment("HF_TOKEN"));
  const surahId = Number(scope?.surahId);
  const ayahs = Array.isArray(scope?.ayahs) ? scope.ayahs.map(Number).filter(Number.isInteger) : [];
  const surahFilter = Number.isInteger(surahId)
    ? { key: "surah", match: { value: surahId } }
    : null;
  let filter = surahFilter ? { must: [surahFilter] } : undefined;

  // ayahRange is stored as a compact string, so first resolve the active ruku's
  // point IDs and then let Qdrant rank only those chunks semantically.
  if (surahFilter && ayahs.length) {
    const { points } = await qdrant.scroll(COLLECTION, {
      filter: { must: [surahFilter] },
      limit: 300,
      with_payload: true,
      with_vector: false
    });
    const scopedIds = points
      .filter(point => rangeContainsAny(point.payload?.ayahRange, ayahs))
      .map(point => point.id);
    if (!scopedIds.length) return [];
    filter = { must: [surahFilter, { has_id: scopedIds }] };
  }

  const matches = await qdrant.search(COLLECTION, {
    vector,
    limit: 5,
    with_payload: true,
    filter
  });

  return matches.map(match => ({
    arabic: match.payload.arabic,
    translation: match.payload.translation,
    tafsir: match.payload.tafsir,
    source: {
      surah: match.payload.surah,
      ayahRange: match.payload.ayahRange
    }
  }));
}

function promptFor(mode, question, sources) {
  const excerpts = sources.map(({ arabic, translation, tafsir, source }) => {
    const ayahText = Array.isArray(arabic)
      ? arabic.map((text, index) => `${text}\n${translation?.[index] || ""}`).join("\n")
      : "";
    return `[Surah ${source.surah}, ayahs ${source.ayahRange}]\nAyah text:\n${ayahText}\n\nTafsir:\n${tafsir}`;
  }).join("\n\n");
  const rules = `Use only the retrieved tafsir excerpts below. If they do not support an answer, say so plainly. Do not add uncited historical claims, legal rulings, or sectarian conclusions. This is supplementary study material, not a replacement for verified tafsir.`;

  if (mode === "summary") {
    return `${rules}\n\nReturn exactly JSON: {"background":"...","summary":"..."}.\n\nRequest: ${question}\n\nRetrieved tafsir:\n${excerpts}`;
  }
  if (mode === "quiz") {
    return `${rules}\n\nReturn exactly a JSON array of five objects: {"q":"Question","a":"Correct choice","choices":["A","B","C","D"]}. Each question must have four choices and exactly one correct answer.\n\nRequest: ${question}\n\nRetrieved tafsir:\n${excerpts}`;
  }
  return `${rules}\n\nQuestion: ${question}\n\nRetrieved tafsir:\n${excerpts}`;
}

async function generate(prompt, json) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": requiredEnvironment("GEMINI_API_KEY"),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: json ? { responseMimeType: "application/json" } : undefined
      })
    }
  );
  const body = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
  const text = body?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned no answer.");
  return json ? JSON.parse(text) : text;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const { mode = "question", question, scope } = req.body || {};
  if (!['summary', 'quiz', 'question'].includes(mode) || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "A mode and question are required." });
  }

  try {
    const sources = await retrieve(question.trim(), scope);
    if (!sources.length) return res.status(404).json({ error: "No matching tafsir sources were found." });
    const result = await generate(promptFor(mode, question.trim(), sources), mode !== "question");
    return res.status(200).json({ answer: result, sources: sources.map(({ source }) => source) });
  } catch (error) {
    console.error("/api/ask failed:", error);
    return res.status(500).json({ error: "The AI study service could not complete that request." });
  }
}
