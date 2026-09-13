/**
 * ============================================================
 * TrailRoadbookPro — Moteur de Calcul Scientifique
 * ============================================================
 *
 * Modèles utilisés :
 * - Distance : Haversine (WGS-84)
 * - Coût énergétique : Minetti et al. (2002) adapté trail
 * - Fatigue : modèle exponentiel (inspiré de Jared Ward 2017)
 * - Météo : coefficients empiriques (thermorégulation sportive)
 * - Nuit : pénalité cognitivomotrice (SunCalc)
 * - VMA → Vitesse : approximation VDOT de Jack Daniels adaptée trail
 *
 * Référence ITRA km-effort : 1 km plat = 1 ke, 100 m D+ = 1 ke
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────
// 1. GÉODÉSIE
// ─────────────────────────────────────────────────────────────

/**
 * Calcule la distance entre deux coordonnées GPS (formule de Haversine).
 * @returns {number} Distance en kilomètres
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Rayon moyen de la Terre en km (WGS-84)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Trouve l'index du point de la trace le plus proche d'une coordonnée donnée.
 * Utilise la distance euclidienne en degrés (suffisante à l'échelle locale).
 */
export function findClosestPointIndex(lat, lon, points) {
  if (!points || points.length === 0) return -1;
  let minIndex = 0;
  let minDistance = Infinity;

  for (let i = 0; i < points.length; i++) {
    const dist = Math.pow(points[i].lat - lat, 2) + Math.pow(points[i].lon - lon, 2);
    if (dist < minDistance) {
      minDistance = dist;
      minIndex = i;
    }
  }
  return minIndex;
}

/**
 * Ajoute un point de départ et d'arrivée s'ils n'existent pas,
 * et trie les waypoints dans l'ordre de la trace.
 */
export function enrichWaypointsWithStartEnd(waypoints, points) {
  if (!points || points.length === 0) return waypoints;

  let enriched = waypoints.map(wp => ({
    ...wp,
    pointIndex: wp.pointIndex !== undefined ? wp.pointIndex : findClosestPointIndex(wp.lat, wp.lon, points)
  })).sort((a, b) => a.pointIndex - b.pointIndex);

  if (enriched.length === 0 || enriched[0].pointIndex > 5) {
    enriched.unshift({
      id: 'wp-start',
      name: 'Départ',
      lat: points[0].lat,
      lon: points[0].lon,
      ele: points[0].ele,
      pointIndex: 0
    });
  } else {
    enriched[0].pointIndex = 0;
  }

  const lastIndex = points.length - 1;
  if (enriched.length === 0 || enriched[enriched.length - 1].pointIndex < lastIndex - 5) {
    enriched.push({
      id: 'wp-end',
      name: 'Arrivée',
      lat: points[lastIndex].lat,
      lon: points[lastIndex].lon,
      ele: points[lastIndex].ele,
      pointIndex: lastIndex
    });
  } else {
    enriched[enriched.length - 1].pointIndex = lastIndex;
  }

  return enriched;
}

// ─────────────────────────────────────────────────────────────
// 2. DÉNIVELÉ & LISSAGE GPS
// ─────────────────────────────────────────────────────────────

/**
 * Calcule les statistiques globales d'une trace (Distance, D+, D-)
 * avec un lissage pour éviter l'exagération du bruit GPS.
 */
export function calculateTraceStats(points, elevationThreshold = 7, distanceFactor = 1) {
  if (!points || points.length === 0) return { distance: 0, elevation: { pos: 0, neg: 0 } };

  let distance = 0;
  let elePos = 0;
  let eleNeg = 0;
  let currentRefEle = points[0]?.ele || 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    distance += calculateDistance(p1.lat, p1.lon, p2.lat, p2.lon) * distanceFactor;

    if (p2.ele !== null && p1.ele !== null) {
      const diff = p2.ele - currentRefEle;
      if (diff >= elevationThreshold) {
        elePos += diff;
        currentRefEle = p2.ele;
      } else if (diff <= -elevationThreshold) {
        eleNeg += Math.abs(diff);
        currentRefEle = p2.ele;
      }
    }
  }

  return { distance, elevation: { pos: elePos, neg: eleNeg } };
}

