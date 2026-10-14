import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import {
  fetchRecentActivities,
  fetchActivityDetails,
  fetchWellnessRange,
  fetchAthleteFullProfile,
  fetchAthleteEvents
} from "@/lib/intervalsApi";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const updateWorkoutsDeclaration = {
  name: "update_workouts",
  description: "Met à jour la liste des séances d'entraînement du plan. Utilise cette fonction uniquement si l'utilisateur demande d'adapter, modifier, ajouter ou supprimer des séances dans son plan. Renvoie la liste COMPLÈTE de TOUTES les séances (anciennes non modifiées + nouvelles/modifiées).",
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
};

const intervalsToolDeclarations = [
  {
    name: "get_athlete_profile",
    description: "Récupère le profil physiologique de l'athlète sur Intervals.icu : poids, FC repos, FC max, seuil lactique (LTHR), allure de seuil, FTP, et les niveaux de forme/fatigue actuels (CTL, ATL, Form).",
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: "get_recent_activities",
    description: "Récupère l'historique des séances et sorties réelles de l'athlète sur Intervals.icu (distance km, D+, durée, TSS réel, allure, FC moyenne/max, RPE ressenti, dérive cardiaque).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        oldest: {
          type: Type.STRING,
          description: "Date de début au format YYYY-MM-DD (optionnel, par défaut 28 jours en arrière)."
        },
        newest: {
          type: Type.STRING,
          description: "Date de fin au format YYYY-MM-DD (optionnel, par défaut aujourd'hui)."
        },
        limit: {
          type: Type.NUMBER,
          description: "Nombre maximum d'activités à retourner (défaut 15)."
        }
      }
    }
  },
  {
    name: "get_activity_details",
    description: "Récupère les détails approfondis d'une séance spécifique sur Intervals.icu via son identifiant (fractions/intervalles réalisés, allures par bloc, FC par intervalle).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        activityId: {
          type: Type.STRING,
          description: "L'identifiant unique de l'activité sur Intervals.icu (ex: 'i1234567' ou ID numérique)."
        }
      },
      required: ["activityId"]
    }
  },
  {
    name: "get_wellness_data",
    description: "Récupère les données de santé et de récupération quotidienne de l'athlète sur Intervals.icu : VFC / HRV, score et durée de sommeil, FC repos, fatigue, stress, courbatures, humeur.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        oldest: {
          type: Type.STRING,
          description: "Date de début au format YYYY-MM-DD (optionnel, par défaut 14 jours en arrière)."
        },
        newest: {
          type: Type.STRING,
          description: "Date de fin au format YYYY-MM-DD (optionnel, par défaut aujourd'hui)."
        }
      }
    }
  },
  {
    name: "get_calendar_events",
    description: "Récupère les événements du calendrier Intervals.icu de l'athlète (courses cibles avec priorité A/B/C, compétitions planifiées, notes coach, objectifs de charge hebdomadaire).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        oldest: {
          type: Type.STRING,
          description: "Date de début au format YYYY-MM-DD (optionnel, par défaut aujourd'hui)."
        },
        newest: {
          type: Type.STRING,
          description: "Date de fin au format YYYY-MM-DD (optionnel, par défaut dans 90 jours)."
        }
      }
    }
  }
];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      message, 
      history, 
      contextPlan, 
      contextWorkouts,
      intervalsAthleteId,
      intervalsApiKey,
      athleteName
    } = body;

    const hasIntervalsAuth = Boolean(intervalsAthleteId && intervalsApiKey);

    const toolsDeclarations: any[] = [updateWorkoutsDeclaration];
    if (hasIntervalsAuth) {
      toolsDeclarations.push(...intervalsToolDeclarations);
    }

    const systemInstruction = `Tu es un entraîneur expert en trail et ultra-trail de niveau mondial.
Ton rôle est d'accompagner l'athlète (${athleteName || 'l\'athlète'}), d'analyser ses données d'entraînement réelles et d'adapter son plan d'entraînement avec une grande rigueur scientifique.
Sois concis, direct, encourageant et très précis sur les chiffres (allures, FC, TSS, D+, ratio charge/forme).

${hasIntervalsAuth ? `🔥 TU AS ACCÈS DIRECTEMENT À LA BASE DE DONNÉES INTERVALS.ICU DE L'ATHLÈTE via des outils intégrés :
- 'get_athlete_profile' : pour connaître ses allures seuil, FC max/repos, FTP et CTL/ATL de base.
- 'get_recent_activities' : pour analyser ses séances passées réellement effectuées (volume, dénivelé, TSS, allures, dérive cardiaque).
- 'get_activity_details' : pour voir le découpage précis des intervalles d'une séance.
- 'get_wellness_data' : pour évaluer sa fatigue, HRV, sommeil, stress et courbatures récentes.
- 'get_calendar_events' : pour voir ses courses cibles (A, B, C) et événements prévus.

