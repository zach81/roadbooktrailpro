import { GoogleGenAI, Type, Schema } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const workoutPhaseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING, description: "warmup, active, recovery, cooldown, intervals" },
    duration: { type: Type.NUMBER, description: "Duration in minutes" },
    intensityTss: { type: Type.NUMBER, description: "Target TSS/hour or % intensity" },
    rpe: { type: Type.NUMBER, description: "RPE 1-10" },
    description: { type: Type.STRING },
    isHill: { type: Type.BOOLEAN },
    repeats: { type: Type.NUMBER },
    workDuration: { type: Type.NUMBER },
    workIntensity: { type: Type.NUMBER },
    workZone: { type: Type.STRING },
    restDuration: { type: Type.NUMBER },
    restIntensity: { type: Type.NUMBER },
    restZone: { type: Type.STRING }
  },
  required: ["type", "duration", "intensityTss"]
};

const workoutSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    name: { type: Type.STRING },
    date: { type: Type.STRING, description: "ISO Date string" },
    estimatedDuration: { type: Type.NUMBER, description: "Total duration in minutes" },
    totalTss: { type: Type.NUMBER, description: "Total expected TSS" },
    type: { type: Type.STRING, description: "WorkoutCategory: Recovery, Endurance, Tempo, Threshold, VO2Max, Long Run, etc." },
    terrain: { type: Type.STRING, description: "Flat, Hilly, Technical Trail, Indoor" },
    sport: { type: Type.STRING, description: "Run, Ride, CrossTraining, WeightTraining" },
    description: { type: Type.STRING },
    phases: {
      type: Type.ARRAY,
      items: workoutPhaseSchema
    }
  },
  required: ["id", "name", "date", "estimatedDuration", "totalTss", "type", "terrain", "sport", "phases"]
};

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    workouts: {
      type: Type.ARRAY,
      items: workoutSchema
    }
  },
  required: ["workouts"]
};

async function main() {
  try {
    console.log("Calling Gemini...");
    const response = await ai.models.generateContent({
      model: "gemma-4-31b-it",
      contents: "Génère 1 séance de test.",
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });
    console.log("Success:", response.text);
  } catch (e: any) {
    console.error("Error:", e.message);
    if (e.status) console.error("Status:", e.status);
    if (e.errorDetails) console.error("Details:", e.errorDetails);
  }
}

main();
