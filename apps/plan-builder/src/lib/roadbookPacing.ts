import { collection, query, where, getDocs, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ParsedCourse, TrackPoint, CourseWaypoint, ComparisonResult, haversineDistance } from './courseParser';
import {
  RaceCalibrationProfile,
  calculateEmpiricalItraFromPerformance,
  estimateRaceTargetHoursForCourse,
} from './intervalsApi';

export interface RoadbookWaypoint {
  id?: string;
  name: string;
  lat: number;
  lon: number;
  ele?: number;
  pointIndex?: number;
  pause?: number; // minutes
  time_modifier?: number; // % (100 = normal, >100 = plus rapide, <100 = plus lent)
  cutoffTime?: string;
  type?: string;
  desc?: string;
  technicality?: number;
  planned_nutrition?: Record<string, number>;
}

export interface RoadbookDoc {
  id: string;
  name: string;
  userId?: string;
  points?: string | Array<{ lat: number; lon: number; ele: number }>;
  waypoints?: string | RoadbookWaypoint[];
  targetTime?: number | string;
  itraIndex?: number | string;
  fatiguePercent?: number;
  startTime?: string;
  pacingStrategy?: 'regular' | 'prudent' | 'aggressive';
  paceProfile?: 'coach' | 'aggressive' | 'moderate';
  descentThreshold?: number;
  walkThreshold?: number;
  upCostDivider?: number;
  downCostModifier?: number;
  officialDistance?: number | string;
  officialElevation?: number | string;
  weather?: string;
  updatedAt?: any;
  isPublic?: boolean;
  lastRetroSyncAt?: string;
  lastRetroSyncSource?: string;
}

