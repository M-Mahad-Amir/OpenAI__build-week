import { GoogleGenerativeAI } from "@google/generative-ai";

// Paste a browser-restricted Gemini API key here for local development.
// For production, route AI requests through a server so the key is not public.
const API_KEY = "";
const MODEL_NAME = "gemini-3.5-flash";

export const isGeminiConfigured = () => Boolean(API_KEY.trim());

function getModel(responseMimeType) {
  if (!isGeminiConfigured()) throw new Error("Gemini is not configured. Paste your API key in src/geminiService.js.");
  const client = new GoogleGenerativeAI(API_KEY);
  return client.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: responseMimeType ? { responseMimeType } : undefined
  });
}

async function generateJson(prompt) {
  const result = await getModel("application/json").generateContent(prompt);
  return JSON.parse(result.response.text());
}

export async function generateStudySummary(context) {
  return generateJson(`
You are a careful Quran study assistant. Produce a concise study background and summary using only the supplied local tafsir excerpts. Do not use translations as context and do not add uncited historical claims, legal rulings, or sectarian conclusions.

${JSON.stringify(context)}

Return exactly: {"background":"...","summary":"..."}.`);
}

export async function generateContextualExplanation(context) {
  const result = await getModel().generateContent(`
Explain the supplied ayah for a learner using only the Arabic text and translations below. State that it is a contextual explanation, not a replacement for verified tafsir. Do not make claims not supported by the supplied text.

${JSON.stringify(context)}`);
  return result.response.text();
}

export async function generateDynamicQuiz(context) {
  return generateJson(`
Write exactly five thoughtful multiple-choice questions based only on these supplied local tafsir excerpts. Do not use translations as context. Each question needs four choices, exactly one answer matching a choice verbatim, and no unsupported claims.

${JSON.stringify(context)}

Return exactly an array of {"q":"Question","a":"Correct choice","choices":["A","B","C","D"]}.`);
}

export async function askGeminiAboutLesson(question, context) {
  const result = await getModel().generateContent(`
You are a careful Quran study companion. Answer the learner's question only from the provided local Quran corpus excerpt. If the excerpt does not support the answer, say so plainly. This is not a substitute for verified tafsir.

Question: ${question}
Corpus excerpt: ${JSON.stringify(context)}`);
  return result.response.text();
}
