import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getGeminiResponse = async (userMessage: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userMessage,
      config: {
        systemInstruction: "You are a helpful AI assistant residing in a terminal-based chat application. Keep your responses concise, technical, and formatted like a computer system log or concise terminal output where appropriate.",
      }
    });

    return response.text || "NO DATA RECEIVED";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "SYSTEM ERROR: UNABLE TO CONNECT TO AI CORE.";
  }
};