# NoorPath

NoorPath is a browser-based Quran learning prototype. It combines a local Quran corpus with guided reading, memorisation, vocabulary, lesson, and daily-reflection flows. It is a static client-side app—there is no backend, build step, account system, or database.

## Run locally

Serve this folder with any static HTTP server and open it in a modern browser. Do not open `index.html` directly: the app loads its local data with `fetch`.

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Features

- Read the full Quran by Surah, Ayah, or any of the 556 global rukus, with Arabic plus English or Urdu translation.
- View local ayah-level tafsir and word-by-word Arabic vocabulary.
- Practise Hifz through pause-mark-aware continuation questions.
- Study a ruku as a grouped tafsir lesson and, when AI is configured, generate a summary, quiz, or grounded Q&A response.
- Explore Arabic vocabulary by ruku, surah, or starting letter, including a ruku vocabulary quiz.
- Track a private daily journey: salah, wellbeing, reading, Hifz, lesson, vocabulary, charity, and social-media habits. Progress, streaks, and points are stored only in browser `localStorage`.

## Data and AI boundaries

- Canonical Quran text, translations, metadata, ruku navigation, Hifz prompts, tafsir display, vocabulary, and progress are local features; they do not rely on AI.
- The bundled corpus contains 114 surahs, 6,236 ayahs, and 556 rukus. Tafsir and word data are lazy-loaded per surah; the word index supports full-Quran letter browsing.
- Gemini is optional and disabled by default. When configured, it receives only the selected study context—Arabic text and local tafsir excerpts—to create an overview, five-question quiz, or answer. Generated content is supplementary and is not a replacement for verified tafsir.
- The prototype deliberately keeps generated material separate from canonical Quran records. A production version should use a server-side AI proxy, licensed and scholar-reviewed sources, authentication, and a secure progress store.

## Project structure

| Area | Responsibility |
| --- | --- |
| `index.html` | App shell, navigation, import map, and static assets. |
| `src/app.js` | Client-side state, rendering, event handling, study flows, reminders, and local progress. |
| `src/quranService.js` | The single access boundary for the canonical Quran corpus, Surah lookup, ruku lookup, and AI study context. |
| `src/tafsirService.js` / `src/vocabularyService.js` | Cached, lazy-loaded per-surah tafsir and word-by-word vocabulary. |
| `src/wordIndexService.js` | Cached full-Quran word index used by Arabic letter browsing. |
| `src/geminiService.js` | Optional Gemini summaries, quizzes, and lesson Q&A. |
| `src/styles.css` / `src/overrides.css` | Responsive UI styling and Arabic RTL presentation. |
| `data/` | Local Quran corpus, schema, tafsir, vocabulary, and word-index files. |
| `misc/` | The script that builds the word index. |
| `docs/` | Documentation for the project implementations. |

## Practices and methodology

- **Local-first and separation of concerns:** canonical Quran data stays in `data/`; focused services load it, while the UI consumes those services rather than accessing files directly.
- **Progressive loading:** tafsir and vocabulary load only for the active surah, with in-memory caching; failures degrade gracefully without blocking core reading.
- **Grounded AI:** optional prompts are limited to the selected ruku’s local tafsir context. AI never supplies canonical text or replaces the local source.
- **Simple, resilient client architecture:** vanilla ES modules, a single state-driven renderer, delegated events, guarded `localStorage`, and responsive/RTL styling keep the prototype lightweight and accessible.

## Team contributions

- **M. Mahad Amir** — led the app’s design and implementation, including the static architecture, normalized Quran corpus, service layer, ruku navigation, Hifz, Arabic vocabulary, lessons, journey tracking, UI refinements, and documentation.
- **Syed Muhammad Areeb** — integrated the initial dynamic Gemini reading, quiz, and chat features; later refactored the reading/vocabulary views and helped remove the exposed API key.
- **Faaiq Ahmed** — led the local data-layer work, including tafsir and word-vocabulary additions, ruku-navigation and vocabulary enhancements.

Contributions above reflect the repository’s Git history.
