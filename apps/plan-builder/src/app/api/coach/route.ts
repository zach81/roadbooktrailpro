import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const updateWorkoutsTool = {
  functionDeclarations: [
    {
      name: "update_workouts",
      description: "Met à jour la liste des séances d'entraînement. Utilise cette fonction uniquement si l'utilisateur demande explicitement de modifier, ajouter ou supprimer des séances dans son plan. Renvoie la liste COMPLÈTE de TOUTES les séances (anciennes non modifiées + nouvelles/modifiées). Ne renvoie pas juste la séance modifiée.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          workouts: {
            type: Type.ARRAY,
            description: "La liste complète des séances d'entraînement du plan.",
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                type: { type: Type.STRING },
                duration: { type: Type.NUMBER },
                tss: { type: Type.NUMBER },
                rpe: { type: Type.NUMBER },
                description: { type: Type.STRING },
                date: { type: Type.STRING }
              },
              required: ["id", "title", "type", "duration", "tss", "description", "date"]
            }
          }
        },
        required: ["workouts"]
      }
    }
  ]
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, history, contextPlan, contextWorkouts } = body;

    const systemInstruction = `Tu es un entraîneur expert en trail et ultra-trail. 
Ton rôle est d'analyser le plan d'entraînement de l'athlète et de l'adapter selon ses retours.
Sois concis, encourageant et très précis techniquement.
Tu as accès à l'état actuel du plan de l'athlète et à la liste de ses séances.
Si l'athlète te demande de modifier le plan (ex: "allège la semaine prochaine", "ajoute des côtes"), tu DOIS utiliser l'outil 'update_workouts' pour appliquer les changements dans la base de données. Renvoie toujours la liste complète des séances.

Contexte du plan actuel : 
${JSON.stringify(contextPlan, null, 2)}

Liste actuelle des séances : 
${JSON.stringify(contextWorkouts, null, 2)}`;

    // Build conversation history text to make the request stateless
    let historyContext = "";
    if (history && history.length > 0) {
      historyContext = "Voici l'historique de notre conversation :\n\n";
      for (const msg of history) {
        historyContext += `[${msg.role === 'user' ? 'Athlète' : 'Coach'}] : ${msg.content}\n\n`;
      }
      historyContext += "---\n\nNouveau message de l'athlète :\n";
    }

    const fullPrompt = historyContext + message;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: fullPrompt,
      config: {
        systemInstruction: systemInstruction,
        tools: [updateWorkoutsTool],
        temperature: 0.4,
      }
    });

    let updatedWorkouts = null;
    let textResponse = response.text || "";

    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      if (call.name === "update_workouts") {
        // According to the new SDK, args are in `args`
        updatedWorkouts = call.args?.workouts;
        if (!textResponse) {
          textResponse = "J'ai bien mis à jour tes séances comme demandé. N'hésite pas si tu veux faire d'autres ajustements !";
        }
      }
    }

    return NextResponse.json({
      text: textResponse,
      updatedWorkouts
    });

  } catch (error: any) {
    console.error("Coach API Error:", error);
    return NextResponse.json(
      { error: "Une erreur s'est produite lors de la génération de la réponse.", details: error.message },
      { status: 500 }
    );
  }
}
