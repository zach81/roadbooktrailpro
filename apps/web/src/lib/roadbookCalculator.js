/**
 * ============================================================
 * mykairn — Moteur de Calcul Scientifique
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

// Helpers internes ou pour formater
export function formatDecimalHoursToHHMM(decimalHours) {
  if (decimalHours == null || isNaN(decimalHours)) return "--h--";
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  if (m === 60) return `${h + 1}h00`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

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
export function calculateTraceStats(points, elevationThreshold = 5, distanceFactor = 1) {
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
  avgDescentSlopePct = 0,
  upCostDivider = 80,
  downCostModifier = 1.0
) {
  // --- Coût montée : paramétrable selon le niveau du coureur ---
  const upCost = elePos / upCostDivider;

  // --- Coût descente : transition douce via sigmoïde ---
  const k = 0.8;
  const slope = avgDescentSlopePct || 0;
  const sigmoid = 1 / (1 + Math.exp(-k * (slope - descentThresholdPercent)));
  
  const downCoeff = (1 / 215) + sigmoid * ((1 / 115) - (1 / 215));
  const downCost = eleNeg * downCoeff * downCostModifier;

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
  if (typeof weather === 'number') {
    // Interpolation continue si on reçoit une température en °C
    // < 5°C : 0.97
    // 15°C : 1.00 (optimal)
    // 25°C : 0.95
    // 35°C : 0.88
    if (weather <= 5) return 0.97;
    if (weather <= 15) return 0.97 + (weather - 5) * (0.03 / 10);
    if (weather <= 25) return 1.00 - (weather - 15) * (0.05 / 10);
    if (weather <= 35) return 0.95 - (weather - 25) * (0.07 / 10);
    return 0.88;
  }

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

/**
 * Retourne un coefficient de vitesse selon la technicité du terrain.
 *
 * @param {number} technicality - 1 (Très Roulant) à 5 (Extrême)
 * @returns {number} coefficient multiplicateur du temps
 */
