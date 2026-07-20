const corpusUrl = new URL("../data/quran.json", import.meta.url);
let corpusPromise;

const normalizeSearch = value => String(value || "")
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]/gu, "");

export async function loadQuranCorpus() {
  if (!corpusPromise) {
    corpusPromise = fetch(corpusUrl, { cache: "force-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`Local Quran corpus could not be loaded (${response.status}).`);
        return response.json();
      })
      .then(corpus => {
        if (!Array.isArray(corpus.surahs) || !Array.isArray(corpus.ayahs)) {
          throw new Error("The local Quran corpus has an invalid shape.");
        }
        return corpus;
      })
      .catch(error => {
        corpusPromise = undefined;
        throw error;
      });
  }
  return corpusPromise;
}

export async function getSurah(surahReference) {
  const corpus = await loadQuranCorpus();
  const numericId = Number(surahReference);
  const query = normalizeSearch(surahReference);
  const surah = Number.isInteger(numericId) && numericId > 0
    ? corpus.surahs.find(item => item.id === numericId)
    : corpus.surahs.find(item => [item.names.transliteration, item.names.english, item.names.arabic]
      .some(name => normalizeSearch(name) === query));

  if (!surah) throw new Error(`Surah "${surahReference}" was not found in the local corpus.`);
  return surah;
}

// Returns all ayahs belonging to a global ruku number (1–556).
// Word-by-word glosses and tafsir are resolved by vocabularyService / tafsirService in app.js.
export async function getRuku(globalRukuNumber) {
  const corpus = await loadQuranCorpus();
  const ruku = Number(globalRukuNumber);
  const ayahs = corpus.ayahs.filter(ayah => ayah.location.ruku.numberInQuran === ruku);

  if (!ayahs.length) throw new Error(`Global ruku ${ruku} was not found in the local corpus.`);

  const surahId = ayahs[0].surahId;
  const surah = corpus.surahs.find(s => s.id === surahId);
  if (!surah) throw new Error(`Surah for global ruku ${ruku} was not found in the local corpus.`);

  const verses = ayahs.map(ayah => ({
    id: ayah.id,
    n: ayah.numberInSurah,
    ar: ayah.arabic,
    en: ayah.translations.en,
    ur: ayah.translations.ur,
    words: ayah.words.map(word => [word.arabic, ""]), // populated by vocabularyService after load
    location: ayah.location,
    sajdah: ayah.sajdah
  }));

  return {
    id: surah.id,
    name: surah.names.transliteration,
    arabicName: surah.names.arabic,
    meaning: surah.names.english,
    revelationType: surah.revelationType,
    ruku: ayahs[0].location.ruku.numberInSurah,
    rukuInQuran: ruku,
    verses,
    tafsir: null, // populated by tafsirService after load
    lesson: {
      background: "",
      summary: "",
      sources: ["Local Quran corpus", "English and Urdu translations supplied with the imported datasets"]
    }
  };
}

export function createStudyContext(study, { ayahNumber } = {}) {
  const verses = ayahNumber
    ? study.verses.filter(verse => verse.n === ayahNumber)
    : study.verses;
  return {
    surah: study.name,
    ruku: study.ruku,
    source: "Locally loaded tafsir for the selected ruku",
    verses: verses.map(verse => ({
      ayah: verse.n,
      arabic: verse.ar,
      tafsir: study.tafsir?.[String(verse.n)]?.tafsir || "No tafsir entry is available for this ayah."
    }))
  };
}

// Resolves a (surahId, ayahNumber) pair to the ayah's global ruku number (1–556).
// Used by the reading nav and Hifz picker to jump to the correct ruku from any ayah.
export async function findGlobalRukuForAyah(surahId, ayahNumber) {
  const corpus = await loadQuranCorpus();
  const ayah = corpus.ayahs.find(
    a => a.surahId === Number(surahId) && a.numberInSurah === Number(ayahNumber)
  );
  if (!ayah) throw new Error(`Ayah ${surahId}:${ayahNumber} was not found in the local corpus.`);
  return ayah.location.ruku.numberInQuran;
}
