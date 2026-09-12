/**
 * Calcule la distance entre deux coordonnées GPS avec la formule de Haversine.
 * @returns {number} Distance en kilomètres
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Rayon de la Terre en km
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
 */
export function findClosestPointIndex(lat, lon, points) {
  if (!points || points.length === 0) return -1;
  let minIndex = 0;
  let minDistance = Infinity;

  for (let i = 0; i < points.length; i++) {
    // Distance au carré simplifiée pour la performance (suffisant pour de petites échelles)
    const dist = Math.pow(points[i].lat - lat, 2) + Math.pow(points[i].lon - lon, 2);
    if (dist < minDistance) {
      minDistance = dist;
      minIndex = i;
    }
  }
  return minIndex;
}

/**
 * Ajoute un point de départ et d'arrivée s'ils n'existent pas, et trie les waypoints dans l'ordre de la trace.
 */
export function enrichWaypointsWithStartEnd(waypoints, points) {
  if (!points || points.length === 0) return waypoints;

  // Assigner un pointIndex à chaque waypoint et trier
  let enriched = waypoints.map(wp => ({
    ...wp,
    pointIndex: wp.pointIndex !== undefined ? wp.pointIndex : findClosestPointIndex(wp.lat, wp.lon, points)
  })).sort((a, b) => a.pointIndex - b.pointIndex);

  // Vérifier s'il y a un point au tout début (tolérance de 5 points d'index)
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
    // Si l'utilisateur a mis un point de départ proche, on s'assure qu'il est index 0
    enriched[0].pointIndex = 0;
  }

  // Vérifier s'il y a un point à la fin
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
    // Si l'utilisateur a mis un point d'arrivée proche, on le force au dernier index
    enriched[enriched.length - 1].pointIndex = lastIndex;
  }

  return enriched;
}

/**
 * Calcule les statistiques globales d'une trace (Distance, D+, D-) avec un lissage pour éviter l'exagération du GPS.
 */
