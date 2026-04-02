import { GoogleGenAI, Type } from "@google/genai";
import { Review } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function analyzeReviews(reviews: Review[]) {
  const reviewsText = reviews
    .slice(0, 50) // Limit to 50 for token efficiency in this demo
    .map((r) => `Rating: ${r.starRating}, Comment: ${r.comment}`)
    .join("\n---\n");

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analizza i seguenti commenti di un'attività su Google. Fornisci un riepilogo del sentiment generale, i temi principali (positivi e negativi) e suggerimenti pratici per migliorare l'attività.
    
    Commenti:
    ${reviewsText}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sentiment: { type: Type.STRING, enum: ["positive", "neutral", "negative"] },
          summary: { type: Type.STRING },
          themes: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["sentiment", "summary", "themes", "suggestions"],
      },
    },
  });

  return JSON.parse(response.text);
}

export async function generateReply(review: Review) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Scrivi una risposta professionale, cortese e personalizzata a questa recensione di Google. 
    Se la recensione è positiva, ringrazia calorosamente. 
    Se è negativa, scusati in modo professionale e invita a contattare l'attività privatamente per risolvere.
    Mantieni un tono che rifletta un'ottima cura del cliente.
    
    Recensione di: ${review.reviewerName}
    Rating: ${review.starRating} stelle
    Commento: ${review.comment}`,
    config: {
      systemInstruction: "Sei un esperto di customer care per attività locali su Google. Scrivi risposte brevi, efficaci e umane.",
    },
  });

  return response.text;
}