export function getTerrainFactor(technicality) {
  switch(Number(technicality)) {
    case 1: return 0.95; // Très roulant (ex: piste cyclable, route)
    case 2: return 1.00; // Trail classique (défaut)
    case 3: return 1.10; // Technique (racines, rochers)
    case 4: return 1.25; // Très technique (haute montagne, pierriers)
    case 5: return 1.40; // Extrême (hors piste, rando alpine)
    default: return 1.00;
  }
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


// ─────────────────────────────────────────────────────────────
// 6. GÉNÉRATEUR DE SEGMENTS
// ─────────────────────────────────────────────────────────────

/**
 * Génère les segments du roadbook avec tous les calculs scientifiques.
 * Le temps de base est une conséquence de la physiologie (Index UTMB).
 *
 * @param {Array}   points               - Points GPS de la trace
 * @param {Array}   orderedWaypoints     - Waypoints triés
 * @param {number}  itraIndex            - Index UTMB/ITRA du coureur
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
  itraIndex,
  fatiguePercent,
  startTimeStr = null,
  elevationThreshold = 5,
  distanceFactor = 1,
  weather = 'modere',
  descentThreshold = 15,
  walkThreshold = 12,
  targetTimeH = null,
  upCostDivider = 80,
  downCostModifier = 1.0,
  pacingStrategy = 'regular',
  paceProfile = 'coach'
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

    const avgDescentSlopePct = (descendDist > 0 && descendEleNeg > 0)
      ? (descendEleNeg / (descendDist * 1000)) * 100
      : 0;

    const kmEffort = calculateKmEffort(
      segmentDist,
      segmentElePos,
      segmentEleNeg,
      descentThreshold,
      avgDescentSlopePct,
      upCostDivider,
      downCostModifier
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
      climbKmEffort: calculateKmEffort(climbDist, climbElePos, 0, descentThreshold, 0, upCostDivider, downCostModifier),
      climbElePos,
      climbDist,
      points: segmentPoints
    });
  }

  // ── PHASE 2 : Application des allures physiologiques ────────
  const startTime = startTimeStr
    ? new Date(startTimeStr).getTime()
    : new Date().setHours(8, 0, 0, 0);

  // Effort total pour calculer le facteur de fatigue exponentiel et la vitesse de référence sur la distance
  const E = rawSegments.reduce((acc, seg) => acc + seg.kmEffort, 0.001);
  const totalStandardKe = rawSegments.reduce((acc, seg) => acc + seg.distance + seg.elevationPos / 100, 0.001);

  // En ultra-distance (> 65 km-effort), la dérive musculaire et la perte de vitesse en fin de course
  // augmentent naturellement par rapport à un 30-50 km : on module la pente de fatigue sur les ultras.
  const ultraFatigueScale = totalStandardKe > 65 ? 1 + Math.min(0.65, (totalStandardKe - 65) / 180) : 1.0;
  const F = Math.min(60, (fatiguePercent || 0) * ultraFatigueScale);
  const { flatSpeedKmh } = estimateBasePaces(itraIndex, totalStandardKe);

  let currentX = 0;

  // Calcul du temps de base (sans fatigue) pour chaque segment, et avec fatigue
  const segmentsBase = rawSegments.map(seg => {
    // Le temps de base utilise le kmEffort personnalisé du segment (tenant compte de upCostDivider et downCostModifier)
    // normalisé pour que les grimpeurs gagnent du temps dans les bosses et les descendeurs dans les descentes.
    const standardKmEffort = seg.distance + (seg.elevationPos / 100);
    const blendedSegEffort = standardKmEffort * 0.45 + seg.kmEffort * 0.55;
    
    // Application de la technicité sur le segment
    const technicalityLevel = seg.to.technicality || 2;
    const terrainFactor = getTerrainFactor(technicalityLevel);
    
    const freshHours = blendedSegEffort / flatSpeedKmh;
    const paceProfileFactor = paceProfile === 'aggressive' ? 0.95 : 1.0;
    // On applique le terrainFactor et le profil d'allure ici !
    const freshMs = freshHours * 3600000 * terrainFactor * paceProfileFactor;
    
    // Fatigue intégrale sur ce segment
    const baseFatigueFactor = seg.kmEffort > 0 ? (computeFatigueIntegral(currentX, seg.kmEffort, E, F) / seg.kmEffort) : 1;
    
    // Application de la stratégie de pacing
    const progress = E > 0 ? (currentX + (seg.kmEffort / 2)) / E : 0;
    let pacingMultiplier = 1.0;
    if (pacingStrategy === 'prudent') {
      // Prudent : départ plus lent (1.05), fin plus rapide (0.95) par rapport à la courbe normale
      pacingMultiplier = 1.05 - 0.10 * progress;
    } else if (pacingStrategy === 'aggressive') {
      // Agressif : départ plus rapide (0.95), fin beaucoup plus lente (1.10)
      pacingMultiplier = 0.95 + 0.15 * progress;
    }
    
    const fatigueFactor = baseFatigueFactor * pacingMultiplier;
    currentX += seg.kmEffort;

    return {
      ...seg,
      standardKmEffort,
      freshMs,
      fatiguedMs: freshMs * fatigueFactor
    };
  });

  // ── PHASE 3 & 4 : Ajustement global et Calcul final (météo, nuit, pauses) ────
  // Passe 1 : Estimation des temps finaux SANS ajustement global
  const baseLat = points[0]?.lat || 45.9;
  const baseLon = points[0]?.lon || 6.8;

  let cumulMsPass1 = startTime;
  let totalOverrideMs = 0;
  let totalPredictedOverrideMs = 0;
  let totalPredictedMs = 0;
  let totalPauseMs = 0;

  for (const seg of segmentsBase) {
    const nightIntens = getNightIntensity(new Date(cumulMsPass1 + (seg.fatiguedMs / 2)), baseLat, baseLon);
    const nightCoeff = getNightCoefficient(nightIntens);
    const modifier = (seg.to.time_modifier || 100) / 100.0;
    
    // Temps final estimé sans ratio global
    const segFinalMs = (seg.fatiguedMs / modifier) / (weatherCoeff * nightCoeff);
    totalPredictedMs += segFinalMs;
    
    if (seg.to.knownTimeMs) {
      totalOverrideMs += seg.to.knownTimeMs;
      totalPredictedOverrideMs += segFinalMs;
    }
    
    const pauseMs = (seg.to.pause || 0) * 60000;
    totalPauseMs += pauseMs;
    cumulMsPass1 += segFinalMs + pauseMs;
  }

  // Si l'utilisateur n'a pas saisi d'objectif manuel, on utilise l'estimation physiologique calibrée (estimateRaceTargetHours)
  const totalDistCalc = rawSegments.reduce((acc, s) => acc + s.distance, 0);
  const totalEleCalc = rawSegments.reduce((acc, s) => acc + s.elevationPos, 0);
  const effectiveTargetTimeH = targetTimeH || estimateRaceTargetHours({
    distanceKm: totalDistCalc,
    elevationGainM: totalEleCalc,
    itraIndex,
    fatiguePercent,
    upCostDivider,
    downCostModifier,
    pauseMinutesTotal: totalPauseMs / 60000,
    paceProfile
  });

  let fastRatio = totalPredictedOverrideMs > 0 ? (totalOverrideMs / totalPredictedOverrideMs) : 1.0;
  let slowRatio = totalPredictedOverrideMs > 0 ? (totalOverrideMs / totalPredictedOverrideMs) : 1.0;

  if (effectiveTargetTimeH) {
    const targetFastMs = effectiveTargetTimeH * 3600000;
    const remainingTargetFastMs = targetFastMs - totalOverrideMs - totalPauseMs;
    fastRatio = (totalPredictedMs - totalPredictedOverrideMs > 0)
      ? Math.max(0.1, remainingTargetFastMs / (totalPredictedMs - totalPredictedOverrideMs))
      : 1.0;
  }
  
  // Marge Rapide / Lent dynamique : ~10% sur formats 30-50K (au lieu de +20% qui donnait des temps ultra-conservateurs),
  // progressant jusqu'à ~16% sur les grands ultras (>120 ke) où l'aléa de fin de course est plus grand.
  const slowSpread = totalStandardKe <= 65 ? 1.10 : Math.min(1.17, 1.10 + ((totalStandardKe - 65) / 150) * 0.07);
  slowRatio = fastRatio * slowSpread;

  // Passe 2 : Calcul final avec application de l'ajustement global
  let cumulMsFast = startTime;
  let cumulMsSlow = startTime;

  return segmentsBase.map((seg, i) => {
    // Recalcul précis de la nuit avec le nouveau temps décalé pour Rapide
    const nightIntensFast = getNightIntensity(new Date(cumulMsFast + (seg.fatiguedMs / 2)), baseLat, baseLon);
    const nightCoeffFast = getNightCoefficient(nightIntensFast);
    
    // Et pour Lent
    const nightIntensSlow = getNightIntensity(new Date(cumulMsSlow + (seg.fatiguedMs / 2)), baseLat, baseLon);
    const nightCoeffSlow = getNightCoefficient(nightIntensSlow);
    
    // Modifier manuel (Vitesse en %) : 110% -> 1.1 -> on divise le temps par 1.1 (plus rapide)
    const modifier = (seg.to.time_modifier || 100) / 100.0;
    
    const segmentFinalMsFast = (seg.fatiguedMs * fastRatio / modifier) / (weatherCoeff * nightCoeffFast);
    const segmentFinalMsSlow = (seg.fatiguedMs * slowRatio / modifier) / (weatherCoeff * nightCoeffSlow);
    
    cumulMsFast += segmentFinalMsFast;
    cumulMsSlow += segmentFinalMsSlow;
    
    const arrTimeFast = new Date(cumulMsFast).toISOString();
    const arrTimeSlow = new Date(cumulMsSlow).toISOString();

    const pauseMs = (seg.to.pause || 0) * 60000;
    cumulMsFast += pauseMs;
    cumulMsSlow += pauseMs;

    // ── Analyse terrain ──────────────
    // currentX est redéfini localement pour computeWalkThreshold
    const localX = segmentsBase.slice(0, i).reduce((a, b) => a + b.kmEffort, 0);
    const walkThresholdPercent = computeWalkThreshold(localX, E, F, walkThreshold);

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
          if (slope >= walkThresholdPercent) {
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

    // ── VAM estimée (Vitesse Ascensionnelle Maximale effective) ────────────
    const timeOnClimbsHours = ((segmentFinalMsFast / 3600000) * (seg.climbKmEffort / (seg.kmEffort || 1))) || 0;
    const vamEstimate = (timeOnClimbsHours > 0 && seg.climbElePos > 0)
      ? Math.round(seg.climbElePos / timeOnClimbsHours)
      : 0;

    // ── Allure moyenne sur le segment (min/km) ───────────────────
    const paceSlowMinPerKm = seg.distance > 0
      ? (segmentFinalMsSlow / 60000) / seg.distance
      : 0;

    return {
      ...seg,
      // Indépendant pour lent et rapide
      durationFastMs: segmentFinalMsFast,
      durationSlowMs: segmentFinalMsSlow,
      arr_fast: arrTimeFast,
      arr_slow: arrTimeSlow,
      nightIntensity: nightIntensFast,
      weatherCoeff,
      terrain: {
        downFlatDist,
        runUphillDist,
        walkDist,
        walkAvgSlope,
        walkThresholdPercent: walkThresholdPercent * 100
      },
      vamEstimate,
      paceSlowMinPerKm,
      durationMs: segmentFinalMsFast,
      arrivalTime: arrTimeFast
    };
  });
}

/**
 * Calcule le seuil de pente à partir duquel un traileur marche plutôt que court,
 * en tenant compte de la fatigue accumulée.
 * Modèle empirique : le seuil baisse avec la fatigue (on marche plus tôt),
 * puis remonte légèrement sur les 10 derniers % (effet "end-spurt").
 */
function computeWalkThreshold(x, E, fatiguePercent, baseThresholdPercent = 12) {
  const F = fatiguePercent / 100;
  const effortProgress = E > 0 ? x / E : 0;

  let threshold = baseThresholdPercent / 100.0;
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
/**
 * Retourne la vitesse de référence 1000 ITRA (en km-effort / heure)
 * selon le volume du parcours (km-effort = km + D+/100).
 * Loi de puissance physiologique Riegel / ITRA (exposant d'endurance ~1.115) :
 * - 25 ke (Trail Court) : ~19.7 ke/h
 * - 50 ke (Marathon / 50K) : ~18.1 ke/h
 * - 75 ke (50K Montagne / 70K) : ~17.3 ke/h
 * - 115 ke (100K / CCC) : ~16.5 ke/h
 * - 270 ke (100M / UTMB) : ~14.9 ke/h
 */
export function getReferenceSpeed1000Itra(kmEffort) {
  const safeKe = Math.max(12, kmEffort || 40);
  return 24.0 * Math.pow(safeKe, -0.068) * 1.03;
}

/**
 * Calcule la cote ITRA empirique d'une course réalisée à partir de sa distance (km),
 * de son dénivelé positif (m) et de son temps total (heures, pauses incluses).
 * Intègre un abattement terrain trail (technicité, relances) sur les formats courts.
 */
export function calculateEmpiricalItraFromPerformance(distanceKm, elevationGainM, elapsedHours, isTrainingFallback = false) {
  if (!distanceKm || distanceKm < 3 || !elapsedHours || elapsedHours <= 0.15) return 500;
  const ke = distanceKm + (elevationGainM || 0) / 100;
  const vRef1000 = getReferenceSpeed1000Itra(ke);
  const actualSpeedKeH = ke / elapsedHours;

  // Sur les distances courtes (<45 ke) ou roulantes (<25 m D+/km), la vitesse brute en ke/h
  // donne structurellement un score trop haut si on ne corrige pas la technicité / densité d'effort.
  const vertDensity = (elevationGainM || 0) / Math.max(1, distanceKm);
  const shortBonusDiscount = ke < 45 ? 0.93 + (ke / 45) * 0.05 : 0.98;
  const flatBonusDiscount = vertDensity < 25 ? 0.94 : vertDensity < 45 ? 0.97 : 1.0;
  // Si c'est une sortie longue d'entraînement (sans dossard), on ne surestime pas mais on ajuste légèrement
  const trainingFactor = isTrainingFallback ? 0.96 : 1.0;

  const rawItra = (actualSpeedKeH / vRef1000) * 1000 * shortBonusDiscount * flatBonusDiscount * trainingFactor;
  return Math.max(250, Math.min(940, Math.round(rawItra)));
}

/**
 * Estime le temps global de course (en heures décimales) pour un parcours donné
 * en fonction de la cote ITRA du coureur, de ses aptitudes et de la distance.
 * Corrige les 2 biais classiques :
 * - Pas d'empilement excessif sur 40-60 km (50K réaliste et dynamique)
 * - Courbe d'ultra-endurance non-linéaire au-delà de 65 km-effort (100K / 100M réalistes, non sur-agressifs)
 */
export function estimateRaceTargetHours({
  distanceKm,
  elevationGainM,
  itraIndex,
  fatiguePercent = 20,
  upCostDivider = 88,
  downCostModifier = 1.0,
  pauseMinutesTotal = 0,
  paceProfile = 'coach'
}) {
  const safeDist = Math.max(1, parseFloat(distanceKm) || 20);
  const safeEle = Math.max(0, parseFloat(elevationGainM) || 0);
  const safeItra = Math.max(250, Math.min(950, parseFloat(itraIndex) || 550));

  const standardKe = safeDist + safeEle / 100;
  const vRef1000 = getReferenceSpeed1000Itra(standardKe);

  // Vitesse moyenne ke/h théorique d'un coureur de cet index ITRA sur ce volume de course
  let runnerKeSpeed = (safeItra / 1000) * vRef1000;

  // Modulation fine selon les aptitudes spécifiques Montée / Descente du coureur par rapport au standard (upCostDivider=90, downCost=0.95)
  const vertRatio = safeEle / safeDist; // m D+ / km
  const upAptitudeRatio = (parseFloat(upCostDivider) || 88) / 90; // >1 si meilleur grimpeur
  const downAptitudeRatio = 1.0 - ((parseFloat(downCostModifier) || 0.95) - 0.95) * 0.18; // >1 si agile en descente
  const terrainWeight = Math.min(1, vertRatio / 60);
  const aptitudeMultiplier = 1 + terrainWeight * ((upAptitudeRatio - 1) * 0.45 + (downAptitudeRatio - 1) * 0.35);
  runnerKeSpeed *= Math.max(0.82, Math.min(1.18, aptitudeMultiplier));

  // Modulation selon la résistance à la fatigue du coureur par rapport à la fatigue attendue pour son ITRA
  const expectedFatigueForItra = Math.round(45 - ((safeItra - 200) / 800) * 30);
  const fatigueDelta = (parseFloat(fatiguePercent) || expectedFatigueForItra) - expectedFatigueForItra;
  const fatigueAdjustment = 1 + (fatigueDelta / 100) * 0.32;

  // Facteur de dégradation ultra-distance (> 65 km-effort) :
  // En ultra, les coureurs amateurs (ITRA < 680) subissent une dérive musculaire, digestive et nocturne
  // beaucoup plus marquée que les élites (ITRA 850+) qui courent 100 km en <10h de jour.
  let ultraDriftMultiplier = 1.0;
  if (standardKe > 65) {
    const ultraExcess = (standardKe - 65) / 100; // ex: +0.50 sur un 115 ke (75km/4000m+), +1.85 sur un UTMB (250 ke)
    const amateurFactor = Math.max(0.25, Math.min(1.45, (820 - safeItra) / 350));
    ultraDriftMultiplier = 1 + Math.pow(ultraExcess, 1.15) * 0.24 * amateurFactor;
  }

  const profileFactor = paceProfile === 'aggressive' ? 0.96 : 1.0;
  const runningHours = (standardKe / Math.max(3.2, runnerKeSpeed)) * fatigueAdjustment * ultraDriftMultiplier * profileFactor;

  // Pauses aux ravitaillements : si l'utilisateur n'a pas saisi de pauses sur un ultra (>65 ke),
  // inclure un forfait physiologique minimal de ravitaillement/base de vie
  let effectivePauseHours = (parseFloat(pauseMinutesTotal) || 0) / 60;
  if (effectivePauseHours < 0.05 && standardKe > 65) {
    effectivePauseHours = ((standardKe - 55) / 25) * 0.12; // ~15-20 min sur 100K, ~45-60 min sur 100M
  }

  return Number(Math.max(0.25, runningHours + effectivePauseHours).toFixed(2));
}

export function estimateBasePaces(utmbIndex, totalKmEffort = 45) {
  const index = Math.max(200, Math.min(1000, utmbIndex || 600));
  const vRef1000 = getReferenceSpeed1000Itra(totalKmEffort);
  // Vitesse fraîche en début d'épreuve (avant application de l'intégrale de fatigue sur les segments)
  const flatSpeedKmh = (index / 1000) * vRef1000 * 1.08;
  const flatPaceMinKm = 60 / flatSpeedKmh;
  const vam = flatSpeedKmh * 95;

  return { vam, flatPaceMinKm, flatSpeedKmh };
}

/**
 * Calcule les paramètres de course optimaux en fonction de l'index ITRA.
 * Permet d'adapter l'agilité en descente, l'efficacité en montée et la résistance à la fatigue.
 */
export function deriveConfigFromITRA(itraIndex) {
  const index = Math.max(200, Math.min(1000, itraIndex || 600));
  
  // Fatigue par défaut (à ajuster par l'utilisateur selon la distance)
  // Elite (1000) -> 15%, Beginner (200) -> 45%
  const fatiguePercent = Math.round(45 - ((index - 200) / 800) * 30);
  
  // Pente Descente Technique: Elite -> 25%, Beginner -> 10%
  const descentThreshold = Math.round(10 + ((index - 200) / 800) * 15);
  
  // Pente Marche Montée: Elite -> 20%, Beginner -> 8%
  const walkThreshold = Math.round(8 + ((index - 200) / 800) * 12);

  // Up Cost Divider: Elite -> 100, Beginner -> 80
  const upCostDivider = Math.round(80 + ((index - 200) / 800) * 20);

  // Down Cost Modifier: Elite -> 0.2 (très agile), Beginner -> 1.5 (très coûteux)
  // On utilise toFixed pour éviter les problèmes d'arrondi
  const downCostModifier = parseFloat((1.5 - ((index - 200) / 800) * 1.3).toFixed(2));

  const pacingStrategy = 'regular';

  return {
    fatiguePercent,
    descentThreshold,
    walkThreshold,
    upCostDivider,
    downCostModifier,
    pacingStrategy
  };
}

// ─────────────────────────────────────────────────────────────
// La fonction estimateTimeFromVMA a été supprimée selon les spécifications.

// L'estimation globale basée sur l'ITRA a été retirée à la demande de l'utilisateur.
// L'objectif global (targetTime) est désormais la seule source de vérité pour le roadbook.

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

    // Saturation : la pleine nuit (1.0) est atteinte rapidement et maintenue
    return Math.min(1.0, Math.max(0, 1 - (distToNadir / maxDist)) * 2.0);
  }

  return 0;
}

// La section de validation avec estimateTimeFromITRA a été retirée.