export function calculateTraceStats(points, elevationThreshold = 7, distanceFactor = 1) {
  let distance = 0;
  let elePos = 0;
  let eleNeg = 0;

  if (!points || points.length === 0) return { distance: 0, elevation: { pos: 0, neg: 0 } };

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
 * Recherche dichotomique pour trouver le seuil de lissage (en mètres) qui permet de coller au D+ officiel de l'organisateur.
 */
export function findOptimalElevationThreshold(points, targetElevation) {
  if (!points || points.length === 0 || !targetElevation) return 5;
  let low = 0;
  let high = 50; // max threshold
  let bestThreshold = 5;
  
  for (let iter = 0; iter < 15; iter++) {
    const mid = (low + high) / 2;
    const stats = calculateTraceStats(points, mid, 1);
    
    if (Math.abs(stats.elevation.pos - targetElevation) < 5) {
      return mid;
    }
    
    if (stats.elevation.pos > targetElevation) {
      // D+ calculé trop élevé -> on a besoin de lisser plus -> augmenter le seuil
      low = mid;
    } else {
      // D+ calculé trop faible -> on a besoin de lisser moins -> baisser le seuil
      high = mid;
    }
    bestThreshold = mid;
  }
  return bestThreshold;
}

/**
 * Calcule les segments du roadbook, la distance, D+, km-effort et le temps estimé.
 */
export function generateSegments(points, orderedWaypoints, targetFastHours, targetSlowHours, fatiguePercent, startTimeStr = null, elevationThreshold = 5, distanceFactor = 1) {
  if (!points || points.length === 0 || orderedWaypoints.length < 2) return [];

  let segments = [];
  let totalKmEffort = 0;
  let cumulDistance = 0;
  let cumulElevation = 0;

  // 1. Découpage en segments et calculs géométriques
  for (let i = 0; i < orderedWaypoints.length - 1; i++) {
    const startWp = orderedWaypoints[i];
    const endWp = orderedWaypoints[i + 1];

    let segmentDist = 0;
    let segmentElePos = 0;
    let segmentEleNeg = 0;

    // Métriques détaillées pour les conseils de pacing
    let climbDist = 0;
    let climbElePos = 0;

    // Initialiser l'altitude de référence pour le lissage
    let currentRefEle = points[startWp.pointIndex]?.ele || 0;
    let lastRefDist = 0;

    for (let j = startWp.pointIndex; j < endWp.pointIndex; j++) {
      const p1 = points[j];
      const p2 = points[j + 1];

      // Distance
      const d = calculateDistance(p1.lat, p1.lon, p2.lat, p2.lon) * distanceFactor;
      segmentDist += d;

      // Dénivelé lissé
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
          currentRefEle = p2.ele;
          lastRefDist = segmentDist;
        }
      }
    }

    // Calcul du km-effort (formule type UTMB/ITRA)
    // Distance + D+/100 (On peut aussi inclure un léger malus D- si très pentu, mais D+/100 est le standard de base)
    const kmEffort = segmentDist + (segmentElePos / 100);
    totalKmEffort += kmEffort;

    cumulDistance += segmentDist;
    cumulElevation += segmentElePos;

    let segmentPoints = [];
    for (let j = startWp.pointIndex; j <= endWp.pointIndex; j++) {
      segmentPoints.push(points[j]);
    }

    segments.push({
      id: `seg-${i}`,
      from: startWp,
      to: endWp,
      distance: segmentDist,
      cumulDistance: cumulDistance,
      elevationPos: segmentElePos,
      elevationNeg: segmentEleNeg,
      cumulElevation: cumulElevation,
      kmEffort: kmEffort,
      climbKmEffort: climbDist + (climbElePos / 100),
      climbElePos: climbElePos,
      points: segmentPoints
    });
  }

  // 2. Calcul des temps de passage avec prise en compte de la fatigue et des pauses
  let totalPauseMs = 0;
  for (let i = 0; i < segments.length; i++) {
    totalPauseMs += (segments[i].to.pause || 0) * 60000;
  }

  const targetFastMs = Math.max(1, ((targetFastHours || 0) * 3600000) - totalPauseMs);
  const targetSlowMs = Math.max(1, ((targetSlowHours || 0) * 3600000) - totalPauseMs);

  const startTime = startTimeStr ? new Date(startTimeStr).getTime() : new Date().setHours(8, 0, 0, 0);

  const F = (fatiguePercent || 0) / 100.0;

  // Somme pondérée par les modificateurs de temps
  let effectiveTotalEffort = 0;
  for (let i = 0; i < segments.length; i++) {
    const modifier = (segments[i].to.time_modifier || 100) / 100.0;
    effectiveTotalEffort += segments[i].kmEffort * modifier;
  }

  const E = effectiveTotalEffort || 1;
  const p0_fast = targetFastMs / (E * (1 + 0.5 * F));
  const p0_slow = targetSlowMs / (E * (1 + 0.5 * F));

  let currentX = 0;
  let cumulFastMs = startTime;
  let cumulSlowMs = startTime;

  return segments.map((seg) => {
    const modifier = (seg.to.time_modifier || 100) / 100.0;
    const dx = seg.kmEffort * modifier;

    // Intégrale pour la fatigue linéaire
    const integralFactor = dx + (F / (2 * E)) * (Math.pow(currentX + dx, 2) - Math.pow(currentX, 2));
    
    // --- Calcul dynamique de la jauge Terrain ---
    // La littérature montre qu'on marche "plus tôt" (seuil plus bas) avec la fatigue.
    // Mais il existe l'effet "end-spurt" (all-in) sur la fin de course où le seuil peut remonter.
    const effortProgress = currentX / E;
    
    let walkThreshold = 0.12; // Base de départ : 12%
    const fatigueDrop = (F / 0.15) * 0.05; // Baisse jusqu'à 5% selon la fatigue
    walkThreshold -= (effortProgress * fatigueDrop);
    
    // Effet "All-in" sur les 10 derniers % de la course
    if (effortProgress > 0.90) {
      const spurtBoost = ((effortProgress - 0.90) / 0.10) * 0.03; // Remonte de 3% max
      walkThreshold += spurtBoost;
    }
    
    walkThreshold = Math.max(0.06, walkThreshold); // Sécurité : jamais < 6%

    let walkDist = 0;
    let runUphillDist = 0;
    let avgWalkSlopeCumul = 0;

    let tempRefEle = points[seg.from.pointIndex]?.ele || 0;
    let tempRefDist = 0;
    let tempSegDist = 0;

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
            avgWalkSlopeCumul += (slope * dSinceRef);
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
    const walkThresholdPercent = walkThreshold * 100;
    // --- Fin Calcul Jauge Terrain ---

    currentX += dx;

    const segmentFastRunMs = p0_fast * integralFactor;
    const segmentSlowRunMs = p0_slow * integralFactor;

    cumulFastMs += segmentFastRunMs;
    cumulSlowMs += segmentSlowRunMs;

    const arrFast = new Date(cumulFastMs).toISOString();
    const arrSlow = new Date(cumulSlowMs).toISOString();

    const pauseMs = (seg.to.pause || 0) * 60000;
    cumulFastMs += pauseMs;
    cumulSlowMs += pauseMs;

    return {
      ...seg,
      durationFastMs: segmentFastRunMs,
      durationSlowMs: segmentSlowRunMs,
      arr_fast: arrFast,
      arr_slow: arrSlow,
      terrain: {
        downFlatDist,
        runUphillDist,
        walkDist,
        walkAvgSlope,
        walkThresholdPercent
      },
      // fallback attributes just in case
      durationMs: segmentSlowRunMs,
      arrivalTime: arrSlow
    };
  });
}

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
      // On est très proche, on renvoie le point le plus proche
      const diff1 = targetDistanceKm - currentDist;
      const diff2 = (currentDist + d) - targetDistanceKm;
      return diff1 < diff2 ? points[i] : points[i + 1];
    }
    currentDist += d;
  }

  return points[points.length - 1];
}

/**
 * Prépare les données de la trace pour le profil altimétrique (Distance cumulée, Altitude, Pente).
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

    // Calcul de pente lissée sur une distance minimale (ex: 250m) pour éviter le bruit GPS
    // et avoir des segments de couleur plus longs et lisibles.
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
      slope = ((points[nextIndex].ele - points[i].ele) / (distNext * 1000)) * 100; // %
    }

    chartData.push({
      x: currentDist,
      y: points[i].ele,
      slope: slope
    });
  }

  return chartData;
}

import * as SunCalc from 'suncalc';

/**
 * Calcule l'intensité de la nuit (0 = jour, 1 = pleine nuit) pour un instant donné,
 * en se basant sur les heures réelles de lever et coucher du soleil à la position de la course.
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