CONSIGNE CAPITALE : Si l'athlète te pose une question sur son état de forme, sa fatigue, son historique d'entraînement, ses dernières séances ou ses courses à venir, tu DOIS appeler les outils correspondants pour consulter ses données réelles avant de formuler ta réponse ! Ne formule jamais de suppositions quand tu peux vérifier les données.` : `Note : La clé API Intervals.icu n'est pas encore renseignée pour cet athlète. Tu ne peux pas interroger ses données en direct.`}

Si l'athlète te demande d'adapter ou modifier son plan (ex: "allège la semaine prochaine", "ajoute une sortie longue dimanche"), tu DOIS utiliser l'outil 'update_workouts' pour renvoyer la liste COMPLÈTE de toutes les séances à jour.

Contexte du plan actuel :
${JSON.stringify(contextPlan, null, 2)}

Liste actuelle des séances du plan :
${JSON.stringify(contextWorkouts, null, 2)}`;

    // Build conversation history
    let historyContext = "";
    if (history && history.length > 0) {
      historyContext = "Voici l'historique de notre conversation :\n\n";
      for (const msg of history) {
        historyContext += `[${msg.role === 'user' ? 'Athlète' : 'Coach'}] : ${msg.content}\n\n`;
      }
      historyContext += "---\n\nNouveau message de l'athlète :\n";
    }

    const fullPrompt = historyContext + message;

    let contents: any[] = [
      { role: "user", parts: [{ text: fullPrompt }] }
    ];

    let updatedWorkouts = null;
    let textResponse = "";
    const toolsUsed: string[] = [];

    const modelName = process.env.GEMINI_MODEL || "gemini-3.6-flash";

    // Multi-turn tool execution loop (max 4 steps)
    for (let step = 0; step < 4; step++) {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: toolsDeclarations }],
          temperature: 0.4,
        }
      });

      const functionCalls = response.functionCalls || [];

      // Check if update_workouts was called
      const updateCall = functionCalls.find(c => c.name === "update_workouts");
      if (updateCall) {
        updatedWorkouts = updateCall.args?.workouts;
      }

      // Check for Intervals.icu query tools
      const queryCalls = functionCalls.filter(c => c.name !== "update_workouts");

      if (queryCalls.length === 0) {
        // No queries needed, grab final text
        textResponse = response.text || "";
        break;
      }

      // Record candidate model parts in contents history
      const candidateParts = response.candidates?.[0]?.content?.parts || [];
      contents.push({ role: "model", parts: candidateParts });

      // Execute each query tool against Intervals.icu
      for (const call of queryCalls) {
        let result: any = null;
        try {
          if (call.name === "get_athlete_profile") {
            result = await fetchAthleteFullProfile(intervalsAthleteId, intervalsApiKey);
            toolsUsed.push("Profil & Seuils (Intervals.icu)");
          } else if (call.name === "get_recent_activities") {
            const oldest = call.args?.oldest as string | undefined;
            const newest = call.args?.newest as string | undefined;
            const limit = typeof call.args?.limit === 'number' ? call.args.limit : 15;
            result = await fetchRecentActivities(intervalsAthleteId, intervalsApiKey, oldest, newest, limit);
            toolsUsed.push("Activités & Sorties réelles");
          } else if (call.name === "get_activity_details") {
            const activityId = String(call.args?.activityId);
            result = await fetchActivityDetails(activityId, intervalsApiKey);
            toolsUsed.push(`Détails séance (${activityId})`);
          } else if (call.name === "get_wellness_data") {
            const oldest = call.args?.oldest as string | undefined;
            const newest = call.args?.newest as string | undefined;
            result = await fetchWellnessRange(intervalsAthleteId, intervalsApiKey, oldest, newest);
            toolsUsed.push("Wellness (HRV / Sommeil / Fatigue)");
          } else if (call.name === "get_calendar_events") {
            const oldest = call.args?.oldest as string | undefined;
            const newest = call.args?.newest as string | undefined;
            result = await fetchAthleteEvents(intervalsAthleteId, intervalsApiKey, oldest, newest);
            toolsUsed.push("Courses cibles & Calendrier");
          }
        } catch (toolErr: any) {
          console.error(`Error executing tool ${call.name}:`, toolErr);
          result = { error: toolErr.message };
        }

        // Send function response back to Gemini
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: call.name,
                response: { data: result }
              }
            }
          ]
        });
      }
    }

    if (!textResponse && updatedWorkouts) {
      textResponse = "J'ai bien analysé tes données et mis à jour tes séances d'entraînement selon tes besoins !";
    } else if (!textResponse) {
      textResponse = "J'ai consulté tes données Intervals.icu. Que souhaites-tu approfondir ou modifier dans ton programme ?";
    }

    return NextResponse.json({
      text: textResponse,
      updatedWorkouts,
      toolsUsed: Array.from(new Set(toolsUsed))
    });

  } catch (error: any) {
    console.error("Coach API Error:", error);
    return NextResponse.json(
      { error: "Une erreur s'est produite lors de la génération de la réponse.", details: error.message },
      { status: 500 }
    );
  }
}