/**
 * Recherche dichotomique pour trouver le seuil de lissage (en mètres)
 * qui permet de correspondre au D+ officiel annoncé par l'organisateur.
 */
export function findOptimalElevationThreshold(points, targetElevation) {
  if (!points || points.length === 0 || !targetElevation) return 5;
  let low = 0;
  let high = 50;
  let bestThreshold = 5;

  for (let iter = 0; iter < 15; iter++) {
    const mid = (low + high) / 2;
    const stats = calculateTraceStats(points, mid, 1);

    if (Math.abs(stats.elevation.pos - targetElevation) < 5) return mid;

    if (stats.elevation.pos > targetElevation) {
      low = mid;
    } else {
      high = mid;
    }
    bestThreshold = mid;
  }
  return bestThreshold;
}

// ─────────────────────────────────────────────────────────────
// 3. MODÈLE ÉNERGÉTIQUE — MINETTI + ITRA
// ─────────────────────────────────────────────────────────────

/**
 * Calcule l'équivalent km-effort selon le modèle énergétique Minetti (2002)
 * adapté aux standards ITRA/UTMB.
 *
 * Principe : exprimer tout coût en "km plat équivalent"
 *   - Montée : 100 m D+ ≈ 1 km-effort  (standard ITRA)
 *   - Descente douce (< seuil_%) : 150 m D- ≈ 1 km-effort
 *     (courir en descente douce est moins coûteux que le plat)
 *   - Descente raide (> seuil_%) : 80 m D- ≈ 1 km-effort
 *     (contractions excentriques très coûteuses)
 *
 * Pour éviter l'effet de seuil, on utilise une transition CONTINUE
 * entre les deux régimes via une sigmoïde logistique centrée sur le seuil.
 *
 * @param {number} distance - Distance horizontale en km
 * @param {number} elePos - Dénivelé positif en m
 * @param {number} eleNeg - Dénivelé négatif en m (valeur positive)
 * @param {number} descentThresholdPercent - Seuil entre descente douce/raide (défaut: 15)
 * @param {number} avgDescentSlopePct - Pente moyenne de la descente sur ce segment (%)
 * @returns {number} km-effort
 */
export function calculateKmEffort(
  distance,
  elePos,
  eleNeg,
  descentThresholdPercent = 15,
  avgDescentSlopePct = 0
) {
  // --- Coût montée : standard ITRA ---
  const upCost = elePos / 100;

  // --- Coût descente : transition douce via sigmoïde ---
  // softCoeff ∈ [1/150, 1/80] selon la pente
  // k=0.8 donne une transition sur ~6% de pente (réaliste)
  const k = 0.8;
  const slope = avgDescentSlopePct || 0;
  const sigmoid = 1 / (1 + Math.exp(-k * (slope - descentThresholdPercent)));
  // sigmoid ≈ 0 → descente douce → coeff ≈ 1/150
  // sigmoid ≈ 1 → descente raide → coeff ≈ 1/80
  const downCoeff = (1 / 150) + sigmoid * ((1 / 80) - (1 / 150));
  const downCost = eleNeg * downCoeff;

  return distance + upCost + downCost;
}

// ─────────────────────────────────────────────────────────────
// 4. COEFFICIENTS ENVIRONNEMENTAUX
// ─────────────────────────────────────────────────────────────

/**
 * Retourne le coefficient de vitesse lié à la météo.
 * Sources : Périard et al. (2015) — thermorégulation en course de fond ;
 *           González-Alonso et al. (1999) — performance par chaleur.
 *
 * @param {string} weather - "froid" | "modere" | "chaud" | "tres_chaud"
 * @returns {number} coefficient multiplicateur (1.0 = pas de malus)
 */
