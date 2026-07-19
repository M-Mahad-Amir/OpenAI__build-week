// Loads the full-Quran deduplicated word index once, caches it.
// Schema: [{ar, tr, s, n}]  (s = surahId, n = ayahNumber of first occurrence)
let indexPromise = null;

export async function getWordIndex() {
  if (!indexPromise) {
    const url = new URL("../data/arabic_words_index.json", import.meta.url);
    indexPromise = fetch(url, { cache: "force-cache" })
      .then(r => {
        if (!r.ok) throw new Error(`Full-Quran word index could not be loaded (${r.status}).`);
        return r.json();
      })
      .catch(e => {
        indexPromise = null;
        throw e;
      });
  }
  return indexPromise;
}
