/**
 * ============================================================
 * mykairn — Connecteur & Profileur Grand Public Strava (API v3)
 * ============================================================
 * - Connexion OAuth2 1-clic + Rafraîchissement automatique du token
 * - Support des clés API personnelles Strava (Access Token / Refresh Token)
 * - Détection native des courses Strava (`workout_type === 1`) + titres "Course" / "Trail"
 * - Profilage haute précision sur les flux GPS / Vitesse / Pente (`streams`)
 * - Import en 1 clic d'une sortie Strava (ou d'un itinéraire) en Roadbook complet
 */

import {
  deriveConfigFromITRA,
  calculateEmpiricalItraFromPerformance,
  estimateRaceTargetHours,
  calculateTraceStats,
} from './roadbookCalculator';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

/**
 * Nettoie un Access Token ou Refresh Token Strava copié par l'utilisateur
 */
export function normalizeStravaToken(rawToken) {
  if (!rawToken) return '';
  let clean = String(rawToken).trim();
  clean = clean.replace(/^["']+|["']+$/g, '').trim();
  if (/^Bearer\s+/i.test(clean)) {
    clean = clean.replace(/^Bearer\s+/i, '').trim();
  }
  return clean;
}

/**
 * Construit l'URL d'autorisation OAuth2 Strava (1-clic grand public)
 */
export function buildStravaOAuthUrl({ clientId, redirectUri }) {
  const effectiveClientId = String(
    clientId || process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID || ''
  ).trim();

  if (!effectiveClientId) {
    throw new Error(
      'Veuillez renseigner votre Client ID Strava (gratuit sur strava.com/settings/api) ou configurer NEXT_PUBLIC_STRAVA_CLIENT_ID.'
    );
  }

  const params = new URLSearchParams({
    client_id: effectiveClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all,profile:read_all',
  });

  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

/**
 * Échange un code d'autorisation OAuth Strava contre { accessToken, refreshToken, expiresAt, athlete }
 */
export async function exchangeStravaOAuthCode({ code, clientId, clientSecret }) {
  const res = await fetch('/api/strava/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grantType: 'authorization_code',
      code,
      clientId,
      clientSecret,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Erreur lors de la connexion OAuth Strava (${res.status}).`);
  }
  return data;
}

/**
 * Rafraîchit automatiquement un Access Token Strava expiré via son Refresh Token
 */
export async function refreshStravaAccessToken({ refreshToken, clientId, clientSecret }) {
  const cleanRefresh = normalizeStravaToken(refreshToken);
  if (!cleanRefresh) {
    throw new Error('Refresh Token Strava manquant pour renouveler la session.');
  }

  const res = await fetch('/api/strava/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grantType: 'refresh_token',
      refreshToken: cleanRefresh,
      clientId,
      clientSecret,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Impossible de rafraîchir le token Strava (${res.status}).`);
  }
  return data;
}

/**
 * S'assure que le token Strava est valide (le rafraîchit s'il est expiré ou s'il renvoie 401)
 */
export async function ensureValidStravaAccessToken({
  accessToken,
  refreshToken,
  expiresAt,
  clientId,
  clientSecret,
}) {
  const cleanAccess = normalizeStravaToken(accessToken);
  const cleanRefresh = normalizeStravaToken(refreshToken);
  const nowSec = Math.floor(Date.now() / 1000);

  // Si on a une date d'expiration passée (avec marge de 2 min) et un refreshToken + clientSecret
  if (
    cleanRefresh &&
    expiresAt &&
    Number(expiresAt) > 0 &&
    Number(expiresAt) < nowSec + 120 &&
    (clientSecret || process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID)
  ) {
    try {
      const refreshed = await refreshStravaAccessToken({
        refreshToken: cleanRefresh,
        clientId,
        clientSecret,
      });
      return {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken || cleanRefresh,
        expiresAt: refreshed.expiresAt,
        refreshed: true,
      };
    } catch {
      // On tente quand même avec l'accessToken actuel s'il est encore valide
    }
  }

  if (!cleanAccess && cleanRefresh) {
    const refreshed = await refreshStravaAccessToken({
      refreshToken: cleanRefresh,
      clientId,
      clientSecret,
    });
    return {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || cleanRefresh,
      expiresAt: refreshed.expiresAt,
      refreshed: true,
    };
  }

  return {
    accessToken: cleanAccess,
    refreshToken: cleanRefresh,
    expiresAt: expiresAt || null,
    refreshed: false,
  };
}

/**
 * Décode une Google Encoded Polyline (utilisée par Strava dans `map.summary_polyline`)
 * en tableau de points `[{ lat, lon, ele: 0 }]`.
 */
export function decodeStravaPolyline(encoded) {
  if (!encoded || typeof encoded !== 'string') return [];
  const points = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({
      lat: lat / 1e5,
      lon: lng / 1e5,
      ele: 0,
    });
  }

  return points;
}

/**
 * Teste la connexion Strava et récupère le profil de l'athlète connecté (`GET /api/v3/athlete`)
 */
export async function verifyStravaConnection({
  accessToken,
  refreshToken,
  expiresAt,
  clientId,
  clientSecret,
}) {
  const tokenState = await ensureValidStravaAccessToken({
    accessToken,
    refreshToken,
    expiresAt,
    clientId,
    clientSecret,
  });

  let activeAccessToken = tokenState.accessToken;
  let activeRefreshToken = tokenState.refreshToken;
  let activeExpiresAt = tokenState.expiresAt;

  if (!activeAccessToken) {
    throw new Error(
      'Veuillez vous connecter avec Strava (1-clic) ou saisir votre Access Token Strava.'
    );
  }

  let res = await fetch(`${STRAVA_API_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${activeAccessToken}` },
  });

  // Si 401 et qu'on dispose d'un refreshToken + identifiants, on rafraîchit automatiquement
  if (res.status === 401 && activeRefreshToken) {
    try {
      const refreshed = await refreshStravaAccessToken({
        refreshToken: activeRefreshToken,
        clientId,
        clientSecret,
      });
      activeAccessToken = refreshed.accessToken;
      activeRefreshToken = refreshed.refreshToken || activeRefreshToken;
      activeExpiresAt = refreshed.expiresAt;
      res = await fetch(`${STRAVA_API_BASE}/athlete`, {
        headers: { Authorization: `Bearer ${activeAccessToken}` },
      });
    } catch {
      // L'erreur 401 sera gérée ci-dessous
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        'Jeton Strava expiré ou invalide (Erreur 401). Cliquez sur "Se connecter avec Strava" ou rafraîchissez votre Access Token sur strava.com/settings/api.'
      );
    }
    throw new Error(`Erreur API Strava (${res.status} ${res.statusText})`);
  }

  const athlete = await res.json();
  const fullName =
    `${athlete.firstname || ''} ${athlete.lastname || ''}`.trim() ||
    athlete.username ||
    `Athlète #${athlete.id}`;

  return {
    athleteId: String(athlete.id),
    athleteName: fullName,
    avatarUrl: athlete.profile || athlete.profile_medium || null,
    weight:
      typeof athlete.weight === 'number' && athlete.weight > 30
        ? Math.round(athlete.weight * 10) / 10
        : undefined,
    city: athlete.city || '',
    accessToken: activeAccessToken,
    refreshToken: activeRefreshToken,
    expiresAt: activeExpiresAt,
  };
}