export function getWeatherCoefficient(weather) {
  const coefficients = {
    froid:     0.97,  // -3% : contractures, équipement lourd
    modere:    1.00,  // référence
    chaud:     0.95,  // -5% : thermorégulation active
    tres_chaud: 0.88  // -12% : hyperthermie + déshydratation accélérée
  };
  return coefficients[weather] || 1.00;
}

/**
 * Retourne un coefficient de vitesse selon l'intensité nocturne.
 * La nuit réduit la vitesse de course (terrain moins lisible, fatigue cognitive).
 * Coefficient : jour=0%, nuit_totale=-10%, transition lissée.
 *
 * @param {number} nightIntensity - 0 (jour) → 1 (pleine nuit)
 * @returns {number} coefficient multiplicateur
 */
export function getNightCoefficient(nightIntensity) {
  return 1 - 0.10 * nightIntensity;
}

// ─────────────────────────────────────────────────────────────
// 5. MODÈLE DE FATIGUE EXPONENTIELLE
// ─────────────────────────────────────────────────────────────

/**
 * Calcule le facteur intégral de fatigue pour un segment,
 * en utilisant un modèle de fatigue exponentielle.
 *
 * Modèle : la vitesse à l'instant x décroît comme exp(-α·x/E),
 * où α = fatigueK est calibré sur fatiguePercent.
 *
 * Interprétation de fatiguePercent :
 *   0%  → pas de fatigue, vitesse constante
 *   15% → le dernier tiers de course est 15% plus lent (ultra standard)
 *   30% → le dernier tiers est 30% plus lent (ultra difficile/100+km)
 *
 * L'intégrale ∫ exp(α·x/E) dx de x0 à x0+dx est calculée analytiquement.
 *
 * @param {number} x0 - Position courante sur l'effort total (km-effort)
 * @param {number} dx - Taille du segment (km-effort)
 * @param {number} E - Effort total (km-effort) de toute la course
 * @param {number} fatiguePercent - Intensité de la fatigue en %
 * @returns {number} Facteur multiplicateur du temps pour ce segment
 */
export function computeFatigueIntegral(x0, dx, E, fatiguePercent) {
  if (fatiguePercent <= 0 || E <= 0) return dx;

  // α calibré pour que exp(α) - 1 ≈ fatiguePercent/100
  // → le dernier segment coûte (1 + fatiguePercent/100) fois plus que le premier
  const alpha = Math.log(1 + (fatiguePercent / 100));

  // Intégrale analytique de exp(α·x/E) dx de x0 à x0+dx
  // = (E/α) * [ exp(α*(x0+dx)/E) - exp(α*x0/E) ]
  const factor = (E / alpha) * (
    Math.exp(alpha * (x0 + dx) / E) - Math.exp(alpha * x0 / E)
  );

  return factor;
}

/**
 * Calcule la constante de base pour normaliser le temps total sur l'effort.
 * Garantit que la somme des segments correspond exactement à targetMs.
 *
 * @param {number} targetMs - Temps cible en ms (après déduction des pauses)
 * @param {Array} segments - Segments avec kmEffort et modifier
 * @param {number} fatiguePercent - Fatigue en %
 * @param {number} E - Effort total
 * @returns {number} p0 - ms par unité d'effort de base
 */
function computeP0(targetMs, segmentsWithDx, fatiguePercent, E) {
  // Somme de toutes les intégrales de fatigue
  let totalIntegral = 0;
  let currentX = 0;
  for (const { dx } of segmentsWithDx) {
    totalIntegral += computeFatigueIntegral(currentX, dx, E, fatiguePercent);
    currentX += dx;
  }
  return totalIntegral > 0 ? targetMs / totalIntegral : 1;
}

// ─────────────────────────────────────────────────────────────
// 6. GÉNÉRATEUR DE SEGMENTS
// ─────────────────────────────────────────────────────────────

