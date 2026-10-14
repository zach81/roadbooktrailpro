import {
  enrichWaypointsWithStartEnd,
  generateSegments,
  calculateTraceStats,
  findOptimalElevationThreshold
} from "./roadbookCalculator";

export function formatTime(dateStr) {
  if (!dateStr) return "--:--";
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return "--:--";
  }
}

export function formatDurationMs(ms) {
  if (!ms && ms !== 0) return "0h00";
  const totalMins = Math.floor(Math.max(0, ms) / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

export function formatPace(minPerKm) {
  if (!minPerKm || !isFinite(minPerKm) || minPerKm <= 0) return "--'--\"";
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}'${secs.toString().padStart(2, "0")}"/km`;
}

export function calculateRoadbookSegments(data) {
  if (!data) return { segments: [], points: [], waypoints: [] };
  try {
    const pts = typeof data.points === "string" ? JSON.parse(data.points || "[]") : (data.points || []);
    const rawWps = typeof data.waypoints === "string" ? JSON.parse(data.waypoints || "[]") : (data.waypoints || []);
    const wps = rawWps.map((wp, i) => ({
      ...wp,
      id: wp.id || `wp-${i}-${Date.now()}`
    }));

    if (pts.length === 0) return { segments: [], points: pts, waypoints: wps };

    const enrichedWp = enrichWaypointsWithStartEnd(wps, pts);
    const rawStats = calculateTraceStats(pts, 7, 1);
    const offDist = parseFloat(data.officialDistance) || 0;
    const offEle = parseFloat(data.officialElevation) || 0;
    const distFactor = (offDist > 0 && rawStats.distance > 0) ? (offDist / rawStats.distance) : 1;
    const optThreshold = (offEle > 0) ? findOptimalElevationThreshold(pts, offEle) : 5;

    const segments = generateSegments(
      pts,
      enrichedWp,
      data.itraIndex || 600,
      data.fatiguePercent || 15,
      data.startTime || "",
      optThreshold,
      distFactor,
      data.weather || "modere",
      data.descentThreshold || 15,
      data.walkThreshold || 12,
      data.targetTime ? parseFloat(data.targetTime) : null,
      data.upCostDivider || 80,
      data.downCostModifier || 1.0,
      data.pacingStrategy || "regular",
      data.paceProfile || "coach"
    );

    return { segments, points: pts, waypoints: enrichedWp };
  } catch (err) {
    console.error("Erreur lors du calcul des segments du roadbook:", err);
    return { segments: [], points: [], waypoints: [] };
  }
}

export function getWaypointNutritionProducts(plannedNutrition, inventory = []) {
  if (!plannedNutrition) return [];
  return Object.entries(plannedNutrition)
    .filter(([_, qty]) => qty > 0)
    .map(([prodId, qty]) => {
      const product = inventory.find(p => p.id === parseInt(prodId, 10));
      return {
        id: prodId,
        name: product ? product.name : `Produit #${prodId}`,
        category: product?.category || "Autre",
        carbs: product?.carbs ? product.carbs * qty : 0,
        qty
      };
    });
}

export function calculateTotalCaddie(segments = [], inventory = []) {
  const total = {};
  segments.forEach(seg => {
    if (seg?.to?.planned_nutrition) {
      Object.entries(seg.to.planned_nutrition).forEach(([prodId, qty]) => {
        if (qty > 0) {
          total[prodId] = (total[prodId] || 0) + qty;
        }
      });
    }
  });

  return Object.entries(total).map(([prodId, qty]) => {
    const product = inventory.find(p => p.id === parseInt(prodId, 10));
    return {
      id: prodId,
      name: product ? product.name : `Produit #${prodId}`,
      category: product?.category || "Général",
      unitCarbs: product?.carbs || 0,
      totalCarbs: (product?.carbs || 0) * qty,
      qty
    };
  });
}
