import {
  IntervalsActivity,
  RaceCalibrationProfile,
  calculateEmpiricalItraFromPerformance,
  analyzeRaceActivitiesForCalibration,
  estimateRaceTargetHoursForCourse,
} from './intervalsApi';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

export function normalizeStravaToken(rawToken?: string | null): string {
  if (!rawToken) return '';
  let clean = String(rawToken).trim();
  clean = clean.replace(/^["']+|["']+$/g, '').trim();
  if (/^Bearer\s+/i.test(clean)) {
    clean = clean.replace(/^Bearer\s+/i, '').trim();
  }
  return clean;
}

export function buildStravaOAuthUrl(params: { clientId?: string; redirectUri: string }): string {
  const effectiveClientId = String(
    params.clientId || process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID || ''
  ).trim();

  if (!effectiveClientId) {
    throw new Error(
      'Veuillez renseigner votre Client ID Strava (gratuit sur strava.com/settings/api) ou configurer NEXT_PUBLIC_STRAVA_CLIENT_ID.'
    );
  }

  const query = new URLSearchParams({
    client_id: effectiveClientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all,profile:read_all',
  });

  return `https://www.strava.com/oauth/authorize?${query.toString()}`;
}

export async function refreshStravaTokenIfNeeded(params: {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number | null;
  clientId?: string;
  clientSecret?: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt?: number | null;
}> {
  const cleanAccess = normalizeStravaToken(params.accessToken);
  const cleanRefresh = normalizeStravaToken(params.refreshToken);
  const nowSec = Math.floor(Date.now() / 1000);

  const shouldRefresh =
    cleanRefresh &&
    ((params.expiresAt && Number(params.expiresAt) > 0 && Number(params.expiresAt) < nowSec + 120) ||
      !cleanAccess);

  if (shouldRefresh) {
    try {
      const res = await fetch('/api/strava/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grantType: 'refresh_token',
          refreshToken: cleanRefresh,
          clientId: params.clientId,
          clientSecret: params.clientSecret,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken || cleanRefresh,
          expiresAt: data.expiresAt,
        };
      }
    } catch {
      // Fallback sur le token actuel
    }
  }

  return {
    accessToken: cleanAccess,
    refreshToken: cleanRefresh,
    expiresAt: params.expiresAt,
  };
}

export async function verifyAndResolveStravaConnection(params: {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number | null;
  clientId?: string;
  clientSecret?: string;
}): Promise<{
  ok: boolean;
  athleteId: string;
  athleteName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt?: number | null;
  weight?: number;
  error?: string;
}> {
  const tokenState = await refreshStravaTokenIfNeeded(params);
  let activeAccess = tokenState.accessToken;
  let activeRefresh = tokenState.refreshToken;
  let activeExpires = tokenState.expiresAt;

  if (!activeAccess) {
    return {
      ok: false,
      athleteId: '',
      athleteName: '',
      accessToken: '',
      refreshToken: activeRefresh,
      error: "Veuillez saisir votre Access Token Strava ou lier votre compte Strava dans Paramètres.",
    };
  }

  try {
    let res = await fetch(`${STRAVA_API_BASE}/athlete`, {
      headers: { Authorization: `Bearer ${activeAccess}` },
    });

    if (res.status === 401 && activeRefresh) {
      const retryRes = await fetch('/api/strava/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grantType: 'refresh_token',
          refreshToken: activeRefresh,
          clientId: params.clientId,
          clientSecret: params.clientSecret,
        }),
      });
      if (retryRes.ok) {
        const refreshed = await retryRes.json();
        activeAccess = refreshed.accessToken;
        activeRefresh = refreshed.refreshToken || activeRefresh;
        activeExpires = refreshed.expiresAt;
        res = await fetch(`${STRAVA_API_BASE}/athlete`, {
          headers: { Authorization: `Bearer ${activeAccess}` },
        });
      }
    }

    if (!res.ok) {
      return {
        ok: false,
        athleteId: '',
        athleteName: '',
        accessToken: activeAccess,
        refreshToken: activeRefresh,
        error:
          res.status === 401
            ? "Jeton Strava expiré ou invalide (Erreur 401). Renouvelez votre Access Token sur strava.com/settings/api ou reconnectez Strava via OAuth."
            : `Erreur API Strava (${res.status}).`,
      };
    }

    const ath = await res.json();
    const name =
      `${ath.firstname || ''} ${ath.lastname || ''}`.trim() ||
      ath.username ||
      `Athlète #${ath.id}`;

    return {
      ok: true,
      athleteId: String(ath.id),
      athleteName: name,
      accessToken: activeAccess,
      refreshToken: activeRefresh,
      expiresAt: activeExpires,
      weight: typeof ath.weight === 'number' && ath.weight > 30 ? Math.round(ath.weight * 10) / 10 : undefined,
    };
  } catch (err: any) {
    return {
      ok: false,
      athleteId: '',
      athleteName: '',
      accessToken: activeAccess,
      refreshToken: activeRefresh,
      error: err?.message || 'Impossible de contacter les serveurs Strava.',
    };
  }
}

