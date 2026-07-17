// Optional local word glossary. The imported CSVs contain Arabic tokenization,
// but not licensed word-by-word translations, so terms absent from this list
// are intentionally shown without a guessed gloss.
export const LOCAL_VOCABULARY = [
  { forms: ["الله"], ar: "اللَّه", translit: "Allah", meaning: "God", frequency: "Core Quran word" },
  { forms: ["رب"], ar: "رَبّ", translit: "Rabb", meaning: "Lord / Sustainer", frequency: "Core Quran word" },
  { forms: ["الرحمن", "رحمن"], ar: "رَحْمَٰن", translit: "Ar-Rahman", meaning: "The Most Compassionate", frequency: "Core Quran word" },
  { forms: ["الرحيم", "رحيم"], ar: "رَحِيم", translit: "Ar-Rahim", meaning: "The Most Merciful", frequency: "Core Quran word" },
  { forms: ["نعبد", "عبد"], ar: "عَبَدَ", translit: "ʿAbada", meaning: "to worship", frequency: "Core Quran word" },
  { forms: ["اهدي", "هدى"], ar: "هُدًى", translit: "Huda", meaning: "guidance", frequency: "Core Quran word" },
  { forms: ["يوم"], ar: "يَوْم", translit: "Yawm", meaning: "day", frequency: "Core Quran word" },
  { forms: ["الصراط", "صراط"], ar: "صِرَاط", translit: "Sirat", meaning: "path", frequency: "Core Quran word" },
  { forms: ["الدين", "دين"], ar: "دِين", translit: "Din", meaning: "judgment / way of life", frequency: "Core Quran word" }
];
