// AI credentials live only in /api/ask. This browser service only calls it.
async function askApi(mode, question, context) {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, question, scope: {
      surahId: context.surahId,
      ayahs: context.verses.map(verse => verse.ayah)
    } })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The AI study service is unavailable.");
  return body;
}

export async function generateStudySummary(context) {
  const response = await askApi(
    "summary",
    `Summarize the key themes of ${context.surah}, ruku ${context.ruku}.`,
    context
  );
  return { ...response.answer, sources: response.sources };
}

export async function generateDynamicQuiz(context) {
  const response = await askApi(
    "quiz",
    `Create a quiz for ${context.surah}, ruku ${context.ruku}.`,
    context
  );
  return response.answer;
}

export async function askGeminiAboutLesson(question, context) {
  const response = await askApi("question", question, context);
  return { answer: response.answer, sources: response.sources };
}
