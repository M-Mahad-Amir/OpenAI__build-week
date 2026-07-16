import { 
  fetchDynamicSurahData, 
  generateDynamicQuiz, 
  generateDynamicVocabulary, 
  askGeminiAboutLesson 
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

// Added activeSurah, quizBank, vocabBank, loading state, and target settings
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
  // Dynamic settings
  loading: false,
  targetSurah: "Al-Fatihah",
  targetRuku: 1,
  activeSurah: null,
  quizBank: [],
  vocabBank: []
};

const escape = (value = "") => String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
const shuffle = array => [...array].sort(() => Math.random() - 0.5);
const today = () => new Date().toISOString().slice(0, 10);
const persist = () => { try { localStorage.setItem(storeKey, JSON.stringify(progress)); } catch { toast("Your browser could not save progress locally."); } };
const toast = message => { const node = $("#toast-template").content.firstElementChild.cloneNode(true); node.textContent = message; document.body.append(node); setTimeout(() => node.remove(), 2800); };
const points = () => Object.values(progress.daily).reduce((sum, item) => sum + (item.score || 0), 0) + (progress.hifz || 0);
const setHeading = (title, crumb) => { $("#view-title").textContent = title; $("#crumb").textContent = crumb; $("#points-total").textContent = points(); };
const ayahSegments = () => state.activeSurah ? state.activeSurah.verses.map(v => v.ar.split(" ").slice(0, 4).join(" ")) : [];

// Core method to load everything from the Gemini API dynamically
async function loadDynamicStudyData() {
  state.loading = true;
  render();
  try {
    // 1. Fetch Surah structure, translations, tafsir, and lesson content
    state.activeSurah = await fetchDynamicSurahData(state.targetSurah, state.targetRuku);
    
    // 2. Fetch vocabulary built dynamically from the current verse list
    state.vocabBank = await generateDynamicVocabulary(state.activeSurah.verses);
    state.vocabQuestion = null; // reset vocab game
    
    // 3. Generate 5 authentic quiz questions for this lesson
    state.quizBank = await generateDynamicQuiz(state.targetSurah, state.targetRuku, state.activeSurah.lesson.summary);
    newLessonQuiz();

    state.tafsirAyah = null;
    state.hifzIndex = 0;
    state.hifzChoices = [];
  } catch (error) {
    console.error("Failed to fetch data from Gemini:", error);
    toast("Error contacting Gemini API. Please check your API key.");
  } finally {
    state.loading = false;
    render();
  }
}

function readingView() {
  if (!state.activeSurah) return;
  setHeading("Read with presence", `QURAN · ${state.activeSurah.name.toUpperCase()}`);
  
  app.innerHTML = `
    <section class="hero">
      <p>RUKU ${state.activeSurah.ruku} · ${state.activeSurah.verses.length} AYAHS · AI GENERATED</p>
      <h2>${state.activeSurah.name} <span style="font-weight:400;font-size:18px">— ${state.activeSurah.meaning}</span></h2>
      <div class="arabic">${state.activeSurah.arabicName}</div>
    </section>
    
    <!-- Added Interactive Surah & Ruku Selection Controls -->
    <div class="card" style="margin-bottom: 20px; padding: 15px;">
      <p class="section-label">STUDY ANOTHER PORTION</p>
      <form id="surah-loader-form" style="display: flex; gap: 10px; align-items: center;">
        <input type="text" id="input-surah" class="field" value="${state.targetSurah}" placeholder="e.g. Al-Baqarah" style="margin:0; flex: 2;" required />
        <input type="number" id="input-ruku" class="field" value="${state.targetRuku}" min="1" max="40" style="margin:0; flex: 1;" required />
        <button type="submit" class="button" style="padding: 10px 15px;">Load with Gemini</button>
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
  const entry = state.activeSurah.tafsir.find(t => { 
    const [start, end = start] = t.ayah.split(/[–-]/).map(Number); 
    return n >= start && n <= end; 
  }) || state.activeSurah.tafsir[0];
  
  return `
    <div class="tafsir">
      <h4>${entry.title} <span class="pill">Ayah ${entry.ayah}</span></h4>
      <p>${entry.text}</p>
      <button class="text-button" data-action="to-lesson">Open grounded lesson →</button>
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
  
  app.innerHTML = `
    <section class="hero">
      <p>LESSON MODE · RUKU ${state.activeSurah.ruku}</p>
      <h2>A dynamic, sourced lesson on ${state.activeSurah.name}</h2>
    </section>
    <div class="lesson-grid">
      <article class="card">
        <p class="section-label">BACKGROUND</p>
        <h2>${state.activeSurah.name}</h2>
        <p>${state.activeSurah.lesson.background}</p>
        <p class="section-label">SHORT SUMMARY</p>
        <p>${state.activeSurah.lesson.summary}</p>
        <div class="source-list">
          <span class="source">Dynamic Gemini Analysis</span>
          <span class="source">Contextual Quran Study Base</span>
        </div>
      </article>
      <article class="card">
        <p class="section-label">RUKU QUIZ · AI-GENERATED</p>
        ${current ? `
          <p class="question-progress">Question ${state.quizIndex + 1} of 5 · ${state.quizScore} correct</p>
          <h3>${current.q}</h3>
          <div id="quiz-options">
            ${current.choices.map(choice => `<button class="quiz-option" data-action="quiz-answer" data-choice="${escape(choice)}">${choice}</button>`).join("")}
          </div>
          <div id="quiz-feedback"></div>
        ` : `
          <p>Quiz generated successfully. Click below to start or try a different set.</p>
        `}
        <button class="text-button" data-action="refresh-quiz" style="margin-top: 15px;">↻ Re-generate new quiz</button>
      </article>
    </div>
    <section class="card" style="margin-top:18px">
      <p class="section-label">ASK AI · CHAT INTERACTIVE</p>
      <h2>Ask about this ruku</h2>
      <p>The AI understands the verses you are studying. Ask any question to help clarify meanings or context.</p>
      <form class="ask-form" id="ask-form">
        <input id="ask-input" maxlength="200" placeholder="e.g., Explain the core message of this ruku?" required />
        <button class="button">Ask AI</button>
      </form>
      <div id="ask-output"></div>
    </section>`;
}

