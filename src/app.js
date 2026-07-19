import { getRuku, createStudyContext } from "./quranService.js";
import { getSurahTafsir } from "./tafsirService.js";
import { getSurahWords } from "./vocabularyService.js";
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
  try { 
    return JSON.parse(localStorage.getItem(storeKey)) || { daily: {}, hifz: 0 }; 
  } catch { 
    return { daily: {}, hifz: 0 }; 
  } 
};

let progress = safeRead();

let state = { 
  view: "reading", 
  language: "en", 
  showTranslation: true, 
  showWords: false, 
  tafsirAyah: null, 
  hifzIndex: 0, 
  hifzChoices: [], 
  lessonQuiz: [], 
  quizIndex: 0, 
  quizScore: 0, 
  vocabQuestion: null,
  // Local corpus selection and optional AI UI state
  loading: false,
  targetGlobalRuku: 1,
  activeSurah: null,
  quizBank: [],
  vocabBank: [],
  summaryLoading: false,
  quizLoading: false
};

const escape = (value = "") => String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
const renderMarkdown = (text = "") => {
  const safe = escape(String(text));
  return safe
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .split(/\n\n+/)
    .map(para => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
};
const shuffle = array => [...array].sort(() => Math.random() - 0.5);
const today = () => new Date().toISOString().slice(0, 10);
const persist = () => { try { localStorage.setItem(storeKey, JSON.stringify(progress)); } catch { toast("Your browser could not save progress locally."); } };
const toast = message => { const node = $("#toast-template").content.firstElementChild.cloneNode(true); node.textContent = message; document.body.append(node); setTimeout(() => node.remove(), 2800); };
const points = () => Object.values(progress.daily).reduce((sum, item) => sum + (item.score || 0), 0) + (progress.hifz || 0);
const setHeading = (title, crumb) => { $("#view-title").textContent = title; $("#crumb").textContent = crumb; $("#points-total").textContent = points(); };
const ayahSegments = () => state.activeSurah ? state.activeSurah.verses.map(v => v.ar.split(" ").slice(0, 4).join(" ")) : [];

// Quran text, translations, tafsir, and word-by-word data are all sourced locally.
async function loadLocalStudyData() {
  state.loading = true;
  render();
  try {
    state.activeSurah = await getRuku(state.targetGlobalRuku);

    // Load vocabulary and tafsir for the active surah in parallel; failures are non-fatal.
    const surahId = state.activeSurah.id;
    const [wordsResult, tafsirResult] = await Promise.allSettled([
      getSurahWords(surahId),
      getSurahTafsir(surahId)
    ]);

    // Populate verse words from the local word-by-word dataset.
    if (wordsResult.status === "fulfilled") {
      const words = wordsResult.value;
      state.activeSurah.verses.forEach(v => {
        const ayahWords = words[String(v.n)] || [];
        v.words = ayahWords.map(w => [w.arabic, w.translation]);
      });
      // Build vocab bank: unique words from this ruku for the quiz.
      const seen = new Set();
      state.vocabBank = state.activeSurah.verses.flatMap(v =>
        (words[String(v.n)] || []).map(w => ({
          ar: w.arabic,
          translit: "",
          meaning: w.translation,
          frequency: `Ayah ${v.n}`
        }))
      ).filter(w => { if (seen.has(w.ar)) return false; seen.add(w.ar); return true; });
    } else {
      console.warn("Arabic words could not be loaded:", wordsResult.reason);
      state.vocabBank = [];
    }

    // Attach tafsir data; null signals load failure (views handle this gracefully).
    state.activeSurah.tafsir = tafsirResult.status === "fulfilled" ? tafsirResult.value : null;
    if (tafsirResult.status === "rejected") {
      console.warn("Tafsir could not be loaded:", tafsirResult.reason);
    }

    state.vocabQuestion = null;
    state.quizBank = [];
    newLessonQuiz();
    state.tafsirAyah = null;
    state.hifzIndex = 0;
    state.hifzChoices = [];
  } catch (error) {
    console.error("Failed to load the local Quran corpus:", error);
    toast(error.message || "Could not load the local Quran corpus.");
  } finally {
    state.loading = false;
    render();
  }
}

function readingView() {
  if (!state.activeSurah) return;
  setHeading("Read with presence", `QURAN · ${state.activeSurah.name.toUpperCase()} · RUKU ${state.activeSurah.rukuInQuran}`);
  
  app.innerHTML = `
    <section class="hero">
      <p>GLOBAL RUKU ${state.activeSurah.rukuInQuran} · SURAH RUKU ${state.activeSurah.ruku} · ${state.activeSurah.verses.length} AYAHS · LOCAL QURAN CORPUS</p>
      <h2>${state.activeSurah.name} <span style="font-weight:400;font-size:18px">— ${state.activeSurah.meaning}</span></h2>
      <div class="arabic">${state.activeSurah.arabicName}</div>
    </section>
    
    <!-- Global Ruku Navigation -->
    <div class="card" style="margin-bottom: 20px; padding: 15px;">
      <p class="section-label">NAVIGATE BY GLOBAL RUKU (1–556)</p>
      <form id="surah-loader-form" style="display: flex; gap: 10px; align-items: center;">
        <input type="number" id="input-global-ruku" class="field" value="${state.targetGlobalRuku}" min="1" max="556" placeholder="Global ruku 1–556" style="margin:0; flex: 1;" required />
        <button type="submit" class="button" style="padding: 10px 15px;">Load</button>
      </form>
    </div>

    <div class="toolbar">
      <div class="tabs">
        <button class="chip ${state.showTranslation ? "active" : ""}" data-action="toggle-translation">Translation</button>
        <button class="chip ${state.showWords ? "active" : ""}" data-action="toggle-words">Word by word</button>
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
          ${state.showTranslation ? `<p class="translation" ${state.language === "ur" ? "dir=rtl" : ""}>${v[state.language]}</p>` : ""}
          ${state.showWords ? `
            <div class="word-list">
              ${v.words.map(w => `<span class="word"><b>${w[0]}</b> ${w[1]}</span>`).join("")}
            </div>
          ` : ""}
          <div class="ayah-actions">
            <button class="text-button" data-action="toggle-tafsir" data-ayah="${v.n}">⌁ Tafsir</button>
            <button class="text-button" data-action="hifz-at" data-ayah="${v.n}">◇ Hifz from here</button>
          </div>
          ${state.tafsirAyah === v.n ? tafsirFor(v.n) : ""}
        </article>
      `).join("")}
    </div>`;
    
  $("#language").value = state.language;
}

function tafsirFor(n) {
  const tafsirText = state.activeSurah.tafsir?.[String(n)]?.tafsir;
  return `
    <div class="tafsir">
      <h4>Tafsir <span class="pill">Ayah ${n}</span></h4>
      ${tafsirText
        ? `<p style="font-size: 0.88rem; line-height: 1.7; max-height: 300px; overflow-y: auto;">${escape(tafsirText)}</p>
           <p class="source">Local tafsir dataset · not a substitute for primary scholarly sources.</p>`
        : `<p>${state.activeSurah.tafsir ? "No tafsir entry found for this ayah." : "Tafsir could not be loaded for this surah."}</p>`}
      <button class="text-button" data-action="to-lesson">Open full lesson →</button>
    </div>`;
}

function makeHifzChoices() {
  const segments = ayahSegments();
  const next = Math.min(state.hifzIndex + 1, segments.length - 1);
  const incorrect = shuffle(segments.filter((_, i) => i !== next)).slice(0, 3);
  state.hifzChoices = shuffle([segments[next], ...incorrect]);
}

function hifzView() {
  if (!state.activeSurah) return;
  setHeading("Build your Hifz", "MEMORIZATION · CONTINUATION PRACTICE");
  const segments = ayahSegments();
  if (!state.hifzChoices.length) makeHifzChoices();
  const current = segments[state.hifzIndex] || segments[0];
  const completed = state.hifzIndex >= segments.length - 1;
  
  app.innerHTML = `
    <section class="grid-2">
      <div class="card">
        <p class="section-label">CONTINUE THE RECITATION</p>
        <h2>${completed ? "Ruku complete" : `What comes next after ayah ${state.hifzIndex + 1}?`}</h2>
        ${completed ? `
          <p>You have reached the end of this ruku sequence. Start over to strengthen memory.</p>
          <button class="button" data-action="restart-hifz">Start again</button>
        ` : `
          <div class="hifz-prompt">${current}</div>
          <p>Choose the opening words of the next verse segment:</p>
          <div id="hifz-options">
            ${state.hifzChoices.map(choice => `<button class="hifz-choice" data-action="hifz-answer" data-choice="${escape(choice)}">${choice}</button>`).join("")}
          </div>
        `}
      </div>
      <aside class="card">
        <p class="section-label">SESSION</p>
        <h3>Gentle recall, one step at a time.</h3>
        <p>Correct continuations add one point. Mistakes do not remove points—repetition is the lesson.</p>
        <div class="metric"><strong>${progress.hifz || 0}</strong><span>Hifz points earned</span></div>
        <div class="metric"><strong>${Math.min(state.hifzIndex + 1, segments.length)} / ${segments.length}</strong><span>Current sequence position</span></div>
      </aside>
    </section>`;
}

function newLessonQuiz() { 
  state.lessonQuiz = shuffle(state.quizBank).slice(0, 5).map(q => ({ ...q, choices: shuffle(q.choices) })); 
  state.quizIndex = 0; 
  state.quizScore = 0; 
}

function lessonView() {
  if (!state.activeSurah) return;
  setHeading("Learn the ruku", `GROUNDED LESSON · ${state.activeSurah.name.toUpperCase()}`);
  if (!state.lessonQuiz.length) newLessonQuiz();
  const current = state.lessonQuiz[state.quizIndex];
  const tafsirData = state.activeSurah.tafsir;
  const firstAyah = state.activeSurah.verses[0].n;
  const lastAyah = state.activeSurah.verses.at(-1).n;

  app.innerHTML = `
    <section class="hero">
      <p>LESSON MODE · GLOBAL RUKU ${state.activeSurah.rukuInQuran} · LOCAL SOURCE</p>
      <h2>A locally grounded lesson on ${state.activeSurah.name}</h2>
    </section>
    <div class="lesson-grid">
      <article class="card" style="overflow-y: auto; max-height: 75vh;">
        <p class="section-label">LOCAL TAFSIR · AYAH BY AYAH</p>
        <h2>${state.activeSurah.name} · Ayahs ${firstAyah}–${lastAyah}</h2>

        ${state.activeSurah.verses.map(v => {
          const text = tafsirData?.[String(v.n)]?.tafsir;
          return `
            <div style="margin-bottom: 20px; border-top: 1px solid var(--line); padding-top: 14px;">
              <p class="section-label">AYAH ${v.n}</p>
              <div class="ayah-ar" style="font-size: 1.2rem; margin-bottom: 6px;">${v.ar}</div>
              <p class="translation" style="margin-bottom: 10px;">${escape(v.en)}</p>
              ${text
                ? `<p style="font-size: 0.87rem; line-height: 1.75;">${escape(text)}</p>`
                : `<p class="source">${tafsirData ? "No tafsir entry for this ayah." : "Tafsir could not be loaded."}</p>`}
            </div>`;
        }).join("")}

        ${state.activeSurah.lesson.summary ? `
          <div style="border-top: 1px solid var(--line); margin-top: 20px; padding-top: 16px;">
            <p class="section-label">AI OVERVIEW</p>
            ${renderMarkdown(state.activeSurah.lesson.summary)}
            <div class="source-list">${state.activeSurah.lesson.sources.map(s => `<span class="source">${escape(s)}</span>`).join("")}</div>
          </div>
        ` : ""}

        <button class="text-button" data-action="generate-summary" ${state.summaryLoading ? "disabled" : ""} style="margin-top: 15px;">
          ${state.summaryLoading ? "Generating overview…" : "Generate AI overview"}
        </button>
      </article>
      <article class="card">
        <p class="section-label">RUKU QUIZ · AI-GENERATED</p>
        ${current ? `
          <p class="question-progress">Question ${state.quizIndex + 1} of 5 · ${state.quizScore} correct</p>
          <h3>${escape(current.q)}</h3>
          <div id="quiz-options">
            ${current.choices.map(choice => `<button class="quiz-option" data-action="quiz-answer" data-choice="${escape(choice)}">${escape(choice)}</button>`).join("")}
          </div>
          <div id="quiz-feedback"></div>
        ` : `
          <p>${isGeminiConfigured() ? "Generate a five-question quiz from this local ruku." : "Add your Gemini API key in src/geminiService.js to generate a quiz from this local ruku."}</p>
        `}
        <button class="text-button" data-action="refresh-quiz" ${state.quizLoading ? "disabled" : ""} style="margin-top: 15px;">${state.quizLoading ? "Generating quiz…" : "↻ Generate AI quiz"}</button>
      </article>
    </div>
    <section class="card" style="margin-top:18px">
      <p class="section-label">ASK AI · CHAT INTERACTIVE</p>
      <h2>Ask about this ruku</h2>
      <p>The AI receives only the locally loaded verses and translations for this ruku. Ask any question to help clarify meanings or context.</p>
      <form class="ask-form" id="ask-form">
        <input id="ask-input" maxlength="200" placeholder="e.g., Explain the core message of this ruku?" required />
        <button class="button">Ask AI</button>
      </form>
      <div id="ask-output"></div>
    </section>`;
}

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
        <p>Word-by-word translations from the local dataset for the active ruku.</p>
        <div>
          ${state.vocabBank.map(w => `
            <div class="vocab-card">
              <div class="vocab-ar">${w.ar}</div>
              <div>
                ${w.translit ? `<strong>${w.translit}</strong>` : ""}
                <p>${w.frequency}</p>
              </div>
              <span class="pill">${w.meaning}</span>
            </div>
          `).join("")}
        </div>
      </article>
      <article class="card">
        <p class="section-label">QUICK CHECK · MULTIPLE CHOICE</p>
        <h2>What does <span class="vocab-ar">${q.word.ar}</span> mean?</h2>
        ${q.choices.map(choice => `<button class="quiz-option" data-action="vocab-answer" data-choice="${escape(choice)}">${choice}</button>`).join("")}
        <div id="vocab-feedback"></div>
        <button class="text-button" data-action="next-vocab" style="margin-top: 15px;">New word →</button>
        <hr style="border:0;border-top:1px solid var(--line);margin:24px 0">
        <p class="section-label">IN THIS RUKU</p>
        <div class="word-list">
          ${state.activeSurah.verses.flatMap(v => v.words).slice(0, 12).map(w => `<span class="word"><b>${w[0]}</b> ${w[1]}</span>`).join("")}
        </div>
      </article>
    </section>`;
}

