import { GoogleGenAI } from "@google/genai";

// Support both standard env and Vite env for Replit compatibility
const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_API_KEY || '';

let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

export const getGeminiResponse = async (userMessage: string): Promise<string> => {
  if (!ai) {
    return "Error: API Key not configured. If you are on Replit, add VITE_API_KEY to Secrets.";
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userMessage,
      config: {
        systemInstruction: "You are a helpful AI assistant residing in a terminal-based chat application. Keep your responses concise, technical, and formatted like a computer system log or concise terminal output where appropriate. Do not use markdown headers significantly, keep it plain text friendly.",
      }
    });

    return response.text || "NO DATA RECEIVED";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "SYSTEM ERROR: UNABLE TO CONNECT TO AI CORE.";
  }
};