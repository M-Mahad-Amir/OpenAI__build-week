# NoorPath — Quran learning app - Team Hackathon Project

A browser-based Quran learning prototype. Quran text, English translation, Urdu translation, verse metadata, and ruku selection are loaded locally from `data/quran.json`; learner progress stays in browser `localStorage`. Gemini is optional and is used only for AI summaries, quizzes, contextual explanations, and the Ask AI panel.

## Run it

Serve the folder with a static-file server, then open the app in a modern browser. The local corpus is loaded with `fetch`, so opening `index.html` directly from `file://` is not supported. No API key is needed to read Quran content, translations, or use Hifz and progress features. To enable optional AI features, paste a browser-restricted Gemini key into `src/geminiService.js`.

## Included now

- Reading mode: Arabic, English/Urdu translation switch, locally tokenized words, on-request contextual explanations, and jump to Hifz.
- Hifz: choose the next continuation from four shuffled Arabic phrase choices.
- Ruku lesson: local source display plus optional AI summary, randomized AI-generated MCQs, and a corpus-bound Ask AI panel.
- Vocabulary: a local reviewed glossary; a separate licensed word-by-word dataset is needed for complete coverage.
- Journey: daily salah/anger/ayah/Hifz check-in, scaled score, local calendar, streak, and a best-effort 11pm browser notification while the app is open.
- Error boundary, guarded local storage, and safe fallbacks for unsupported notifications.

## Data and AI boundaries

- `src/quranService.js` is the only client-side boundary for Quran text, translations, verse metadata, surahs, and rukus. It currently reads `data/quran.json`; a future Supabase repository can replace that implementation without changing the UI.
- `createStudyContext()` returns only the selected local ruku (or ayah) for AI calls. It is the seam for a future embeddings/RAG retrieval layer and keeps canonical Quran data separate from generated material.
- `src/geminiService.js` contains optional AI-only operations. It never loads or generates canonical Quran text, translations, or metadata.

## Required before a production launch

1. **Verified Quran text**: a licensed/approved Uthmani Arabic text, stable ayah IDs, surah/ruku/juz metadata, sajdah markers, and a documented revision source.
2. **Translations and word-by-word data**: separately licensed English and Urdu translations plus morphology/gloss data, with translator/source attribution and display permissions.
3. **Tafsir corpus**: a licensed, scholar-approved English tafsir at ayah granularity. Keep source, edition, page/volume where applicable, and an explicit review policy.
4. **RAG pipeline**: chunk tafsir by ruku/ayah, attach `surah`, `ayahStart`, `ayahEnd`, `ruku`, translator/tafsir edition, and citations. At query time fetch the selected ruku plus exactly three ayahs of contextual overlap on each side (where available); reject answers without a cited supporting chunk.
5. **AI provider/API**: an LLM API key is needed only for genuinely generated lesson explanations and Ask AI. Use a paid or trial provider with an embeddings model plus a small answer model; “free tiers” and credits change frequently, so choose based on the provider’s current terms and never expose a key in the browser. Put calls behind a server endpoint, rate-limit it, log citations (not private chat contents), and add a moderation/refusal policy.
6. **Database and auth**: authenticated backend plus encrypted per-user records for progress/check-ins. Browser storage is only a prototype.
7. **Notifications**: a PWA/service worker and web-push backend (or native mobile notifications). A browser page alone cannot reliably send a notification when it is closed.
8. **Scholarly review and safety**: review all generated lesson/quiz prompts, forbid uncited doctrinal answers, show citations, and offer “I do not have enough verified material” as a valid response.
9. **Privacy and product requirements**: consent, export/delete controls, age policy, data-retention policy, accessibility, offline handling, analytics opt-in, and a clear note that salah/anger logs are private wellbeing data.

## Safe RAG answer contract

The production answer endpoint should return `{ answer, citations, grounded: true }` only when every claim is supported by retrieved chunks. Otherwise it should return `{ answer: "I don’t have enough verified material in this selected ruku to answer that precisely.", citations: [], grounded: false }`. Generate five quiz questions from the same retrieved chunks and validate every correct answer and distractor against citations before returning it.

## Score used in the prototype

`(salah points / 15 × 55) + (anger rating / 5 × 20) + (min(ayahs,25) / 25 × 15) + (min(hifz,10) / 10 × 10)`

Salah points per prayer are mosque 3, home 2, qaza 1, and missed 0. The implementation rounds this 100-point total and adds it once per daily check-in.