/**
 * Génère les segments du roadbook avec tous les calculs scientifiques.
 *
 * @param {Array}   points               - Points GPS de la trace
 * @param {Array}   orderedWaypoints     - Waypoints triés
 * @param {number}  targetFastHours      - Objectif temps rapide (h)
 * @param {number}  targetSlowHours      - Objectif temps lent (h)
 * @param {number}  fatiguePercent       - Fatigue estimée (%)
 * @param {string}  startTimeStr         - ISO datetime de départ
 * @param {number}  elevationThreshold   - Seuil lissage altimétrique (m)
 * @param {number}  distanceFactor       - Correcteur distance GPS → officielle
 * @param {string}  weather              - Météo ("modere" par défaut)
 * @param {number}  descentThreshold     - Seuil descente douce/raide (% pente, défaut 15)
 * @returns {Array} Segments enrichis avec temps, VAM, terrain
 */
export function generateSegments(
  points,
  orderedWaypoints,
  targetFastHours,
  targetSlowHours,
  fatiguePercent,
  startTimeStr = null,
  elevationThreshold = 5,
  distanceFactor = 1,
  weather = 'modere',
  descentThreshold = 15
) {
  if (!points || points.length === 0 || orderedWaypoints.length < 2) return [];

  const weatherCoeff = getWeatherCoefficient(weather);

  // ── PHASE 1 : Calculs géométriques par segment ──────────────
  let rawSegments = [];
  let cumulDistance = 0;
  let cumulElevation = 0;

  for (let i = 0; i < orderedWaypoints.length - 1; i++) {
    const startWp = orderedWaypoints[i];
    const endWp = orderedWaypoints[i + 1];

    let segmentDist = 0;
    let segmentElePos = 0;
    let segmentEleNeg = 0;
    let climbDist = 0;
    let climbElePos = 0;
    let descendDist = 0;
    let descendEleNeg = 0;

    let currentRefEle = points[startWp.pointIndex]?.ele || 0;
    let lastRefDist = 0;

    for (let j = startWp.pointIndex; j < endWp.pointIndex; j++) {
      const p1 = points[j];
      const p2 = points[j + 1];
      const d = calculateDistance(p1.lat, p1.lon, p2.lat, p2.lon) * distanceFactor;
      segmentDist += d;

      if (p2.ele !== null && p1.ele !== null) {
        const diff = p2.ele - currentRefEle;
        if (diff >= elevationThreshold) {
          segmentElePos += diff;
          const dSinceRef = segmentDist - lastRefDist;
          climbElePos += diff;
          climbDist += dSinceRef;
          currentRefEle = p2.ele;
          lastRefDist = segmentDist;
        } else if (diff <= -elevationThreshold) {
          segmentEleNeg += Math.abs(diff);
          const dSinceRef = segmentDist - lastRefDist;
          descendEleNeg += Math.abs(diff);
          descendDist += dSinceRef;
          currentRefEle = p2.ele;
          lastRefDist = segmentDist;
        }
      }
    }

    // Pente moyenne de descente sur ce segment (pour le modèle Minetti)
    const avgDescentSlopePct = (descendDist > 0 && descendEleNeg > 0)
      ? (descendEleNeg / (descendDist * 1000)) * 100
      : 0;

    const kmEffort = calculateKmEffort(
      segmentDist,
      segmentElePos,
      segmentEleNeg,
      descentThreshold,
      avgDescentSlopePct
    );

    cumulDistance += segmentDist;
    cumulElevation += segmentElePos;

    let segmentPoints = [];
    for (let j = startWp.pointIndex; j <= endWp.pointIndex; j++) {
      segmentPoints.push(points[j]);
    }

    rawSegments.push({
      id: `seg-${i}`,
      from: startWp,
      to: endWp,
      distance: segmentDist,
      cumulDistance,
      elevationPos: segmentElePos,
      elevationNeg: segmentEleNeg,
      cumulElevation,
      kmEffort,
      avgDescentSlopePct,
      climbKmEffort: calculateKmEffort(climbDist, climbElePos, 0, descentThreshold, 0),
      climbElePos,
      climbDist,
      points: segmentPoints
    });
  }

  // ── PHASE 2 : Normalisation temps avec fatigue exponentielle ─

  // Pauses totales (en ms)
  let totalPauseMs = rawSegments.reduce((acc, seg) => acc + (seg.to.pause || 0) * 60000, 0);

  const targetFastMs  = Math.max(1, ((targetFastHours  || 0) * 3600000) - totalPauseMs);
  const targetSlowMs  = Math.max(1, ((targetSlowHours || 0) * 3600000) - totalPauseMs);

  const startTime = startTimeStr
    ? new Date(startTimeStr).getTime()
    : new Date().setHours(8, 0, 0, 0);

  const F = (fatiguePercent || 0);

  // Calcul de l'effort total effectif (avec modifier par waypoint)
  const segmentsWithDx = rawSegments.map(seg => ({
    dx: seg.kmEffort * ((seg.to.time_modifier || 100) / 100.0),
    seg
  }));
  const E = segmentsWithDx.reduce((acc, { dx }) => acc + dx, Math.max(segmentsWithDx.reduce((a, { dx }) => a + dx, 0) * 0.0001, 0.001));

  // La météo ralentit la vitesse → augmente le temps → on divise p0 par weatherCoeff
  const p0_fast = computeP0(targetFastMs, segmentsWithDx, F, E) / weatherCoeff;
  const p0_slow = computeP0(targetSlowMs, segmentsWithDx, F, E) / weatherCoeff;

  // ── PHASE 3 : Calcul segment par segment ─────────────────────
  let currentX = 0;
  let cumulFastMs = startTime;
  let cumulSlowMs = startTime;

  const baseLat = points[0]?.lat || 45.9;
  const baseLon = points[0]?.lon || 6.8;

  return segmentsWithDx.map(({ dx, seg }) => {
    const modifier = (seg.to.time_modifier || 100) / 100.0;

    // Intégrale de fatigue analytique
    const fatigueFactor = computeFatigueIntegral(currentX, dx, E, F);

    // Coefficient de nuit estimé au milieu de l'intervalle de temps (ETA lent)
    const midSlowMs = cumulSlowMs + (p0_slow * fatigueFactor) / 2;
    const nightIntens = getNightIntensity(new Date(midSlowMs), baseLat, baseLon);
    const nightCoeff = getNightCoefficient(nightIntens);

    // Temps segment : p0 × fatigue × (1/nightCoeff)
    // nightCoeff < 1 → on est plus lent → on divise
    const segmentFastMs = (p0_fast * fatigueFactor) / nightCoeff;
    const segmentSlowMs = (p0_slow * fatigueFactor) / nightCoeff;

    cumulFastMs += segmentFastMs;
    cumulSlowMs += segmentSlowMs;

    const arrFast = new Date(cumulFastMs).toISOString();
    const arrSlow = new Date(cumulSlowMs).toISOString();

    const pauseMs = (seg.to.pause || 0) * 60000;
    cumulFastMs += pauseMs;
    cumulSlowMs += pauseMs;

    // ── Analyse terrain (pour jauge marche/course) ──────────────
    const walkThreshold = computeWalkThreshold(currentX, E, F);

    let walkDist = 0, runUphillDist = 0, avgWalkSlopeCumul = 0;
    let tempRefEle = points[seg.from.pointIndex]?.ele || 0;
    let tempRefDist = 0, tempSegDist = 0;

    for (let j = seg.from.pointIndex; j < seg.to.pointIndex; j++) {
      const p1 = points[j];
      const p2 = points[j + 1];
      const d = calculateDistance(p1.lat, p1.lon, p2.lat, p2.lon);
      tempSegDist += d;

      if (p2.ele !== null && p1.ele !== null) {
        const diff = p2.ele - tempRefEle;
        if (diff >= elevationThreshold) {
          const dSinceRef = tempSegDist - tempRefDist;
          const slope = dSinceRef > 0 ? (diff / (dSinceRef * 1000)) : 0;
          if (slope >= walkThreshold) {
            walkDist += dSinceRef;
            avgWalkSlopeCumul += slope * dSinceRef;
          } else {
            runUphillDist += dSinceRef;
          }
          tempRefEle = p2.ele;
          tempRefDist = tempSegDist;
        } else if (diff <= -elevationThreshold) {
          tempRefEle = p2.ele;
          tempRefDist = tempSegDist;
        }
      }
    }

    const downFlatDist = Math.max(0, seg.distance - walkDist - runUphillDist);
    const walkAvgSlope = walkDist > 0 ? (avgWalkSlopeCumul / walkDist) * 100 : 0;

    // ── VAM estimée (Vitesse Ascensionnelle Maximale) ────────────
    const timeOnClimbsHours = ((segmentSlowMs / 3600000) * (seg.climbKmEffort / (seg.kmEffort || 1))) || 0;
    const vamEstimate = (timeOnClimbsHours > 0 && seg.climbElePos > 0)
      ? Math.round(seg.climbElePos / timeOnClimbsHours)
      : 0;

    // ── Allure moyenne sur le segment (min/km) ───────────────────
    const paceSlowMinPerKm = seg.distance > 0
      ? (segmentSlowMs / 60000) / seg.distance
      : 0;

    currentX += dx;

    return {
      ...seg,
      durationFastMs: segmentFastMs,
      durationSlowMs: segmentSlowMs,
      arr_fast: arrFast,
      arr_slow: arrSlow,
      nightIntensity: nightIntens,
      weatherCoeff,
      terrain: {
        downFlatDist,
        runUphillDist,
        walkDist,
        walkAvgSlope,
        walkThresholdPercent: walkThreshold * 100
      },
      vamEstimate,
      paceSlowMinPerKm,
      // Fallbacks
      durationMs: segmentSlowMs,
      arrivalTime: arrSlow
    };
  });
}

