# NoorPath

NoorPath is a vanilla-JavaScript Quran study app. Quran reading, tafsir display, vocabulary, Hifz practice, and progress tracking are local-first browser features. Optional AI study features use a Vercel serverless RAG endpoint backed by Qdrant.

## Run locally

Install the Node dependencies first:

```bash
npm install
```

For local reading-only work, serve the repository with a static server:

```bash
python -m http.server 8000
```

For the AI study features, use Vercel's local runtime so `/api/ask` is available:

```bash
npx vercel dev
```

Do not open `index.html` directly: the app fetches its local data files.

## Features

- Read the full Quran by Surah, Ayah, or any of the 556 global rukus, with Arabic plus English or Urdu translation.
- View local ayah-level tafsir and word-by-word Arabic vocabulary.
- Practise Hifz through pause-mark-aware continuation questions.
- Study a ruku through grouped local tafsir, RAG-grounded summaries and quizzes, and source-backed Q&A.
- Explore Arabic vocabulary by ruku, surah, or starting letter, including a ruku vocabulary quiz.
- Track a private daily journey: salah, wellbeing, reading, Hifz, lesson, vocabulary, charity, and social-media habits. Progress, streaks, and points remain in browser `localStorage`.

## RAG architecture

1. `scripts/ingest.js` reads every `data/tafsir/<surah>.json` file and groups adjacent ayahs with exactly identical tafsir text into one chunk.
2. Each chunk stores a stable readable ID, surah, ayah range, Arabic ayahs, English translations, and tafsir. Its tafsir is embedded with `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions).
3. The vectors and payloads are upserted to Qdrant collection `noorpath_tafsir` using cosine distance. The ingestion script also creates the integer payload index on `surah`, which scoped ruku retrieval requires.
4. `api/ask.js` embeds a question with the same model, retrieves the five most relevant chunks, builds Gemini context from ayah text and tafsir, and returns an answer with source references.
5. `src/ragService.js` is the browser boundary for the endpoint. `askRag(question)` posts `{ question }` to `/api/ask` and returns `{ answer, sources }`; the lesson summary and quiz helpers use the same endpoint internally.

Run the tafsir ingestion after configuring the environment variables below:

```bash
npm run ingest:tafsir
```

The current corpus produces 1,896 grouped tafsir chunks. Rerunning ingestion is safe: deterministic point IDs update the existing Qdrant points.


## Data and AI boundaries

- Canonical Quran text, translations, metadata, ruku navigation, Hifz prompts, tafsir display, vocabulary, and progress are local features; they do not rely on AI.
- The bundled corpus contains 114 surahs, 6,236 ayahs, and 556 rukus. Tafsir and word data are lazy-loaded per surah; the word index supports full-Quran letter browsing.
- AI output is supplementary study material, grounded in retrieved tafsir chunks, and is not a replacement for verified tafsir or primary scholarly sources.
- Generated material remains separate from canonical Quran records.


## Project structure

| Area | Responsibility |
| --- | --- |
| `index.html` | Static app shell, navigation, fonts, and stylesheets. |
| `src/app.js` | Client-side state, rendering, event handling, study flows, and local progress. |
| `src/quranService.js` | Canonical Quran corpus access, Surah/ruku lookup, and study-context construction. |
| `src/ragService.js` | Browser client for `/api/ask`; exposes RAG Q&A plus lesson summary and quiz helpers. |
| `api/ask.js` | Vercel serverless RAG endpoint: Hugging Face embeddings, Qdrant retrieval, and Gemini generation. |
| `src/tafsirService.js` / `src/vocabularyService.js` | Cached, lazy-loaded per-surah tafsir and word-by-word vocabulary. |
| `src/wordIndexService.js` | Cached full-Quran word index used by Arabic letter browsing. |
| `scripts/ingest.js` | Builds grouped tafsir chunks, embeddings, Qdrant points, and the `surah` payload index. |
| `data/` | Local Quran corpus, schema, tafsir, vocabulary, and word-index files. |
| `docs/` | Development history and project documentation. |

## Practices and methodology

- **Local-first:** the core Quran study experience remains usable without AI services.
- **Service boundaries:** the UI uses focused corpus, tafsir, vocabulary, and RAG services rather than accessing data or credentials directly.
- **Grounded generation:** server-side prompts receive retrieved ayah text and tafsir only; returned source ranges are displayed under lesson answers.
- **Secret isolation:** Hugging Face, Qdrant, and Gemini credentials stay in environment variables on the server.
- **Simple frontend:** vanilla ES modules, a single state-driven renderer, delegated events, guarded `localStorage`, and responsive/RTL styling keep the client lightweight.

## Team contributions

- **M. Mahad Amir** — led the app’s design and implementation, including the static architecture, normalized Quran corpus, service layer, ruku navigation, Hifz, Arabic vocabulary, lessons, journey tracking, UI refinements, and documentation.
- **Syed Muhammad Areeb** — integrated the initial dynamic Gemini reading, quiz, and chat features; later refactored the reading/vocabulary views and helped remove the exposed API key.
- **Faaiq Ahmed** — led the local data-layer work, including tafsir and word-vocabulary additions, ruku-navigation and vocabulary enhancements.

Contributions above reflect the repository’s Git history.
