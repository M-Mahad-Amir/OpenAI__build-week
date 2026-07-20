import { getRuku, createStudyContext, loadQuranCorpus } from "./quranService.js";
import { getSurahTafsir } from "./tafsirService.js";
import { getSurahWords } from "./vocabularyService.js";
import { getWordIndex } from "./wordIndexService.js";
import {
  askGeminiAboutLesson,
  generateDynamicQuiz,
  generateStudySummary,
  isGeminiConfigured
} from "./geminiService.js";

const $ = (selector, scope = document) => scope.querySelector(selector);
const app = $("#app");
const storeKey = "noorpath-demo-progress-v1";

const safeRead = () => {
  try { return JSON.parse(localStorage.getItem(storeKey)) || { daily: {}, hifz: 0 }; }
  catch { return { daily: {}, hifz: 0 }; }
};

let progress = safeRead();

// ── Arabic letter table ──────────────────────────────────────────────────────
const ARABIC_LETTERS = [
  "ا","ب","ت","ث","ج","ح","خ","د","ذ","ر","ز","س","ش","ص","ض",
  "ط","ظ","ع","غ","ف","ق","ك","ل","م","ن","ه","و","ي","ء"
];

// ── State ────────────────────────────────────────────────────────────────────
let state = {
  // Core
  view: "reading",
  language: "en",
  showTranslation: true,
  showWords: false,
  tafsirAyah: null,
  loading: false,
  targetGlobalRuku: 1,
  activeSurah: null,
  surahList: [],          // [{id, name}] populated after first corpus load
  surahRukus: {},         // {surahId: [{number, firstAyah, lastAyah, globalNumber}]}
  vocabBank: [],
  vocabQuestion: null,
  vocabAyahIndex: 0,
  summaryLoading: false,
  quizLoading: false,

  // Feature 1 — Reading nav
  navSurahId: 1,
  navMode: "ruku",        // "ruku" | "ayah"
  navInput: 1,

  // Feature 2 — Arabic tab
  arabicMode: "ruku",     // "ruku" | "letter" | "random"
  arabicSurahId: 1,
  arabicInputMode: "ruku",// "ruku" | "ayah" within browse
  arabicInput: 1,
  arabicBrowseWords: [],  // [{ar, tr, s, n}]
  arabicBrowseLoading: false,
  arabicLetter: "",
  arabicWordIndex: null,  // null=not loaded, []=failed, array=loaded
  arabicIndexLoading: false,
  arabicSessionSeen: new Set(),  // Arabic strings shown in random mode this session
  arabicRandomWords: [],

  // Feature 3 — Hifz
  hifzIndex: 0,
  hifzChoices: [],
  hifzSegments: [],       // [{text, ayah}] waqf-split across all ruku verses
  hifzLastAnswered: null, // {chosen, correct, wasCorrect} — drives highlighted render
  hifzPickerSurahId: 1,
  hifzPickerRuku: 1,

  // Feature 4 — Quiz
  lessonQuiz: [],
  quizIndex: 0,
  quizScore: 0,
  quizAnswers: {},        // {[index]: {selected, isCorrect}}
  quizBank: [],

  // Feature 5 — Journey
  editingEntry: null      // populated when user clicks "Edit today"
};