/**
 * Récupère la liste des activités Strava de l'athlète sur les N derniers jours
 */
export async function fetchStravaActivities({
  accessToken,
  refreshToken,
  expiresAt,
  clientId,
  clientSecret,
  days = 365,
  perPage = 120,
}) {
  const verified = await verifyStravaConnection({
    accessToken,
    refreshToken,
    expiresAt,
    clientId,
    clientSecret,
  });

  const afterEpoch = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  const url = `${STRAVA_API_BASE}/athlete/activities?after=${afterEpoch}&per_page=${Math.min(200, perPage)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${verified.accessToken}` },
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Autorisation de lecture des activités Strava manquante (scope 'activity:read_all' requis). Reconnectez-vous via le bouton OAuth Strava."
      );
    }
    throw new Error(`Erreur lors de la récupération des activités Strava (${res.status}).`);
  }

  const rawActs = await res.json();
  if (!Array.isArray(rawActs)) return { activities: [], verified };

  const explicitRegex = /\b(course|race|comp[eé]tition|dossard|utmb|templiers|saint[eé]lyon|diagonale)\b/i;
  const raceRegex = /\b(course|race|trail|ultra|marathon|semi|kv|10\s?km|20\s?km|dossard|comp[eé]tition|utmb|ut4m|templiers|saint[eé]lyon|diagonale|skytrail|skyrunning)\b/i;

  const activities = rawActs.map((a) => {
    const title = (a.name || '').trim();
    const sport = a.sport_type || a.type || 'Run';
    // Sur Strava, workout_type === 1 signifie que l'athlète a tagué la course comme "Course / Compétition" !
    const isStravaWorkoutRace = Number(a.workout_type) === 1 || Number(a.workout_type) === 11;
    const isExplicit = isStravaWorkoutRace || explicitRegex.test(title);
    const isRace = isExplicit || (sport === 'TrailRun' && (a.distance || 0) >= 18000) || raceRegex.test(title);

    const distKm = (a.distance || 0) / 1000;
    const eleM = a.total_elevation_gain || 0;
    const ke = distKm + eleM / 100;
    const sec = a.elapsed_time > a.moving_time ? a.elapsed_time : (a.moving_time || 3600);
    const h = Math.max(0.25, sec / 3600);
    const isRunOrTrail = ['Run', 'TrailRun', 'VirtualRun', 'Hike', 'Walk'].includes(sport) || ['Run', 'TrailRun', 'Hike', 'Walk'].includes(a.type);
    const empiricalItra =
      isRunOrTrail && distKm >= 5
        ? calculateEmpiricalItraFromPerformance(distKm, eleM, h, !isExplicit)
        : undefined;

    const hasGps = Boolean(
      (Array.isArray(a.start_latlng) && a.start_latlng.length === 2) ||
        a.map?.summary_polyline
    );

    return {
      id: a.id,
      name: title || 'Sortie Strava',
      type: sport,
      start_date_local: a.start_date_local || a.start_date || '',
      distance: a.distance || 0,
      distKm: Math.round(distKm * 100) / 100,
      total_elevation_gain: eleM,
      eleM: Math.round(eleM),
      ke: Math.round(ke * 10) / 10,
      moving_time: a.moving_time || 0,
      elapsed_time: a.elapsed_time || a.moving_time || 0,
      average_speed: a.average_speed || 0,
      average_heartrate: a.average_heartrate || undefined,
      max_heartrate: a.max_heartrate || undefined,
      suffer_score: a.suffer_score || undefined,
      workout_type: a.workout_type,
      isStravaWorkoutRace,
      isExplicitCourseTitle: isExplicit,
      isRace,
      empiricalItra,
      has_gps: hasGps,
      summary_polyline: a.map?.summary_polyline || '',
    };
  });

  return {
    activities,
    verified,
  };
}

