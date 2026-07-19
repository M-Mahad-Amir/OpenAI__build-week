# NoorPath development log

## Purpose and update rule

This is the repository's factual implementation reference. Add an entry after an implementation is completed and verified. Each later entry should identify the date, commit (when one exists), files changed, what now works, technical decisions or data boundaries, and verification performed. Do not record proposed work as if it were implemented.

## Baseline recorded

- Recorded: 2026-07-19
- Repository baseline: `0758a309ac895cb66fd1b72c057f902c493b1f9c` (`Updated Readme`)
- Working tree at review: clean before this log was added
- Available conversation record: no earlier chat transcripts were present in this repository or available workspace context. This entry is therefore based on the checked-in files, Git history, `Initial Prompt.txt`, and `Project Tentative Overview (summarized).txt`.

## Implemented application

NoorPath is a browser-based Quran-learning prototype. It has no build system, package manifest, backend, or test suite in the current tree. Serve the repository with a static HTTP server; opening `index.html` directly does not work because the corpus is loaded with `fetch`.

### Runtime layout

| Area | Implemented responsibility |
| --- | --- |
| `index.html` | Defines the shell, sidebar navigation, top bar, app mount point, toast template, font loading, module import map for Gemini, and static asset links. |
| `src/app.js` | Client-side state, rendering, event handling, study flows, local progress, notification attempt, and optional Gemini UI actions. |
| `src/quranService.js` | Sole client-side access layer for the local Quran corpus; it fetches/caches the data, resolves a surah, maps a selected ruku to UI data, matches the local vocabulary, and creates the bounded AI context. |
| `src/data.js` | Nine-term reviewed local Arabic glossary used as an optional word-level gloss layer. |
| `src/geminiService.js` | Optional Gemini calls for summaries, contextual explanations, quizzes, and selected-ruku Q&A. The configured API key is empty. |
| `src/styles.css` | Responsive visual system for the desktop sidebar/mobile layout, reading cards, study activities, forms, calendar, and feedback states. |

### Local corpus and schema

- `data/quran.json` is the canonical local reading corpus used by the app. It is 8,687,103 bytes, has SHA-256 `195B31C5B2CFE1604B078F391DCB7A7AED90A253B661376ED32F8818F45F1C49`, and contains schema version `1.0.0`, 114 surahs, 6,236 ayahs, 556 rukus, and 15 marked sajdahs.
- Its source manifest identifies `The Quran Dataset.csv` for Quran text and English translation and `Urdu.csv` for Urdu translation. The imported-at value is currently empty.
- `data/quran-normalized.schema.json` specifies the data contract: source attribution, ordered surahs, stable `surah:ayah` IDs, Arabic/English/Urdu text, ruku/juz/manzil/hizb-quarter metadata, sajdah metadata, and tokenized Arabic words. It explicitly keeps generated tafsir, lessons, and quizzes out of canonical ayah records.
- The corpus service accepts a numeric surah ID or an exact normalized Arabic, English, or transliterated name. It returns only the selected ruku's ayahs for the active study state.

### User-facing flows currently present

- **Reading:** select a surah and ruku, read Arabic, switch English/Urdu translation, toggle translations and word chips, open the contextual-explanation panel, or jump into Hifz from a selected ayah.
- **Hifz:** shows the first four space-separated Arabic words of each ayah as a continuation prompt and four shuffled choices. A correct continuation advances the sequence and adds one locally stored Hifz point.
- **Ruku lesson:** displays local ruku metadata, can request a Gemini summary and a five-question Gemini quiz, and offers a Gemini question panel. Before an AI quiz is generated, there is no quiz bank.
- **Vocabulary:** shows matched entries from the nine-term local glossary, a multiple-choice meaning check, and the first twelve word chips from the active ruku. Unmatched Arabic tokens deliberately show `Gloss unavailable in this local corpus`.
- **Journey:** stores one daily check-in in browser `localStorage` under `noorpath-demo-progress-v1`, renders a month calendar and streak, and totals points from saved daily scores plus Hifz points. The daily score is `round((salah / 15 * 55) + (anger / 5 * 20) + (min(ayahs, 25) / 25 * 15) + (min(hifz, 10) / 10 * 10))`.
- **Reminder:** requests browser notification permission and checks hourly while the page is open; at 23:00 it can issue a reminder if the day's check-in is absent.

### AI and safety boundary as implemented

- Canonical Quran text, translations, metadata, ruku selection, Hifz prompts, and progress do not depend on Gemini.
- The UI only enables AI operations when `API_KEY` in `src/geminiService.js` is non-empty. The shipped value is `""`; no key is committed.
- `createStudyContext()` passes the selected ruku, or a single selected ayah for contextual explanation, together with the local Arabic/English/Urdu text. The prompt instructions constrain responses to that supplied excerpt and label them as not replacing verified tafsir.
- The direct browser implementation imports `@google/generative-ai` from jsDelivr and uses model name `gemini-3.5-flash`. No server-side proxy, authentication, persistent user store, or retrieval system exists in this repository.

## Commit history through the baseline

| Date | Commit | Implemented change |
| --- | --- | --- |
| 2026-07-15 | `fb9563a` | Added the initial static application: README, page shell, main client script, glossary data, and styling. |
| 2026-07-15 | `0171f99`, `7c30b69`, `2e7d127` | Added and revised the initial prompt and project overview documents. |
| 2026-07-15 | `6d60803` | Temporarily added an API/server-based implementation and related browser changes. |
| 2026-07-15 | `5f264bd`, `262f0a9`, `c5e2f88` | Applied then reverted a browser-startup adjustment and reverted the temporary API/server implementation; `package.json` and `server.js` are absent from the current baseline. |
| 2026-07-16 | `00d25e0` | Added the Gemini service and integrated optional dynamic AI reading, quiz, and chat actions into the static client. |
| 2026-07-16 | `5961f9c` | Removed the exposed Gemini API key. |
| 2026-07-17 | `a573e98` | Updated the configured Gemini model name. |
| 2026-07-17 | `c2ccb77` | Replaced sample Quran data with the normalized local full-corpus JSON, added the schema and corpus service, and refactored the UI and Gemini data handling around that boundary. |
| 2026-07-19 | `0758a30` | Updated README documentation to describe the local-corpus architecture, optional AI boundary, score, and production requirements. |

## Verification recorded for this entry

- Inspected every current project file and the complete reachable Git commit list/name-status history.
- Parsed `data/quran.json` successfully and confirmed its aggregate counts, source manifest, first ID (`1:1`), and last ID (`114:6`).
- Confirmed the current worktree had no pre-existing changes before creating this file.