/**
 * Calcule le seuil de pente à partir duquel un traileur marche plutôt que court,
 * en tenant compte de la fatigue accumulée.
 * Modèle empirique : le seuil baisse avec la fatigue (on marche plus tôt),
 * puis remonte légèrement sur les 10 derniers % (effet "end-spurt").
 */
function computeWalkThreshold(x, E, fatiguePercent) {
  const F = fatiguePercent / 100;
  const effortProgress = E > 0 ? x / E : 0;

  let threshold = 0.12; // 12% de base
  const fatigueDrop = (F / 0.15) * 0.05;
  threshold -= effortProgress * fatigueDrop;

  // End-spurt : remontée sur les 10 derniers %
  if (effortProgress > 0.90) {
    const spurtBoost = ((effortProgress - 0.90) / 0.10) * 0.03;
    threshold += spurtBoost;
  }

  return Math.max(0.06, threshold);
}

// ─────────────────────────────────────────────────────────────
// 7. ESTIMATION VMA → TEMPS CIBLE (Jack Daniels adapté trail)
// ─────────────────────────────────────────────────────────────

export function estimateTimeFromVMA(vmaKmh, kmEffort, fatiguePercent = 15) {
  if (!vmaKmh || vmaKmh <= 0 || !kmEffort || kmEffort <= 0) return null;

  // Conversion approximative de la VMA vers un index ITRA équivalent
  // Une VMA de 20 km/h correspond environ à 910 ITRA
  // Une VMA de 15 km/h correspond environ à 585 ITRA
  const equivalentItra = Math.max(200, (vmaKmh - 6) * 65);

  return estimateTimeFromITRA(equivalentItra, kmEffort, fatiguePercent);
}