export interface RoadbookSummary {
  id: string;
  name: string;
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  targetTimeFormatted: string;
  targetTimeH?: number;
  itraIndex?: number;
  dateFormatted?: string;
  isDemo?: boolean;
  waypointsCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. MODÈLE SCIENTIFIQUE DE PACING TRAIL (Minetti + ITRA + Fatigue)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coût énergétique de la course selon Minetti et al. (2002)
 * @param slope Pente en décimal (ex: 0.10 pour 10%)
 */
function minettiCost(slope: number): number {
  const i = Math.max(-0.45, Math.min(0.45, slope));
  return (
    155.4 * Math.pow(i, 5) -
    30.4 * Math.pow(i, 4) -
    43.3 * Math.pow(i, 3) +
    46.3 * Math.pow(i, 2) +
    19.5 * i +
    3.6
  );
}

/**
 * Calcule la vitesse estimée à plat selon l'index ITRA
 */
function getFlatSpeedFromItra(itra: number): number {
  const safeItra = Math.max(300, Math.min(950, itra || 550));
  // Vitesse de base sur plat en km/h pour un coureur d'index ITRA donné
  return 6.5 + (safeItra - 300) * 0.0145;
}

/**
 * Facteur de ralentissement en fonction de la pente, modulé par upCostDivider et downCostModifier
 */
function getSlopeSpeedMultiplier(
  slopePct: number,
  upCostDivider: number = 80,
  downCostModifier: number = 1.0
): number {
  const s = slopePct / 100;
  if (s > 0) {
    // Montée : ralentissement progressif selon Minetti modulé par l'aisance en côte (upCostDivider: 80 = standard, 100 = puissant)
    const costFlat = minettiCost(0);
    const costUphill = minettiCost(s);
    const upEfficiencyBoost = Math.max(0.75, Math.min(1.3, upCostDivider / 85));
    return Math.max(0.18, (costFlat / costUphill) * upEfficiencyBoost);
  } else {
    // Descente : modulée par l'aisance en descente (downCostModifier: 0.4 = agile/rapide, 1.0 = normal, 1.4 = prudent/lent)
    const downAgilityFactor = Math.max(0.7, Math.min(1.35, 1.15 - (downCostModifier - 0.6) * 0.35));
    if (s >= -0.10) {
      return (1.0 + Math.abs(s) * 2.2) * downAgilityFactor; // Accélération modérée
    } else if (s >= -0.22) {
      return (1.22 - (Math.abs(s) - 0.10) * 1.5) * downAgilityFactor; // Début de retenue
    } else {
      return Math.max(0.35, (1.04 - (Math.abs(s) - 0.22) * 3.0) * downAgilityFactor); // Descente très raide et technique
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CONVERSION D'UN ROADBOOK EN PARSEDCOURSE (Pacing Idéal)
// ─────────────────────────────────────────────────────────────────────────────

export function convertRoadbookToParsedCourse(
  roadbook: RoadbookDoc,
  options?: {
    paceProfile?: 'target' | 'fast' | 'slow';
    customTargetTimeH?: number;
  }
): ParsedCourse {
  // 1. Extraire les points GPS
  let rawPoints: Array<{ lat: number; lon: number; ele: number }> = [];
  if (typeof roadbook.points === 'string') {
    try {
      rawPoints = JSON.parse(roadbook.points || '[]');
    } catch {
      rawPoints = [];
    }
  } else if (Array.isArray(roadbook.points)) {
    rawPoints = roadbook.points;
  }

  if (rawPoints.length === 0) {
    throw new Error(`Le Roadbook "${roadbook.name}" ne contient aucun point GPS.`);
  }

  // 2. Extraire les waypoints (ravitos, cols, sommets)
  let rawWaypoints: RoadbookWaypoint[] = [];
  if (typeof roadbook.waypoints === 'string') {
    try {
      rawWaypoints = JSON.parse(roadbook.waypoints || '[]');
    } catch {
      rawWaypoints = [];
    }
  } else if (Array.isArray(roadbook.waypoints)) {
    rawWaypoints = roadbook.waypoints;
  }

  // 3. Calculer les distances cumulées brutes et le dénivelé
  let totalDistKm = 0;
  let totalGainM = 0;
  let totalLossM = 0;
  const distCumulative: number[] = [0];

  for (let i = 1; i < rawPoints.length; i++) {
    const p1 = rawPoints[i - 1];
    const p2 = rawPoints[i];
    const d = haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
    totalDistKm += d;
    distCumulative.push(totalDistKm);

    const dEle = p2.ele - p1.ele;
    if (Math.abs(dEle) > 0.4) {
      if (dEle > 0) totalGainM += dEle;
      else totalLossM += Math.abs(dEle);
    }
  }

  const itra = Number(roadbook.itraIndex) || 560;
  const flatBaseSpeed = getFlatSpeedFromItra(itra);
  const fatiguePercent = (roadbook.fatiguePercent ?? 12) / 100;
  const pacingStrategy = roadbook.pacingStrategy || 'regular';
  const upCostDivider = Number(roadbook.upCostDivider) || 80;
  const downCostModifier = Number(roadbook.downCostModifier) || 1.0;

  // Pré-associer les waypoints à leurs index pour appliquer time_modifier par tronçon
  const enrichedWaypoints: Array<CourseWaypoint & { timeModifierPct: number }> = rawWaypoints.map((wp) => {
    let closestIdx = 0;
    let minD = Infinity;

    if (wp.pointIndex !== undefined && wp.pointIndex >= 0 && wp.pointIndex < rawPoints.length) {
      closestIdx = wp.pointIndex;
    } else {
      for (let j = 0; j < rawPoints.length; j++) {
        const d = haversineDistance(wp.lat, wp.lon, rawPoints[j].lat, rawPoints[j].lon);
        if (d < minD) {
          minD = d;
          closestIdx = j;
        }
      }
    }

    const km = Math.round(distCumulative[closestIdx] * 100) / 100;
    const ele = rawPoints[closestIdx]?.ele ?? wp.ele ?? 0;

    return {
      id: wp.id || `wp-${closestIdx}`,
      name: wp.name,
      km,
      ele: Math.round(ele),
      pauseMin: wp.pause || 0,
      cutoffTime: wp.cutoffTime,
      type: wp.type || 'ravito',
      lat: wp.lat,
      lon: wp.lon,
      pointIndex: closestIdx,
      timeModifierPct: Number(wp.time_modifier) > 0 ? Number(wp.time_modifier) : 100,
    };
  }).sort((a, b) => a.km - b.km);

  // 4. Déterminer les durées de chaque segment entre points
  const segmentDurationSec: number[] = new Array(rawPoints.length).fill(0);
  let totalCalculatedDurationSec = 0;
  let curWpSegIdx = 0;

  for (let i = 1; i < rawPoints.length; i++) {
    while (
      curWpSegIdx < enrichedWaypoints.length - 1 &&
      (enrichedWaypoints[curWpSegIdx].pointIndex ?? 0) < i
    ) {
      curWpSegIdx++;
    }
    const segModifier = (enrichedWaypoints[curWpSegIdx]?.timeModifierPct || 100) / 100;

    const dKm = distCumulative[i] - distCumulative[i - 1];
    if (dKm <= 0) continue;

    const p1 = rawPoints[i - 1];
    const p2 = rawPoints[i];
    const dEle = p2.ele - p1.ele;
    const slopePct = (dEle / (dKm * 1000)) * 100;

    const slopeMult = getSlopeSpeedMultiplier(slopePct, upCostDivider, downCostModifier);
    const progressRatio = distCumulative[i] / Math.max(0.1, totalDistKm);

    // Fatigue progressive
    let fatigueFactor = 1.0 + fatiguePercent * Math.pow(progressRatio, 1.3);

    // Ajustement de stratégie de pacing
    if (pacingStrategy === 'prudent') {
      // Départ 5% plus lent, fin préservée
      fatigueFactor *= 1.05 - 0.10 * progressRatio;
    } else if (pacingStrategy === 'aggressive') {
      // Départ 5% plus rapide, dérive plus forte sur la fin
      fatigueFactor *= 0.95 + 0.15 * progressRatio;
    }

    const speedKmH = Math.max(1.8, Math.min(24, ((flatBaseSpeed * slopeMult) / fatigueFactor) * segModifier));
    const dtSec = (dKm / speedKmH) * 3600;

    segmentDurationSec[i] = dtSec;
    totalCalculatedDurationSec += dtSec;
  }

  // 5. Ajustement de l'objectif cible (Target Time)
  const targetTimeSetting = options?.customTargetTimeH ?? Number(roadbook.targetTime);
  let timeScaleFactor = 1.0;

  // Calcul du temps total de pauses prévues aux ravitaillements
  let totalPlannedPauseSec = 0;
  rawWaypoints.forEach((wp) => {
    if (wp.pause && wp.pause > 0) {
      totalPlannedPauseSec += wp.pause * 60;
    }
  });

  const effectiveTargetHours =
    targetTimeSetting && targetTimeSetting > 0
      ? targetTimeSetting
      : estimateRaceTargetHoursForCourse({
          distanceKm: Number(roadbook.officialDistance) || totalDistKm,
          elevationGainM: Number(roadbook.officialElevation) || totalGainM,
          itraIndex: itra,
          fatiguePercent: roadbook.fatiguePercent ?? 15,
          upCostDivider,
          downCostModifier,
          pauseMinutesTotal: totalPlannedPauseSec / 60,
        });

  if (effectiveTargetHours && effectiveTargetHours > 0) {
    const targetTotalSec = effectiveTargetHours * 3600;
    const targetRunningSec = Math.max(1800, targetTotalSec - totalPlannedPauseSec);
    if (totalCalculatedDurationSec > 0) {
      timeScaleFactor = targetRunningSec / totalCalculatedDurationSec;
    }
  }

  if (options?.paceProfile === 'fast') {
    timeScaleFactor *= 0.94; // Profil optimiste (-6%)
  } else if (options?.paceProfile === 'slow') {
    timeScaleFactor *= 1.12; // Profil prudent (+12%)
  }

  // 7. Construire les TrackPoints avec timestamps cumulés et temps de pause aux ravitos
  const points: TrackPoint[] = [];
  let currentElapsedSec = 0;
  const startDate = roadbook.startTime ? new Date(roadbook.startTime) : new Date(Date.now() - 3600000 * 5);

  let nextWpIdx = 0;

  for (let i = 0; i < rawPoints.length; i++) {
    const p = rawPoints[i];
    const dt = (segmentDurationSec[i] || 0) * timeScaleFactor;
    currentElapsedSec += dt;

    // Vérifier si un ravitaillement avec pause se situe ici
    if (nextWpIdx < enrichedWaypoints.length) {
      const wp = enrichedWaypoints[nextWpIdx];
      if (wp.pointIndex === i) {
        wp.plannedTimeSec = Math.round(currentElapsedSec);
        if (wp.pauseMin && wp.pauseMin > 0) {
          currentElapsedSec += wp.pauseMin * 60;
        }
        nextWpIdx++;
      }
    }

    const km = Math.round(distCumulative[i] * 1000) / 1000;
    const speed = i > 0 && dt > 0 ? ((distCumulative[i] - distCumulative[i - 1]) / (dt / 3600)) : flatBaseSpeed;

    points.push({
      lat: p.lat,
      lon: p.lon,
      ele: Math.round(p.ele * 10) / 10,
      elapsedSec: Math.round(currentElapsedSec),
      distKm: km,
      speedKmH: Math.round(speed * 10) / 10,
      time: new Date(startDate.getTime() + Math.round(currentElapsedSec) * 1000),
    });
  }

  const finalDurationSec = points.length > 0 ? points[points.length - 1].elapsedSec : 0;
  const hours = Math.floor(finalDurationSec / 3600);
  const minutes = Math.floor((finalDurationSec % 3600) / 60);

  return {
    name: `${roadbook.name} (Pacing Idéal Roadbook)`,
    points,
    totalDistanceKm: Math.round(totalDistKm * 10) / 10,
    totalDurationSec: finalDurationSec,
    elevationGainM: Math.round(totalGainM),
    elevationLossM: Math.round(totalLossM),
    minElevationM: Math.round(Math.min(...rawPoints.map((p) => p.ele))),
    maxElevationM: Math.round(Math.max(...rawPoints.map((p) => p.ele))),
    sourceType: 'ROADBOOK',
    waypoints: enrichedWaypoints,
    targetTimeFormatted: `${hours}h ${String(minutes).padStart(2, '0')}m`,
    pacingStrategy: pacingStrategy,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ROADBOOKS DE DÉMONSTRATION INTÉGRÉS (Haute fidélité)
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_ROADBOOKS: RoadbookDoc[] = [
  {
    id: 'demo-roc-de-france',
    name: 'Roc de France Skytrail',
    targetTime: 6.25, // 6h15
    itraIndex: 610,
    fatiguePercent: 14,
    pacingStrategy: 'prudent',
    paceProfile: 'coach',
    officialDistance: 42.5,
    officialElevation: 2450,
    isPublic: true,
    waypoints: [
      { name: 'Départ (Céret)', lat: 42.4845, lon: 2.7482, ele: 175, pause: 0, type: 'start' },
      { name: 'Ravito 1 - Col de Fontfrède', lat: 42.4592, lon: 2.7214, ele: 1012, pause: 5, type: 'food', cutoffTime: '2h00' },
      { name: 'Sommet Roc de France', lat: 42.4418, lon: 2.7052, ele: 1449, pause: 2, type: 'peak' },
      { name: 'Ravito 2 - Les Salines', lat: 42.4285, lon: 2.7289, ele: 1098, pause: 8, type: 'food', cutoffTime: '4h15' },
      { name: 'Col de Boussols', lat: 42.4510, lon: 2.7560, ele: 780, pause: 3, type: 'water' },
      { name: 'Arrivée (Céret Place)', lat: 42.4845, lon: 2.7482, ele: 175, pause: 0, type: 'finish', cutoffTime: '8h00' },
    ],
    points: generateSyntheticCoursePoints([
      { lat: 42.4845, lon: 2.7482, ele: 175 },
      { lat: 42.4780, lon: 2.7380, ele: 420 },
      { lat: 42.4690, lon: 2.7290, ele: 710 },
      { lat: 42.4592, lon: 2.7214, ele: 1012 }, // R1
      { lat: 42.4500, lon: 2.7120, ele: 1280 },
      { lat: 42.4418, lon: 2.7052, ele: 1449 }, // Sommet
      { lat: 42.4330, lon: 2.7160, ele: 1220 },
      { lat: 42.4285, lon: 2.7289, ele: 1098 }, // R2
      { lat: 42.4390, lon: 2.7420, ele: 940 },
      { lat: 42.4510, lon: 2.7560, ele: 780 },
      { lat: 42.4680, lon: 2.7540, ele: 450 },
      { lat: 42.4845, lon: 2.7482, ele: 175 }, // Fin
    ], 280),
  },
  {
    id: 'demo-trail-cretes',
    name: 'Trail des Crêtes Vosgiennes',
    targetTime: 3.75, // 3h45
    itraIndex: 580,
    fatiguePercent: 10,
    pacingStrategy: 'regular',
    paceProfile: 'coach',
    officialDistance: 28.4,
    officialElevation: 1680,
    isPublic: true,
    waypoints: [
      { name: 'Départ - Gérardmer Lac', lat: 48.0720, lon: 6.8780, ele: 660, pause: 0, type: 'start' },
      { name: 'Ravito 1 - Col de la Schlucht', lat: 48.0630, lon: 7.0220, ele: 1139, pause: 6, type: 'food', cutoffTime: '1h45' },
      { name: 'Sommet Hohneck (1363m)', lat: 48.0370, lon: 7.0160, ele: 1363, pause: 2, type: 'peak' },
      { name: 'Ravito 2 - Kastelberg', lat: 48.0210, lon: 6.9950, ele: 1220, pause: 5, type: 'water', cutoffTime: '2h45' },
      { name: 'Arrivée - Retour Gérardmer', lat: 48.0720, lon: 6.8780, ele: 660, pause: 0, type: 'finish', cutoffTime: '5h00' },
    ],
    points: generateSyntheticCoursePoints([
      { lat: 48.0720, lon: 6.8780, ele: 660 },
      { lat: 48.0700, lon: 6.9200, ele: 850 },
      { lat: 48.0680, lon: 6.9700, ele: 1020 },
      { lat: 48.0630, lon: 7.0220, ele: 1139 },
      { lat: 48.0490, lon: 7.0250, ele: 1280 },
      { lat: 48.0370, lon: 7.0160, ele: 1363 },
      { lat: 48.0210, lon: 6.9950, ele: 1220 },
      { lat: 48.0380, lon: 6.9500, ele: 990 },
      { lat: 48.0550, lon: 6.9100, ele: 810 },
      { lat: 48.0720, lon: 6.8780, ele: 660 },
    ], 220),
  },
];

/**
 * Génère des points GPS lisses et réalistes à partir de balises maîtresses
 */
function generateSyntheticCoursePoints(
  anchors: Array<{ lat: number; lon: number; ele: number }>,
  totalCount: number
): Array<{ lat: number; lon: number; ele: number }> {
  const result: Array<{ lat: number; lon: number; ele: number }> = [];
  const segments = anchors.length - 1;
  const ptsPerSeg = Math.floor(totalCount / segments);

  for (let s = 0; s < segments; s++) {
    const a1 = anchors[s];
    const a2 = anchors[s + 1];

    for (let k = 0; k < ptsPerSeg; k++) {
      const t = k / ptsPerSeg;
      // Interpolation avec ondulation naturelle de sentier
      const noise = Math.sin(t * Math.PI) * 0.0012;
      const eleNoise = Math.sin(t * Math.PI * 3) * 8;

      result.push({
        lat: a1.lat + (a2.lat - a1.lat) * t + noise,
        lon: a1.lon + (a2.lon - a1.lon) * t + noise * 0.7,
        ele: Math.round(a1.ele + (a2.ele - a1.ele) * t + eleNoise),
      });
    }
  }

  // Dernier point exact
  result.push(anchors[anchors.length - 1]);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. RÉCUPÉRATION DES ROADBOOKS DEPUIS FIRESTORE & COMPTABILISATION
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchUserRoadbooks(userId?: string): Promise<RoadbookSummary[]> {
  const summaries: RoadbookSummary[] = [];

  // Toujours ajouter les roadbooks de démonstration certifiés
  DEMO_ROADBOOKS.forEach((demo) => {
    summaries.push({
      id: demo.id,
      name: demo.name,
      distanceKm: Number(demo.officialDistance) || 42,
      elevationGainM: Number(demo.officialElevation) || 2400,
      elevationLossM: Number(demo.officialElevation) || 2400,
      targetTimeFormatted: `${Math.floor(Number(demo.targetTime))}h ${Math.round((Number(demo.targetTime) % 1) * 60)}m`,
      targetTimeH: Number(demo.targetTime),
      itraIndex: Number(demo.itraIndex),
      isDemo: true,
      waypointsCount: Array.isArray(demo.waypoints) ? demo.waypoints.length : 0,
      dateFormatted: 'Modèle Certifié',
    });
  });

  if (!userId) return summaries;

  try {
    const roadbooksRef = collection(db, 'roadbooks');
    const q = query(roadbooksRef, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);

    querySnapshot.forEach((docSnap) => {
      const d = docSnap.data() as RoadbookDoc;
      let wpsCount = 0;
      if (typeof d.waypoints === 'string') {
        try {
          wpsCount = JSON.parse(d.waypoints).length;
        } catch {
          wpsCount = 0;
        }
      } else if (Array.isArray(d.waypoints)) {
        wpsCount = d.waypoints.length;
      }

      let ptsCount = 0;
      if (typeof d.points === 'string') {
        try {
          ptsCount = JSON.parse(d.points).length;
        } catch {
          ptsCount = 0;
        }
      } else if (Array.isArray(d.points)) {
        ptsCount = d.points.length;
      }

      // Si le roadbook a des coordonnées valides
      if (ptsCount > 0) {
        const dist = Number(d.officialDistance) || 0;
        const gain = Number(d.officialElevation) || 0;
        const targetH = Number(d.targetTime) || 0;
        const targetStr = targetH > 0
          ? `${Math.floor(targetH)}h ${String(Math.round((targetH % 1) * 60)).padStart(2, '0')}m`
          : 'Pacing Auto (ITRA)';

        summaries.push({
          id: docSnap.id,
          name: d.name || 'Roadbook sans titre',
          distanceKm: dist,
          elevationGainM: gain,
          elevationLossM: gain,
          targetTimeFormatted: targetStr,
          targetTimeH: targetH > 0 ? targetH : undefined,
          itraIndex: Number(d.itraIndex) || undefined,
          isDemo: false,
          waypointsCount: wpsCount,
          dateFormatted: d.updatedAt ? new Date(d.updatedAt).toLocaleDateString('fr-FR') : undefined,
        });
      }
    });
  } catch (err) {
    console.warn('[RoadbookPacing] Impossible de récupérer les roadbooks Firestore :', err);
  }

  return summaries;
}

export async function fetchRoadbookById(roadbookId: string): Promise<RoadbookDoc | null> {
  // 1. Vérifier si c'est un démo preset
  const demo = DEMO_ROADBOOKS.find((d) => d.id === roadbookId);
  if (demo) return demo;

  // 2. Chercher dans Firestore
  try {
    const docRef = doc(db, 'roadbooks', roadbookId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as RoadbookDoc;
    }
  } catch (err) {
    console.error('[RoadbookPacing] Erreur chargement roadbook :', err);
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. RÉTRO-SYNCHRONISATION (.FIT / COURSE RÉELLE -> ROADBOOK & PROFIL COUREUR)
// ─────────────────────────────────────────────────────────────────────────────

export interface RetroSyncWaypointChange {
  id: string;
  name: string;
  km: number;
  oldPauseMin: number;
  newPauseMin: number;
  oldTimeModifierPct: number;
  newTimeModifierPct: number;
  segmentDeltaSec: number;
}

export interface RetroSyncRecommendation {
  sourceLabel: string;
  isDemoRoadbook: boolean;
  oldTargetTimeH: number;
  newTargetTimeH: number;
  oldTargetTimeFormatted: string;
  newTargetTimeFormatted: string;
  oldItraIndex: number;
  newItraIndex: number;
  oldFatiguePercent: number;
  newFatiguePercent: number;
  oldPacingStrategy: 'regular' | 'prudent' | 'aggressive';
  newPacingStrategy: 'regular' | 'prudent' | 'aggressive';
  oldUpCostDivider: number;
  newUpCostDivider: number;
  oldDownCostModifier: number;
  newDownCostModifier: number;
  oldWalkThreshold: number;
  newWalkThreshold: number;
  oldDescentThreshold: number;
  newDescentThreshold: number;
  waypointChanges: RetroSyncWaypointChange[];
  updatedWaypointsArray: RoadbookWaypoint[];
  summaryReasons: string[];
}

function formatHoursToHHMM(hoursDecimal: number): string {
  const h = Math.floor(hoursDecimal);
  const m = Math.round((hoursDecimal - h) * 60);
  if (m === 60) return `${h + 1}h 00m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Calcule la rétro-synchronisation complète d'un Roadbook à partir de la confrontation
 * entre le Roadbook (Trace 1) et la sortie réelle .FIT / Intervals.icu (Trace 2).
 */
export function computeRoadbookRetroSync(
  roadbook: RoadbookDoc,
  comparison: ComparisonResult
): RetroSyncRecommendation {
  const c1 = comparison.course1;
  const c2 = comparison.course2;
  const pa = comparison.pacingAnalysis;

  const oldTargetTimeH = Number(roadbook.targetTime) || Number((c1.totalDurationSec / 3600).toFixed(2));
  const actualDurationH = Number((c2.totalDurationSec / 3600).toFixed(2));
  const newTargetTimeH = Math.max(0.5, actualDurationH);

  // 1. Calcul de l'Index ITRA empirique observé sur la Trace 2
  const distKm = c2.totalDistanceKm || c1.totalDistanceKm || 20;
  const eleGainM = c2.elevationGainM || c1.elevationGainM || 500;
  const kmEffort = distKm + eleGainM / 100;
  const elapsedHours = Math.max(0.25, c2.totalDurationSec / 3600);
  const observedItra = calculateEmpiricalItraFromPerformance(distKm, eleGainM, elapsedHours, false);
  const oldItraIndex = Number(roadbook.itraIndex) || 560;
  // Lissage pondéré (75% performance réelle du jour, 25% index initial)
  const newItraIndex = Math.round(observedItra * 0.75 + oldItraIndex * 0.25);

  // 2. Modulation de la Fatigue (%) et de la Stratégie de Pacing selon la dérive 1ère vs 2ème moitié
  const oldFatiguePercent = Number(roadbook.fatiguePercent ?? 15);
  const firstHalfDelta = pa?.firstHalfDeltaSec ?? 0;
  const secondHalfDelta = pa?.secondHalfDeltaSec ?? 0;
  // Si secondHalfDelta est très négatif par rapport à firstHalfDelta, le coureur a subi une forte dérive (fatigue sous-estimée)
  const halfDriftSec = firstHalfDelta - secondHalfDelta; // > 0 si 2ème moitié moins bonne que 1ère moitié
  const halfDriftRatio = c1.totalDurationSec > 0 ? halfDriftSec / (c1.totalDurationSec * 0.5) : 0;
  const fatigueAdjustment = Math.round(halfDriftRatio * 45);
  const newFatiguePercent = Math.max(5, Math.min(42, oldFatiguePercent + fatigueAdjustment));

  const oldPacingStrategy = roadbook.pacingStrategy || 'regular';
  let newPacingStrategy: 'regular' | 'prudent' | 'aggressive' = oldPacingStrategy;
  if (firstHalfDelta > 120 && secondHalfDelta < -180) {
    // Parti trop vite, explosion en 2e moitié -> recommander 'prudent'
    newPacingStrategy = 'prudent';
  } else if (firstHalfDelta < -120 && secondHalfDelta > 120) {
    // Negative split marqué -> profil 'prudent' validé ou passage en 'regular'
    newPacingStrategy = 'regular';
  } else if (newFatiguePercent >= 22) {
    newPacingStrategy = 'prudent';
  }

  // 3. Modulation Montée (upCostDivider) et Descente (downCostModifier)
  const oldUpCostDivider = Number(roadbook.upCostDivider) || 80;
  const uphillDeltaSec = pa?.uphillDeltaSec ?? 0;
  // Si uphillDeltaSec > 0 (avance en montée), le coureur est plus économique en D+ -> augmenter upCostDivider
  const upDeltaMinutes = uphillDeltaSec / 60;
  const upDividerShift = Math.max(-12, Math.min(14, Math.round(upDeltaMinutes * 0.8)));
  const newUpCostDivider = Math.max(65, Math.min(110, oldUpCostDivider + upDividerShift));

  const oldDownCostModifier = Number(roadbook.downCostModifier ?? 1.0);
  const downhillDeltaSec = pa?.downhillDeltaSec ?? 0;
  // Si downhillDeltaSec < 0 (perte de temps en descente), le coureur freine plus -> augmenter downCostModifier
  const downDeltaMinutes = downhillDeltaSec / 60;
  const downModShift = Math.max(-0.35, Math.min(0.4, -downDeltaMinutes * 0.025));
  const newDownCostModifier = Number(Math.max(0.25, Math.min(1.65, oldDownCostModifier + downModShift)).toFixed(2));

  const oldWalkThreshold = Number(roadbook.walkThreshold) || 12;
  const newWalkThreshold = Math.max(6, Math.min(22, oldWalkThreshold + Math.round(upDividerShift / 3)));

  const oldDescentThreshold = Number(roadbook.descentThreshold) || 15;
  const newDescentThreshold = Math.max(8, Math.min(26, oldDescentThreshold + Math.round(downDeltaMinutes * 0.25)));

  // 4. Rétro-synchronisation des Ravitaillements (Pauses réelles & time_modifier par tronçon)
  let rawWaypoints: RoadbookWaypoint[] = [];
  if (typeof roadbook.waypoints === 'string') {
    try {
      rawWaypoints = JSON.parse(roadbook.waypoints || '[]');
    } catch {
      rawWaypoints = [];
    }
  } else if (Array.isArray(roadbook.waypoints)) {
    rawWaypoints = [...roadbook.waypoints];
  }

  const wpSplits = comparison.waypointSplits || [];
  const waypointChanges: RetroSyncWaypointChange[] = [];

  let prevPlannedElapsed = 0;
  let prevActualElapsed = 0;

  const updatedWaypointsArray: RoadbookWaypoint[] = rawWaypoints.map((wp, idx) => {
    const matchingSplit =
      wpSplits.find((s) => s.id === wp.id || s.name.toLowerCase() === wp.name.toLowerCase()) || wpSplits[idx];

    const oldPauseMin = Number(wp.pause) || 0;
    const oldMod = Number(wp.time_modifier) || 100;

    if (!matchingSplit) {
      return { ...wp, pause: oldPauseMin, time_modifier: oldMod };
    }

    // Pause réelle détectée en minutes
    const detectedPauseMin =
      matchingSplit.actualPauseSec !== undefined && matchingSplit.actualPauseSec > 0
        ? Math.round((matchingSplit.actualPauseSec / 60) * 2) / 2
        : oldPauseMin;

    const isStartOrFinish = wp.type === 'start' || wp.type === 'finish' || matchingSplit.km <= 0.2;
    const newPauseMin = isStartOrFinish ? 0 : detectedPauseMin;

    // Calcul du ratio de vitesse réel vs prévu sur ce tronçon
    const segPlannedSec = Math.max(60, matchingSplit.plannedTimeSec - prevPlannedElapsed);
    const segActualSec = Math.max(60, matchingSplit.actualTimeSec - prevActualElapsed);
    prevPlannedElapsed = matchingSplit.plannedTimeSec;
    prevActualElapsed = matchingSplit.actualTimeSec;

    const segDeltaSec = segPlannedSec - segActualSec;
    // Ajuster le time_modifier du tronçon (pondéré avec le changement de temps global pour ne moduler que la spécificité du tronçon)
    const globalRatio = c1.totalDurationSec > 0 ? c2.totalDurationSec / c1.totalDurationSec : 1;
    const normalizedSegRatio = (segPlannedSec * globalRatio) / segActualSec;
    const rawNewMod = Math.round(oldMod * (0.4 + 0.6 * normalizedSegRatio));
    const newTimeModifierPct = Math.max(65, Math.min(140, rawNewMod));

    waypointChanges.push({
      id: wp.id || `wp-${idx}`,
      name: wp.name,
      km: matchingSplit.km,
      oldPauseMin,
      newPauseMin,
      oldTimeModifierPct: oldMod,
      newTimeModifierPct,
      segmentDeltaSec: Math.round(segDeltaSec),
    });

    return {
      ...wp,
      pause: newPauseMin,
      time_modifier: newTimeModifierPct,
    };
  });

  // 5. Générer les explications synthétiques
  const summaryReasons: string[] = [];
  const totalDeltaMin = Math.round(comparison.totalTimeDeltaSec / 60);
  if (Math.abs(totalDeltaMin) >= 1) {
    summaryReasons.push(
      `Objectif recalibré de ${formatHoursToHHMM(oldTargetTimeH)} à ${formatHoursToHHMM(newTargetTimeH)} (${totalDeltaMin >= 0 ? `avance de ${totalDeltaMin} min` : `retard de ${Math.abs(totalDeltaMin)} min`} sur la trace réelle).`
    );
  }
  if (newItraIndex !== oldItraIndex) {
    summaryReasons.push(
      `Index ITRA effectif ajusté de ${oldItraIndex} → ${newItraIndex} selon votre vitesse réelle en km-effort (${kmEffort.toFixed(1)} ke).`
    );
  }
  if (newUpCostDivider !== oldUpCostDivider || newDownCostModifier !== oldDownCostModifier) {
    summaryReasons.push(
      `Rendement pentes modulé : Coût Montée ${oldUpCostDivider} → ${newUpCostDivider} (${uphillDeltaSec >= 0 ? 'gain' : 'perte'} en D+) et Agilité Descente ${oldDownCostModifier} → ${newDownCostModifier}.`
    );
  }
  if (newFatiguePercent !== oldFatiguePercent) {
    summaryReasons.push(
      `Courbe de fatigue calibrée de ${oldFatiguePercent}% → ${newFatiguePercent}% (stratégie recommandée : ${newPacingStrategy === 'prudent' ? 'Prudent' : newPacingStrategy === 'aggressive' ? 'Agressif' : 'Régulier'}).`
    );
  }

  return {
    sourceLabel: c2.name,
    isDemoRoadbook: roadbook.id.startsWith('demo-'),
    oldTargetTimeH,
    newTargetTimeH,
    oldTargetTimeFormatted: formatHoursToHHMM(oldTargetTimeH),
    newTargetTimeFormatted: formatHoursToHHMM(newTargetTimeH),
    oldItraIndex,
    newItraIndex,
    oldFatiguePercent,
    newFatiguePercent,
    oldPacingStrategy,
    newPacingStrategy,
    oldUpCostDivider,
    newUpCostDivider,
    oldDownCostModifier,
    newDownCostModifier,
    oldWalkThreshold,
    newWalkThreshold,
    oldDescentThreshold,
    newDescentThreshold,
    waypointChanges,
    updatedWaypointsArray,
    summaryReasons,
  };
}

/**
 * Construit une recommandation de modulation d'un Roadbook à partir de la signature
 * extraite des sorties clairement intitulées "Course" (Intervals.icu).
 */
export function computeRoadbookModulationFromRaces(
  roadbook: RoadbookDoc,
  raceProfile: RaceCalibrationProfile
): RetroSyncRecommendation {
  const oldTargetTimeH = Number(roadbook.targetTime) || 5.0;
  const newTargetTimeH = raceProfile.estimatedTargetHoursForRoadbook || oldTargetTimeH;
  const oldItraIndex = Number(roadbook.itraIndex) || 560;
  const oldFatiguePercent = Number(roadbook.fatiguePercent ?? 15);
  const oldPacingStrategy = roadbook.pacingStrategy || 'regular';
  const oldUpCostDivider = Number(roadbook.upCostDivider) || 80;
  const oldDownCostModifier = Number(roadbook.downCostModifier ?? 1.0);
  const oldWalkThreshold = Number(roadbook.walkThreshold) || 12;
  const oldDescentThreshold = Number(roadbook.descentThreshold) || 15;

  let rawWaypoints: RoadbookWaypoint[] = [];
  if (typeof roadbook.waypoints === 'string') {
    try {
      rawWaypoints = JSON.parse(roadbook.waypoints || '[]');
    } catch {
      rawWaypoints = [];
    }
  } else if (Array.isArray(roadbook.waypoints)) {
    rawWaypoints = [...roadbook.waypoints];
  }

  const waypointChanges: RetroSyncWaypointChange[] = [];
  const updatedWaypointsArray: RoadbookWaypoint[] = rawWaypoints.map((wp, idx) => {
    const oldPauseMin = Number(wp.pause) || 0;
    const oldMod = Number(wp.time_modifier) || 100;
    const isAidStation = wp.type === 'food' || wp.type === 'ravito' || wp.type === 'water' || oldPauseMin > 0;
    const isStartOrFinish = wp.type === 'start' || wp.type === 'finish' || idx === 0 || idx === rawWaypoints.length - 1;
    const newPauseMin = isStartOrFinish
      ? 0
      : isAidStation
      ? Math.max(2, Math.round((oldPauseMin * 0.5 + raceProfile.avgPauseMinutesPer20Km * 0.5) * 2) / 2)
      : oldPauseMin;

    waypointChanges.push({
      id: wp.id || `wp-${idx}`,
      name: wp.name,
      km: idx * 8,
      oldPauseMin,
      newPauseMin,
      oldTimeModifierPct: oldMod,
      newTimeModifierPct: oldMod,
      segmentDeltaSec: 0,
    });

    return {
      ...wp,
      pause: newPauseMin,
      time_modifier: oldMod,
    };
  });

  const summaryReasons: string[] = [
    `Calibré sur ${raceProfile.racesCount} sortie(s) de compétition (${raceProfile.explicitCoursesCount} intitulée(s) explicitement "Course").`,
    `Cote ITRA empirique en course : ${oldItraIndex} → ${raceProfile.avgEmpiricalItra}.`,
    `Temps cible modulé pour ce parcours : ${formatHoursToHHMM(oldTargetTimeH)} → ${formatHoursToHHMM(newTargetTimeH)}.`,
    `Indice de fatigue réel observé en compétition : ${raceProfile.recommendedFatiguePercent}% (${raceProfile.recommendedPacingStrategy}).`,
  ];

  return {
    sourceLabel: `${raceProfile.racesCount} sortie(s) "Course" Intervals.icu`,
    isDemoRoadbook: roadbook.id.startsWith('demo-'),
    oldTargetTimeH,
    newTargetTimeH,
    oldTargetTimeFormatted: formatHoursToHHMM(oldTargetTimeH),
    newTargetTimeFormatted: formatHoursToHHMM(newTargetTimeH),
    oldItraIndex,
    newItraIndex: raceProfile.avgEmpiricalItra,
    oldFatiguePercent,
    newFatiguePercent: raceProfile.recommendedFatiguePercent,
    oldPacingStrategy,
    newPacingStrategy: raceProfile.recommendedPacingStrategy,
    oldUpCostDivider,
    newUpCostDivider: raceProfile.recommendedUpCostDivider,
    oldDownCostModifier,
    newDownCostModifier: raceProfile.recommendedDownCostModifier,
    oldWalkThreshold,
    newWalkThreshold: raceProfile.recommendedWalkThreshold,
    oldDescentThreshold,
    newDescentThreshold: raceProfile.recommendedDescentThreshold,
    waypointChanges,
    updatedWaypointsArray,
    summaryReasons,
  };
}

/**
 * Applique et sauvegarde les paramètres rétro-synchronisés sur le Roadbook en mémoire
 * et dans Firestore (collection `roadbooks` et optionnellement profil global `users`).
 */
export async function applyRetroSyncToRoadbookAndProfile(
  roadbook: RoadbookDoc,
  rec: RetroSyncRecommendation,
  options: {
    syncTargetTime: boolean;
    syncPhysiology: boolean;
    syncSlopes: boolean;
    syncWaypoints: boolean;
    updateGlobalUserProfile: boolean;
    userId?: string;
  }
): Promise<{ updatedRoadbook: RoadbookDoc; savedToFirestore: boolean; savedToProfile: boolean }> {
  const updatedRoadbook: RoadbookDoc = {
    ...roadbook,
    targetTime: options.syncTargetTime ? rec.newTargetTimeH : roadbook.targetTime,
    itraIndex: options.syncPhysiology ? rec.newItraIndex : roadbook.itraIndex,
    fatiguePercent: options.syncPhysiology ? rec.newFatiguePercent : roadbook.fatiguePercent,
    pacingStrategy: options.syncPhysiology ? rec.newPacingStrategy : roadbook.pacingStrategy,
    upCostDivider: options.syncSlopes ? rec.newUpCostDivider : roadbook.upCostDivider,
    downCostModifier: options.syncSlopes ? rec.newDownCostModifier : roadbook.downCostModifier,
    walkThreshold: options.syncSlopes ? rec.newWalkThreshold : roadbook.walkThreshold,
    descentThreshold: options.syncSlopes ? rec.newDescentThreshold : roadbook.descentThreshold,
    waypoints: options.syncWaypoints ? rec.updatedWaypointsArray : roadbook.waypoints,
    lastRetroSyncAt: new Date().toISOString(),
    lastRetroSyncSource: rec.sourceLabel,
  };

  let savedToFirestore = false;
  let savedToProfile = false;

  // 1. Persister sur le document Roadbook dans Firestore (si ce n'est pas un roadbook de démo)
  if (roadbook.id && !roadbook.id.startsWith('demo-')) {
    try {
      const rbRef = doc(db, 'roadbooks', roadbook.id);
      const firestorePayload: Record<string, any> = {
        updatedAt: Date.now(),
        lastRetroSyncAt: updatedRoadbook.lastRetroSyncAt,
        lastRetroSyncSource: updatedRoadbook.lastRetroSyncSource,
      };
      if (options.syncTargetTime) firestorePayload.targetTime = rec.newTargetTimeH;
      if (options.syncPhysiology) {
        firestorePayload.itraIndex = String(rec.newItraIndex);
        firestorePayload.fatiguePercent = rec.newFatiguePercent;
        firestorePayload.pacingStrategy = rec.newPacingStrategy;
      }
      if (options.syncSlopes) {
        firestorePayload.upCostDivider = rec.newUpCostDivider;
        firestorePayload.downCostModifier = rec.newDownCostModifier;
        firestorePayload.walkThreshold = rec.newWalkThreshold;
        firestorePayload.descentThreshold = rec.newDescentThreshold;
      }
      if (options.syncWaypoints) {
        firestorePayload.waypoints = JSON.stringify(rec.updatedWaypointsArray);
      }

      await updateDoc(rbRef, firestorePayload);
      savedToFirestore = true;
    } catch (err) {
      console.error('[RetroSync] Erreur lors de la mise à jour Firestore du roadbook :', err);
    }
  }

  // 2. Persister dans le profil physiologique global de l'utilisateur (`users/{uid}`)
  const targetUid = options.userId || roadbook.userId;
  if (options.updateGlobalUserProfile && targetUid) {
    try {
      const userRef = doc(db, 'users', targetUid);
      const userPayload: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };
      if (options.syncPhysiology) {
        userPayload.itraIndex = String(rec.newItraIndex);
        userPayload.fatiguePercent = rec.newFatiguePercent;
        userPayload.pacingStrategy = rec.newPacingStrategy;
      }
      if (options.syncSlopes) {
        userPayload.upCostDivider = rec.newUpCostDivider;
        userPayload.downCostModifier = rec.newDownCostModifier;
        userPayload.walkThreshold = rec.newWalkThreshold;
        userPayload.descentThreshold = rec.newDescentThreshold;
      }
      await setDoc(userRef, userPayload, { merge: true });
      savedToProfile = true;
    } catch (err) {
      console.error('[RetroSync] Erreur lors de la mise à jour du profil utilisateur :', err);
    }
  }

  return { updatedRoadbook, savedToFirestore, savedToProfile };
}
