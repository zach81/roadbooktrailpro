/**
 * ============================================================
 * mykairn — Connecteur & Profileur Physiologique Intervals.icu
 * ============================================================
 * - Normalisation anti-erreur 401 (Clé API & ID Athlète)
 * - Auto-détection et fallback sur /api/v1/athlete/0
 * - Analyse de vos sorties "Course" + flux GPS/Vitesse/Pente
 *   pour profiler l'athlète (ITRA, Seuil Marche, Coût D+,
 *   Agilité Descente, Résistance Fatigue, Archétype).
 */

import {
  deriveConfigFromITRA,
  calculateEmpiricalItraFromPerformance,
  estimateRaceTargetHours,
  getReferenceSpeed1000Itra,
} from './roadbookCalculator';

const BASE_URL = 'https://intervals.icu/api/v1';

/**
 * Nettoie la clé API Intervals.icu pour éviter les erreurs 401
 */
export function normalizeIntervalsApiKey(rawKey) {
  if (!rawKey) return '';
  let clean = String(rawKey).trim();
  clean = clean.replace(/^["']+|["']+$/g, '').trim();
  if (/^API_KEY:/i.test(clean)) {
    clean = clean.replace(/^API_KEY:/i, '').trim();
  }
  if (/^Bearer\s+/i.test(clean)) {
    clean = clean.replace(/^Bearer\s+/i, '').trim();
  }
  return clean;
}

/**
 * Normalise l'identifiant athlète Intervals.icu :
 * - Extrait i123456 depuis une URL collée
 * - Ajoute le préfixe 'i' si l'utilisateur n'a tapé que les chiffres (ex: "467323" -> "i467323")
 * - Utilise '0' (raccourci officiel Intervals.icu pour le propriétaire de la clé API) si vide ou e-mail
 */
export function normalizeIntervalsAthleteId(rawId) {
  if (!rawId) return '0';
  let clean = String(rawId).trim();
  if (!clean) return '0';

  const urlMatch = clean.match(/athlete\/(i?\d+)/i);
  if (urlMatch && urlMatch[1]) {
    clean = urlMatch[1];
  }

  if (clean.includes('@')) {
    return '0';
  }

  if (clean === '0') return '0';
  if (/^\d+$/.test(clean)) {
    return `i${clean}`;
  }
  if (/^I\d+$/.test(clean)) {
    return `i${clean.slice(1)}`;
  }

  return clean;
}

function getAuthHeaders(apiKey) {
  const cleanKey = normalizeIntervalsApiKey(apiKey);
  return {
    Authorization: 'Basic ' + btoa(`API_KEY:${cleanKey}`),
    'Content-Type': 'application/json',
  };
}

/**
 * Appelle un endpoint /athlete/{id}{subPath} avec repli automatique sur /athlete/0{subPath}
 * en cas d'erreur 401/403/404 liée à un ID athlète mal saisi.
 */
export async function fetchIntervalsAthleteEndpoint(athleteId, apiKey, subPath = '') {
  const cleanKey = normalizeIntervalsApiKey(apiKey);
  if (!cleanKey) {
    throw new Error(
      'Clé API Intervals.icu manquante. Rendez-vous dans Paramètres > Connexion Intervals.icu pour coller votre Developer API Key.'
    );
  }

  const normalizedId = normalizeIntervalsAthleteId(athleteId);
  const headers = getAuthHeaders(cleanKey);

  const primaryUrl = `${BASE_URL}/athlete/${normalizedId}${subPath}`;
  let res = await fetch(primaryUrl, { headers });

  if ((res.status === 401 || res.status === 403 || res.status === 404) && normalizedId !== '0') {
    const fallbackUrl = `${BASE_URL}/athlete/0${subPath}`;
    const fallbackRes = await fetch(fallbackUrl, { headers });
    if (fallbackRes.ok) {
      return fallbackRes;
    }
    res = fallbackRes;
  }

  return res;
}

/**
 * Teste la connexion Intervals.icu et résout automatiquement le vrai ID Athlète (ex: i467323),
 * le nom, le poids et la condition physique (CTL).
 */
export async function verifyIntervalsConnection(athleteId, apiKey) {
  const cleanKey = normalizeIntervalsApiKey(apiKey);
  if (!cleanKey) {
    throw new Error('Veuillez saisir votre Clé API (Developer Key) Intervals.icu.');
  }

  const res = await fetchIntervalsAthleteEndpoint(athleteId || '0', cleanKey, '');
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        'Erreur 401 (Accès refusé) : Votre Clé API est invalide. Sur intervals.icu/settings, descendez dans "Developer Settings" > "API Key" (ne mettez pas votre mot de passe).'
      );
    }
    throw new Error(`Erreur Intervals.icu (${res.status} ${res.statusText})`);
  }

  const data = await res.json();
  const resolvedId = data?.id ? String(data.id) : normalizeIntervalsAthleteId(athleteId);
  const name =
    data?.name ||
    (data?.firstname ? `${data.firstname} ${data.lastname || ''}`.trim() : null) ||
    resolvedId;

  return {
    resolvedAthleteId: resolvedId,
    cleanApiKey: cleanKey,
    name,
    weight: typeof data?.icu_weight === 'number' && data.icu_weight > 30 ? Math.round(data.icu_weight * 10) / 10 : undefined,
    ctl: typeof data?.ctl === 'number' ? Math.round(data.ctl) : undefined,
  };
}

