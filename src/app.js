import { SURAH_SAMPLE, QUIZ_BANK, CORE_VOCABULARY } from "./data.js";

const $ = (selector, scope = document) => scope.querySelector(selector);
const app = $("#app");
const storeKey = "noorpath-demo-progress-v1";
const safeRead = () => { try { return JSON.parse(localStorage.getItem(storeKey)) || { daily: {}, hifz: 0 }; } catch { return { daily: {}, hifz: 0 }; } };
let progress = safeRead();
let state = { view: "reading", language: "en", showTranslation: true, showWords: false, tafsirAyah: null, hifzIndex: 0, hifzChoices: [], lessonQuiz: [], quizIndex: 0, quizScore: 0, vocabQuestion: null };

const escape = (value = "") => String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
const shuffle = array => [...array].sort(() => Math.random() - 0.5);
const today = () => new Date().toISOString().slice(0, 10);
const persist = () => { try { localStorage.setItem(storeKey, JSON.stringify(progress)); } catch { toast("Your browser could not save progress locally."); } };
const toast = message => { const node = $("#toast-template").content.firstElementChild.cloneNode(true); node.textContent = message; document.body.append(node); setTimeout(() => node.remove(), 2800); };
const points = () => Object.values(progress.daily).reduce((sum, item) => sum + (item.score || 0), 0) + (progress.hifz || 0);
const setHeading = (title, crumb) => { $("#view-title").textContent = title; $("#crumb").textContent = crumb; $("#points-total").textContent = points(); };
const ayahSegments = () => SURAH_SAMPLE.verses.map(v => v.ar.split(" ").slice(0, 4).join(" "));

function readingView() {
  setHeading("Read with presence", "QURAN · SAMPLE LIBRARY");
  const translation = state.language === "en" ? "English" : "Urdu";
  app.innerHTML = `
    <section class="hero"><p>RUKU ${SURAH_SAMPLE.ruku} · ${SURAH_SAMPLE.verses.length} AYAHS · SAMPLE DATA</p><h2>${SURAH_SAMPLE.name} <span style="font-weight:400;font-size:18px">— ${SURAH_SAMPLE.meaning}</span></h2><div class="arabic">${SURAH_SAMPLE.arabicName}</div></section>
    <div class="toolbar"><div class="tabs"><button class="chip ${state.showTranslation ? "active" : ""}" data-action="toggle-translation">Translation</button><button class="chip ${state.showWords ? "active" : ""}" data-action="toggle-words">Word by word</button><select id="language" aria-label="Translation language"><option value="en">English</option><option value="ur">Urdu</option></select></div><button class="button secondary" data-action="hifz-from-reading">Practice this ruku →</button></div>
    <div class="ayah-list">${SURAH_SAMPLE.verses.map(v => `<article class="ayah-card"><span class="ayah-num">${v.n}</span><div class="ayah-ar">${v.ar}</div>${state.showTranslation ? `<p class="translation" ${state.language === "ur" ? "dir=rtl" : ""}>${v[state.language]}</p>` : ""}${state.showWords ? `<div class="word-list">${v.words.map(w => `<span class="word"><b>${w[0]}</b> ${w[1]}</span>`).join("")}</div>` : ""}<div class="ayah-actions"><button class="text-button" data-action="toggle-tafsir" data-ayah="${v.n}">⌁ Tafsir</button><button class="text-button" data-action="hifz-at" data-ayah="${v.n}">◇ Hifz from here</button></div>${state.tafsirAyah === v.n ? tafsirFor(v.n) : ""}</article>`).join("")}</div>`;
  $("#language").value = state.language;
}

function tafsirFor(n) {
  const entry = SURAH_SAMPLE.tafsir.find(t => { const [start, end = start] = t.ayah.split("–").map(Number); return n >= start && n <= end; }) || SURAH_SAMPLE.tafsir[2];
  return `<div class="tafsir"><h4>${entry.title} <span class="pill">Ayah ${entry.ayah}</span></h4><p>${entry.text}</p><button class="text-button" data-action="to-lesson">Open grounded lesson →</button></div>`;
}

function makeHifzChoices() {
  const segments = ayahSegments();
  const next = Math.min(state.hifzIndex + 1, segments.length - 1);
  const incorrect = shuffle(segments.filter((_, i) => i !== next)).slice(0, 3);
  state.hifzChoices = shuffle([segments[next], ...incorrect]);
}