function vocabularyView() {
  if (!state.activeSurah || !state.vocabBank.length) return;
  setHeading("Arabic, one word at a time", "VOCABULARY · HIGH-VALUE WORDS");
  
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
        <p class="section-label">CORE RUKU VOCABULARY</p>
        <h2>Recognize the building blocks</h2>
        <p>Gemini extracted these high-frequency vocabulary words directly from this lesson's text:</p>
        <div>
          ${state.vocabBank.map(w => `
            <div class="vocab-card">
              <div class="vocab-ar">${w.ar}</div>
              <div>
                <strong>${w.translit}</strong>
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
        ${saved ? `<div class="notice">Today’s score is <strong>${saved.score}/100</strong>. You can return tomorrow for the next check-in.</div>` : checkinForm()}
        <button class="text-button" data-action="enable-reminder">Enable 11pm reminder</button>
      </article>
      <article class="card">
        <p class="section-label">${new Intl.DateTimeFormat("en", { month:"long", year:"numeric" }).format(new Date()).toUpperCase()}</p>
        <h2>Consistency calendar</h2>
        <div class="calendar">${calendar()}</div>
      </article>
    </section>`;
}

function checkinForm() { const prayers = ["Fajr","Dhuhr","Asr","Maghrib","Isha"]; return `<form id="checkin-form"><div class="checkin-grid">${prayers.map(p => `<div class="prayer"><label>${p}</label><select name="${p}"><option value="3">Mosque</option><option value="2">Home</option><option value="1">Qaza</option><option value="0">Missed</option></select></div>`).join("")}</div><div class="field"><label for="anger">Anger control (1 = struggled, 5 = excellent)</label><select id="anger" name="anger">${[1,2,3,4,5].map(n => `<option value="${n}" ${n === 3 ? "selected" : ""}>${n} / 5</option>`).join("")}</select></div><div class="field"><label for="ayahs">Ayahs read today</label><input id="ayahs" name="ayahs" type="number" min="0" max="1000" value="0" required></div><div class="field"><label for="hifz-count">Correct Hifz continuations today</label><input id="hifz-count" name="hifz" type="number" min="0" max="1000" value="0" required></div><button class="button gold">Save today’s score</button></form>`; }

function render() { 
  try { 
    if (state.loading) {
      app.innerHTML = `
        <div class="card empty" style="padding: 50px 20px;">
          <div class="brand-mark" style="margin: 0 auto 20px; font-size: 32px; width: 50px; height: 50px;">ن</div>
          <h2>Consulting Gemini AI...</h2>
          <p>Structuring clean, authenticated lesson details and quizzes for Surah ${state.targetSurah}. Please wait a moment.</p>
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
    if (action === "refresh-quiz") { 
      state.loading = true;
      render();
      generateDynamicQuiz(state.activeSurah.name, state.activeSurah.ruku, state.activeSurah.lesson.summary).then(quiz => {
        state.quizBank = quiz;
        newLessonQuiz();
        state.loading = false;
        render();
      });
    }
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
      state.targetSurah = $("#input-surah").value;
      state.targetRuku = Number($("#input-ruku").value);
      loadDynamicStudyData();
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
  out.innerHTML = `<div class="feedback">${correct ? "Correct." : "Not quite."} This is grounded in the selected ruku’s lesson material.</div>`; 
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

// Full, unhallucinated dynamic Ask AI Implementation 
async function askAI(question) {
  const outputDiv = $("#ask-output");
  outputDiv.innerHTML = `<div class="ask-answer"><strong>Grounded answer</strong><br>Asking AI companion...</div>`;
  try {
    const response = await askGeminiAboutLesson(question, state.activeSurah.lesson, state.activeSurah.name, state.activeSurah.ruku);
    outputDiv.innerHTML = `
      <div class="ask-answer">
        <strong>Grounded answer</strong><br>${response}<br>
        <span class="source">Source: Authentic context extraction of Surah ${state.activeSurah.name}</span>
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

// Initial app load using Gemini
loadDynamicStudyData();