import { NextResponse } from "next/server";
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

export async function POST(req: Request) {
  try {
    const { macrocycle, config, weeksToGenerate, startDate } = await req.json();

    const generationStartDate = startDate ? new Date(startDate) : new Date(macrocycle.startDate);

    const systemInstruction = `Tu es un entraîneur expert en trail et ultra-trail, spécialisé dans la planification scientifique.
Ton rôle est de générer UNIQUEMENT les séances (workouts) pour une durée de ${weeksToGenerate} semaine(s) d'un plan d'entraînement, en respectant scrupuleusement la structure du macrocycle fourni (le TSS cible par semaine, la phase).
L'athlète t'a fourni des consignes supplémentaires via "Notes pour le coach IA". Utilise-les pour adapter le contenu spécifique des séances (ex: type de terrain, focus sur les côtes, technicité).
Génère la liste complète des séances structurées pour chaque jour d'entraînement prévu sur cette période.
Retourne au format JSON strict.`;

    const prompt = `Voici la structure du plan et les paramètres de l'athlète :
Config de l'athlète :
${JSON.stringify(config, null, 2)}

Macrocycle cible (respecte bien le TSS hebdomadaire et la phase) :
${JSON.stringify(macrocycle, null, 2)}

Notes du coach / Instructions IA :
"${config.aiNotes || 'Aucune note spécifique.'}"

Génère les séances (workouts) pour ${weeksToGenerate} semaine(s).
Le premier jour de cette génération est le ${generationStartDate.toLocaleDateString()}. Les dates des séances générées doivent commencer à partir de cette date précise.`;

    let response;
    let retries = 3;
    let delay = 1000;
    while (retries > 0) {
      try {
        response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: responseSchema,
          }
        });
        break; // Success, exit retry loop
      } catch (err: any) {
        if (err.status === 503 || err.status === 429) {
          retries--;
          if (retries === 0) throw err;
          console.log(`Gemini API busy (status ${err.status}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        } else {
          throw err;
        }
      }
    }

    const text = response?.text;
    if (!text) {
      throw new Error("No text returned from Gemini");
    }

    const data = JSON.parse(text);
    return NextResponse.json({ workouts: data.workouts });

  } catch (error: any) {
    console.error("API error in generate-workouts:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