/**
 * Récupère les flux détaillés (vitesse, pente, altitude) d'une activité Intervals.icu
 */
async function fetchActivityStreams(activityId, apiKey) {
  const cleanKey = normalizeIntervalsApiKey(apiKey);
  const types = 'time,altitude,fixed_altitude,velocity_smooth,grade_smooth,heartrate';
  const url = `${BASE_URL}/activity/${activityId}/streams.json?types=${types}`;
  const res = await fetch(url, { headers: getAuthHeaders(cleanKey) });
  if (!res.ok) return null;
  const raw = await res.json();
  const streamMap = {};
  if (Array.isArray(raw)) {
    for (const s of raw) {
      if (s && s.type && Array.isArray(s.data)) {
        streamMap[s.type] = s.data;
      }
    }
  } else if (raw && typeof raw === 'object') {
    for (const k of Object.keys(raw)) {
      if (Array.isArray(raw[k])) streamMap[k] = raw[k];
      else if (raw[k] && Array.isArray(raw[k].data)) streamMap[k] = raw[k].data;
    }
  }
  return streamMap;
}

/**
 * Analyse les activités de l'athlète sur les 12 derniers mois + les flux GPS/Pente/Vitesse
 * de ses 3 meilleures sorties "Course" pour profiler ses aptitudes terrain réelles.
 */