function hifzView() {
  setHeading("Build your Hifz", "MEMORIZATION · CONTINUATION PRACTICE");
  const segments = ayahSegments();
  if (!state.hifzChoices.length) makeHifzChoices();
  const current = segments[state.hifzIndex] || segments[0];
  const completed = state.hifzIndex >= segments.length - 1;
  app.innerHTML = `<section class="grid-2"><div class="card"><p class="section-label">CONTINUE THE RECITATION</p><h2>${completed ? "Ruku complete" : `What comes next after ayah ${state.hifzIndex + 1}?`}</h2>${completed ? `<p>You have reached the end of this demo ruku. Start over to strengthen the sequence.</p><button class="button" data-action="restart-hifz">Start again</button>` : `<div class="hifz-prompt">${current}</div><p>Choose the opening 3–4 words of the next set. The sample uses whole-ayah beginnings; production data should include verified waqf/break segments.</p><div id="hifz-options">${state.hifzChoices.map(choice => `<button class="hifz-choice" data-action="hifz-answer" data-choice="${escape(choice)}">${choice}</button>`).join("")}</div>`}</div><aside class="card"><p class="section-label">SESSION</p><h3>Gentle recall, one step at a time.</h3><p>Correct continuations add one point. Mistakes do not remove points—repetition is the lesson.</p><div class="metric"><strong>${progress.hifz || 0}</strong><span>Hifz points earned</span></div><div class="metric"><strong>${Math.min(state.hifzIndex + 1, segments.length)} / ${segments.length}</strong><span>Current sequence position</span></div></aside></section>`;
}

function newLessonQuiz() { state.lessonQuiz = shuffle(QUIZ_BANK).slice(0, 5).map(q => ({ ...q, choices: shuffle(q.choices) })); state.quizIndex = 0; state.quizScore = 0; }
function lessonView() {
  setHeading("Learn the ruku", "GROUNDED LESSON · AL-FATIHAH 1–7");
  if (!state.lessonQuiz.length) newLessonQuiz();
  const current = state.lessonQuiz[state.quizIndex];
  app.innerHTML = `<section class="hero"><p>LESSON MODE · RUKU ${SURAH_SAMPLE.ruku}</p><h2>A short, sourced lesson on ${SURAH_SAMPLE.name}</h2></section><div class="lesson-grid"><article class="card"><p class="section-label">BACKGROUND</p><h2>${SURAH_SAMPLE.name}</h2><p>${SURAH_SAMPLE.lesson.background}</p><p class="section-label">SHORT SUMMARY</p><p>${SURAH_SAMPLE.lesson.summary}</p><div class="source-list">${SURAH_SAMPLE.lesson.sources.map(source => `<span class="source">${source}</span>`).join("")}</div></article><article class="card"><p class="section-label">RUKU QUIZ · RANDOMIZED</p><p class="question-progress">Question ${state.quizIndex + 1} of 5 · ${state.quizScore} correct</p><h3>${current.q}</h3><div id="quiz-options">${current.choices.map(choice => `<button class="quiz-option" data-action="quiz-answer" data-choice="${escape(choice)}">${choice}</button>`).join("")}</div><div id="quiz-feedback"></div><button class="text-button" data-action="refresh-quiz">↻ New random set</button></article></div><section class="card" style="margin-top:18px"><p class="section-label">ASK AI · SOURCE-BOUND DEMO</p><h2>Ask about this ruku</h2><p>The prototype answers only from the displayed lesson corpus. If a claim is not supported here, it refuses rather than guessing.</p><form class="ask-form" id="ask-form"><input id="ask-input" maxlength="200" placeholder="e.g., What does the straight path mean here?" required /><button class="button">Ask</button></form><div id="ask-output"></div></section>`;
}

function vocabularyView() {
  setHeading("Arabic, one word at a time", "VOCABULARY · HIGH-VALUE WORDS");
  if (!state.vocabQuestion) { const word = CORE_VOCABULARY[Math.floor(Math.random() * CORE_VOCABULARY.length)]; state.vocabQuestion = { word, choices: shuffle([word.meaning, ...shuffle(CORE_VOCABULARY.filter(w => w !== word).map(w => w.meaning)).slice(0, 3)]) }; }
  const q = state.vocabQuestion;
  app.innerHTML = `<section class="grid-2"><article class="card"><p class="section-label">CORE QURAN VOCABULARY</p><h2>Recognize the building blocks</h2><p>These are representative high-value words. Full frequency claims require a verified, versioned morphology corpus.</p><div>${CORE_VOCABULARY.map(w => `<div class="vocab-card"><div class="vocab-ar">${w.ar}</div><div><strong>${w.translit}</strong><p>${w.frequency}</p></div><span class="pill">${w.meaning}</span></div>`).join("")}</div></article><article class="card"><p class="section-label">QUICK CHECK · MULTIPLE CHOICE</p><h2>What does <span class="vocab-ar">${q.word.ar}</span> mean?</h2>${q.choices.map(choice => `<button class="quiz-option" data-action="vocab-answer" data-choice="${escape(choice)}">${choice}</button>`).join("")}<div id="vocab-feedback"></div><button class="text-button" data-action="next-vocab">New word →</button><hr style="border:0;border-top:1px solid var(--line);margin:24px 0"><p class="section-label">IN THIS RUKU</p><div class="word-list">${SURAH_SAMPLE.verses.flatMap(v => v.words).slice(0,12).map(w => `<span class="word"><b>${w[0]}</b>${w[1]}</span>`).join("")}</div></article></section>`;
}

