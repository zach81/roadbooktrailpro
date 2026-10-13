/**
 * Route API Next.js pour l'export Suunto via l'API MCP de Parat.io
 * Endpoint : POST /api/suunto-export
 */

const PARAT_MCP_URL = "https://parat.io/raceplanner/api/mcp";

/**
 * Nettoie les accents et caractères spéciaux pour la compatibilité montre
 */
function sanitizeName(str, maxLen = 20) {
  if (!str) return "Checkpoint";
  const normalized = str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[;,\n\r]/g, " ")
    .trim();
  return normalized.slice(0, maxLen);
}

/**
 * Générateur local de secours si le service MCP externe est temporairement injoignable
 */
function generateFallbackP8(raceName, checkpoints) {
  const cleanRace = sanitizeName(raceName, 20);
  const rows = checkpoints.map((cp) => {
    const km = Number(cp.km).toFixed(1);
    const min = Math.round(Number(cp.targetElapsedMin) || 0);
    const stop = cp.stopMin ? Math.round(cp.stopMin) : "-";
    const name = sanitizeName(cp.name, 16);
    return `${km},${min},${stop},${name}`;
  });
  return `P8;${cleanRace};${rows.join(";")}`;
}

/**
 * Appelle un outil du serveur MCP Parat.io
 */
async function callMcpTool(sessionId, toolName, args) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }

  const res = await fetch(PARAT_MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 10000),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Erreur HTTP ${res.status} lors de l'appel à ${toolName}`);
  }

  const text = await res.text();
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const payload = JSON.parse(line.slice(6));
        if (payload.result && payload.result.content && payload.result.content[0]) {
          const contentText = payload.result.content[0].text;
          if (payload.result.isError) {
            throw new Error(contentText);
          }
          return JSON.parse(contentText);
        }
      } catch (err) {
        if (err.message && !err.message.includes("Unexpected token")) {
          throw err;
        }
      }
    }
  }

  throw new Error(`Aucune donnée exploitable renvoyée par ${toolName}`);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { raceName, checkpoints } = body;

    if (!raceName || !Array.isArray(checkpoints) || checkpoints.length === 0) {
      return Response.json(
        { error: "raceName et checkpoints (non vide) sont requis." },
        { status: 400 }
      );
    }

    // Filtrer les checkpoints à km > 0 (le départ à km 0 est implicite pour Parat.io)
    const validCheckpoints = checkpoints
      .filter((cp) => cp.km > 0.05)
      .map((cp) => ({
        name: sanitizeName(cp.name, 50),
        km: Number(Number(cp.km).toFixed(2)),
        targetElapsedMin: Math.max(0, Math.round(Number(cp.targetElapsedMin) || 0)),
        notes: cp.notes || undefined,
      }));

    if (validCheckpoints.length === 0) {
      return Response.json(
        { error: "Au moins un checkpoint au-delà du départ (km > 0) est nécessaire." },
        { status: 400 }
      );
    }

    let codeResult = null;
    let planResult = null;
    let usedFallback = false;

    try {
      // 1. Initialisation de session MCP
      const initRes = await fetch(PARAT_MCP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "trailroadbookpro", version: "1.0.0" },
          },
        }),
        signal: AbortSignal.timeout(8000),
      });

      const sessionId = initRes.headers.get("mcp-session-id");

      // 2. Génération du code compagnon Suunto (P8)
      codeResult = await callMcpTool(sessionId, "build_race_plan_code", {
        raceName,
        sourceNote: "Trail Roadbook Pro",
        checkpoints: validCheckpoints,
      });

      // 3. Génération du lien de consultation Parat.io Race Planner
      try {
        planResult = await callMcpTool(sessionId, "build_race_plan", {
          raceName,
          sourceNote: "Trail Roadbook Pro",
          checkpoints: validCheckpoints,
        });
      } catch (err) {
        console.warn("Échec optionnel de build_race_plan:", err.message);
      }
    } catch (mcpErr) {
      console.warn("Parat MCP indisponible ou en erreur, utilisation du repli local:", mcpErr.message);
      usedFallback = true;
      codeResult = {
        code: generateFallbackP8(raceName, validCheckpoints),
        caveat: "Code généré localement (serveur Parat.io injoignable).",
      };
    }

    return Response.json({
      success: true,
      code: codeResult?.code || generateFallbackP8(raceName, validCheckpoints),
      caveat: codeResult?.caveat || null,
      plannerUrl: planResult?.url || null,
      plannerTable: planResult?.table || null,
      isFallback: usedFallback,
      checkpointsCount: validCheckpoints.length,
    });
  } catch (error) {
    console.error("Erreur générale dans l'API suunto-export:", error);
    return Response.json(
      { error: error.message || "Erreur interne lors de la génération de l'export Suunto." },
      { status: 500 }
    );
  }
}