// ── Pure helpers ─────────────────────────────────────────────────────────────
const escape = (v = "") => String(v).replace(/[&<>'"]/g,
  c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;" })[c]);

const renderMarkdown = (text = "") => {
  const safe = escape(String(text));
  return safe
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .split(/\n\n+/)
    .map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
};

const normaliseChoice = s => String(s).trim().replace(/\s+/g, " ").slice(0, 90);

const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
const today   = () => new Date().toISOString().slice(0, 10);
const persist = () => { try { localStorage.setItem(storeKey, JSON.stringify(progress)); } catch { toast("Your browser could not save progress locally."); } };
const toast   = msg => { const n = $("#toast-template").content.firstElementChild.cloneNode(true); n.textContent = msg; document.body.append(n); setTimeout(() => n.remove(), 2800); };
const points  = () => Object.values(progress.daily).reduce((s, d) => s + (d.score || 0), 0) + (progress.hifz || 0);
const setHeading = (title, crumb) => { $("#view-title").textContent = title; $("#crumb").textContent = crumb; $("#points-total").textContent = points(); };

// ── Arabic letter utilities ──────────────────────────────────────────────────
function stripDiacritics(s) {
  return s.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, "");
}
function normalizeAlef(c) {
  return "أإآٱ".includes(c) ? "ا" : c;
}
function baseFirstLetter(ar) {
  const s = stripDiacritics(ar || "");
  return normalizeAlef(s[0] || "");
}

// ── Surah dropdown ───────────────────────────────────────────────────────────
function surahDropdownOptions(selectedId) {
  return state.surahList.map(s =>
    `<option value="${s.id}" ${s.id === Number(selectedId) ? "selected" : ""}>${s.id}. ${s.name}</option>`
  ).join("");
}

function buildSurahRukus(corpus) {
  const grouped = {};
  corpus.ayahs.forEach(ayah => {
    const sid = ayah.surahId;
    const number = ayah.location.ruku.numberInSurah;
    const existing = grouped[sid]?.find(r => r.number === number);
    if (existing) existing.lastAyah = ayah.numberInSurah;
    else (grouped[sid] ||= []).push({
      number,
      firstAyah: ayah.numberInSurah,
      lastAyah: ayah.numberInSurah,
      globalNumber: ayah.location.ruku.numberInQuran
    });
  });
  return grouped;
}

function rukuDropdownOptions(surahId, selectedRuku) {
  return (state.surahRukus[Number(surahId)] || []).map(r =>
    `<option value="${r.number}" ${r.number === Number(selectedRuku) ? "selected" : ""}>Ruku ${r.number}: Verses ${r.firstAyah} to ${r.lastAyah}</option>`
  ).join("");
}

// ── Daily activity tracking ──────────────────────────────────────────────────
function initTodayActivity() {
  const t = today();
  if (!progress.todayActivity || progress.todayActivity.date !== t) {
    progress.todayActivity = { date: t, hifzPts: 0, lessonVisited: false, arabicWords: 0 };
    persist();
  }
}

// ── Hifz waqf splitting ──────────────────────────────────────────────────────
// Marks confirmed in corpus: U+06D6–U+06DC, U+06DE, U+06DF.
// Each mark is kept at the END of its preceding segment (the natural pause unit).
function getWaqfSegments(verses) {
  const pauseMark = /[\u06D6-\u06DC\u06DE\u06DF]/;
  return verses.flatMap(v => {
    const segments = [];
    let part = [];
    // Split only after a complete whitespace-delimited word bearing a waqf mark.
    // This prevents a word from ever being cut in the middle.
    for (const word of v.ar.trim().split(/\s+/)) {
      part.push(word);
      if (pauseMark.test(word)) {
        segments.push({ text: part.join(" "), ayah: v.n });
        part = [];
      }
    }
    if (part.length) segments.push({ text: part.join(" "), ayah: v.n });
    return segments;
  });
}

const hifzSegs = () => state.hifzSegments.map(s => s.text);

// ── Reading nav resolver ─────────────────────────────────────────────────────
async function resolveGlobalRuku(surahId, mode, input) {
  const corpus = await loadQuranCorpus();
  const sid = Number(surahId), num = Number(input);
  if (mode === "ruku") {
    const a = corpus.ayahs.find(x => x.surahId === sid && x.location.ruku.numberInSurah === num);
    if (!a) throw new Error(`Ruku ${num} not found in surah ${sid}.`);
    return a.location.ruku.numberInQuran;
  } else {
    const a = corpus.ayahs.find(x => x.surahId === sid && x.numberInSurah === num);
    if (!a) throw new Error(`Ayah ${num} not found in surah ${sid}.`);
    return a.location.ruku.numberInQuran;
  }
}

// ── Journey scoring (8 equal-weight components, each 0–100) ─────────────────
function computeScore({ salah, anger, ayahs, hifzToday, lessonVisited, arabicWords, charity, socialMedia }) {
  const sm = { none: 100, "30": 75, "60": 50, "120": 25, gt120: 0 };
  const components = [
    (salah / 15) * 100,
    ((anger - 1) / 4) * 100,
    (Math.min(ayahs, 25) / 25) * 100,
    (Math.min(hifzToday, 10) / 10) * 100,
    lessonVisited ? 100 : 0,
    (Math.min(arabicWords, 20) / 20) * 100,
    charity > 0 ? 100 : 0,
    sm[String(socialMedia)] ?? 100
  ];
  return Math.round(components.reduce((a, b) => a + b, 0) / components.length);
}

// ── Arabic browse word loader (per-surah, via vocabularyService) ─────────────
async function loadArabicBrowseWords() {
  state.arabicBrowseLoading = true;
  render();
  try {
    const corpus = await loadQuranCorpus();
    const sid = state.arabicSurahId, inp = Number(state.arabicInput);
    let targetAyahs;
    if (state.arabicInputMode === "ruku") {
      targetAyahs = corpus.ayahs
        .filter(a => a.surahId === sid && a.location.ruku.numberInSurah === inp)
        .map(a => a.numberInSurah);
      if (!targetAyahs.length) throw new Error(`Ruku ${inp} not found in that surah.`);
    } else {
      targetAyahs = [inp];
    }
    const words = await getSurahWords(sid);
    const result = [];
    for (const n of targetAyahs) {
      for (const w of words[String(n)] || []) {
        result.push({ ar: w.arabic, tr: w.translation, s: sid, n });
      }
    }
    state.arabicBrowseWords = result;
    initTodayActivity();
    progress.todayActivity.arabicWords = Math.max(progress.todayActivity.arabicWords, result.length);
    persist();
  } catch (e) {
    toast(e.message || "Could not load vocabulary for that selection.");
  } finally {
    state.arabicBrowseLoading = false;
    render();
  }
}

// ── Full-Quran word index loader ─────────────────────────────────────────────
async function loadArabicIndex() {
  if (state.arabicWordIndex !== null) return;
  state.arabicIndexLoading = true;
  render();
  try {
    state.arabicWordIndex = await getWordIndex();
  } catch {
    toast("Full-Quran word index could not be loaded.");
    state.arabicWordIndex = [];
  } finally {
    state.arabicIndexLoading = false;
    render();
  }
}

async function getArabicRandom() {
  if (state.arabicWordIndex === null) {
    await loadArabicIndex();
    if (!state.arabicWordIndex?.length) return;
  }
  if (!state.arabicWordIndex.length) { toast("Word index is not available."); return; }
  let pool = state.arabicWordIndex.filter(w => !state.arabicSessionSeen.has(w.ar));
  if (!pool.length) {
    state.arabicSessionSeen = new Set();
    toast("All words have been shown this session. Starting fresh.");
    pool = state.arabicWordIndex;
  }
  const words = shuffle(pool).slice(0, 20);
  state.arabicRandomWords = words;
  words.forEach(w => state.arabicSessionSeen.add(w.ar));
  initTodayActivity();
  progress.todayActivity.arabicWords += words.length;
  persist();
  render();
}

// ── Primary data loader ──────────────────────────────────────────────────────
async function loadLocalStudyData() {
  state.loading = true;
  render();
  try {
    state.activeSurah = await getRuku(state.targetGlobalRuku);

    // Populate surah list for all dropdowns once
    if (!state.surahList.length) {
      const corpus = await loadQuranCorpus();
      state.surahList = corpus.surahs.map(s => ({ id: s.id, name: s.names.transliteration }));
      state.surahRukus = buildSurahRukus(corpus);
    }

    // Sync nav + hifz picker to active surah
    state.navSurahId = state.activeSurah.id;
    state.hifzPickerSurahId = state.activeSurah.id;
    state.hifzPickerRuku = state.activeSurah.ruku;
    state.arabicSurahId = state.activeSurah.id;
    state.arabicInput = state.activeSurah.ruku;

    const sid = state.activeSurah.id;
    const [wordsResult, tafsirResult] = await Promise.allSettled([
      getSurahWords(sid),
      getSurahTafsir(sid)
    ]);

    if (wordsResult.status === "fulfilled") {
      const words = wordsResult.value;
      state.activeSurah.verses.forEach(v => {
        v.words = (words[String(v.n)] || []).map(w => [w.arabic, w.translation]);
      });
      const seen = new Set();
      state.vocabBank = state.activeSurah.verses
        .flatMap(v => (words[String(v.n)] || []).map(w => ({
          ar: w.arabic, translit: "", meaning: w.translation, frequency: `Ayah ${v.n}`
        })))
        .filter(w => { if (seen.has(w.ar)) return false; seen.add(w.ar); return true; });
    } else {
      console.warn("Arabic words could not be loaded:", wordsResult.reason);
      state.vocabBank = [];
    }

    state.activeSurah.tafsir = tafsirResult.status === "fulfilled" ? tafsirResult.value : null;
    if (tafsirResult.status === "rejected")
      console.warn("Tafsir could not be loaded:", tafsirResult.reason);

    // Build waqf-split Hifz segments
    state.hifzSegments = getWaqfSegments(state.activeSurah.verses);
    state.hifzLastAnswered = null;

    // Honour a picker-requested start position
    state.hifzIndex = 0;
    state.hifzChoices = [];

    state.vocabQuestion = null;
    state.vocabAyahIndex = 0;
    state.quizBank = [];
    newLessonQuiz();
    state.tafsirAyah = null;

    initTodayActivity();
  } catch (error) {
    console.error("Failed to load the local Quran corpus:", error);
    toast(error.message || "Could not load the local Quran corpus.");
  } finally {
    state.loading = false;
    render();
  }
}

// ── Views ────────────────────────────────────────────────────────────────────

function readingView() {
  if (!state.activeSurah) return;
  setHeading("Read with presence", `QURAN · ${state.activeSurah.name.toUpperCase()} · RUKU ${state.activeSurah.rukuInQuran}`);
  const opts = surahDropdownOptions(state.navSurahId);

  app.innerHTML = `
    <section class="hero">
      <p>GLOBAL RUKU ${state.activeSurah.rukuInQuran} · SURAH RUKU ${state.activeSurah.ruku} · ${state.activeSurah.verses.length} AYAHS · LOCAL QURAN CORPUS</p>
      <h2>${state.activeSurah.name} <span style="font-weight:400;font-size:18px">— ${state.activeSurah.meaning}</span></h2>
      <div class="arabic">${state.activeSurah.arabicName}</div>
    </section>

    <div class="card" style="margin-bottom:20px;padding:15px">
      <p class="section-label">NAVIGATE · SURAH &amp; RUKU / AYAH</p>
      <form id="nav-form" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <select id="nav-surah" class="field" style="margin:0;flex:2;min-width:160px">${opts}</select>
        <div class="tabs">
          <button type="button" class="chip ${state.navMode==="ruku"?"active":""}" data-action="nav-mode" data-mode="ruku">Ruku #</button>
          <button type="button" class="chip ${state.navMode==="ayah"?"active":""}" data-action="nav-mode" data-mode="ayah">Ayah #</button>
        </div>
        <input type="number" id="nav-input" class="field" value="${state.navInput}" min="1"
          placeholder="${state.navMode==="ruku"?"Ruku #":"Ayah #"}" style="margin:0;width:80px" required>
        <button type="submit" class="button" style="padding:10px 15px">Load</button>
      </form>
    </div>

    <div class="toolbar">
      <div class="tabs">
        <button class="chip ${state.showTranslation?"active":""}" data-action="toggle-translation">Translation</button>
        <button class="chip ${state.showWords?"active":""}" data-action="toggle-words">Word by word</button>
        <select id="language" aria-label="Translation language">
          <option value="en">English</option>
          <option value="ur">Urdu</option>
        </select>
      </div>
      <button class="button secondary" data-action="hifz-from-reading">Practice this ruku →</button>
    </div>

    <div class="ayah-list">
      ${state.activeSurah.verses.map(v => `
        <article class="ayah-card">
          <span class="ayah-num">${v.n}</span>
          <div class="ayah-ar">${v.ar}</div>
          ${state.showTranslation ? `<p class="translation" ${state.language==="ur"?"dir=rtl":""}>${v[state.language]}</p>` : ""}
          ${state.showWords ? `<div class="word-list">${v.words.map(w=>`<span class="word"><b>${w[0]}</b> ${w[1]}</span>`).join("")}</div>` : ""}
          <div class="ayah-actions">
            <button class="text-button" data-action="toggle-tafsir" data-ayah="${v.n}">⌁ Tafsir</button>
            <button class="text-button" data-action="hifz-at" data-ayah="${v.n}">◇ Hifz from here</button>
          </div>
          ${state.tafsirAyah === v.n ? tafsirFor(v.n) : ""}
        </article>
      `).join("")}
    </div>

    <div style="display:flex;gap:10px;margin-top:16px;padding:0 4px">
      <button class="button secondary" data-action="prev-ruku" ${state.targetGlobalRuku<=1?"disabled":""}>← Prev Ruku</button>
      <button class="button secondary" data-action="next-ruku" ${state.targetGlobalRuku>=556?"disabled":""}>Next Ruku →</button>
    </div>`;

  $("#language").value = state.language;
}

function tafsirFor(n) {
  const text = state.activeSurah.tafsir?.[String(n)]?.tafsir;
  return `
    <div class="tafsir">
      <h4>Tafsir <span class="pill">Ayah ${n}</span></h4>
      ${text
        ? `<p style="font-size:0.88rem;line-height:1.7;max-height:300px;overflow-y:auto">${escape(text)}</p>
           <p class="source">Local tafsir dataset · not a substitute for primary scholarly sources.</p>`
        : `<p>${state.activeSurah.tafsir ? "No tafsir entry found for this ayah." : "Tafsir could not be loaded for this surah."}</p>`}
      <button class="text-button" data-action="to-lesson">Open full lesson →</button>
    </div>`;
}

// ── Hifz ─────────────────────────────────────────────────────────────────────

function makeHifzChoices() {
  const segs = hifzSegs();
  const next = Math.min(state.hifzIndex + 1, segs.length - 1);
  const incorrect = shuffle(segs.filter((_, i) => i !== next)).slice(0, 3);
  state.hifzChoices = shuffle([segs[next], ...incorrect]);
}

function hifzView() {
  if (!state.activeSurah) return;
  setHeading("Build your Hifz", "MEMORIZATION · CONTINUATION PRACTICE");
  const segs = hifzSegs();
  if (!state.hifzChoices.length && !state.hifzLastAnswered) makeHifzChoices();
  const current    = segs[state.hifzIndex] || segs[0];
  const currentAyah = state.hifzSegments[state.hifzIndex]?.ayah;
  const lastAns    = state.hifzLastAnswered;
  const pickerOpts = surahDropdownOptions(state.hifzPickerSurahId);
  const rukuOpts   = rukuDropdownOptions(state.hifzPickerSurahId, state.hifzPickerRuku);

  app.innerHTML = `
    <div class="card" style="margin-bottom:16px;padding:15px">
      <p class="section-label">START FROM SURAH &amp; RUKU</p>
      <form id="hifz-picker" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <select id="hifz-pick-surah" class="field" style="margin:0;flex:2;min-width:160px">${pickerOpts}</select>
        <select id="hifz-pick-ruku" class="field" style="margin:0;flex:2;min-width:190px">${rukuOpts}</select>
        <button type="submit" class="button" style="padding:10px 15px">Go</button>
      </form>
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="button secondary" data-action="prev-hifz-ruku" ${state.targetGlobalRuku <= 1 ? "disabled" : ""}>← Prev Ruku</button>
        <button class="button secondary" data-action="next-hifz-ruku" ${state.targetGlobalRuku >= 556 ? "disabled" : ""}>Next Ruku →</button>
      </div>
    </div>

    <section class="grid-2">
      <div class="card">
        <p class="section-label">CONTINUE THE RECITATION${currentAyah ? ` · AYAH ${currentAyah}` : ""}</p>
        <h2>What comes next?</h2>
          <div class="hifz-prompt">${current}</div>
          <p style="margin:10px 0 6px;font-size:0.85rem;opacity:0.7">Choose the next part:</p>
          <div id="hifz-options">
            ${state.hifzChoices.map(choice => {
              let cls = "hifz-choice";
              if (lastAns) {
                if (choice === lastAns.correct) cls += " correct";
                else if (choice === lastAns.chosen && !lastAns.wasCorrect) cls += " wrong";
              }
              return `<button class="${cls}" data-action="hifz-answer" data-choice="${escape(choice)}" ${lastAns?"disabled":""}>${choice}</button>`;
            }).join("")}
          </div>
          ${lastAns && !lastAns.wasCorrect
            ? `<button class="button secondary" data-action="hifz-continue" style="margin-top:12px">Continue →</button>`
            : ""}
      </div>
      <aside class="card">
        <p class="section-label">SESSION</p>
        <h3>Gentle recall, one step at a time.</h3>
        <p>A wrong answer reveals the correct continuation — you can always keep going. Only correct answers earn a point.</p>
        <div class="metric"><strong>${progress.hifz || 0}</strong><span>Hifz points earned</span></div>
        <div class="metric"><strong>${Math.min(state.hifzIndex + 1, segs.length)} / ${segs.length}</strong><span>Position in this ruku</span></div>
      </aside>
    </section>`;
}

// ── Lesson / Quiz ─────────────────────────────────────────────────────────────

function newLessonQuiz() {
  state.lessonQuiz = shuffle(state.quizBank).slice(0, 5).map(q => ({ ...q, choices: shuffle(q.choices) }));
  state.quizIndex  = 0;
  state.quizScore  = 0;
  state.quizAnswers = {};
}

function lessonView() {
  if (!state.activeSurah) return;
  setHeading("Learn the ruku", `GROUNDED LESSON · ${state.activeSurah.name.toUpperCase()}`);
  if (!state.lessonQuiz.length) newLessonQuiz();
  const current     = state.lessonQuiz[state.quizIndex];
  const answered    = current ? state.quizAnswers[state.quizIndex] : null;
  const allAnswered = state.lessonQuiz.length > 0 && Object.keys(state.quizAnswers).length >= state.lessonQuiz.length;
  const tafsirData  = state.activeSurah.tafsir;
  const firstAyah   = state.activeSurah.verses[0].n;
  const lastAyah    = state.activeSurah.verses.at(-1).n;

  app.innerHTML = `
    <section class="hero">
      <p>LESSON MODE · GLOBAL RUKU ${state.activeSurah.rukuInQuran} · LOCAL SOURCE</p>
      <h2>A locally grounded lesson on ${state.activeSurah.name}</h2>
    </section>
    <div class="lesson-grid">
      <article class="card" style="overflow-y:auto;max-height:75vh">
        <p class="section-label">LOCAL TAFSIR · AYAH BY AYAH</p>
        <h2>${state.activeSurah.name} · Ayahs ${firstAyah}–${lastAyah}</h2>

        ${state.activeSurah.verses.map(v => {
          const text = tafsirData?.[String(v.n)]?.tafsir;
          return `
            <div style="margin-bottom:20px;border-top:1px solid var(--line);padding-top:14px">
              <p class="section-label">AYAH ${v.n}</p>
              <div class="ayah-ar" style="font-size:1.2rem;margin-bottom:6px">${v.ar}</div>
              <p class="translation" style="margin-bottom:10px">${escape(v.en)}</p>
              ${text
                ? `<p style="font-size:0.87rem;line-height:1.75">${escape(text)}</p>`
                : `<p class="source">${tafsirData ? "No tafsir entry for this ayah." : "Tafsir could not be loaded."}</p>`}
            </div>`;
        }).join("")}

        ${state.activeSurah.lesson.summary ? `
          <div style="border-top:1px solid var(--line);margin-top:20px;padding-top:16px">
            <p class="section-label">AI OVERVIEW</p>
            ${renderMarkdown(state.activeSurah.lesson.summary)}
            <div class="source-list">${state.activeSurah.lesson.sources.map(s => `<span class="source">${escape(s)}</span>`).join("")}</div>
          </div>
        ` : ""}

        <button class="text-button" data-action="generate-summary" ${state.summaryLoading?"disabled":""}
          style="margin-top:15px">${state.summaryLoading?"Generating overview…":"Generate AI overview"}</button>
      </article>

      <article class="card">
        <p class="section-label">RUKU QUIZ · AI-GENERATED</p>
        ${allAnswered ? quizEndContent() : current ? `
          <h3 style="font-size:1rem;margin-bottom:12px">${escape(current.q)}</h3>
          <div id="quiz-options">
            ${current.choices.map(choice => {
              const norm = normaliseChoice(choice);
              let cls = "quiz-option";
              if (answered) {
                if (choice === current.a) cls += " correct";
                else if (choice === answered.selected && !answered.isCorrect) cls += " wrong";
              }
              return `<button class="${cls}" data-action="quiz-answer" data-choice="${escape(choice)}"
                ${answered?"disabled":""}>${escape(norm)}</button>`;
            }).join("")}
          </div>
          <div id="quiz-feedback">
            ${answered ? `<div class="feedback">${answered.isCorrect ? "Correct." : `Not quite — ${escape(normaliseChoice(current.a))}`}</div>` : ""}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">
            <button class="button secondary" data-action="quiz-prev"
              ${state.quizIndex===0?"disabled":""} style="padding:8px 14px">← Prev</button>
            <span class="section-label" style="margin:0">Q ${state.quizIndex+1} / ${state.lessonQuiz.length} · ${state.quizScore} ✓</span>
            <button class="button secondary" data-action="quiz-next"
              ${state.quizIndex>=state.lessonQuiz.length-1?"disabled":""} style="padding:8px 14px">Next →</button>
          </div>
        ` : `
          <p>${isGeminiConfigured()
            ? "Generate a five-question quiz from this local ruku."
            : "Please Add your Gemini API key in src/geminiService.js to generate a quiz."}</p>
        `}
        ${!allAnswered ? `<button class="text-button" data-action="refresh-quiz" ${state.quizLoading?"disabled":""}
          style="margin-top:15px">${state.quizLoading?"Generating quiz…":"↻ Generate new quiz"}</button>
        ` : ""}
      </article>
    </div>
    <section class="card" style="margin-top:18px">
      <p class="section-label">ASK AI · CHAT INTERACTIVE</p>
      <h2>Ask about this ruku</h2>
      <p>The AI receives only the locally loaded tafsir for this ruku.</p>
      <form class="ask-form" id="ask-form">
        <input id="ask-input" maxlength="200" placeholder="e.g., Explain the core message of this ruku?" required>
        <button class="button">Ask AI</button>
      </form>
      <div id="ask-output"></div>
    </section>`;
}

function quizEndContent() {
  const total = state.lessonQuiz.length;
  const score = state.quizScore;
  const remark = score === total ? "Excellent recall — you engaged closely with this tafsir." :
    score >= Math.ceil(total * 0.7) ? "Good work. Revisit the tafsir notes for the questions you missed." :
    "Keep studying the tafsir, then try a fresh quiz when you feel ready.";
  return `
    <p class="section-label">QUIZ COMPLETE</p>
    <h2>${score} / ${total}</h2>
    <div class="feedback"><strong>Remarks:</strong> ${remark}</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
      <button class="button" data-action="new-quiz">New quiz</button>
      <button class="button secondary" data-action="next-lesson-ruku" ${state.targetGlobalRuku >= 556 ? "disabled" : ""}>New ruku →</button>
    </div>`;
}

// ── Arabic tab ────────────────────────────────────────────────────────────────

function arabicView() {
  setHeading("Arabic vocabulary", "ARABIC · LEARN WORDS");
  const opts = surahDropdownOptions(state.arabicSurahId);
  app.innerHTML = `
    <div class="toolbar" style="margin-bottom:16px">
      <div class="tabs">
        <button class="chip ${state.arabicMode==="ruku"?"active":""}" data-action="arabic-mode" data-mode="ruku">Ruku vocabulary</button>
        <button class="chip ${state.arabicMode==="letter"?"active":""}" data-action="arabic-mode" data-mode="letter">By Letter</button>
        <button class="chip ${state.arabicMode==="random"?"active":""}" data-action="arabic-mode" data-mode="random">Random 20</button>
      </div>
    </div>
    ${arabicModeContent(opts)}`;
}

function arabicModeContent(opts) {
  // ── Ruku vocabulary mode ──
  if (state.arabicMode === "ruku") {
    const active = state.activeSurah;
    const rukuOpts = rukuDropdownOptions(state.arabicSurahId, state.arabicInput);
    return `
      <div class="card" style="margin-bottom:16px;padding:15px">
        <p class="section-label">START FROM SURAH &amp; RUKU</p>
        <form id="arabic-ruku-form" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <select id="arabic-ruku-surah" class="field" style="margin:0;flex:2;min-width:160px">${opts}</select>
          <select id="arabic-ruku-select" class="field" style="margin:0;flex:2;min-width:190px">${rukuOpts}</select>
          <button type="submit" class="button" style="padding:10px 16px">Go</button>
        </form>
      </div>
      ${active ? rukuVocabularyContent(active) : ""}`;
  }

  // ── Letter mode ──
  if (state.arabicMode === "letter") {
    if (state.arabicIndexLoading)
      return `<div class="card"><p>Loading full-Quran word index…</p></div>`;
    const filtered = (state.arabicWordIndex && state.arabicLetter)
      ? state.arabicWordIndex.filter(w => baseFirstLetter(w.ar) === state.arabicLetter)
      : [];
    return `
      <div class="card" style="margin-bottom:16px;padding:15px">
        <p class="section-label">FILTER BY FIRST LETTER · FULL QURAN (${state.arabicWordIndex ? `${state.arabicWordIndex.length} unique word forms loaded` : "loading…"})</p>
        <p style="margin-bottom:12px">Choose a letter to see all Quran words starting with it.</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${ARABIC_LETTERS.map(l => `
            <button class="chip ${state.arabicLetter===l?"active":""}" data-action="arabic-letter" data-letter="${l}"
              style="font-family:'Amiri Quran',serif;font-size:1.3rem;padding:8px 14px;min-width:44px">${l}</button>
          `).join("")}
        </div>
        ${filtered.length ? `<p class="source" style="margin-top:10px">${filtered.length} results${filtered.length>200?" (showing first 200)":""}</p>` : ""}
      </div>
      ${filtered.length
        ? wordGrid(filtered.slice(0, 200))
        : state.arabicLetter && state.arabicWordIndex
          ? `<div class="card"><p>No words found starting with ${state.arabicLetter}.</p></div>`
          : ""}`;
  }

  // ── Random mode ──
  if (state.arabicMode === "random") {
    if (state.arabicIndexLoading)
      return `<div class="card"><p>Loading full-Quran word index…</p></div>`;
    const remaining = state.arabicWordIndex
      ? state.arabicWordIndex.length - state.arabicSessionSeen.size
      : null;
    return `
      <div class="card" style="margin-bottom:16px;padding:15px">
        <p class="section-label">RANDOM VOCABULARY DRILL · FULL QURAN</p>
        <p>20 unique words sampled from the full Quran. Already-seen words are skipped for this session.</p>
        ${remaining !== null
          ? `<p class="source">${remaining} words remaining in pool this session.</p>`
          : `<p class="source">Word index not yet loaded — click the button to fetch it once (~1 MB).</p>`}
        <button class="button" data-action="arabic-random" style="margin-top:12px">
          ${state.arabicRandomWords.length ? "Get Next 20 →" : "Get 20 Random Words"}
        </button>
      </div>
      ${state.arabicRandomWords.length ? wordGrid(state.arabicRandomWords) : ""}`;
  }
  return "";
}

function rukuVocabularyContent(active) {
  const ayahsWithWords = active.verses.filter(v => v.words.length);
  if (!ayahsWithWords.length) return `<section class="card"><h2>No vocabulary loaded for this ruku</h2><p>The word-by-word dataset has no entries for this selection.</p></section>`;
  state.vocabAyahIndex = Math.min(state.vocabAyahIndex, ayahsWithWords.length - 1);
  const ayah = ayahsWithWords[state.vocabAyahIndex];
  if (!state.vocabQuestion || state.vocabQuestion.ayah !== ayah.n) {
    const [ar, meaning] = ayah.words[Math.floor(Math.random() * ayah.words.length)];
    const allMeanings = active.verses.flatMap(v => v.words.map(w => w[1])).filter(Boolean);
    state.vocabQuestion = {
      ayah: ayah.n,
      word: { ar, meaning },
      choices: shuffle([meaning, ...shuffle(allMeanings.filter(m => m !== meaning)).slice(0, 3)])
    };
  }
  const q = state.vocabQuestion;
  const firstAyah = active.verses[0].n;
  const lastAyah = active.verses.at(-1).n;
  return `
    <section class="grid-2">
      <article class="card">
        <p class="section-label">RUKU ${active.ruku}: VERSES ${firstAyah} TO ${lastAyah}</p>
        <h2>Words in this ruku</h2>
        <div>${active.verses.map(v => `
          <div class="vocab-card">
            <div class="vocab-ar">${v.n}</div>
            <div class="word-list" style="margin:0;padding:0;border:0">${v.words.map(w => `<span class="word"><b>${w[0]}</b> ${escape(w[1])}</span>`).join("")}</div>
          </div>`).join("")}</div>
      </article>
      <article class="card">
        <p class="section-label">QUICK CHECK · AYAH ${ayah.n}</p>
        <h2>What does <span class="vocab-ar">${q.word.ar}</span> mean?</h2>
        ${q.choices.map(c => `<button class="quiz-option" data-action="vocab-answer" data-choice="${escape(c)}">${escape(c)}</button>`).join("")}
        <div id="vocab-feedback"></div>
        <p class="source" style="margin-top:18px">A correct answer moves automatically to the next ayah.</p>
      </article>
    </section>
    <div style="display:flex;gap:10px;margin-top:16px;padding:0 4px">
      <button class="button secondary" data-action="prev-vocab-ruku" ${state.targetGlobalRuku <= 1 ? "disabled" : ""}>← Prev Ruku</button>
      <button class="button secondary" data-action="next-vocab-ruku" ${state.targetGlobalRuku >= 556 ? "disabled" : ""}>Next Ruku →</button>
    </div>`;
}

function wordGrid(words) {
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">
      ${words.map(w => `
        <div class="vocab-card" style="flex-direction:column;align-items:flex-start;gap:4px;padding:14px">
          <div class="vocab-ar" style="font-size:1.4rem;line-height:1.4">${w.ar}</div>
          <p style="font-size:0.82rem;color:var(--text-secondary);margin:4px 0 6px;flex:1">${escape(w.tr)}</p>
          <span class="pill" style="font-size:0.72rem">${w.s}:${w.n}</span>
        </div>
      `).join("")}
    </div>`;
}

// ── Vocabulary (ruku-scoped) ───────────────────────────────────────────────────

function vocabularyView() {
  if (!state.activeSurah) return;
  if (!state.vocabBank.length) {
    setHeading("Arabic, one word at a time", "VOCABULARY · LOCAL DATASET");
    app.innerHTML = `<section class="card"><p class="section-label">LOCAL DATASET</p><h2>No vocabulary loaded for this ruku</h2><p>The word-by-word dataset could not be loaded or has no entries for this ruku.</p></section>`;
    return;
  }
  setHeading("Arabic, one word at a time", "VOCABULARY · WORD BY WORD");
  if (!state.vocabQuestion) {
    const word = state.vocabBank[Math.floor(Math.random() * state.vocabBank.length)];
    state.vocabQuestion = {
      word,
      choices: shuffle([word.meaning, ...shuffle(state.vocabBank.filter(w => w !== word).map(w => w.meaning)).slice(0, 3)])
    };
  }
  const q = state.vocabQuestion;
  app.innerHTML = `
    <section class="grid-2">
      <article class="card">
        <p class="section-label">RUKU VOCABULARY</p>
        <h2>Words from this ruku</h2>
        <div>
          ${state.vocabBank.map(w => `
            <div class="vocab-card">
              <div class="vocab-ar">${w.ar}</div>
              <div>${w.translit ? `<strong>${w.translit}</strong>` : ""}<p>${w.frequency}</p></div>
              <span class="pill">${w.meaning}</span>
            </div>
          `).join("")}
        </div>
      </article>
      <article class="card">
        <p class="section-label">QUICK CHECK · MULTIPLE CHOICE</p>
        <h2>What does <span class="vocab-ar">${q.word.ar}</span> mean?</h2>
        ${q.choices.map(c => `<button class="quiz-option" data-action="vocab-answer" data-choice="${escape(c)}">${c}</button>`).join("")}
        <div id="vocab-feedback"></div>
        <button class="text-button" data-action="next-vocab" style="margin-top:15px">New word →</button>
        <hr style="border:0;border-top:1px solid var(--line);margin:24px 0">
        <p class="section-label">IN THIS RUKU</p>
        <div class="word-list">
          ${state.activeSurah.verses.flatMap(v => v.words).slice(0, 12).map(w => `<span class="word"><b>${w[0]}</b> ${w[1]}</span>`).join("")}
        </div>
      </article>
    </section>`;
}

// ── Journey ───────────────────────────────────────────────────────────────────

function streak() {
  let n = 0, d = new Date();
  while (progress.daily[d.toISOString().slice(0, 10)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function calendar() {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const first = new Date(y, m, 1).getDay();
  return Array.from({ length: first + days }, (_, i) => {
    if (i < first) return `<span></span>`;
    const d   = i - first + 1;
    const id  = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const cls = [progress.daily[id] ? "done" : "", id === today() ? "today" : ""].join(" ");
    return `<div class="day ${cls}">${d}${progress.daily[id]
      ? `<br><span style="font-size:0.7rem;opacity:0.9">✦${progress.daily[id].score}</span>`
      : ""}</div>`;
  }).join("");
}

function progressView() {
  setHeading("Your journey", "DAILY RHYTHM · PRIVATE ON THIS DEVICE");
  initTodayActivity();
  const saved = progress.daily[today()];
  const act   = progress.todayActivity;

  app.innerHTML = `
    <section class="metrics">
      <div class="metric"><strong>${streak()}</strong><span>day streak</span></div>
      <div class="metric"><strong>${points()}</strong><span>total points</span></div>
      <div class="metric"><strong>${Object.keys(progress.daily).length}</strong><span>check-ins</span></div>
    </section>
    <section class="grid-2">
      <article class="card">
        <p class="section-label">${saved && !state.editingEntry ? "TODAY IS SAVED" : "DAILY CHECK-IN"}</p>
        <h2>How did today go?</h2>
        <p>For each salah: mosque = 3, home = 2, qaza = 1, missed = 0.</p>
        ${saved && !state.editingEntry
          ? `<div class="notice">Today's score is <strong>${saved.score}/100</strong>.
               <button class="text-button" data-action="edit-checkin" style="margin-left:10px">Edit today</button>
             </div>`
          : checkinForm(state.editingEntry || {})}
        <button class="text-button" data-action="enable-reminder" style="margin-top:12px">Enable 11pm reminder</button>
      </article>
      <article class="card">
        <p class="section-label">${new Intl.DateTimeFormat("en",{month:"long",year:"numeric"}).format(new Date()).toUpperCase()}</p>
        <h2>Consistency calendar</h2>
        <div class="calendar">${calendar()}</div>
      </article>
    </section>
    <section class="card" style="margin-top:16px">
      <p class="section-label">TODAY'S ACTIVITY · AUTO-TRACKED</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-top:12px">
        <div class="metric"><strong>${act.hifzPts}</strong><span>Hifz pts today</span></div>
        <div class="metric"><strong>${act.lessonVisited ? "✓" : "—"}</strong><span>Lesson visited</span></div>
        <div class="metric"><strong>${act.arabicWords}</strong><span>Arabic words seen</span></div>
      </div>
    </section>`;
}

function checkinForm(prefill = {}) {
  initTodayActivity();
  const act = progress.todayActivity;
  const prayers = ["Fajr","Dhuhr","Asr","Maghrib","Isha"];
  const salahOpts = (p) => [3,2,1,0].map(v => {
    const sel = (prefill[p] !== undefined ? Number(prefill[p]) : 3) === v ? "selected" : "";
    return `<option value="${v}" ${sel}>${["Mosque","Home","Qaza","Missed"][3-v]}</option>`;
  }).join("");

  return `
    <form id="checkin-form">
      <div class="checkin-grid">
        ${prayers.map(p => `<div class="prayer"><label>${p}</label><select name="${p}">${salahOpts(p)}</select></div>`).join("")}
      </div>
      <div class="field">
        <label for="anger">Anger control (1 = struggled, 5 = excellent)</label>
        <select id="anger" name="anger">
          ${[1,2,3,4,5].map(n => `<option value="${n}" ${(prefill.anger||3)===n?"selected":""}>${n}/5</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="ayahs">Ayahs read today</label>
        <input id="ayahs" name="ayahs" type="number" min="0" max="1000" value="${prefill.ayahs||0}" required>
      </div>
      <div class="field">
        <label>Hifz today <span class="pill">auto-tracked</span></label>
        <input type="number" value="${prefill.hifzToday ?? act.hifzPts}" readonly
          style="opacity:0.65;cursor:default">
      </div>
      <div class="field">
        <label>Lesson visited <span class="pill">auto-tracked</span></label>
        <input type="text" value="${(prefill.lessonVisited ?? act.lessonVisited) ? "Yes ✓" : "Not yet"}" readonly
          style="opacity:0.65;cursor:default">
      </div>
      <div class="field">
        <label>Arabic words viewed <span class="pill">auto-tracked</span></label>
        <input type="number" value="${prefill.arabicWords ?? act.arabicWords}" readonly
          style="opacity:0.65;cursor:default">
      </div>
      <div class="field">
        <label for="charity">Charity today (Rs) — any amount earns full credit</label>
        <input id="charity" name="charity" type="number" min="0" value="${prefill.charity||0}">
      </div>
      <div class="field">
        <label for="social-media">Social media time today (less is better)</label>
        <select id="social-media" name="social-media">
          <option value="none" ${(prefill.socialMedia||"none")==="none"?"selected":""}>None or minimal</option>
          <option value="30"   ${prefill.socialMedia==="30"?"selected":""}>~30 minutes</option>
          <option value="60"   ${prefill.socialMedia==="60"?"selected":""}>~1 hour</option>
          <option value="120"  ${prefill.socialMedia==="120"?"selected":""}>~2 hours</option>
          <option value="gt120" ${prefill.socialMedia==="gt120"?"selected":""}>More than 2 hours</option>
        </select>
      </div>
      <button class="button gold">Save today's score</button>
    </form>`;
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  try {
    if (state.loading) {
      app.innerHTML = `
        <div class="card empty" style="padding:50px 20px;text-align:center">
          <div class="brand-mark" style="margin:0 auto 20px;font-size:32px;width:50px;height:50px">ن</div>
          <h2>Loading the local Quran corpus…</h2>
          <p>Retrieving global ruku ${state.targetGlobalRuku} from the local corpus.</p>
        </div>`;
      return;
    }
    const views = { reading: readingView, hifz: hifzView, lesson: lessonView,
                    vocabulary: vocabularyView, arabic: arabicView, progress: progressView };
    (views[state.view] || readingView)();
    document.querySelectorAll(".nav-link").forEach(b => b.classList.toggle("active", b.dataset.view === state.view));
  } catch (error) {
    console.error(error);
    app.innerHTML = `<div class="card empty"><h2>We could not load this view.</h2><p>Your saved progress is safe. Please refresh and try again.</p></div>`;
  }
}

function selectView(view) {
  state.view = view;
  if (view === "lesson") {
    initTodayActivity();
    if (!progress.todayActivity.lessonVisited) { progress.todayActivity.lessonVisited = true; persist(); }
  }
  render();
}

// ── Event delegation ──────────────────────────────────────────────────────────

document.addEventListener("click", event => {
  const btn = event.target.closest("[data-action],[data-view]");
  if (!btn) return;
  if (btn.dataset.view) return selectView(btn.dataset.view);
  const action = btn.dataset.action;
  try {
    // Reading
    if (action === "toggle-translation")  { state.showTranslation = !state.showTranslation; render(); }
    if (action === "toggle-words")        { state.showWords = !state.showWords; render(); }
    if (action === "toggle-tafsir")       { const n = Number(btn.dataset.ayah); state.tafsirAyah = state.tafsirAyah === n ? null : n; render(); }
    if (action === "nav-mode")            { state.navMode = btn.dataset.mode; render(); }
    if (action === "prev-ruku")           { if (state.targetGlobalRuku > 1)   { state.targetGlobalRuku--; loadLocalStudyData(); } }
    if (action === "next-ruku")           { if (state.targetGlobalRuku < 556) { state.targetGlobalRuku++; loadLocalStudyData(); } }

    // Hifz
    if (action === "hifz-from-reading")   { state.hifzIndex = 0; state.hifzChoices = []; state.hifzLastAnswered = null; selectView("hifz"); }
    if (action === "hifz-at") {
      const n = Number(btn.dataset.ayah);
      const idx = state.hifzSegments.findIndex(s => s.ayah === n);
      state.hifzIndex = Math.max(0, idx);
      state.hifzChoices = [];
      state.hifzLastAnswered = null;
      selectView("hifz");
    }
    if (action === "restart-hifz")        { state.hifzIndex = 0; state.hifzChoices = []; state.hifzLastAnswered = null; render(); }
    if (action === "prev-hifz-ruku")     { if (state.targetGlobalRuku > 1) { state.targetGlobalRuku--; loadLocalStudyData(); } }
    if (action === "next-hifz-ruku")     { if (state.targetGlobalRuku < 556) { state.targetGlobalRuku++; loadLocalStudyData(); } }
    if (action === "hifz-answer")         answerHifz(btn);
    if (action === "hifz-continue") {
      if (state.hifzIndex + 1 >= state.hifzSegments.length - 1) advanceHifzRuku();
      else { state.hifzIndex++; state.hifzChoices = []; state.hifzLastAnswered = null; render(); }
    }

    // Lesson / quiz
    if (action === "to-lesson")           selectView("lesson");
    if (action === "quiz-answer")         answerQuiz(btn);
    if (action === "quiz-prev")           { state.quizIndex = Math.max(0, state.quizIndex - 1); render(); }
    if (action === "quiz-next")           { state.quizIndex = Math.min(state.lessonQuiz.length - 1, state.quizIndex + 1); render(); }
    if (action === "refresh-quiz")        generateQuiz();
    if (action === "new-quiz")            { newLessonQuiz(); render(); }
    if (action === "next-lesson-ruku")    { if (state.targetGlobalRuku < 556) { state.targetGlobalRuku++; loadLocalStudyData(); } }
    if (action === "generate-summary")    generateSummary();

    // Vocabulary
    if (action === "vocab-answer")        answerVocab(btn);
    if (action === "next-vocab")          { state.vocabQuestion = null; render(); }
    if (action === "prev-vocab-ruku")     { if (state.targetGlobalRuku > 1) { state.targetGlobalRuku--; loadLocalStudyData(); } }
    if (action === "next-vocab-ruku")     { if (state.targetGlobalRuku < 556) { state.targetGlobalRuku++; loadLocalStudyData(); } }

    // Arabic tab
    if (action === "arabic-mode") {
      state.arabicMode = btn.dataset.mode;
      if ((state.arabicMode === "letter" || state.arabicMode === "random") && state.arabicWordIndex === null && !state.arabicIndexLoading) {
        loadArabicIndex();
      } else {
        render();
      }
    }
    if (action === "arabic-browse-mode")  { state.arabicInputMode = btn.dataset.mode; render(); }
    if (action === "arabic-letter") {
      state.arabicLetter = btn.dataset.letter;
      if (state.arabicWordIndex === null && !state.arabicIndexLoading) { loadArabicIndex(); }
      else render();
    }
    if (action === "arabic-random")       getArabicRandom();

    // Journey
    if (action === "enable-reminder")     enableReminder();
    if (action === "edit-checkin")        { state.editingEntry = { ...progress.daily[today()] }; delete progress.daily[today()]; persist(); render(); }
  } catch (error) {
    console.error(error);
    toast("That action could not be completed. Please try again.");
  }
});

document.addEventListener("change", event => {
  if (event.target.id === "language")            { state.language = event.target.value === "ur" ? "ur" : "en"; render(); }
  if (event.target.id === "nav-surah")           { state.navSurahId = Number(event.target.value); }
  if (event.target.id === "arabic-browse-surah") { state.arabicSurahId = Number(event.target.value); }
  if (event.target.id === "arabic-ruku-surah") {
    state.arabicSurahId = Number(event.target.value);
    state.arabicInput = state.surahRukus[state.arabicSurahId]?.[0]?.number || 1;
    render();
  }
  if (event.target.id === "hifz-pick-surah") {
    state.hifzPickerSurahId = Number(event.target.value);
    state.hifzPickerRuku = state.surahRukus[state.hifzPickerSurahId]?.[0]?.number || 1;
    render();
  }
});

document.addEventListener("submit", event => {
  event.preventDefault();
  try {
    if (event.target.id === "ask-form")          { askAI($("#ask-input").value); }
    if (event.target.id === "checkin-form")      { saveCheckin(new FormData(event.target)); }
    if (event.target.id === "nav-form") {
      const sid = Number($("#nav-surah").value);
      const inp = Number($("#nav-input").value);
      state.navSurahId = sid;
      state.navInput   = inp;
      resolveGlobalRuku(sid, state.navMode, inp)
        .then(g => { state.targetGlobalRuku = g; return loadLocalStudyData(); })
        .catch(e => toast(e.message || "Could not resolve that entry."));
    }
    if (event.target.id === "hifz-picker") {
      const sid    = Number($("#hifz-pick-surah").value);
      const rukuN  = Number($("#hifz-pick-ruku").value);
      state.hifzPickerSurahId = sid;
      state.hifzPickerRuku = rukuN;
      resolveGlobalRuku(sid, "ruku", rukuN)
        .then(g => { state.targetGlobalRuku = g; return loadLocalStudyData(); })
        .catch(e => toast(e.message || "Could not load that ruku."));
    }
    if (event.target.id === "arabic-browse-form") {
      state.arabicSurahId = Number($("#arabic-browse-surah").value);
      state.arabicInput   = Number($("#arabic-browse-input").value);
      loadArabicBrowseWords();
    }
    if (event.target.id === "arabic-ruku-form") {
      const sid = Number($("#arabic-ruku-surah").value);
      const rukuN = Number($("#arabic-ruku-select").value);
      state.arabicSurahId = sid;
      state.arabicInput = rukuN;
      resolveGlobalRuku(sid, "ruku", rukuN)
        .then(g => { state.targetGlobalRuku = g; return loadLocalStudyData(); })
        .catch(e => toast(e.message || "Could not load that ruku."));
    }
  } catch (error) {
    console.error(error);
    toast("Unable to process request.");
  }
});

// ── Answer handlers ───────────────────────────────────────────────────────────

function answerHifz(btn) {
  const segs     = hifzSegs();
  const nextIndex = Math.min(state.hifzIndex + 1, segs.length - 1);
  const expected = segs[nextIndex];
  const correct  = btn.dataset.choice === expected;
  state.hifzLastAnswered = { chosen: btn.dataset.choice, correct: expected, wasCorrect: correct };
  if (correct) {
    progress.hifz = (progress.hifz || 0) + 1;
    initTodayActivity();
    progress.todayActivity.hifzPts++;
    persist();
    render();
    setTimeout(() => {
      if (nextIndex >= segs.length - 1) advanceHifzRuku();
      else { state.hifzIndex++; state.hifzChoices = []; state.hifzLastAnswered = null; render(); }
    }, 700);
  } else {
    render(); // show highlighted correct + Continue button
  }
}

function advanceHifzRuku() {
  if (state.targetGlobalRuku >= 556) {
    state.hifzIndex = 0;
    state.hifzChoices = [];
    state.hifzLastAnswered = null;
    toast("You have reached the end of the Quran. Starting this ruku again.");
    render();
    return;
  }
  state.targetGlobalRuku++;
  loadLocalStudyData();
}

function answerQuiz(btn) {
  if (state.quizAnswers[state.quizIndex]) return; // already answered
  const q = state.lessonQuiz[state.quizIndex];
  const selected  = btn.dataset.choice;
  const isCorrect = selected === q.a;
  state.quizAnswers[state.quizIndex] = { selected, isCorrect };
  if (isCorrect) state.quizScore++;
  render();
}

function answerVocab(btn) {
  const correct = btn.dataset.choice === state.vocabQuestion.word.meaning;
  document.querySelectorAll(".quiz-option").forEach(x => x.disabled = true);
  btn.classList.add(correct ? "correct" : "wrong");
  $("#vocab-feedback").innerHTML = `<div class="feedback">${correct ? "Correct — moving to the next ayah…" : `The answer is: ${state.vocabQuestion.word.meaning}.`}</div>`;
  if (correct) {
    const ayahsWithWords = state.activeSurah.verses.filter(v => v.words.length);
    setTimeout(() => {
      state.vocabAyahIndex = (state.vocabAyahIndex + 1) % ayahsWithWords.length;
      state.vocabQuestion = null;
      render();
    }, 700);
  }
}

// ── AI helpers ────────────────────────────────────────────────────────────────

async function generateSummary() {
  if (!isGeminiConfigured()) return toast("Paste your Gemini API key in src/geminiService.js to use AI summaries.");
  state.summaryLoading = true; render();
  try {
    const summary = await generateStudySummary(createStudyContext(state.activeSurah));
    state.activeSurah.lesson = {
      ...state.activeSurah.lesson,
      summary: summary.summary || summary.background || "",
      sources: [...state.activeSurah.lesson.sources, "AI overview constrained to the selected local ruku"]
    };
  } catch (e) {
    console.error("Could not generate AI summary:", e);
    toast("Could not generate an AI summary. Check the key and Gemini settings.");
  } finally {
    state.summaryLoading = false; render();
  }
}

async function generateQuiz() {
  if (!isGeminiConfigured()) return toast("Please paste your Gemini API key in src/geminiService.js to use AI quizzes.");
  state.quizLoading = true; render();
  try {
    const quiz = await generateDynamicQuiz(createStudyContext(state.activeSurah));
    if (!Array.isArray(quiz) || quiz.length < 5) throw new Error("Gemini returned an incomplete quiz.");
    state.quizBank = quiz;
    newLessonQuiz();
  } catch (e) {
    console.error("Could not generate AI quiz:", e);
    toast("Could not generate an AI quiz. Check the key and Gemini settings.");
  } finally {
    state.quizLoading = false; render();
  }
}

async function askAI(question) {
  if (!isGeminiConfigured()) return toast("Paste your Gemini API key in src/geminiService.js to use the AI Assistant.");
  const out = $("#ask-output");
  out.innerHTML = `<div class="ask-answer"><strong>Grounded answer</strong><br>Asking AI companion…</div>`;
  try {
    const response = await askGeminiAboutLesson(question, createStudyContext(state.activeSurah));
    out.innerHTML = `
      <div class="ask-answer">
        <strong>Grounded answer</strong>
        ${renderMarkdown(response)}
        <span class="source">Source: locally loaded ${state.activeSurah.name}, ruku ${state.activeSurah.ruku}</span>
      </div>`;
  } catch {
    out.innerHTML = `<div class="ask-answer"><strong>Grounded answer</strong><br>Error generating answer.</div>`;
  }
}

// ── Check-in save ─────────────────────────────────────────────────────────────

function saveCheckin(data) {
  initTodayActivity();
  const act   = progress.todayActivity;
  const salah = ["Fajr","Dhuhr","Asr","Maghrib","Isha"].reduce((s, p) => s + Number(data.get(p)||0), 0);
  const anger       = Number(data.get("anger") || 1);
  const ayahs       = Math.max(0, Number(data.get("ayahs") || 0));
  const charity     = Math.max(0, Number(data.get("charity") || 0));
  const socialMedia = data.get("social-media") || "none";
  const hifzToday   = act.hifzPts;
  const lessonVisited = act.lessonVisited;
  const arabicWords = act.arabicWords;

  const score = computeScore({ salah, anger, ayahs, hifzToday, lessonVisited, arabicWords, charity, socialMedia });
  progress.daily[today()] = { score, salah, anger, ayahs, hifzToday, lessonVisited, arabicWords, charity, socialMedia };
  state.editingEntry = null;
  persist();
  toast(`Saved ${score}/100 for today.`);
  render();
}

// ── Reminder ──────────────────────────────────────────────────────────────────

function enableReminder() {
  if (!("Notification" in window)) return toast("Notifications are not supported in this browser.");
  Notification.requestPermission()
    .then(r => toast(r === "granted" ? "Reminder enabled while this app is open." : "Notification permission was not granted."))
    .catch(() => toast("Could not enable notifications."));
}

function reminderTick() {
  const now = new Date();
  if (now.getHours() === 23 && !progress.daily[today()] && "Notification" in window && Notification.permission === "granted") {
    new Notification("NoorPath", { body: "Before the day closes, save your gentle daily check-in." });
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
window.addEventListener("error", e => console.error("Unexpected app error", e.error));
setInterval(reminderTick, 60 * 60 * 1000);
reminderTick();
loadLocalStudyData();
