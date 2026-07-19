# NoorPath — Development Roadmap & Architecture Notes (v3)

## Current Status

✔ Local Quran dataset integrated (114 surahs, 6,236 ayahs, 556 rukus)

✔ AI no longer generates Quran text

✔ Vocabulary and Tafsir datasets converted and split per-surah, ready to drop in (`data/tafsir/<surah>.json`, `data/arabic_words/<surah>.json`)

✔ Lesson = one global Ruku, confirmed. (Note: the tafsir data turned out to be one long unique commentary per ayah, not text shared across consecutive ayahs — so "group by identical tafsir" isn't possible on this dataset. Ruku is the grouping, and each ayah's own tafsir displays within it.)

✔ Waqf/pause marks confirmed present in the Arabic ayah text — Hifz part-splitting can proceed

⏳ Global Ruku fix is still the first thing to build — everything else below sits on top of it

---

# Immediate Tasks

Two consolidated prompts cover all of it. Foundation has to land first — the Features prompt assumes the global-ruku lookup and the two new services already exist.

**Prompt 1 — Foundation:** global Ruku lookup, wire in Tafsir/Vocabulary datasets, Lesson-as-Ruku, remove leaked debug text + fix Markdown rendering, retire the old 9-term glossary.

**Prompt 2 — Features:** Reading navigation redesign, new Arabic tab, Hifz fixes, Quiz UX fixes, Journey tab expansion.

### Prompt 1 — Foundation

Refactor the application to treat Ruku as a global Quran-wide entity (1–556) instead of per-surah. Create a single lookup that returns every ayah belonging to a given global Ruku, with no hardcoded ruku counts or ranges, and have Reading, Quiz, Vocabulary, and Hifz all consume this same lookup. Wire in two new local datasets, each split per-surah for lazy loading: `data/tafsir/<surah>.json` (ayah number → {ruku, tafsir}) and `data/arabic_words/<surah>.json` (ayah number → ordered list of {position, arabic, translation}). Create `tafsirService.js` and `vocabularyService.js` that fetch only the active surah's file on demand, matched to ayahs via the existing `surah:ayah` id convention. Define a Lesson as one Ruku, and within it display each ayah's own tafsir entry directly, replacing the current AI-generated contextual explanation and removing any hardcoded tafsir still in the codebase (e.g. a hardcoded Al-Fatihah tafsir — check `app.js` and `geminiService.js`). While in this area, remove the raw AI context-window text currently leaking into the ruku lesson panel, and fix Markdown rendering so AI-generated summaries display formatted text instead of raw `**` syntax. Replace the 9-term glossary in `data.js` with `vocabularyService.js` as the primary word-gloss source. Preserve existing state management and styling.

### Prompt 2 — Features

Building on the global-ruku lookup and services from Prompt 1, implement: **(1) Reading navigation** — Surah dropdown plus a choice of Ruku or specific Ayah as entry point, both resolving through the global-ruku lookup; one ruku per page; if entry is a mid-ruku ayah, render from that ruku's first ayah; add Next/Previous Ruku controls that cross surah boundaries. **(2) A new Arabic tab** with three modes: browse by Surah + Ruku/Verse listing every word and translation via `vocabularyService.js`; browse all words starting with a chosen Arabic letter; a 20-random-word mode that doesn't repeat a word already shown in the session. **(3) Hifz fixes** — a wrong answer should show the correct continuation and let the user proceed instead of blocking; add a Surah/Ayah picker so practice can start anywhere; split each ayah into parts at the waqf/pause marks already in the Arabic text, so each choice is a full part including its pause mark, and the correct next choice picks up exactly where the previous part ended; generate wrong-answer choices by sampling other parts from the same surah for now (leave cross-Quran similarity matching as a later upgrade). **(4) Quiz fixes** — normalize answer-choice text so length/formatting doesn't hint at the correct answer; add backward/forward navigation between questions without losing prior answers. **(5) Journey tab** — auto-pull the day's Hifz, Lesson, and Arabic-tab activity instead of manual entry for those; add charity (Rs) and social media time (30 min/1 hr/2 hr/>2 hr) as new inputs; scale every component to a common 0–100 range with placeholder equal weights and combine into one score; add an edit control for a submitted day; show every past date's stored score on the calendar, not just today's. Keep all of this consistent with existing state management, styling, and the service-layer pattern.

---

# Recommended Architecture

Frontend

↓

Local Datasets

↓

Reading

Lesson

Vocabulary

Arabic Tab

Quiz

Hifz

Journey

↓

Vercel Serverless Functions

↓

OpenAI / Gemini

↓

Supabase

---

# API Keys

Never expose API keys to frontend code.

.gitignore only protects Git.

It does NOT protect deployed websites.

Instead:

Store keys as Vercel Environment Variables.

Call AI only through Vercel Serverless Functions.

Browser

↓

/api/askAI

↓

LLM

The browser never receives the key.

---

# Folder Structure

data/

    quran.json

    quran-normalized.schema.json

    tafsir/

        1.json ... 114.json

    arabic_words/

        1.json ... 114.json