function streak() { let n = 0, d = new Date(); while (progress.daily[d.toISOString().slice(0, 10)]) { n++; d.setDate(d.getDate() - 1); } return n; }
function calendar() { const now = new Date(), year = now.getFullYear(), month = now.getMonth(), days = new Date(year, month + 1, 0).getDate(), first = new Date(year, month, 1).getDay(); return Array.from({ length: first + days }, (_, i) => i < first ? `<span></span>` : (() => { const day = i - first + 1, id = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`, cls = [progress.daily[id] ? "done" : "", id === today() ? "today" : ""].join(" "); return `<div class="day ${cls}">${day}${progress.daily[id] ? `<br>✦${progress.daily[id].score}` : ""}</div>`; })()).join(""); }

function progressView() {
  setHeading("Your journey", "DAILY RHYTHM · PRIVATE ON THIS DEVICE");
  const saved = progress.daily[today()];
  app.innerHTML = `
    <section class="metrics">
      <div class="metric"><strong>${streak()}</strong><span>day streak</span></div>
      <div class="metric"><strong>${points()}</strong><span>total points</span></div>
      <div class="metric"><strong>${Object.keys(progress.daily).length}</strong><span>check-ins</span></div>
    </section>
    <section class="grid-2">
      <article class="card">
        <p class="section-label">${saved ? "TODAY IS SAVED" : "DAILY CHECK-IN"}</p>
        <h2>How did today go?</h2>
        <p>For each salah: mosque = 3, home = 2, qaza = 1, missed = 0.</p>
        ${saved ? `<div class="notice">Today's score is <strong>${saved.score}/100</strong>. You can return tomorrow for the next check-in.</div>` : checkinForm()}
        <button class="text-button" data-action="enable-reminder">Enable 11pm reminder</button>
      </article>
      <article class="card">
        <p class="section-label">${new Intl.DateTimeFormat("en", { month:"long", year:"numeric" }).format(new Date()).toUpperCase()}</p>
        <h2>Consistency calendar</h2>
        <div class="calendar">${calendar()}</div>
      </article>
    </section>`;
}

function checkinForm() { const prayers = ["Fajr","Dhuhr","Asr","Maghrib","Isha"]; return `<form id="checkin-form"><div class="checkin-grid">${prayers.map(p => `<div class="prayer"><label>${p}</label><select name="${p}"><option value="3">Mosque</option><option value="2">Home</option><option value="1">Qaza</option><option value="0">Missed</option></select></div>`).join("")}</div><div class="field"><label for="anger">Anger control (1 = struggled, 5 = excellent)</label><select id="anger" name="anger">${[1,2,3,4,5].map(n => `<option value="${n}" ${n === 3 ? "selected" : ""}>${n} / 5</option>`).join("")}</select></div><div class="field"><label for="ayahs">Ayahs read today</label><input id="ayahs" name="ayahs" type="number" min="0" max="1000" value="0" required></div><div class="field"><label for="hifz-count">Correct Hifz continuations today</label><input id="hifz-count" name="hifz" type="number" min="0" max="1000" value="0" required></div><button class="button gold">Save today's score</button></form>`; }

function render() { 
  try { 
    if (state.loading) {
      app.innerHTML = `
        <div class="card empty" style="padding: 50px 20px;">
          <div class="brand-mark" style="margin: 0 auto 20px; font-size: 32px; width: 50px; height: 50px;">ن</div>
          <h2>Loading the local Quran corpus…</h2>
          <p>Retrieving global ruku ${state.targetGlobalRuku} from the local corpus.</p>
        </div>`;
      return;
    }
    
    ({ reading: readingView, hifz: hifzView, lesson: lessonView, vocabulary: vocabularyView, progress: progressView }[state.view] || readingView)(); 
    document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.view === state.view)); 
  } catch (error) { 
    console.error(error); 
    app.innerHTML = `<div class="card empty"><h2>We could not load this view.</h2><p>Your saved progress is safe. Please refresh and try again.</p></div>`; 
  } 
}

function selectView(view) { state.view = view; render(); }

document.addEventListener("click", event => { 
  const button = event.target.closest("[data-action], [data-view]"); 
  if (!button) return; 
  if (button.dataset.view) return selectView(button.dataset.view); 
  const action = button.dataset.action; 
  try {
    if (action === "toggle-translation") { state.showTranslation = !state.showTranslation; render(); }
    if (action === "toggle-words") { state.showWords = !state.showWords; render(); }
    if (action === "toggle-tafsir") { const n = Number(button.dataset.ayah); state.tafsirAyah = state.tafsirAyah === n ? null : n; render(); }
    if (action === "hifz-from-reading") { state.hifzIndex = 0; state.hifzChoices = []; selectView("hifz"); }
    if (action === "hifz-at") { state.hifzIndex = Math.max(0, Number(button.dataset.ayah) - 1); state.hifzChoices = []; selectView("hifz"); }
    if (action === "to-lesson") selectView("lesson");
    if (action === "restart-hifz") { state.hifzIndex = 0; state.hifzChoices = []; render(); }
    if (action === "hifz-answer") answerHifz(button);
    if (action === "quiz-answer") answerQuiz(button);
    if (action === "refresh-quiz") generateQuiz();
    if (action === "generate-summary") generateSummary();
    if (action === "vocab-answer") answerVocab(button);
    if (action === "next-vocab") { state.vocabQuestion = null; render(); }
    if (action === "enable-reminder") enableReminder();
  } catch (error) { 
    console.error(error); 
    toast("That action could not be completed. Please try again."); 
  } 
});

document.addEventListener("change", event => { if (event.target.id === "language") { state.language = event.target.value === "ur" ? "ur" : "en"; render(); } });

document.addEventListener("submit", event => { 
  event.preventDefault(); 
  try { 
    if (event.target.id === "ask-form") {
      askAI($("#ask-input").value); 
    }
    if (event.target.id === "checkin-form") {
      saveCheckin(new FormData(event.target)); 
    }
    if (event.target.id === "surah-loader-form") {
      const val = Number($("#input-global-ruku").value);
      if (val >= 1 && val <= 556) {
        state.targetGlobalRuku = val;
        loadLocalStudyData();
      } else {
        toast("Please enter a global ruku number between 1 and 556.");
      }
    }
  } catch (error) { 
    console.error(error); 
    toast("Unable to process request."); 
  } 
});

function answerHifz(button) { 
  const expected = ayahSegments()[Math.min(state.hifzIndex + 1, ayahSegments().length - 1)];
  const correct = button.dataset.choice === expected; 
  document.querySelectorAll(".hifz-choice").forEach(x => x.disabled = true); 
  button.classList.add(correct ? "correct" : "wrong"); 
  if (!correct) [...document.querySelectorAll(".hifz-choice")].find(x => x.dataset.choice === expected)?.classList.add("correct"); 
  if (correct) { 
    progress.hifz = (progress.hifz || 0) + 1; 
    persist(); 
    state.hifzIndex++; 
    setTimeout(() => { state.hifzChoices = []; render(); }, 700); 
  } else {
    toast("Try reading the highlighted continuation, then repeat it."); 
  }
}

function answerQuiz(button) { 
  const q = state.lessonQuiz[state.quizIndex];
  const correct = button.dataset.choice === q.a; 
  document.querySelectorAll(".quiz-option").forEach(x => x.disabled = true); 
  button.classList.add(correct ? "correct" : "wrong"); 
  if (!correct) [...document.querySelectorAll(".quiz-option")].find(x => x.dataset.choice === q.a)?.classList.add("correct"); 
  if (correct) state.quizScore++; 
  const out = $("#quiz-feedback"); 
  out.innerHTML = `<div class="feedback">${correct ? "Correct." : "Not quite."} This is grounded in the selected ruku's lesson material.</div>`; 
  if (state.quizIndex < 4) {
    setTimeout(() => { state.quizIndex++; render(); }, 1100); 
  } else {
    out.innerHTML += `<div class="feedback">Finished: ${state.quizScore}/5. Generate a new set to try different questions.</div>`; 
  }
}

function answerVocab(button) { 
  const correct = button.dataset.choice === state.vocabQuestion.word.meaning; 
  document.querySelectorAll(".quiz-option").forEach(x => x.disabled = true); 
  button.classList.add(correct ? "correct" : "wrong"); 
  $("#vocab-feedback").innerHTML = `<div class="feedback">${correct ? "Correct—well remembered." : `The answer is: ${state.vocabQuestion.word.meaning}.`}</div>`; 
}

async function generateSummary() {
  if (!isGeminiConfigured()) return toast("Paste your Gemini API key in src/geminiService.js to use AI summaries.");
  state.summaryLoading = true;
  render();
  try {
    const summary = await generateStudySummary(createStudyContext(state.activeSurah));
    state.activeSurah.lesson = {
      ...state.activeSurah.lesson,
      summary: summary.summary || summary.background || "",
      sources: [...state.activeSurah.lesson.sources, "AI overview constrained to the selected local ruku"]
    };
  } catch (error) {
    console.error("Could not generate AI summary:", error);
    toast("Could not generate an AI summary. Check the key and Gemini settings.");
  } finally {
    state.summaryLoading = false;
    render();
  }
}

async function generateQuiz() {
  if (!isGeminiConfigured()) return toast("Paste your Gemini API key in src/geminiService.js to use AI quizzes.");
  state.quizLoading = true;
  render();
  try {
    const quiz = await generateDynamicQuiz(createStudyContext(state.activeSurah));
    if (!Array.isArray(quiz) || quiz.length < 5) throw new Error("Gemini returned an incomplete quiz.");
    state.quizBank = quiz;
    newLessonQuiz();
  } catch (error) {
    console.error("Could not generate AI quiz:", error);
    toast("Could not generate an AI quiz. Check the key and Gemini settings.");
  } finally {
    state.quizLoading = false;
    render();
  }
}

// AI Assistant is constrained to the local ruku currently on screen.
async function askAI(question) {
  if (!isGeminiConfigured()) return toast("Paste your Gemini API key in src/geminiService.js to use the AI Assistant.");
  const outputDiv = $("#ask-output");
  outputDiv.innerHTML = `<div class="ask-answer"><strong>Grounded answer</strong><br>Asking AI companion...</div>`;
  try {
    const response = await askGeminiAboutLesson(question, createStudyContext(state.activeSurah));
    outputDiv.innerHTML = `
      <div class="ask-answer">
        <strong>Grounded answer</strong>
        ${renderMarkdown(response)}
        <span class="source">Source: locally loaded ${state.activeSurah.name}, ruku ${state.activeSurah.ruku}</span>
      </div>`;
  } catch (error) {
    outputDiv.innerHTML = `<div class="ask-answer"><strong>Grounded answer</strong><br>Error generating answer.</div>`;
  }
}

function saveCheckin(data) { const prayerTotal = ["Fajr","Dhuhr","Asr","Maghrib","Isha"].reduce((sum, p) => sum + Number(data.get(p) || 0), 0); const anger = Number(data.get("anger") || 0), ayahs = Math.max(0, Number(data.get("ayahs") || 0)), hifz = Math.max(0, Number(data.get("hifz") || 0)); const score = Math.round((prayerTotal / 15 * 55) + (anger / 5 * 20) + (Math.min(ayahs, 25) / 25 * 15) + (Math.min(hifz, 10) / 10 * 10)); progress.daily[today()] = { score, prayerTotal, anger, ayahs, hifz }; persist(); toast(`Saved ${score}/100 for today.`); render(); }
function enableReminder() { if (!("Notification" in window)) return toast("Notifications are not supported in this browser."); Notification.requestPermission().then(result => toast(result === "granted" ? "Reminder enabled while this app is open." : "Notification permission was not granted.")).catch(() => toast("Could not enable notifications.")); }
function reminderTick() { const now = new Date(); if (now.getHours() === 23 && !progress.daily[today()] && "Notification" in window && Notification.permission === "granted") new Notification("NoorPath", { body: "Before the day closes, save your gentle daily check-in." }); }

window.addEventListener("error", error => console.error("Unexpected app error", error.error)); 
setInterval(reminderTick, 60 * 60 * 1000); 
reminderTick(); 

// Initial app load is independent of Gemini.
loadLocalStudyData();