/**
 * Récupère les flux haute résolution d'une activité Strava :
 * `time,latlng,distance,altitude,velocity_smooth,heartrate,grade_smooth`
 */
export async function fetchStravaActivityStreams(activityId, accessToken) {
  const cleanAccess = normalizeStravaToken(accessToken);
  const keys = 'time,latlng,distance,altitude,velocity_smooth,heartrate,grade_smooth';
  const url = `${STRAVA_API_BASE}/activities/${activityId}/streams?keys=${keys}&key_by_type=true`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cleanAccess}` },
  });

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
      if (Array.isArray(raw[k])) {
        streamMap[k] = raw[k];
      } else if (raw[k] && Array.isArray(raw[k].data)) {
        streamMap[k] = raw[k].data;
      }
    }
  }

  return streamMap;
}

/**
 * Convertit une activité Strava + ses flux GPS/Altitude en données de Roadbook mykairn
 * (`{ name, stats, points, waypoints }`), prêt à être sauvegardé dans Firestore !
 */
export async function convertStravaActivityToRoadbook(activity, accessToken) {
  const streams = await fetchStravaActivityStreams(activity.id, accessToken);
  let points = [];

  if (streams && Array.isArray(streams.latlng) && streams.latlng.length > 0) {
    const latlng = streams.latlng;
    const alt = Array.isArray(streams.altitude) ? streams.altitude : [];

    // Sous-échantillonnage intelligent si la trace dépasse 3500 points pour garder un Firestore léger et fluide
    const step = latlng.length > 3500 ? Math.ceil(latlng.length / 3000) : 1;
    for (let i = 0; i < latlng.length; i += step) {
      const pair = latlng[i];
      if (Array.isArray(pair) && pair.length >= 2) {
        points.push({
          lat: Number(pair[0].toFixed(6)),
          lon: Number(pair[1].toFixed(6)),
          ele: typeof alt[i] === 'number' ? Math.round(alt[i] * 10) / 10 : 0,
        });
      }
    }
    // Toujours inclure le tout dernier point
    const lastIdx = latlng.length - 1;
    if ((lastIdx % step) !== 0 && Array.isArray(latlng[lastIdx])) {
      points.push({
        lat: Number(latlng[lastIdx][0].toFixed(6)),
        lon: Number(latlng[lastIdx][1].toFixed(6)),
        ele: typeof alt[lastIdx] === 'number' ? Math.round(alt[lastIdx] * 10) / 10 : 0,
      });
    }
  } else if (activity.summary_polyline) {
    points = decodeStravaPolyline(activity.summary_polyline);
  }

  if (points.length < 2) {
    throw new Error("Cette activité Strava ne contient pas de trace GPS exploitable.");
  }

  const smoothedStats = calculateTraceStats(points);
  let minEle = Infinity;
  let maxEle = -Infinity;
  for (const p of points) {
    if (p.ele < minEle) minEle = p.ele;
    if (p.ele > maxEle) maxEle = p.ele;
  }

  const finalDistKm =
    smoothedStats.distance > 0
      ? smoothedStats.distance
      : Math.round(((activity.distance || 0) / 1000) * 100) / 100;
  const finalPosM =
    smoothedStats.elevation.pos > 0
      ? smoothedStats.elevation.pos
      : Math.round(activity.total_elevation_gain || 0);

  const stats = {
    distance: finalDistKm,
    elevation: {
      max: Number.isFinite(maxEle) ? Math.round(maxEle) : 0,
      min: Number.isFinite(minEle) ? Math.round(minEle) : 0,
      pos: finalPosM,
      neg: smoothedStats.elevation.neg || finalPosM,
    },
  };

  return {
    name: activity.name || 'Roadbook Strava',
    stats,
    points,
    waypoints: [],
  };
}

/**
 * Analyse les Courses Strava (`workout_type === 1` ou intitulées "Course" / "Trail")
 * + les flux GPS/Pente/Vitesse des 3 meilleures compétitions pour profiler l'athlète grand public.
 */
export async function profileAthleteFromStravaRaces({
  accessToken,
  refreshToken,
  expiresAt,
  clientId,
  clientSecret,
  targetDistanceKm = null,
  targetElevationGainM = null,
  pauseMinutesTotal = 0,
}) {
  const { activities, verified } = await fetchStravaActivities({
    accessToken,
    refreshToken,
    expiresAt,
    clientId,
    clientSecret,
    days: 365,
    perPage: 150,
  });

  const runActs = activities.filter(
    (a) =>
      (['Run', 'TrailRun', 'VirtualRun', 'Hike', 'Walk'].includes(a.type)) &&
      a.distKm >= 5
  );

  let raceActs = runActs.filter((a) => a.isRace);
  let usedFallbackLongRuns = false;

  if (raceActs.length === 0) {
    raceActs = runActs
      .filter((a) => a.distKm >= 12)
      .sort((a, b) => (b.ke || 0) - (a.ke || 0))
      .slice(0, 6);
    usedFallbackLongRuns = true;
  }

  if (raceActs.length === 0 && runActs.length > 0) {
    raceActs = [...runActs].sort((a, b) => (b.ke || 0) - (a.ke || 0)).slice(0, 5);
    usedFallbackLongRuns = true;
  }

  if (raceActs.length === 0) {
    throw new Error(
      "Aucune course à pied ou sortie trail (> 5 km) trouvée sur les 12 derniers mois dans votre compte Strava."
    );
  }

  const explicitCount = raceActs.filter((a) => a.isExplicitCourseTitle).length;

  let weightedItraSum = 0;
  let totalWeight = 0;
  let peakItra = 0;
  let weightedStopRatio = 0;
  let avgVertRatio = 0;

  const referenceRaces = [];

  for (const act of raceActs) {
    const itra = act.empiricalItra || 500;
    const trailRelevance =
      (act.ke >= 28 ? 1.35 : act.ke >= 18 ? 1.0 : 0.65) *
      (act.eleM / Math.max(1, act.distKm) >= 30 ? 1.25 : 0.85);
    let w = (act.isExplicitCourseTitle ? 2.5 : 1.0) * trailRelevance;

    if (targetDistanceKm && targetDistanceKm > 0) {
      const distDiffRatio =
        Math.abs(act.distKm - targetDistanceKm) / Math.max(12, targetDistanceKm);
      if (distDiffRatio < 0.35) w *= 1.5;
    }

    weightedItraSum += itra * w;
    totalWeight += w;
    if (itra > peakItra && act.ke >= 18) peakItra = itra;

    const moving = act.moving_time || act.elapsed_time || 3600;
    const elapsed = Math.max(moving, act.elapsed_time || moving);
    const stopRatio = Math.max(0, (elapsed - moving) / elapsed);
    weightedStopRatio += stopRatio * w;

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
      hasGps: act.has_gps,
    });
  }

  const avgItra = Math.round(weightedItraSum / (totalWeight || 1));
  if (!peakItra) peakItra = avgItra;
  const blendedItra = Math.round(avgItra * 0.9 + peakItra * 0.1);
  const meanStopRatio = weightedStopRatio / (totalWeight || 1);
  const meanVertRatio = avgVertRatio / (totalWeight || 1);

  const baseDerived = deriveConfigFromITRA(blendedItra);
  let fatiguePercent = Math.round(
    Math.max(8, Math.min(45, baseDerived.fatiguePercent + meanStopRatio * 22))
  );
  let walkThreshold = Math.round(
    Math.max(
      6,
      Math.min(
        24,
        baseDerived.walkThreshold + (meanVertRatio > 55 ? 2 : meanVertRatio > 35 ? 1 : 0)
      )
    )
  );
  let descentThreshold = Math.round(
    Math.max(10, Math.min(26, baseDerived.descentThreshold + (meanVertRatio > 50 ? 2 : 0)))
  );
  let upCostDivider = Math.round(
    Math.max(
      65,
      Math.min(
        115,
        baseDerived.upCostDivider + (meanVertRatio > 55 ? 6 : meanVertRatio < 20 ? -4 : 0)
      )
    )
  );
  let downCostModifier = Number(
    Math.max(
      0.75,
      Math.min(1.25, baseDerived.downCostModifier - (meanVertRatio > 50 ? 0.05 : 0))
    ).toFixed(2)
  );
  let pacingStrategy =
    meanStopRatio < 0.04 ? 'aggressive' : meanStopRatio > 0.12 ? 'prudent' : 'regular';

  // Analyse haute précision sur les flux GPS/Pente/Vitesse des 3 meilleures courses Strava
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
      const streams = await fetchStravaActivityStreams(act.id, verified.accessToken);
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
          uphillRatioSum += actUpSum / actUpCnt / actFlatKmh;
          uphillRatioCount++;
        }
        if (actModDownCnt > 15) {
          modDownRatioSum += actModDownSum / actModDownCnt / actFlatKmh;
          modDownCount++;
        }
        if (actSteepDownCnt > 10) {
          steepDownRatioSum += actSteepDownSum / actSteepDownCnt / actFlatKmh;
          steepDownCount++;
        }
      }

      if (transitionGrades.length >= 8) {
        const avgWalkG =
          transitionGrades.reduce((a, b) => a + b, 0) / transitionGrades.length;
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
      // Ignorer si un stream est indisponible
    }
  }

  const flatSpeedKmh =
    flatCount > 0
      ? Math.round((flatSpeedSum / flatCount) * 10) / 10
      : Math.round((blendedItra / 1000) * 19.5 * 10) / 10;

  let uphillEfficiencyScore = Math.min(
    98,
    Math.max(35, Math.round((upCostDivider - 55) * 1.4))
  );
  let downhillAgilityScore = Math.min(
    98,
    Math.max(35, Math.round((1.3 - downCostModifier) * 125))
  );
  let enduranceScore = Math.min(
    98,
    Math.max(35, Math.round(100 - fatiguePercent * 1.6))
  );

  if (walkGradeCount > 0) {
    const empiricalWalk = Math.round(walkGradeSum / walkGradeCount);
    walkThreshold = Math.max(
      6,
      Math.min(24, Math.round(walkThreshold * 0.4 + empiricalWalk * 0.6))
    );
  }

  if (uphillRatioCount > 0) {
    const upRatio = uphillRatioSum / uphillRatioCount;
    const streamUpDivider = Math.round(
      Math.max(65, Math.min(115, 75 + (upRatio - 0.45) * 95))
    );
    upCostDivider = Math.round(upCostDivider * 0.4 + streamUpDivider * 0.6);
    uphillEfficiencyScore = Math.min(
      99,
      Math.max(30, Math.round(40 + (upRatio - 0.4) * 140))
    );
  }

  if (modDownCount > 0) {
    const modDownRatio = modDownRatioSum / modDownCount;
    const steepDownRatio =
      steepDownCount > 0 ? steepDownRatioSum / steepDownCount : modDownRatio * 0.82;
    const combinedDown = modDownRatio * 0.6 + steepDownRatio * 0.4;
    const streamDownMod = Number(
      Math.max(0.75, Math.min(1.25, 1.32 - combinedDown * 0.4)).toFixed(2)
    );
    downCostModifier = Number(
      (downCostModifier * 0.4 + streamDownMod * 0.6).toFixed(2)
    );
    descentThreshold = Math.round(
      Math.max(
        10,
        Math.min(26, 12 + (steepDownRatio / Math.max(0.5, modDownRatio)) * 12)
      )
    );
    downhillAgilityScore = Math.min(
      99,
      Math.max(30, Math.round((combinedDown - 0.65) * 130))
    );
  }

  if (speedFadeCount > 0) {
    const avgFade = speedFadeSum / speedFadeCount;
    const streamFatigue = Math.round(
      Math.max(8, Math.min(45, 10 + avgFade * 1.15))
    );
    fatiguePercent = Math.round(fatiguePercent * 0.5 + streamFatigue * 0.5);
    enduranceScore = Math.min(
      99,
      Math.max(30, Math.round(100 - fatiguePercent * 1.55))
    );
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
    estimatedTargetFormatted =
      m === 60 ? `${h + 1}h00` : `${h}h${m < 10 ? `0${m}` : m}`;
  }

  return {
    source: 'STRAVA',
    stravaAthleteId: verified.athleteId,
    athleteName: verified.athleteName,
    avatarUrl: verified.avatarUrl,
    weight: verified.weight,
    accessToken: verified.accessToken,
    refreshToken: verified.refreshToken,
    expiresAt: verified.expiresAt,
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

