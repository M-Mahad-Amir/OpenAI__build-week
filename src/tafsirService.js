// Lazy-loads per-surah tafsir from data/tafsir/<surahId>.json.
// Schema: { "<ayahNumber>": { ruku: <numberInSurah>, tafsir: "<text>" }, ... }
const cache = new Map();

async function loadSurahTafsir(surahId) {
  if (cache.has(surahId)) return cache.get(surahId);
  const url = new URL(`../data/tafsir/${surahId}.json`, import.meta.url);
  const promise = fetch(url, { cache: "force-cache" })
    .then(response => {
      if (!response.ok) throw new Error(`Tafsir for surah ${surahId} could not be loaded (${response.status}).`);
      return response.json();
    })
    .catch(error => {
      cache.delete(surahId);
      throw error;
    });
  cache.set(surahId, promise);
  return promise;
}

export async function getSurahTafsir(surahId) {
  return loadSurahTafsir(surahId);
}
