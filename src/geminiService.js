import { GoogleGenerativeAI } from "@google/generative-ai";

// Replace this with your actual Gemini API Key
const API_KEY = ""; 
const genAI = new GoogleGenerativeAI(API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash", //  Updated
  generationConfig: {
    responseMimeType: "application/json"
  }
});

export async function fetchDynamicSurahData(surahName, rukuNumber) {
  const prompt = `
    Generate authentic study details for Surah: "${surahName}", Ruku number: ${rukuNumber}.
    Provide the verses with Arabic, English, and Urdu translations.
    Break down words from the verses into an array of [Arabic word, English translation] pairs.
    Provide the Tafsir breakdown.
    Provide the Lesson material including a background and summary.

    Follow this JSON structure strictly:
    {
      "id": 1,
      "name": "${surahName}",
      "arabicName": "Arabic Script Name",
      "meaning": "English Meaning of Name",
      "ruku": ${rukuNumber},
      "verses": [
        { 
          "n": 1, 
          "ar": "Arabic text of verse", 
          "en": "English translation", 
          "ur": "Urdu translation",
          "words": [["ArabicWord", "Meaning"], ["ArabicWord2", "Meaning2"]] 
        }
      ],
      "tafsir": [
        { "ayah": "1-3", "title": "Section Title", "text": "Explanation of these ayahs" }
      ],
      "lesson": {
        "background": "Historical background / context",
        "summary": "Short, clear summary of key lessons",
        "sources": ["Quranic Text", "Classical Tafsir"]
      }
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (error) {
    console.error("Error fetching Surah details:", error);
    throw error;
  }
}

export async function generateDynamicQuiz(surahName, rukuNumber, lessonSummary) {
  const prompt = `
    Based on Surah: "${surahName}", Ruku: ${rukuNumber} with the following summary:
    "${lessonSummary}"

    Generate exactly 5 high-quality, authentic multiple-choice questions (MCQs).
    Ensure the questions challenge the student's understanding. One choice must be the correct answer.

    Follow this JSON structure strictly:
    [
      {
        "q": "Question text?",
        "a": "Correct answer matching one of the choices exactly",
        "choices": ["Choice A", "Choice B", "Choice C", "Choice D"]
      }
    ]
  `;

  try {
    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (error) {
    console.error("Error generating quiz:", error);
    throw error;
  }
}

export async function generateDynamicVocabulary(versesArray) {
  const versesText = JSON.stringify(versesArray);
  const prompt = `
    Based on these verses: ${versesText}
    Extract 6-8 key Arabic vocabulary words. Provide their transliteration, English meaning, and frequency/importance.

    Follow this JSON structure strictly:
    [
      {
        "ar": "Arabic word",
        "translit": "Transliteration",
        "meaning": "English translation",
        "frequency": "Frequency (e.g. Core word, Common, etc.)"
      }
    ]
  `;

  try {
    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (error) {
    console.error("Error generating vocab:", error);
    throw error;
  }
}

export async function askGeminiAboutLesson(userQuery, lessonContent, surahName, rukuNumber) {
  const customModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `
    You are an authentic, precise AI Quran study companion.
    The user is studying Surah: "${surahName}", Ruku: ${rukuNumber}.
    Lesson Details:
    - Background: ${lessonContent.background}
    - Summary: ${lessonContent.summary}

    Answer this question concisely, without hallucinations, using orthodox sources:
    "${userQuery}"
  `;

  try {
    const result = await customModel.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Error with Ask AI:", error);
    return "I apologize, but I could not reach the AI service right now. Please try again.";
  }
}