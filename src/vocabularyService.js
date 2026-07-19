// Lazy-loads per-surah word-by-word data from data/arabic_words/<surahId>.json.
// Schema: { "<ayahNumber>": [{ position, arabic, translation }, ...], ... }
const cache = new Map();

async function loadSurahWords(surahId) {
  if (cache.has(surahId)) return cache.get(surahId);
  const url = new URL(`../data/arabic_words/${surahId}.json`, import.meta.url);
  const promise = fetch(url, { cache: "force-cache" })
    .then(response => {
      if (!response.ok) throw new Error(`Arabic words for surah ${surahId} could not be loaded (${response.status}).`);
      return response.json();
    })
    .catch(error => {
      cache.delete(surahId);
      throw error;
    });
  cache.set(surahId, promise);
  return promise;
}

export async function getSurahWords(surahId) {
  return loadSurahWords(surahId);
}
