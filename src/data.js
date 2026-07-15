// Demo-only corpus. Replace this file with a verified Quran + licensed tafsir dataset.
const SURAH_SAMPLE = {
  id: 1, name: "Al-Fatihah", arabicName: "ٱلْفَاتِحَة", meaning: "The Opening", ruku: 1,
  verses: [
    { n: 1, ar: "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ", en: "In the name of Allah, the Most Compassionate, Most Merciful.", ur: "اللہ کے نام سے جو بہت مہربان، نہایت رحم والا ہے۔", words: [["بِسْمِ","In the name"],["ٱللَّهِ","of Allah"],["ٱلرَّحْمَـٰنِ","the Most Compassionate"],["ٱلرَّحِيمِ","the Most Merciful"]] },
    { n: 2, ar: "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ", en: "All praise is for Allah—Lord of all worlds.", ur: "سب تعریفیں اللہ ہی کے لیے ہیں جو تمام جہانوں کا رب ہے۔", words: [["ٱلْحَمْدُ","All praise"],["لِلَّهِ","is for Allah"],["رَبِّ","Lord"],["ٱلْعَـٰلَمِينَ","of all worlds"]] },
    { n: 3, ar: "ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ", en: "The Most Compassionate, Most Merciful.", ur: "جو بہت مہربان، نہایت رحم والا ہے۔", words: [["ٱلرَّحْمَـٰنِ","The Most Compassionate"],["ٱلرَّحِيمِ","Most Merciful"]] },
    { n: 4, ar: "مَـٰلِكِ يَوْمِ ٱلدِّينِ", en: "Master of the Day of Judgment.", ur: "روزِ جزا کا مالک ہے۔", words: [["مَـٰلِكِ","Master"],["يَوْمِ","of the Day"],["ٱلدِّينِ","of Judgment"]] },
    { n: 5, ar: "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ", en: "You alone we worship and You alone we ask for help.", ur: "ہم تیری ہی عبادت کرتے ہیں اور تجھ ہی سے مدد مانگتے ہیں۔", words: [["إِيَّاكَ","You alone"],["نَعْبُدُ","we worship"],["وَإِيَّاكَ","and You alone"],["نَسْتَعِينُ","we ask for help"]] },
    { n: 6, ar: "ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ", en: "Guide us along the Straight Path.", ur: "ہمیں سیدھا راستہ دکھا۔", words: [["ٱهْدِنَا","Guide us"],["ٱلصِّرَٰطَ","the path"],["ٱلْمُسْتَقِيمَ","the straight"]] },
    { n: 7, ar: "صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ", en: "The way of those You have blessed—not those who have incurred anger or gone astray.", ur: "ان لوگوں کا راستہ جن پر تو نے انعام فرمایا، نہ ان کا جن پر غضب ہوا اور نہ گمراہوں کا۔", words: [["صِرَٰطَ","The way"],["ٱلَّذِينَ","of those who"],["أَنْعَمْتَ","You blessed"],["عَلَيْهِمْ","upon them"]] }
  ],
  tafsir: [
    { ayah: "1–3", title: "Opening with mercy", text: "The surah begins by naming Allah and foregrounding His mercy. Praise belongs to the Lord of every realm, and the two mercy-names frame the believer’s relationship with Him." },
    { ayah: "4", title: "Accountability", text: "Remembering the Day of Judgment gives worship direction: deeds matter and final judgment belongs to Allah alone." },
    { ayah: "5–7", title: "A covenant and a prayer", text: "The servant declares exclusive worship and dependence, then asks for steady guidance: the way of those favoured by Allah, distinct from ways of error." }
  ],
  lesson: {
    background: "Al-Fatihah is a concise prayer that joins praise, recognition of accountability, worship, reliance, and a request for guidance.",
    summary: "It teaches that Allah is the Lord of all worlds, merciful, and the Master of the Day of Judgment. The believer responds with worship, seeking help, and asking to remain on the straight path.",
    sources: ["Al-Fatihah 1–7 (demo corpus)", "Context window: 3 ayahs before/after where available"],
    answers: [
      { keywords: ["main", "theme", "summary", "about"], text: "The ruku moves from praise of Allah and His mercy to worship, reliance, and a direct prayer for guidance." },
      { keywords: ["day", "judgment", "master", "account"], text: "Verse 4 names Allah as Master of the Day of Judgment, grounding the prayer in accountability." },
      { keywords: ["help", "worship", "alone"], text: "Verse 5 combines exclusive worship with exclusive dependence: worship is for Allah alone, and help is sought from Him alone." },
      { keywords: ["straight", "path", "guide", "guidance"], text: "Verses 6–7 ask for the straight path: the way of those blessed by Allah, not paths of anger or misguidance." }
    ]
  }
};

const QUIZ_BANK = [
  { q: "Which sequence best reflects the movement of Al-Fatihah?", a: "Praise → accountability → worship and a request for guidance", choices: ["Praise → accountability → worship and a request for guidance","Law → history → pilgrimage","Creation → trade → inheritance","War → treaty → migration"] },
  { q: "Complete the idea in verse 5: “You alone we worship and You alone …”", a: "we ask for help", choices: ["we ask for help","we fear as rulers","we call by lineage","we praise in public"] },
  { q: "What does the title in verse 4 add to the surah’s message?", a: "A reminder that final judgment belongs to Allah", choices: ["A reminder that final judgment belongs to Allah","A description of seasonal time","A command to count days","A promise of worldly status"] },
  { q: "The “straight path” is clarified as the way of whom?", a: "Those blessed by Allah", choices: ["Those blessed by Allah","Those with the most wealth","Those who never need help","Those who rule all worlds"] },
  { q: "Why do verses 1–3 emphasize mercy before the Day of Judgment?", a: "They frame the relationship with Allah through compassion alongside accountability", choices: ["They frame the relationship with Allah through compassion alongside accountability","They remove the need for worship","They list separate deities","They describe a historical battle"] },
  { q: "Which phrase is the clearest statement of reliance in this ruku?", a: "You alone we ask for help", choices: ["You alone we ask for help","Lord of all worlds","Day of Judgment","All praise is for Allah"] },
  { q: "Which response is requested after the declaration of worship?", a: "Guidance to the straight path", choices: ["Guidance to the straight path","Permission to judge others","A list of worldly rewards","Freedom from accountability"] }
];

const CORE_VOCABULARY = [
  { ar: "اللَّه", translit: "Allah", meaning: "God", frequency: "Core Quran word" },
  { ar: "رَبّ", translit: "Rabb", meaning: "Lord / Sustainer", frequency: "Core Quran word" },
  { ar: "رَحْمَة", translit: "Rahmah", meaning: "Mercy", frequency: "Core Quran word" },
  { ar: "عَبَدَ", translit: "ʿAbada", meaning: "to worship", frequency: "Core Quran word" },
  { ar: "هُدًى", translit: "Huda", meaning: "guidance", frequency: "Core Quran word" },
  { ar: "يَوْم", translit: "Yawm", meaning: "day", frequency: "Core Quran word" },
  { ar: "صِرَاط", translit: "Sirāt", meaning: "path", frequency: "Core Quran word" },
  { ar: "دِين", translit: "Dīn", meaning: "judgment / way of life", frequency: "Core Quran word" }
];

// This is intentionally a browser global rather than an ES module so index.html
// can be opened directly from a shared folder as well as served over localhost.
window.QuranSampleData = { SURAH_SAMPLE, QUIZ_BANK, CORE_VOCABULARY };