/**
 * Estime un temps cible à partir de l'index ITRA du coureur en utilisant le modèle de Riegel étendu.
 * @param {number} itraIndex - Index ITRA (ex: 600)
 * @param {number} kmEffort - Kilomètres-effort
 * @param {number} fatiguePercent - Fatigue estimée (%)
 * @returns {{ fastH: number, slowH: number }}
 */
export function estimateTimeFromITRA(itraIndex, kmEffort, fatiguePercent = 15) {
  if (!itraIndex || itraIndex <= 0 || !kmEffort || kmEffort <= 0) return null;

  // Modèle empirique affiné (Riegel) calibré sur une distance de 71 ke (ex: Madeloc 45km/2600m+)
  const baseSpeed = 2.5 + (itraIndex / 1000) * 16.5; 
  
  // Exposant de fatigue de Riegel (1.0 = aucune perte de vitesse avec la distance)
  // Plus l'ITRA est faible, plus la vitesse s'effondre sur les très longues distances.
  const timeExponent = 1.05 + ((1000 - itraIndex) / 1000) * 0.65;
  
  // Temps de base pour un effort de 71 ke
  const baseTime71 = 71 / baseSpeed;
  
  // Temps ajusté à la distance (Riegel formula: T2 = T1 * (D2/D1)^exponent)
  const baseH = baseTime71 * Math.pow(kmEffort / 71, timeExponent);

  // Ajout de la fatigue ponctuelle de la course
  const fatigueFactor = 1 + (fatiguePercent / 200);
  const fastH = Math.round(baseH * fatigueFactor * 10) / 10;
  const slowH = Math.round(baseH * fatigueFactor * 1.20 * 10) / 10;

  return { fastH, slowH };
}