src/

    app.js

    data.js              (deprecate once vocabularyService.js is wired in)

    quranService.js

    vocabularyService.js   (new)

    tafsirService.js         (new)

    geminiService.js

index.html

.gitignore

---

# Backend Decision

Recommended:

Frontend

↓

Vercel Functions

↓

Supabase

↓

LLM

No Express

No Render

No Railway

No Xano

Only:

Vercel

+

Supabase

This is beginner-friendly and sufficient for the hackathon.

---

# Roadmap

Stage 1

✔ Local datasets

↓

Stage 2

⏳ Foundation — global Ruku fix, Lesson-as-Ruku, Vocabulary/Tafsir integration (Prompt 1)

↓

Stage 3

⏳ Features — Reading nav, Arabic tab, Hifz, Quiz UX, Journey (Prompt 2)

↓

Stage 4

Move AI into Vercel Functions

↓

Stage 5

Connect Supabase

Store:

- Users
- Progress
- Streaks
- Quiz History
- Chat History

↓

Stage 6

Generate embeddings

↓

Stage 7

Store embeddings in Supabase pgvector

↓

Stage 8

Implement RAG

User Question

↓

Embedding

↓

Vector Search

↓

Relevant Tafsir / Context

↓

LLM

↓

Grounded Answer

↓

Stage 9

Deployment

Frontend

→ Vercel

Backend Logic

→ Vercel Functions

Database

→ Supabase

↓

Final polish

Demo

Submission

---

1. Supabase Integration Prompt

Integrate Supabase as the application's backend service while preserving the existing frontend architecture and local Quran datasets. Configure Supabase Authentication (Google and Email providers if required), PostgreSQL database, Row-Level Security (RLS), and Storage only if needed. Design normalized tables for users, study progress, streaks, Hifz progress, quiz attempts, vocabulary mastery, journey entries (including charity and social media fields), AI chat history, and user preferences. Create reusable Supabase service functions instead of placing database logic directly inside UI components. Keep the schema modular so pgvector, embeddings, and Retrieval-Augmented Generation (RAG) can be added later without restructuring the existing database. Ensure secure authentication, proper foreign keys, indexes, timestamps, and scalable database design while preserving the current application behavior.

2. Vercel Serverless Functions Prompt

Refactor the application's AI layer to use Vercel Serverless Functions instead of calling AI providers directly from the frontend. Create modular API endpoints (e.g., /api/askAI, /api/generateQuiz, /api/generateSummary) responsible for communicating with Gemini/OpenAI. Move all API keys and sensitive credentials to Vercel Environment Variables so they are never exposed to the client. Update the frontend to consume these serverless endpoints while preserving the current UI and state management. Structure the implementation so additional endpoints for embeddings and vector search can be added without affecting the frontend architecture.

3. RAG + Supabase pgvector Prompt

Implement a Retrieval-Augmented Generation (RAG) pipeline using Supabase PostgreSQL with the pgvector extension. Use the local tafsir dataset (already per-ayah, no further chunking of source content required beyond splitting long entries into semantic chunks), lesson content, and vocabulary as the knowledge base. Generate embeddings for each chunk using the selected embedding model, and store both the text and embeddings inside Supabase pgvector along with appropriate metadata (Surah, Ayah, Global Ruku, source). For every AI query, generate an embedding for the user's question, perform semantic similarity search against pgvector, retrieve the most relevant chunks, and pass only this retrieved context to the language model. The language model should produce concise, grounded answers while referencing the retrieved sources whenever possible. Keep the RAG pipeline modular so additional datasets or embedding models can be integrated later without changing the frontend.

4. Production Deployment Prompt (Vercel + Supabase)

Prepare the project for production deployment using Vercel and Supabase. Configure the frontend for Vercel hosting, deploy the serverless API functions, connect securely to Supabase using environment variables, and remove all hardcoded secrets or API keys from the client. Verify that local Quran, vocabulary, and tafsir datasets load correctly, serverless functions communicate with AI providers securely, Supabase authentication and database operations function correctly, and the application builds successfully for production. Optimize loading performance, implement proper error handling and loading states, validate environment variables, and ensure the deployed application remains modular and ready for future RAG enhancements.

5. Final "Architecture Refactor" Prompt (Recommended before starting RAG)

Review the entire project architecture before implementing RAG. Refactor the codebase into clear service layers while preserving all existing functionality. Ensure the frontend communicates only with reusable service modules, serverless API functions handle all AI requests, Supabase manages authentication and persistent data, and local datasets remain the primary source for Quran text, translations, vocabulary, tafsir, and metadata. Eliminate duplicated logic, improve modularity, centralize data access, and verify that the application is fully prepared for pgvector, embeddings, and Retrieval-Augmented Generation without requiring future architectural rewrites. Do not redesign the UI; focus entirely on maintainability, scalability, and clean separation of responsibilities.

---

# Important Principle

The frontend should never know:

- where Tafsir comes from
- where AI comes from
- where vocabulary comes from

Every feature should only communicate with service layers.

This allows swapping:

API → Dataset

Dataset → RAG

Gemini → OpenAI

without changing the UI.

The goal is to keep the architecture modular so future improvements require minimal refactoring.
