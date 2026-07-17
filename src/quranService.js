import { LOCAL_VOCABULARY } from "./data.js";

const corpusUrl = new URL("../data/quran.json", import.meta.url);
let corpusPromise;

const normalizeSearch = value => String(value || "")
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]/gu, "");

const normalizeArabic = value => String(value || "")
  .replace(/[\u064B-\u065F\u0670]/g, "")
  .replace(/[ٱأإآ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/ة/g, "ه");

const glossaryByWord = new Map(LOCAL_VOCABULARY.flatMap(entry => entry.forms.map(form => [form, entry])));

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

  if (!surah) throw new Error(`Surah “${surahReference}” was not found in the local corpus.`);
  return surah;
}

export async function getRuku(surahReference, rukuNumber) {
  const [corpus, surah] = await Promise.all([loadQuranCorpus(), getSurah(surahReference)]);
  const ruku = Number(rukuNumber);
  const ayahs = corpus.ayahs.filter(ayah => ayah.surahId === surah.id && ayah.location.ruku.numberInSurah === ruku);

  if (!ayahs.length) throw new Error(`${surah.names.transliteration} does not have ruku ${ruku}.`);

  const verses = ayahs.map(ayah => ({
    id: ayah.id,
    n: ayah.numberInSurah,
    ar: ayah.arabic,
    en: ayah.translations.en,
    ur: ayah.translations.ur,
    words: ayah.words.map(word => {
      const glossary = glossaryByWord.get(normalizeArabic(word.arabic));
      return [word.arabic, glossary?.meaning || "Gloss unavailable in this local corpus"];
    }),
    location: ayah.location,
    sajdah: ayah.sajdah
  }));

  return {
    id: surah.id,
    name: surah.names.transliteration,
    arabicName: surah.names.arabic,
    meaning: surah.names.english,
    revelationType: surah.revelationType,
    ruku,
    rukuInQuran: ayahs[0].location.ruku.numberInQuran,
    verses,
    lesson: {
      background: `${surah.names.transliteration}, ruku ${ruku}, contains ayahs ${verses[0].n}–${verses.at(-1).n}. The Quran text and English/Urdu translations below are loaded from the local corpus.`,
      summary: "Generate an AI summary when you want a contextual study aid; the canonical verses remain local and unchanged.",
      sources: ["Local Quran corpus", "English and Urdu translations supplied with the imported datasets"]
    }
  };
}

export function getLocalVocabulary(study) {
  const includedWords = new Set(study.verses.flatMap(verse => verse.words.map(([arabic]) => normalizeArabic(arabic))));
  return LOCAL_VOCABULARY.filter(entry => entry.forms.some(form => includedWords.has(form)));
}

export function createStudyContext(study, { ayahNumber } = {}) {
  const verses = ayahNumber
    ? study.verses.filter(verse => verse.n === ayahNumber)
    : study.verses;
  return {
    surah: study.name,
    ruku: study.ruku,
    source: "Local Quran corpus (Arabic text with imported English and Urdu translations)",
    verses: verses.map(verse => ({
      ayah: verse.n,
      arabic: verse.ar,
      english: verse.en,
      urdu: verse.ur
    }))
  };
}