// ─────────────────────────────────────────────────────────────
// 8. UTILITAIRES GRAPHIQUES & CARTOGRAPHIQUES
// ─────────────────────────────────────────────────────────────

/**
 * Trouve le point GPS correspondant à une distance kilométrique depuis le départ.
 */
export function findPointByDistance(targetDistanceKm, points) {
  if (!points || points.length === 0) return null;
  if (targetDistanceKm <= 0) return points[0];

  let currentDist = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const d = calculateDistance(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon);
    if (currentDist + d >= targetDistanceKm) {
      const diff1 = targetDistanceKm - currentDist;
      const diff2 = (currentDist + d) - targetDistanceKm;
      return diff1 < diff2 ? points[i] : points[i + 1];
    }
    currentDist += d;
  }

  return points[points.length - 1];
}

/**
 * Prépare les données de la trace pour le profil altimétrique.
 * La pente est lissée sur 250 m pour éviter le bruit GPS.
 */
export function generateChartData(points, distanceFactor = 1) {
  if (!points || points.length === 0) return [];

  let currentDist = 0;
  const chartData = [];

  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const p1 = points[i - 1];
      const p2 = points[i];
      currentDist += calculateDistance(p1.lat, p1.lon, p2.lat, p2.lon) * distanceFactor;
    }

    let slope = 0;
    let distNext = 0;
    let nextIndex = i;

    while (nextIndex < points.length - 1 && distNext < 0.25) {
      distNext += calculateDistance(
        points[nextIndex].lat, points[nextIndex].lon,
        points[nextIndex + 1].lat, points[nextIndex + 1].lon
      ) * distanceFactor;
      nextIndex++;
    }

    if (distNext > 0) {
      slope = ((points[nextIndex].ele - points[i].ele) / (distNext * 1000)) * 100;
    }

    chartData.push({ x: currentDist, y: points[i].ele, slope });
  }

  return chartData;
}

// ─────────────────────────────────────────────────────────────
// 9. CALCUL SOLAIRE (SunCalc)
// ─────────────────────────────────────────────────────────────

import * as SunCalc from 'suncalc';

/**
 * Calcule l'intensité de la nuit (0 = jour, 1 = pleine nuit) pour un instant donné,
 * en se basant sur les heures réelles de lever/coucher du soleil à la position de la course.
 */
