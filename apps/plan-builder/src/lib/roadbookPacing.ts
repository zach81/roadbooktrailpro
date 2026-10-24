import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ParsedCourse, TrackPoint, CourseWaypoint, haversineDistance } from './courseParser';

export interface RoadbookWaypoint {
  id?: string;
  name: string;
  lat: number;
  lon: number;
  ele?: number;
  pointIndex?: number;
  pause?: number; // minutes
  cutoffTime?: string;
  type?: string;
  desc?: string;
  technicality?: number;
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
  officialDistance?: number | string;
  officialElevation?: number | string;
  weather?: string;
  updatedAt?: any;
  isPublic?: boolean;
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
 * Facteur de ralentissement en fonction de la pente
 */
function getSlopeSpeedMultiplier(slopePct: number): number {
  const s = slopePct / 100;
  if (s > 0) {
    // Montée : ralentissement progressif selon Minetti
    const costFlat = minettiCost(0);
    const costUphill = minettiCost(s);
    return Math.max(0.18, costFlat / costUphill);
  } else {
    // Descente : accélération modérée jusqu'à -10%, puis freinage excentrique
    if (s >= -0.10) {
      return 1.0 + Math.abs(s) * 2.2; // Accélération modérée
    } else if (s >= -0.22) {
      return 1.22 - (Math.abs(s) - 0.10) * 1.5; // Début de retenue
    } else {
      return Math.max(0.35, 1.04 - (Math.abs(s) - 0.22) * 3.0); // Descente très raide et technique
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

  // 4. Déterminer les durées de chaque segment entre points
  const segmentDurationSec: number[] = new Array(rawPoints.length).fill(0);
  let totalCalculatedDurationSec = 0;

  for (let i = 1; i < rawPoints.length; i++) {
    const dKm = distCumulative[i] - distCumulative[i - 1];
    if (dKm <= 0) continue;

    const p1 = rawPoints[i - 1];
    const p2 = rawPoints[i];
    const dEle = p2.ele - p1.ele;
    const slopePct = (dEle / (dKm * 1000)) * 100;

    const slopeMult = getSlopeSpeedMultiplier(slopePct);
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

    const speedKmH = Math.max(1.8, Math.min(24, (flatBaseSpeed * slopeMult) / fatigueFactor));
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

  if (targetTimeSetting && targetTimeSetting > 0) {
    const targetTotalSec = targetTimeSetting * 3600;
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

  // 6. Associer les waypoints aux distances exactes
  const enrichedWaypoints: CourseWaypoint[] = rawWaypoints.map((wp) => {
    let closestIdx = 0;
    let minD = Infinity;

    // Trouver le point GPS le plus proche si pointIndex non défini
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
    };
  }).sort((a, b) => a.km - b.km);

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