function streak() { let n = 0, d = new Date(); while (progress.daily[d.toISOString().slice(0, 10)]) { n++; d.setDate(d.getDate() - 1); } return n; }
function calendar() { const now = new Date(), year = now.getFullYear(), month = now.getMonth(), days = new Date(year, month + 1, 0).getDate(), first = new Date(year, month, 1).getDay(); return Array.from({ length: first + days }, (_, i) => i < first ? `<span></span>` : (() => { const day = i - first + 1, id = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`, cls = [progress.daily[id] ? "done" : "", id === today() ? "today" : ""].join(" "); return `<div class="day ${cls}">${day}${progress.daily[id] ? `<br>✦${progress.daily[id].score}` : ""}</div>`; })()).join(""); }
function progressView() {
  setHeading("Your journey", "DAILY RHYTHM · PRIVATE ON THIS DEVICE");
  const saved = progress.daily[today()];
  app.innerHTML = `<section class="metrics"><div class="metric"><strong>${streak()}</strong><span>day streak</span></div><div class="metric"><strong>${points()}</strong><span>total points</span></div><div class="metric"><strong>${Object.keys(progress.daily).length}</strong><span>check-ins</span></div></section><section class="grid-2"><article class="card"><p class="section-label">${saved ? "TODAY IS SAVED" : "DAILY CHECK-IN"}</p><h2>How did today go?</h2><p>For each salah: mosque = 3, home = 2, qaza = 1, missed = 0. Your personal log remains in this browser in the prototype.</p>${saved ? `<div class="notice">Today’s score is <strong>${saved.score}/100</strong>. You can return tomorrow for the next check-in.</div>` : checkinForm()}<button class="text-button" data-action="enable-reminder">Enable 11pm reminder</button></article><article class="card"><p class="section-label">${new Intl.DateTimeFormat("en", { month:"long", year:"numeric" }).format(new Date()).toUpperCase()}</p><h2>Consistency calendar</h2><div class="calendar">${calendar()}</div></article></section>`;
}
function checkinForm() { const prayers = ["Fajr","Dhuhr","Asr","Maghrib","Isha"]; return `<form id="checkin-form"><div class="checkin-grid">${prayers.map(p => `<div class="prayer"><label>${p}</label><select name="${p}"><option value="3">Mosque</option><option value="2">Home</option><option value="1">Qaza</option><option value="0">Missed</option></select></div>`).join("")}</div><div class="field"><label for="anger">Anger control (1 = struggled, 5 = excellent)</label><select id="anger" name="anger">${[1,2,3,4,5].map(n => `<option value="${n}" ${n === 3 ? "selected" : ""}>${n} / 5</option>`).join("")}</select></div><div class="field"><label for="ayahs">Ayahs read today</label><input id="ayahs" name="ayahs" type="number" min="0" max="1000" value="0" required></div><div class="field"><label for="hifz-count">Correct Hifz continuations today</label><input id="hifz-count" name="hifz" type="number" min="0" max="1000" value="0" required></div><button class="button gold">Save today’s score</button></form>`; }

function render() { try { ({ reading: readingView, hifz: hifzView, lesson: lessonView, vocabulary: vocabularyView, progress: progressView }[state.view] || readingView)(); document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.view === state.view)); } catch (error) { console.error(error); app.innerHTML = `<div class="card empty"><h2>We could not load this view.</h2><p>Your saved progress is safe. Please refresh and try again.</p></div>`; } }

function selectView(view) { state.view = view; render(); }
document.addEventListener("click", event => { const button = event.target.closest("[data-action], [data-view]"); if (!button) return; if (button.dataset.view) return selectView(button.dataset.view); const action = button.dataset.action; try {
  if (action === "toggle-translation") { state.showTranslation = !state.showTranslation; render(); }
  if (action === "toggle-words") { state.showWords = !state.showWords; render(); }
  if (action === "toggle-tafsir") { const n = Number(button.dataset.ayah); state.tafsirAyah = state.tafsirAyah === n ? null : n; render(); }
  if (action === "hifz-from-reading") { state.hifzIndex = 0; state.hifzChoices = []; selectView("hifz"); }
  if (action === "hifz-at") { state.hifzIndex = Math.max(0, Number(button.dataset.ayah) - 1); state.hifzChoices = []; selectView("hifz"); }
  if (action === "to-lesson") selectView("lesson");
  if (action === "restart-hifz") { state.hifzIndex = 0; state.hifzChoices = []; render(); }
  if (action === "hifz-answer") answerHifz(button);
  if (action === "quiz-answer") answerQuiz(button);
  if (action === "refresh-quiz") { newLessonQuiz(); render(); }
  if (action === "vocab-answer") answerVocab(button);
  if (action === "next-vocab") { state.vocabQuestion = null; render(); }
  if (action === "enable-reminder") enableReminder();
} catch (error) { console.error(error); toast("That action could not be completed. Please try again."); } });

document.addEventListener("change", event => { if (event.target.id === "language") { state.language = event.target.value === "ur" ? "ur" : "en"; render(); } });
document.addEventListener("submit", event => { event.preventDefault(); try { if (event.target.id === "ask-form") askAI($("#ask-input").value); if (event.target.id === "checkin-form") saveCheckin(new FormData(event.target)); } catch (error) { console.error(error); toast("Unable to save that just now."); } });

function answerHifz(button) { const expected = ayahSegments()[Math.min(state.hifzIndex + 1, ayahSegments().length - 1)], correct = button.dataset.choice === expected; document.querySelectorAll(".hifz-choice").forEach(x => x.disabled = true); button.classList.add(correct ? "correct" : "wrong"); if (!correct) [...document.querySelectorAll(".hifz-choice")].find(x => x.dataset.choice === expected)?.classList.add("correct"); if (correct) { progress.hifz = (progress.hifz || 0) + 1; persist(); state.hifzIndex++; setTimeout(() => { state.hifzChoices = []; render(); }, 700); } else toast("Try reading the highlighted continuation, then repeat it."); }
function answerQuiz(button) { const q = state.lessonQuiz[state.quizIndex], correct = button.dataset.choice === q.a; document.querySelectorAll(".quiz-option").forEach(x => x.disabled = true); button.classList.add(correct ? "correct" : "wrong"); if (!correct) [...document.querySelectorAll(".quiz-option")].find(x => x.dataset.choice === q.a)?.classList.add("correct"); if (correct) state.quizScore++; const out = $("#quiz-feedback"); out.innerHTML = `<div class="feedback">${correct ? "Correct." : "Not quite."} This is grounded in the selected ruku’s lesson material.</div>`; if (state.quizIndex < 4) setTimeout(() => { state.quizIndex++; render(); }, 1100); else out.innerHTML += `<div class="feedback">Finished: ${state.quizScore}/5. Generate a new set to try different questions.</div>`; }
function answerVocab(button) { const correct = button.dataset.choice === state.vocabQuestion.word.meaning; document.querySelectorAll(".quiz-option").forEach(x => x.disabled = true); button.classList.add(correct ? "correct" : "wrong"); $("#vocab-feedback").innerHTML = `<div class="feedback">${correct ? "Correct—well remembered." : `The answer is: ${state.vocabQuestion.word.meaning}.`}</div>`; }
function askAI(question) { const normalized = question.toLowerCase(); const answer = SURAH_SAMPLE.lesson.answers.find(item => item.keywords.some(key => normalized.includes(key))); $("#ask-output").innerHTML = `<div class="ask-answer"><strong>Grounded answer</strong><br>${answer ? answer.text : "I don’t have enough verified material in this selected ruku to answer that precisely. Try asking about mercy, worship, help, the Day of Judgment, or the straight path."}<br><span class="source">Source: Al-Fatihah 1–7 demo corpus</span></div>`; }
function saveCheckin(data) { const prayerTotal = ["Fajr","Dhuhr","Asr","Maghrib","Isha"].reduce((sum, p) => sum + Number(data.get(p) || 0), 0); const anger = Number(data.get("anger") || 0), ayahs = Math.max(0, Number(data.get("ayahs") || 0)), hifz = Math.max(0, Number(data.get("hifz") || 0)); const score = Math.round((prayerTotal / 15 * 55) + (anger / 5 * 20) + (Math.min(ayahs, 25) / 25 * 15) + (Math.min(hifz, 10) / 10 * 10)); progress.daily[today()] = { score, prayerTotal, anger, ayahs, hifz }; persist(); toast(`Saved ${score}/100 for today.`); render(); }
function enableReminder() { if (!("Notification" in window)) return toast("Notifications are not supported in this browser."); Notification.requestPermission().then(result => toast(result === "granted" ? "Reminder enabled while this app is open." : "Notification permission was not granted.")).catch(() => toast("Could not enable notifications.")); }
function reminderTick() { const now = new Date(); if (now.getHours() === 23 && !progress.daily[today()] && "Notification" in window && Notification.permission === "granted") new Notification("NoorPath", { body: "Before the day closes, save your gentle daily check-in." }); }
window.addEventListener("error", error => console.error("Unexpected app error", error.error)); setInterval(reminderTick, 60 * 60 * 1000); reminderTick(); render();