export function getNightIntensity(dateObj, lat, lon) {
  if (!dateObj || isNaN(dateObj.getTime()) || !lat || !lon) return 0;

  const times = SunCalc.getTimes(dateObj, lat, lon);
  const time = dateObj.getTime();
  const sunset = times.sunset.getTime();
  const sunrise = times.sunrise.getTime();

  if (time > sunset || time < sunrise) {
    let prevSunset, nextSunrise;

    if (time > sunset) {
      prevSunset = sunset;
      const tomorrow = new Date(dateObj);
      tomorrow.setDate(tomorrow.getDate() + 1);
      nextSunrise = SunCalc.getTimes(tomorrow, lat, lon).sunrise.getTime();
    } else {
      nextSunrise = sunrise;
      const yesterday = new Date(dateObj);
      yesterday.setDate(yesterday.getDate() - 1);
      prevSunset = SunCalc.getTimes(yesterday, lat, lon).sunset.getTime();
    }

    const nadirTime = prevSunset + (nextSunrise - prevSunset) / 2;
    const maxDist = (nextSunrise - prevSunset) / 2;
    const distToNadir = Math.abs(time - nadirTime);

    return Math.max(0, 1 - (distToNadir / maxDist));
  }

  return 0;
}

// ─────────────────────────────────────────────────────────────
// 10. DONNÉES DE TEST / VALIDATION
// ─────────────────────────────────────────────────────────────

/**
 * Exemples de référence pour valider le moteur de calcul.
 * Sources : résultats officiels UTMB, ITRA, Runners World.
 *
 * Usage : compareModelToReference(VALIDATION_EXAMPLES[0]) dans la console
 */
export const VALIDATION_EXAMPLES = [
  {
    name: "UTMB — Coureur Niveau 700 ITRA",
    // Données course
    distanceKm: 173,
    elePos: 10000,
    eleNeg: 10000,
    // Données coureur
    itraIndex: 700,
    fatiguePercent: 20,
    weather: 'modere',
    // Résultat réel moyen
    referenceTimeH: 26.5,
    // Source : finishers UTMB 2019, médiane des classés 700-750 ITRA
  },
  {
    name: "CCC (Courmayeur-Champex-Chamonix) — Coureur 600 ITRA",
    distanceKm: 100,
    elePos: 6100,
    eleNeg: 5600,
    itraIndex: 600,
    fatiguePercent: 18,
    weather: 'modere',
    referenceTimeH: 17.5,
  },
  {
    name: "Marathon des Sables étape type — Coureur moyen",
    distanceKm: 40,
    elePos: 300,
    eleNeg: 300,
    itraIndex: 400,
    fatiguePercent: 10,
    weather: 'tres_chaud',
    referenceTimeH: 6.5,
  },
  {
    name: "Trail 20km local — Débutant",
    distanceKm: 20,
    elePos: 800,
    eleNeg: 800,
    itraIndex: 200,
    fatiguePercent: 8,
    weather: 'modere',
    referenceTimeH: 3.5,
  }
];

/**
 * Compare le modèle aux données de référence (pour tests en console).
 * @param {Object} example - Un élément de VALIDATION_EXAMPLES
 */
export function compareModelToReference(example) {
  const totalKmEffort = calculateKmEffort(
    example.distanceKm,
    example.elePos,
    example.eleNeg,
    15,
    example.eleNeg / (example.distanceKm * 10) // pente descente approx.
  );

  const estimate = estimateTimeFromITRA(
    example.itraIndex,
    totalKmEffort,
    example.fatiguePercent
  );

  const weatherCoeff = getWeatherCoefficient(example.weather);
  const adjustedFast = estimate ? estimate.fastH / weatherCoeff : null;
  const adjustedSlow = estimate ? estimate.slowH / weatherCoeff : null;

  console.group(`🏔️ ${example.name}`);
  console.log(`km-effort : ${totalKmEffort.toFixed(1)} ke`);
  console.log(`Estimation (météo incluse) : ${adjustedFast?.toFixed(1)}h → ${adjustedSlow?.toFixed(1)}h`);
  console.log(`Référence réelle : ${example.referenceTimeH}h`);
  const errorPct = adjustedFast ? Math.abs(adjustedFast - example.referenceTimeH) / example.referenceTimeH * 100 : null;
  console.log(`Écart modèle : ${errorPct?.toFixed(1)}%`);
  console.groupEnd();

  return { totalKmEffort, adjustedFast, adjustedSlow, referenceTimeH: example.referenceTimeH };
}