export async function profileAthleteFromIntervalsRaces(
  athleteId,
  apiKey,
  targetDistanceKm = null,
  targetElevationGainM = null,
  pauseMinutesTotal = 0
) {
  const verified = await verifyIntervalsConnection(athleteId, apiKey);
  const effectiveId = verified.resolvedAthleteId;
  const cleanKey = verified.cleanApiKey;

  const now = new Date();
  const oldest = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const newest = now.toISOString().split('T')[0];

  const res = await fetchIntervalsAthleteEndpoint(
    effectiveId,
    cleanKey,
    `/activities?oldest=${oldest}&newest=${newest}`
  );

  if (!res.ok) {
    throw new Error(`Erreur lors de la lecture des activités Intervals.icu (${res.status})`);
  }

  const acts = await res.json();
  if (!Array.isArray(acts)) {
    throw new Error('Réponse invalide lors de la lecture des activités Intervals.icu.');
  }

  const explicitRegex = /\b(course|race|comp[eé]tition|dossard)\b/i;
  const raceRegex = /\b(course|race|trail|ultra|marathon|semi|kv|10\s?km|20\s?km|dossard|comp[eé]tition|utmb|ut4m|templiers|saint[eé]lyon|diagonale|skytrail|skyrunning)\b/i;

  const enriched = acts
    .filter((a) => ['Run', 'TrailRun', 'Hike', 'Walk', 'VirtualRun'].includes(a.type) && (a.distance || 0) >= 5000)
    .map((a) => {
      const title = (a.name || '').trim();
      const isExplicit = explicitRegex.test(title) || Boolean(a.race) || a.category === 'RACE';
      const isRace = isExplicit || raceRegex.test(title);
      const distKm = (a.distance || 0) / 1000;
      const eleM = a.total_elevation_gain || 0;
      const ke = distKm + eleM / 100;
      const sec = a.elapsed_time > a.moving_time ? a.elapsed_time : (a.moving_time || 3600);
      const h = Math.max(0.25, sec / 3600);
      const empiricalItra = calculateEmpiricalItraFromPerformance(distKm, eleM, h, !isExplicit);
      return {
        ...a,
        isExplicitCourseTitle: isExplicit,
        isRace,
        empiricalItra,
        distKm,
        eleM,
        ke,
      };
    });

  let raceActs = enriched.filter((a) => a.isRace);
  let usedFallbackLongRuns = false;

  if (raceActs.length === 0) {
    // Fallback intelligent sur les sorties longues trail (> 14 km) si aucune sortie n'est intitulée "Course"
    raceActs = enriched
      .filter((a) => a.distKm >= 14)
      .sort((a, b) => (b.ke || 0) - (a.ke || 0))
      .slice(0, 6);
    usedFallbackLongRuns = true;
  }

  if (raceActs.length === 0) {
    throw new Error(
      "Aucune sortie 'Course' ni sortie longue (> 14 km) trouvée sur les 12 derniers mois dans Intervals.icu."
    );
  }

  const explicitCount = raceActs.filter((a) => a.isExplicitCourseTitle).length;

  let weightedItraSum = 0;
  let totalWeight = 0;
  let peakItra = 0;
  let weightedStopRatio = 0;
  let weightedDecoupling = 0;
  let decouplingWeight = 0;
  let avgVertRatio = 0;

  const referenceRaces = [];

  for (const act of raceActs) {
    const itra = act.empiricalItra || 500;
    // Pondération par pertinence :
    // - x2.5 si explicitement marqué "Course" / Race
    // - Bonus pour les vrais trails (>25 ke et >30m D+/km) afin que les 10 km sur route plats ne gonflent pas la cote ITRA trail
    const trailRelevance = (act.ke >= 28 ? 1.35 : act.ke >= 18 ? 1.0 : 0.65) * ((act.eleM / Math.max(1, act.distKm)) >= 30 ? 1.25 : 0.85);
    let w = (act.isExplicitCourseTitle ? 2.5 : 1.0) * trailRelevance;
    if (targetDistanceKm && targetDistanceKm > 0) {
      const distDiffRatio = Math.abs(act.distKm - targetDistanceKm) / Math.max(12, targetDistanceKm);
      if (distDiffRatio < 0.35) w *= 1.5;
    }

    weightedItraSum += itra * w;
    totalWeight += w;
    if (itra > peakItra && act.ke >= 18) peakItra = itra;

    const moving = act.moving_time || act.elapsed_time || 3600;
    const elapsed = Math.max(moving, act.elapsed_time || moving);
    const stopRatio = Math.max(0, (elapsed - moving) / elapsed);
    weightedStopRatio += stopRatio * w;

    if (typeof act.decoupling === 'number' && !Number.isNaN(act.decoupling)) {
      weightedDecoupling += Math.max(0, act.decoupling) * w;
      decouplingWeight += w;
    }

    const vertRatio = act.distKm > 0 ? act.eleM / act.distKm : 0;
    avgVertRatio += vertRatio * w;

    referenceRaces.push({
      id: act.id,
      name: act.name,
      date: act.start_date_local ? act.start_date_local.split('T')[0] : '',
      distanceKm: Math.round(act.distKm * 10) / 10,
      elevationGainM: Math.round(act.eleM),
      durationFormatted: `${Math.floor(elapsed / 3600)}h${String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}`,
      empiricalItra: itra,
      isExplicitCourse: Boolean(act.isExplicitCourseTitle),
      hasGps: Boolean(act.start_latlng && act.start_latlng.length === 2),
    });
  }

  const avgItra = Math.round(weightedItraSum / (totalWeight || 1));
  if (!peakItra) peakItra = avgItra;
  // On privilégie la moyenne pondérée réelle (90%) plutôt que le pic isolé (10%) pour ne jamais surévaluer la cote ITRA
  const blendedItra = Math.round(avgItra * 0.90 + peakItra * 0.10);
  const meanStopRatio = weightedStopRatio / (totalWeight || 1);
  const meanDecoupling = decouplingWeight > 0 ? weightedDecoupling / decouplingWeight : 6.5;
  const meanVertRatio = avgVertRatio / (totalWeight || 1);

  const baseDerived = deriveConfigFromITRA(blendedItra);
  let fatiguePercent = Math.round(
    Math.max(8, Math.min(45, baseDerived.fatiguePercent + (meanDecoupling - 6.0) * 0.9 + meanStopRatio * 22))
  );
  let walkThreshold = Math.round(
    Math.max(6, Math.min(24, baseDerived.walkThreshold + (meanVertRatio > 55 ? 2 : meanVertRatio > 35 ? 1 : 0)))
  );
  let descentThreshold = Math.round(
    Math.max(10, Math.min(26, baseDerived.descentThreshold + (meanVertRatio > 50 ? 2 : 0)))
  );
  let upCostDivider = Math.round(
    Math.max(65, Math.min(115, baseDerived.upCostDivider + (meanVertRatio > 55 ? 6 : meanVertRatio < 20 ? -4 : 0)))
  );
  let downCostModifier = Number(
    Math.max(0.75, Math.min(1.25, baseDerived.downCostModifier - (meanVertRatio > 50 ? 0.05 : 0))).toFixed(2)
  );
  let pacingStrategy =
    meanDecoupling < 4.5 && meanStopRatio < 0.05
      ? 'aggressive'
      : meanDecoupling > 9 || meanStopRatio > 0.12
      ? 'prudent'
      : 'regular';

  // Analyse haute précision sur les flux GPS/Pente/Vitesse des 3 meilleures courses
  const topCandidates = [...raceActs]
    .sort((a, b) => {
      const scoreA = (a.isExplicitCourseTitle ? 1000 : 0) + (a.empiricalItra || 500);
      const scoreB = (b.isExplicitCourseTitle ? 1000 : 0) + (b.empiricalItra || 500);
      return scoreB - scoreA;
    })
    .slice(0, 3);

  let flatSpeedSum = 0;
  let flatCount = 0;
  let uphillRatioSum = 0;
  let uphillRatioCount = 0;
  let modDownRatioSum = 0;
  let modDownCount = 0;
  let steepDownRatioSum = 0;
  let steepDownCount = 0;
  let walkGradeSum = 0;
  let walkGradeCount = 0;
  let speedFadeSum = 0;
  let speedFadeCount = 0;
  let streamsAnalyzedCount = 0;

  for (const act of topCandidates) {
    try {
      const streams = await fetchActivityStreams(act.id, cleanKey);
      if (!streams) continue;
      const vel = streams.velocity_smooth;
      const grade = streams.grade_smooth;
      if (!Array.isArray(vel) || vel.length < 60) continue;

      streamsAnalyzedCount++;
      const n = vel.length;

      let actFlatSum = 0;
      let actFlatCnt = 0;
      let actUpSum = 0;
      let actUpCnt = 0;
      let actModDownSum = 0;
      let actModDownCnt = 0;
      let actSteepDownSum = 0;
      let actSteepDownCnt = 0;
      const transitionGrades = [];

      let firstHalfSpd = 0;
      let firstHalfCnt = 0;
      let secondHalfSpd = 0;
      let secondHalfCnt = 0;

      for (let i = 0; i < n; i++) {
        const vMs = vel[i];
        if (typeof vMs !== 'number' || vMs < 0.4 || vMs > 7.5) continue;
        const vKmh = vMs * 3.6;

        if (i < n / 2) {
          firstHalfSpd += vKmh;
          firstHalfCnt++;
        } else {
          secondHalfSpd += vKmh;
          secondHalfCnt++;
        }

        const g = Array.isArray(grade) && typeof grade[i] === 'number' ? grade[i] : null;
        if (g === null) continue;

        if (g >= -2 && g <= 2) {
          actFlatSum += vKmh;
          actFlatCnt++;
        } else if (g >= 6 && g <= 16) {
          actUpSum += vKmh;
          actUpCnt++;
          if (vKmh >= 4.7 && vKmh <= 6.2) {
            transitionGrades.push(g);
          }
        } else if (g <= -4 && g >= -11) {
          actModDownSum += vKmh;
          actModDownCnt++;
        } else if (g < -12 && g >= -28) {
          actSteepDownSum += vKmh;
          actSteepDownCnt++;
        }
      }

      if (actFlatCnt > 15) {
        const actFlatKmh = actFlatSum / actFlatCnt;
        flatSpeedSum += actFlatKmh;
        flatCount++;

        if (actUpCnt > 15) {
          uphillRatioSum += (actUpSum / actUpCnt) / actFlatKmh;
          uphillRatioCount++;
        }
        if (actModDownCnt > 15) {
          modDownRatioSum += (actModDownSum / actModDownCnt) / actFlatKmh;
          modDownCount++;
        }
        if (actSteepDownCnt > 10) {
          steepDownRatioSum += (actSteepDownSum / actSteepDownCnt) / actFlatKmh;
          steepDownCount++;
        }
      }

      if (transitionGrades.length >= 8) {
        const avgWalkG = transitionGrades.reduce((a, b) => a + b, 0) / transitionGrades.length;
        walkGradeSum += avgWalkG;
        walkGradeCount++;
      }

      if (firstHalfCnt > 20 && secondHalfCnt > 20) {
        const m1 = firstHalfSpd / firstHalfCnt;
        const m2 = secondHalfSpd / secondHalfCnt;
        if (m1 > 0) {
          const fadePct = Math.max(0, ((m1 - m2) / m1) * 100);
          speedFadeSum += fadePct;
          speedFadeCount++;
        }
      }
    } catch {
      // Ignorer si les streams d'une activité ne sont pas accessibles
    }
  }

  const flatSpeedKmh =
    flatCount > 0
      ? Math.round((flatSpeedSum / flatCount) * 10) / 10
      : Math.round((blendedItra / 1000) * 19.5 * 10) / 10;

  let uphillEfficiencyScore = Math.min(98, Math.max(35, Math.round((upCostDivider - 55) * 1.4)));
  let downhillAgilityScore = Math.min(98, Math.max(35, Math.round((1.3 - downCostModifier) * 125)));
  let enduranceScore = Math.min(98, Math.max(35, Math.round(100 - fatiguePercent * 1.6)));

  if (walkGradeCount > 0) {
    const empiricalWalk = Math.round(walkGradeSum / walkGradeCount);
    walkThreshold = Math.max(6, Math.min(24, Math.round(walkThreshold * 0.4 + empiricalWalk * 0.6)));
  }

  if (uphillRatioCount > 0) {
    const upRatio = uphillRatioSum / uphillRatioCount;
    const streamUpDivider = Math.round(Math.max(65, Math.min(115, 75 + (upRatio - 0.45) * 95)));
    upCostDivider = Math.round(upCostDivider * 0.4 + streamUpDivider * 0.6);
    uphillEfficiencyScore = Math.min(99, Math.max(30, Math.round(40 + (upRatio - 0.4) * 140)));
  }

  if (modDownCount > 0) {
    const modDownRatio = modDownRatioSum / modDownCount;
    const steepDownRatio = steepDownCount > 0 ? steepDownRatioSum / steepDownCount : modDownRatio * 0.82;
    const combinedDown = modDownRatio * 0.6 + steepDownRatio * 0.4;
    const streamDownMod = Number(Math.max(0.75, Math.min(1.25, 1.32 - combinedDown * 0.4)).toFixed(2));
    downCostModifier = Number((downCostModifier * 0.4 + streamDownMod * 0.6).toFixed(2));
    descentThreshold = Math.round(
      Math.max(10, Math.min(26, 12 + (steepDownRatio / Math.max(0.5, modDownRatio)) * 12))
    );
    downhillAgilityScore = Math.min(99, Math.max(30, Math.round((combinedDown - 0.65) * 130)));
  }

  if (speedFadeCount > 0) {
    const avgFade = speedFadeSum / speedFadeCount;
    const streamFatigue = Math.round(Math.max(8, Math.min(45, 10 + avgFade * 1.15)));
    fatiguePercent = Math.round(fatiguePercent * 0.5 + streamFatigue * 0.5);
    enduranceScore = Math.min(99, Math.max(30, Math.round(100 - fatiguePercent * 1.55)));
    if (avgFade < 6) pacingStrategy = 'aggressive';
    else if (avgFade > 15) pacingStrategy = 'prudent';
    else pacingStrategy = 'regular';
  }

  let runnerArchetype = 'Traileur Polyvalent & Régulier';
  if (uphillEfficiencyScore >= downhillAgilityScore + 8 && uphillEfficiencyScore >= 68) {
    runnerArchetype = 'Grimpeur Montagnard';
  } else if (downhillAgilityScore >= uphillEfficiencyScore + 8 && downhillAgilityScore >= 68) {
    runnerArchetype = 'Descendeur Technique & Relanceur';
  } else if (enduranceScore >= 78) {
    runnerArchetype = 'Diesel Ultra-Endurant';
  }

  // Estimation optionnelle sur le parcours Roadbook actif via le modèle non-linéaire ITRA/Riegel
  let estimatedTargetHours = null;
  let estimatedTargetFormatted = null;
  if (targetDistanceKm && targetDistanceKm > 0) {
    estimatedTargetHours = estimateRaceTargetHours({
      distanceKm: targetDistanceKm,
      elevationGainM: targetElevationGainM || 0,
      itraIndex: blendedItra,
      fatiguePercent,
      upCostDivider,
      downCostModifier,
      pauseMinutesTotal: pauseMinutesTotal || 0,
      paceProfile: 'coach',
    });
    const h = Math.floor(estimatedTargetHours);
    const m = Math.round((estimatedTargetHours - h) * 60);
    estimatedTargetFormatted = m === 60 ? `${h + 1}h00` : `${h}h${m < 10 ? `0${m}` : m}`;
  }

  return {
    resolvedAthleteId: effectiveId,
    cleanApiKey: cleanKey,
    athleteName: verified.name,
    weight: verified.weight,
    ctl: verified.ctl,
    racesCount: raceActs.length,
    explicitCoursesCount: explicitCount,
    usedFallbackLongRuns,
    streamsAnalyzedCount,
    calibratedItra: blendedItra,
    peakItra,
    fatiguePercent,
    walkThreshold,
    descentThreshold,
    upCostDivider,
    downCostModifier,
    pacingStrategy,
    runnerArchetype,
    uphillEfficiencyScore,
    downhillAgilityScore,
    enduranceScore,
    flatSpeedKmh,
    estimatedTargetHours,
    estimatedTargetFormatted,
    referenceRaces: referenceRaces.slice(0, 5),
  };
}

