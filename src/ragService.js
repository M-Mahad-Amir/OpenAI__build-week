async function postAsk(question, options) {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options ? { question, ...options } : { question })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The AI study service is unavailable.");
  return { answer: body.answer, sources: body.sources || [] };
}

// Public RAG Q&A contract: POST { question } and return { answer, sources }.
export function askRag(question) {
  return postAsk(question);
}

function scopeFor(context) {
  return {
    surahId: context.surahId,
    ayahs: context.verses.map(verse => verse.ayah)
  };
}

export async function generateRagSummary(context) {
  const { answer, sources } = await postAsk(
    `Summarize the key themes of ${context.surah}, ruku ${context.ruku}.`,
    { mode: "summary", scope: scopeFor(context) }
  );
  return { ...answer, sources };
}

export async function generateRagQuiz(context) {
  const { answer } = await postAsk(
    `Create a quiz for ${context.surah}, ruku ${context.ruku}.`,
    { mode: "quiz", scope: scopeFor(context) }
  );
  return answer;
}