export async function fetchStravaActivitiesList(params: {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number | null;
  clientId?: string;
  clientSecret?: string;
  days?: number;
}): Promise<{
  activities: (IntervalsActivity & { summary_polyline?: string })[];
  accessToken: string;
  refreshToken: string;
  expiresAt?: number | null;
  athleteName: string;
  athleteId: string;
}> {
  const verified = await verifyAndResolveStravaConnection(params);
  if (!verified.ok) {
    throw new Error(verified.error || 'Connexion Strava invalide.');
  }

  const days = params.days || 90;
  const afterEpoch = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  const url = `${STRAVA_API_BASE}/athlete/activities?after=${afterEpoch}&per_page=120`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${verified.accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Erreur lors de la récupération des activités Strava (${res.status}).`);
  }

  const rawActs = await res.json();
  if (!Array.isArray(rawActs)) {
    return {
      activities: [],
      accessToken: verified.accessToken,
      refreshToken: verified.refreshToken,
      expiresAt: verified.expiresAt,
      athleteName: verified.athleteName,
      athleteId: verified.athleteId,
    };
  }

  const explicitRegex = /\b(course|race|comp[eé]tition|dossard|utmb|templiers|saint[eé]lyon|diagonale)\b/i;
  const raceRegex = /\b(course|race|trail|ultra|marathon|semi|kv|10\s?km|20\s?km|dossard|comp[eé]tition|utmb|ut4m|templiers|saint[eé]lyon|diagonale|skytrail|skyrunning)\b/i;

  const activities = rawActs.map((a: any) => {
    const title = (a.name || '').trim();
    const sport = a.sport_type || a.type || 'Run';
    const isStravaWorkoutRace = Number(a.workout_type) === 1 || Number(a.workout_type) === 11;
    const isExplicitCourseTitle = isStravaWorkoutRace || explicitRegex.test(title);
    const isRace = isExplicitCourseTitle || (sport === 'TrailRun' && (a.distance || 0) >= 18000) || raceRegex.test(title);

    const distKm = (a.distance || 0) / 1000;
    const eleM = a.total_elevation_gain || 0;
    const kmEffort = distKm + eleM / 100;
    const totalSec = a.elapsed_time > a.moving_time ? a.elapsed_time : (a.moving_time || 3600);
    const hours = Math.max(0.25, totalSec / 3600);
    const isRunOrTrail = ['Run', 'TrailRun', 'VirtualRun', 'Hike', 'Walk'].includes(sport);
    const empiricalItra =
      isRunOrTrail && distKm >= 5
        ? calculateEmpiricalItraFromPerformance(distKm, eleM, hours, !isExplicitCourseTitle)
        : undefined;

    const has_gps = Boolean(
      (Array.isArray(a.start_latlng) && a.start_latlng.length === 2) ||
        a.map?.summary_polyline
    );

    return {
      id: a.id,
      name: title || 'Sortie Strava',
      type: sport,
      start_date_local: a.start_date_local || a.start_date || '',
      distance: a.distance || 0,
      moving_time: a.moving_time || 0,
      elapsed_time: a.elapsed_time || a.moving_time || 0,
      total_elevation_gain: eleM,
      average_speed: a.average_speed || undefined,
      average_heartrate: a.average_heartrate ? Math.round(a.average_heartrate) : undefined,
      max_heartrate: a.max_heartrate ? Math.round(a.max_heartrate) : undefined,
      icu_tss: a.suffer_score || undefined,
      has_gps,
      isRace,
      isExplicitCourseTitle,
      empiricalItra,
      kmEffort: Math.round(kmEffort * 10) / 10,
      summary_polyline: a.map?.summary_polyline || '',
    };
  });

  return {
    activities,
    accessToken: verified.accessToken,
    refreshToken: verified.refreshToken,
    expiresAt: verified.expiresAt,
    athleteName: verified.athleteName,
    athleteId: verified.athleteId,
  };
}

export async function fetchStravaStreams(
  activityId: string | number,
  accessToken: string
): Promise<Record<string, any[]> | null> {
  const cleanAccess = normalizeStravaToken(accessToken);
  if (!cleanAccess) return null;

  const keys = 'time,latlng,distance,altitude,velocity_smooth,heartrate,grade_smooth';
  const url = `${STRAVA_API_BASE}/activities/${activityId}/streams?keys=${keys}&key_by_type=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cleanAccess}` },
  });

  if (!res.ok) return null;
  const raw = await res.json();
  const map: Record<string, any[]> = {};

  if (Array.isArray(raw)) {
    for (const s of raw) {
      if (s && s.type && Array.isArray(s.data)) {
        map[s.type] = s.data;
      }
    }
  } else if (raw && typeof raw === 'object') {
    for (const k of Object.keys(raw)) {
      if (Array.isArray(raw[k])) map[k] = raw[k];
      else if (raw[k] && Array.isArray(raw[k].data)) map[k] = raw[k].data;
    }
  }

  return map;
}

export async function calibrateAthleteProfileWithStravaStreams(
  activities: IntervalsActivity[],
  accessToken: string,
  roadbookDistanceKm?: number,
  roadbookElevationGainM?: number,
  roadbookWaypointsCount?: number
): Promise<RaceCalibrationProfile | null> {
  const baseProfile = analyzeRaceActivitiesForCalibration(
    activities,
    roadbookDistanceKm,
    roadbookElevationGainM,
    roadbookWaypointsCount
  );
  if (!baseProfile) return null;

  const cleanAccess = normalizeStravaToken(accessToken);
  if (!cleanAccess) return baseProfile;

  const topRaceIds = baseProfile.referenceRaces.slice(0, 3).map((r) => r.id);

  let flatSpeedSum = 0, flatCount = 0;
  let upSpeedSum = 0, upCount = 0;
  let downFastSpeedSum = 0, downSteepSpeedSum = 0, downFastCount = 0, downSteepCount = 0;
  const walkTransitionGrades: number[] = [];
  const halfFadeRatios: number[] = [];
  let streamsAnalyzedCount = 0;

  for (const actId of topRaceIds) {
    try {
      const streams = await fetchStravaStreams(actId, cleanAccess);
      if (!streams) continue;
      const velArr = streams.velocity_smooth || [];
      const gradeArr = streams.grade_smooth || [];
      if (velArr.length < 60) continue;

      streamsAnalyzedCount++;
      const n = velArr.length;
      let firstHalfSpdSum = 0, firstHalfCnt = 0;
      let secondHalfSpdSum = 0, secondHalfCnt = 0;

      for (let i = 5; i < n; i += 3) {
        const vMs = Number(velArr[i]);
        if (!vMs || vMs < 0.45 || vMs > 7.5) continue;
        const vKmh = vMs * 3.6;

        if (i < n / 2) {
          firstHalfSpdSum += vKmh;
          firstHalfCnt++;
        } else {
          secondHalfSpdSum += vKmh;
          secondHalfCnt++;
        }

        const gradePct = gradeArr[i] !== undefined ? Number(gradeArr[i]) : NaN;
        if (isNaN(gradePct) || gradePct < -45 || gradePct > 45) continue;

        if (gradePct >= -2 && gradePct <= 2) {
          flatSpeedSum += vKmh;
          flatCount++;
        } else if (gradePct >= 6 && gradePct <= 16) {
          upSpeedSum += vKmh;
          upCount++;
          if (vKmh >= 4.7 && vKmh <= 6.2) {
            walkTransitionGrades.push(gradePct);
          }
        } else if (gradePct <= -4 && gradePct >= -11) {
          downFastSpeedSum += vKmh;
          downFastCount++;
        } else if (gradePct < -12 && gradePct >= -28) {
          downSteepSpeedSum += vKmh;
          downSteepCount++;
        }
      }

      if (firstHalfCnt > 20 && secondHalfCnt > 20) {
        const avg1 = firstHalfSpdSum / firstHalfCnt;
        const avg2 = secondHalfSpdSum / secondHalfCnt;
        if (avg1 > 0) {
          halfFadeRatios.push(Math.max(0, ((avg1 - avg2) / avg1) * 100));
        }
      }
    } catch {
      // ignore
    }
  }

  if (streamsAnalyzedCount === 0) return baseProfile;

  let recommendedWalkThreshold = baseProfile.recommendedWalkThreshold;
  if (walkTransitionGrades.length >= 8) {
    const avgW = walkTransitionGrades.reduce((a, b) => a + b, 0) / walkTransitionGrades.length;
    recommendedWalkThreshold = Math.max(6, Math.min(24, Math.round(recommendedWalkThreshold * 0.4 + avgW * 0.6)));
  }

  const flatSpeedKmh =
    flatCount > 20
      ? Number((flatSpeedSum / flatCount).toFixed(1))
      : baseProfile.flatSpeedKmh || 11.5;

  let recommendedUpCostDivider = baseProfile.recommendedUpCostDivider;
  let uphillEfficiencyScore = baseProfile.uphillEfficiencyScore || 65;
  if (upCount > 20 && flatSpeedKmh > 0) {
    const upRatio = (upSpeedSum / upCount) / flatSpeedKmh;
    const streamDiv = Math.round(Math.max(65, Math.min(115, 75 + (upRatio - 0.45) * 95)));
    recommendedUpCostDivider = Math.round(recommendedUpCostDivider * 0.4 + streamDiv * 0.6);
    uphillEfficiencyScore = Math.min(99, Math.max(30, Math.round(40 + (upRatio - 0.4) * 140)));
  }

  let recommendedDownCostModifier = baseProfile.recommendedDownCostModifier;
  let recommendedDescentThreshold = baseProfile.recommendedDescentThreshold;
  let downhillAgilityScore = baseProfile.downhillAgilityScore || 65;
  if (downFastCount > 15 && flatSpeedKmh > 0) {
    const modDownRatio = (downFastSpeedSum / downFastCount) / flatSpeedKmh;
    const steepDownRatio =
      downSteepCount > 10 ? (downSteepSpeedSum / downSteepCount) / flatSpeedKmh : modDownRatio * 0.82;
    const combinedDown = modDownRatio * 0.6 + steepDownRatio * 0.4;
    const streamDownMod = Number(Math.max(0.75, Math.min(1.25, 1.32 - combinedDown * 0.4)).toFixed(2));
    recommendedDownCostModifier = Number(
      (recommendedDownCostModifier * 0.4 + streamDownMod * 0.6).toFixed(2)
    );
    recommendedDescentThreshold = Math.round(
      Math.max(10, Math.min(26, 12 + (steepDownRatio / Math.max(0.5, modDownRatio)) * 12))
    );
    downhillAgilityScore = Math.min(99, Math.max(30, Math.round((combinedDown - 0.65) * 130)));
  }

  let recommendedFatiguePercent = baseProfile.recommendedFatiguePercent;
  let recommendedPacingStrategy = baseProfile.recommendedPacingStrategy;
  let enduranceScore = baseProfile.enduranceScore || 65;
  if (halfFadeRatios.length > 0) {
    const avgFade = halfFadeRatios.reduce((a, b) => a + b, 0) / halfFadeRatios.length;
    const streamFatigue = Math.round(Math.max(8, Math.min(42, 10 + avgFade * 1.15)));
    recommendedFatiguePercent = Math.round(recommendedFatiguePercent * 0.5 + streamFatigue * 0.5);
    enduranceScore = Math.min(99, Math.max(30, Math.round(100 - recommendedFatiguePercent * 1.55)));
    recommendedPacingStrategy =
      avgFade < 6 ? 'aggressive' : avgFade > 15 ? 'prudent' : 'regular';
  }

  let runnerArchetype = 'Traileur Polyvalent & Régulier';
  if (uphillEfficiencyScore >= downhillAgilityScore + 8 && uphillEfficiencyScore >= 68) {
    runnerArchetype = 'Grimpeur Montagnard';
  } else if (downhillAgilityScore >= uphillEfficiencyScore + 8 && downhillAgilityScore >= 68) {
    runnerArchetype = 'Descendeur Technique & Relanceur';
  } else if (enduranceScore >= 78) {
    runnerArchetype = 'Diesel Ultra-Endurant';
  }

  let estimatedTargetHoursForRoadbook = baseProfile.estimatedTargetHoursForRoadbook;
  let estimatedTargetFormatted = baseProfile.estimatedTargetFormatted;
  if (roadbookDistanceKm && roadbookDistanceKm > 0) {
    const pausesMin = (roadbookWaypointsCount || Math.floor(roadbookDistanceKm / 12)) * 4.0;
    const totalEstH = estimateRaceTargetHoursForCourse({
      distanceKm: roadbookDistanceKm,
      elevationGainM: roadbookElevationGainM || 0,
      itraIndex: baseProfile.avgEmpiricalItra,
      fatiguePercent: recommendedFatiguePercent,
      upCostDivider: recommendedUpCostDivider,
      downCostModifier: recommendedDownCostModifier,
      pauseMinutesTotal: pausesMin,
    });
    estimatedTargetHoursForRoadbook = totalEstH;
    const h = Math.floor(totalEstH);
    const m = Math.round((totalEstH % 1) * 60);
    estimatedTargetFormatted = m === 60 ? `${h + 1}h00` : `${h}h${String(m).padStart(2, '0')}`;
  }

  return {
    ...baseProfile,
    streamsAnalyzedCount,
    recommendedFatiguePercent,
    recommendedPacingStrategy,
    recommendedUpCostDivider,
    recommendedDownCostModifier,
    recommendedWalkThreshold,
    recommendedDescentThreshold,
    estimatedTargetHoursForRoadbook,
    estimatedTargetFormatted,
    runnerArchetype,
    flatSpeedKmh,
    uphillEfficiencyScore,
    downhillAgilityScore,
    enduranceScore,
  };
}

