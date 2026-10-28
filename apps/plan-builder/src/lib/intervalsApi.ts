import { Workout } from '@/types';
import { generateIntervalsWorkoutText } from './trainingEngine';

const SPORT_COLORS: Record<string, string> = {
  'Run': '#FF4500', // Orange-red
  'Ride': '#1E90FF', // Dodger blue
  'Swim': '#00CED1', // Dark turquoise
  'Strength': '#8A2BE2', // Blue violet
  'Walk': '#32CD32', // Lime green
  'Yoga': '#FF69B4', // Hot pink
  'Rowing': '#D2691E', // Chocolate
  'Other': '#808080' // Gray
};

/**
 * Normalise la clé API Intervals.icu pour éviter les erreurs 401 (espaces, préfixe API_KEY:, Bearer, guillemets).
 */
export function normalizeIntervalsApiKey(rawKey?: string | null): string {
  if (!rawKey) return '';
  let k = String(rawKey).trim();
  k = k.replace(/^["']|["']$/g, '').trim();
  if (/^basic\s+/i.test(k)) {
    k = k.replace(/^basic\s+/i, '').trim();
    try {
      const decoded = typeof atob !== 'undefined' ? atob(k) : Buffer.from(k, 'base64').toString('utf-8');
      if (decoded.startsWith('API_KEY:')) {
        k = decoded.slice('API_KEY:'.length).trim();
      }
    } catch {
      // ignore
    }
  }
  if (/^bearer\s+/i.test(k)) {
    k = k.replace(/^bearer\s+/i, '').trim();
  }
  if (/^api_key:/i.test(k)) {
    k = k.replace(/^api_key:/i, '').trim();
  }
  return k.replace(/\s+/g, '');
}

/**
 * Normalise l'ID Athlète Intervals.icu :
 * - Extrait `i123456` si l'utilisateur a collé une URL complète d'Intervals.icu
 * - Ajoute automatiquement le `i` devant un identifiant purement numérique (ex: "467323" -> "i467323")
 * - Retourne `'0'` (raccourci officiel d'Intervals.icu pour le propriétaire de la clé API) si vide ou si email collé par erreur
 */
export function normalizeIntervalsAthleteId(rawId?: string | null): string {
  if (!rawId) return '0';
  let id = String(rawId).trim();
  if (!id || id.includes('@')) return '0';

  const urlMatch = id.match(/\b(i\d{3,10})\b/i);
  if (urlMatch) {
    return urlMatch[1].toLowerCase();
  }
  if (/^\d{3,10}$/.test(id)) {
    return `i${id}`;
  }
  if (/^i\d+$/i.test(id)) {
    return id.toLowerCase();
  }
  if (id === '0') return '0';
  return id;
}

/**
 * Construit le header HTTP Basic Auth officiel d'Intervals.icu (`API_KEY:<key>`)
 */
export function getBasicAuth(apiKey: string): string {
  const cleanKey = normalizeIntervalsApiKey(apiKey);
  if (typeof btoa !== 'undefined') {
    return 'Basic ' + btoa(`API_KEY:${cleanKey}`);
  }
  return 'Basic ' + Buffer.from(`API_KEY:${cleanKey}`).toString('base64');
}

/**
 * Effectue un appel GET ou POST sur `/api/v1/athlete/{athleteId}{subPath}` avec fallback automatique
 * sur `/api/v1/athlete/0{subPath}` si l'ID athlète saisi provoque une erreur 401/403/404.
 */
async function fetchAthleteEndpointWithFallback(
  athleteId: string,
  apiKey: string,
  subPath: string = '',
  init?: RequestInit
): Promise<{ response: Response; resolvedAthleteId: string }> {
  const cleanKey = normalizeIntervalsApiKey(apiKey);
  if (!cleanKey) {
    throw new Error('Clé API Intervals.icu manquante.');
  }

  const normalizedId = normalizeIntervalsAthleteId(athleteId);
  const headers = new Headers(init?.headers || {});
  headers.set('Authorization', getBasicAuth(cleanKey));
  headers.set('Content-Type', 'application/json');

  const primaryUrl = `https://intervals.icu/api/v1/athlete/${normalizedId}${subPath}`;
  let response = await fetch(primaryUrl, { ...init, headers });

  if (!response.ok && (response.status === 401 || response.status === 403 || response.status === 404) && normalizedId !== '0') {
    const fallbackUrl = `https://intervals.icu/api/v1/athlete/0${subPath}`;
    const fallbackRes = await fetch(fallbackUrl, { ...init, headers });
    if (fallbackRes.ok) {
      return { response: fallbackRes, resolvedAthleteId: '0' };
    }
    response = fallbackRes;
  }

  return { response, resolvedAthleteId: normalizedId };
}

/**
 * Teste la connexion Intervals.icu et résout automatiquement le vrai ID Athlète (`i...`), le nom et la FTP/Poids.
 */
export async function verifyAndResolveIntervalsConnection(
  athleteId: string,
  apiKey: string
): Promise<{
  ok: boolean;
  resolvedAthleteId: string;
  athleteName: string;
  ctl?: number;
  weight?: number;
  error?: string;
}> {
  const cleanKey = normalizeIntervalsApiKey(apiKey);
  if (!cleanKey) {
    return {
      ok: false,
      resolvedAthleteId: '',
      athleteName: '',
      error: 'Veuillez saisir votre Clé API personnelle (Developer Settings > API Key).',
    };
  }

  try {
    const { response } = await fetchAthleteEndpointWithFallback(athleteId || '0', cleanKey, '');
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          resolvedAthleteId: normalizeIntervalsAthleteId(athleteId),
          athleteName: '',
          error:
            "Erreur 401 (Accès refusé) : votre Clé API est invalide ou expirée. Vérifiez que vous avez bien copié la 'API Key' située tout en bas de intervals.icu/settings (section Developer Settings), et non votre mot de passe.",
        };
      }
      return {
        ok: false,
        resolvedAthleteId: normalizeIntervalsAthleteId(athleteId),
        athleteName: '',
        error: `Erreur Intervals.icu (${response.status}). Vérifiez votre clé API et votre ID Athlète.`,
      };
    }

    const data = await response.json();
    const realId = data?.id ? String(data.id) : normalizeIntervalsAthleteId(athleteId);
    const name = data?.name || `${data?.firstname || ''} ${data?.lastname || ''}`.trim() || realId;
    const ctl = data?.icu?.ctl ?? data?.ctl;
    const weight = data?.icu?.weight ?? data?.weight;

    return {
      ok: true,
      resolvedAthleteId: realId,
      athleteName: name,
      ctl: ctl !== undefined ? Math.round(ctl) : undefined,
      weight: weight !== undefined ? Number(weight) : undefined,
    };
  } catch (err: any) {
    return {
      ok: false,
      resolvedAthleteId: normalizeIntervalsAthleteId(athleteId),
      athleteName: '',
      error: err?.message || 'Impossible de contacter les serveurs Intervals.icu.',
    };
  }
}

/**
 * Uploads a list of workouts to Intervals.icu
 * Requires the user's Intervals.icu Athlete ID and API Key.
 */
export async function uploadWorkoutsToIntervals(
  athleteId: string,
  apiKey: string,
  workouts: Workout[],
  isSimplified: boolean = true
) {
  if (!workouts || workouts.length === 0) {
    return [];
  }

  const payload = workouts.map((workout) => ({
    category: 'WORKOUT',
    type: workout.sport || 'Run', // Use actual sport
    start_date_local: workout.date.toISOString().split('T')[0] + 'T00:00:00', // Just dates for now
    name: workout.name,
    description: generateIntervalsWorkoutText(workout, isSimplified),
    external_id: workout.id, // Using our internal ID for upserting
    color: SPORT_COLORS[workout.sport || 'Run'] || SPORT_COLORS['Other']
  }));

  const { response } = await fetchAthleteEndpointWithFallback(
    athleteId,
    apiKey,
    '/events/bulk?upsert=true',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to upload workouts to Intervals.icu: ${response.status} - ${errorBody}`);
  }

  return response.json();
}

/**
 * Deletes a list of previously exported workouts from Intervals.icu
 * using their external_id (which corresponds to our internal workout id).
 */
export async function deleteWorkoutsFromIntervals(
  athleteId: string,
  apiKey: string,
  workouts: Workout[]
) {
  const payload = workouts.map((workout) => ({
    external_id: workout.id,
  }));

  const { response } = await fetchAthleteEndpointWithFallback(
    athleteId,
    apiKey,
    '/events/bulk-delete',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to delete workouts from Intervals.icu: ${response.status} - ${errorBody}`);
  }

  return response.json();
}

/**
 * Fetches the athlete's current wellness or load (CTL, ATL).
 * We use the standard /athlete/{id} endpoint which provides summary metrics.
 */
export async function fetchAthleteLoad(athleteId: string, apiKey: string) {
  const cleanKey = normalizeIntervalsApiKey(apiKey);
  const headers = new Headers();
  headers.append('Authorization', getBasicAuth(cleanKey));
  headers.append('Content-Type', 'application/json');

  try {
    const { response, resolvedAthleteId } = await fetchAthleteEndpointWithFallback(athleteId, cleanKey, '');
    if (!response.ok) {
      throw new Error(`Failed to fetch athlete data: ${response.status}`);
    }
    const data = await response.json();
    const effectiveId = data?.id || resolvedAthleteId;
    
    // Pour le coach (ou les athlètes complets), le CTL/ATL exact est dans les données de wellness.
    // On va chercher le wellness d'aujourd'hui.
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const wellnessUrl = `https://intervals.icu/api/v1/athlete/${effectiveId}/wellness?oldest=${today}`;
    
    let ctl = data?.icu?.ctl || data?.ctl || 0;
    let atl = data?.icu?.atl || data?.atl || 0;
    
    try {
      const wellnessResponse = await fetch(wellnessUrl, { headers });
      if (wellnessResponse.ok) {
        const wellnessData = await wellnessResponse.json();
        if (Array.isArray(wellnessData) && wellnessData.length > 0) {
          const todayWellness = wellnessData[wellnessData.length - 1];
          ctl = todayWellness.ctl ?? ctl;
          atl = todayWellness.atl ?? atl;
        }
      }
    } catch (e) {
      console.warn("Could not fetch wellness data", e);
    }

    const form = ctl - atl;
    
    // Fetch activities for the past 4 weeks to calculate average weekly TSS
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const activitiesUrl = `https://intervals.icu/api/v1/athlete/${effectiveId}/activities?oldest=${fourWeeksAgo}&newest=${today}`;
    
    let avgWeeklyTss = 0;
    try {
      const activitiesResponse = await fetch(activitiesUrl, { headers });
      if (activitiesResponse.ok) {
        const activitiesData = await activitiesResponse.json();
        if (Array.isArray(activitiesData)) {
          const totalTss = activitiesData.reduce((sum, act) => sum + (act.icu_tss || act.tss || 0), 0);
          avgWeeklyTss = Math.round(totalTss / 4);
        }
      }
    } catch (e) {
      console.warn("Could not fetch past activities for TSS", e);
    }
    
    // Extractions avancées
    const ftp = data?.icu?.ftp || data?.ftp || data?.run_ftp || null;
    const weight = data?.icu?.weight || data?.weight || null;
    const restingHR = data?.icu?.restingHR || data?.resting_hr || data?.icu?.resting_hr || null;
    const thresholdPace = data?.icu?.threshold_pace || data?.run_threshold_pace || null;
    const name = data?.name || `${data?.firstname || ''} ${data?.lastname || ''}`.trim();
    
    return {
      ctl: Math.round(ctl),
      atl: Math.round(atl),
      form: Math.round(form),
      avgWeeklyTss,
      ftp,
      weight,
      restingHR,
      thresholdPace,
      name
    };
  } catch (error) {
    console.error("Error fetching athlete load:", error);
    return null;
  }
}

/**
 * Fetches the list of athletes coached by the user.
 */
export async function fetchCoachedAthletes(coachId: string, apiKey: string) {
  const cleanKey = normalizeIntervalsApiKey(apiKey);
  const normId = normalizeIntervalsAthleteId(coachId);
  
  const headers = new Headers();
  headers.append('Authorization', getBasicAuth(cleanKey));
  headers.append('Content-Type', 'application/json');

  try {
    let url = `https://intervals.icu/api/v1/athlete/${normId}/athletes`;
    let response = await fetch(url, { headers });
    
    if (!response.ok) {
      url = `https://intervals.icu/api/v1/athlete/${normId}/athlete-summary`;
      response = await fetch(url, { headers });
    }

    if (!response.ok && normId !== '0') {
      url = `https://intervals.icu/api/v1/athlete/0/athlete-summary`;
      response = await fetch(url, { headers });
    }
    
    if (!response.ok) {
      const { response: fallbackResponse } = await fetchAthleteEndpointWithFallback(normId, cleanKey, '');
      if (!fallbackResponse.ok) {
        throw new Error(`Erreur Intervals.icu (${fallbackResponse.status}) : vérifiez que votre Clé API Developer (Settings > Developer Settings > API Key) est valide.`);
      }
      const data = await fallbackResponse.json();
      return [data];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [data];
  } catch (error: any) {
    if (error.message !== "403_FORBIDDEN") {
      console.error("Error fetching coached athletes:", error);
    }
    throw error;
  }
}

/**
 * Uploads training phases as calendar notes to Intervals.icu
 */
export async function uploadPhasesToIntervals(
  athleteId: string,
  apiKey: string,
  plan: any, // Macrocycle type
  maxWeeks?: number
) {
  if (!plan || !plan.mesocycles || plan.mesocycles.length === 0) {
    return [];
  }

  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/events/bulk?upsert=true`;
  
  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'Base': return 'green';
      case 'Build': return 'blue';
      case 'Peak': return 'orange';
      case 'Taper': return 'yellow';
      case 'Recovery': return 'gray';
      default: return 'green';
    }
  };

  let currentDate = new Date(plan.startDate);
  let accumulatedWeeks = 0;
  
  const payload = plan.mesocycles
    .filter((meso: any) => {
      if (maxWeeks === undefined) return true;
      return accumulatedWeeks < maxWeeks;
    })
    .map((meso: any, idx: number) => {
      const weeksToInclude = (maxWeeks !== undefined && accumulatedWeeks + meso.weeks > maxWeeks)
        ? (maxWeeks - accumulatedWeeks)
        : meso.weeks;

      const startDate = new Date(currentDate);
      // Add weeks * 7 days to get the end date
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + (weeksToInclude * 7) - 1);
      
      // Update currentDate and accumulatedWeeks for the next mesocycle
      currentDate.setDate(currentDate.getDate() + (meso.weeks * 7));
      accumulatedWeeks += meso.weeks;

    // Combine plan name and phase name. If plan name has Saimaa Cycle Tour, we can use it.
    let noteName = `${meso.phase} Phase`;
    if (plan.name) {
      noteName = `${plan.name} - ${meso.phase}`;
    }

    return {
      category: 'NOTE',
      name: noteName,
      description: `Plan: ${plan.name}\nWeeks: ${weeksToInclude}`,
      start_date_local: startDate.toISOString().split('T')[0] + 'T00:00:00',
      end_date_local: endDate.toISOString().split('T')[0] + 'T23:59:59',
      color: getPhaseColor(meso.phase),
      external_id: `planbuilder_phase_${plan.id || 'new'}_${meso.id || idx}`,
    };
  });

  const { response } = await fetchAthleteEndpointWithFallback(
    athleteId,
    apiKey,
    '/events/bulk?upsert=true',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to upload phases to Intervals.icu: ${response.status} - ${errorBody}`);
  }

  return response.json();
}

/**
 * Fetches the athlete's events (races, etc.) from Intervals.icu
 */
export async function fetchAthleteEvents(athleteId: string, apiKey: string, start?: string, end?: string) {
  const params = new URLSearchParams();
  if (start) params.append('oldest', start);
  if (end) params.append('newest', end);
  const subPath = `/events${params.toString() ? `?${params.toString()}` : ''}`;

  try {
    const { response } = await fetchAthleteEndpointWithFallback(athleteId, apiKey, subPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch events: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching athlete events:", error);
    return [];
  }
}


/**
 * Uploads weekly targets for load and time to Intervals.icu
 */
export async function uploadWeeklyTargetsToIntervals(
  athleteId: string,
  apiKey: string,
  workouts: Workout[]
) {
  if (!workouts || workouts.length === 0) return [];

  // Group by week (Monday) and sport
  const weeklyStats: Record<string, Record<string, { tss: number, seconds: number }>> = {};

  workouts.forEach(w => {
    const d = new Date(w.date);
    // Get Monday of that week
    const day = d.getDay() || 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - day + 1);
    
    const weekStr = monday.toISOString().split('T')[0];
    const sport = w.sport || 'Run';

    if (!weeklyStats[weekStr]) weeklyStats[weekStr] = {};
    if (!weeklyStats[weekStr][sport]) weeklyStats[weekStr][sport] = { tss: 0, seconds: 0 };

    weeklyStats[weekStr][sport].tss += w.totalTss;
    weeklyStats[weekStr][sport].seconds += (w.estimatedDuration * 60);
  });

  const payload = [];

  for (const [weekStr, sports] of Object.entries(weeklyStats)) {
    for (const [sport, stats] of Object.entries(sports)) {
      payload.push({
        category: 'TARGET',
        type: sport,
        start_date_local: weekStr + 'T00:00:00',
        load_target: Math.round(stats.tss),
        time_target: Math.round(stats.seconds),
        color: SPORT_COLORS[sport] || SPORT_COLORS['Other'],
        external_id: `planbuilder_target_${sport}_${weekStr}`
      });
    }
  }

  const { response } = await fetchAthleteEndpointWithFallback(
    athleteId,
    apiKey,
    '/events/bulk?upsert=true',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to upload targets to Intervals.icu: ${response.status} - ${errorBody}`);
  }

  return response.json();
}

/**
 * Helper to format speed (m/s) into min/km pace
 */
function formatPace(metersPerSec: number): string {
  if (!metersPerSec || metersPerSec <= 0) return '';
  const secPerKm = 1000 / metersPerSec;
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}/km`;
}

/**
 * Fetches recent activities for an athlete from Intervals.icu (summarized for AI)
 */
export async function fetchRecentActivities(
  athleteId: string,
  apiKey: string,
  oldest?: string,
  newest?: string,
  limit: number = 20
) {
  const now = new Date();
  const defaultNewest = newest || now.toISOString().split('T')[0];
  const defaultOldest = oldest || new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    const { response } = await fetchAthleteEndpointWithFallback(
      athleteId,
      apiKey,
      `/activities?oldest=${defaultOldest}&newest=${defaultNewest}`
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to fetch activities: ${response.status} - ${errText}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data
      .slice(-limit)
      .map((act: any) => ({
        id: act.id,
        name: act.name,
        type: act.type,
        date: act.start_date_local ? act.start_date_local.split('T')[0] : '',
        distanceKm: act.distance ? Number((act.distance / 1000).toFixed(2)) : 0,
        durationMin: act.moving_time ? Math.round(act.moving_time / 60) : Math.round((act.elapsed_time || 0) / 60),
        elevationGainM: act.total_elevation_gain ? Math.round(act.total_elevation_gain) : 0,
        tss: act.icu_tss ?? act.tss ?? 0,
        avgHr: act.average_heartrate ? Math.round(act.average_heartrate) : null,
        maxHr: act.max_heartrate ? Math.round(act.max_heartrate) : null,
        paceMinKm: act.average_speed ? formatPace(act.average_speed) : null,
        rpe: act.perceived_exertion ?? null,
        feel: act.feel ?? null,
        decoupling: act.decoupling !== undefined ? Number(act.decoupling.toFixed(1)) : null,
        description: act.description ? act.description.slice(0, 150) : null
      }));
  } catch (error: any) {
    console.error("Error in fetchRecentActivities:", error);
    return { error: error.message };
  }
}

/**
 * Fetches deep details of a specific activity from Intervals.icu
 */
export async function fetchActivityDetails(activityId: string, apiKey: string) {
  const url = `https://intervals.icu/api/v1/activity/${activityId}`;
  const headers = new Headers();
  headers.append('Authorization', getBasicAuth(apiKey));
  headers.append('Content-Type', 'application/json');

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch activity details: ${response.status}`);
    }
    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      type: data.type,
      date: data.start_date_local,
      distanceKm: data.distance ? Number((data.distance / 1000).toFixed(2)) : 0,
      movingTimeMin: data.moving_time ? Math.round(data.moving_time / 60) : 0,
      elevationGainM: data.total_elevation_gain ? Math.round(data.total_elevation_gain) : 0,
      tss: data.icu_tss ?? data.tss ?? 0,
      avgHr: data.average_heartrate ? Math.round(data.average_heartrate) : null,
      maxHr: data.max_heartrate ? Math.round(data.max_heartrate) : null,
      rpe: data.perceived_exertion ?? null,
      feel: data.feel ?? null,
      decoupling: data.decoupling ?? null,
      description: data.description,
      intervals: (data.icu_intervals || []).slice(0, 20).map((it: any) => ({
        type: it.type,
        durationSec: it.duration,
        distanceM: it.distance,
        avgHr: it.average_heartrate,
        paceMinKm: it.average_speed ? formatPace(it.average_speed) : null,
        intensity: it.intensity
      }))
    };
  } catch (error: any) {
    console.error("Error in fetchActivityDetails:", error);
    return { error: error.message };
  }
}

/**
 * Fetches daily wellness and recovery range from Intervals.icu
 */
export async function fetchWellnessRange(
  athleteId: string,
  apiKey: string,
  oldest?: string,
  newest?: string
) {
  const now = new Date();
  const defaultNewest = newest || now.toISOString().split('T')[0];
  const defaultOldest = oldest || new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    const { response } = await fetchAthleteEndpointWithFallback(
      athleteId,
      apiKey,
      `/wellness?oldest=${defaultOldest}&newest=${defaultNewest}`
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch wellness: ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data.map((w: any) => ({
      date: w.id,
      ctl: w.ctl !== undefined ? Math.round(w.ctl) : null,
      atl: w.atl !== undefined ? Math.round(w.atl) : null,
      form: (w.ctl !== undefined && w.atl !== undefined) ? Math.round(w.ctl - w.atl) : null,
      restingHR: w.restingHR ?? null,
      hrv: w.hrv ?? w.hrvSDNN ?? null,
      sleepHours: w.sleepSecs ? Number((w.sleepSecs / 3600).toFixed(1)) : null,
      sleepScore: w.sleepScore ?? null,
      sleepQuality: w.sleepQuality ?? null,
      fatigue: w.fatigue ?? null,
      stress: w.stress ?? null,
      soreness: w.soreness ?? null,
      motivation: w.motivation ?? null,
      mood: w.mood ?? null,
      injury: w.injury ?? null,
      readiness: w.readiness ?? null,
      weight: w.weight ?? null,
      comments: w.comments ?? null
    }));
  } catch (error: any) {
    console.error("Error in fetchWellnessRange:", error);
    return { error: error.message };
  }
}

/**
 * Fetches athlete profile and physiological settings from Intervals.icu
 */
export async function fetchAthleteFullProfile(athleteId: string, apiKey: string) {
  try {
    const { response } = await fetchAthleteEndpointWithFallback(athleteId, apiKey, '');
    if (!response.ok) {
      throw new Error(`Failed to fetch athlete profile: ${response.status}`);
    }
    const data = await response.json();
    return {
      id: data.id,
      name: data.name || `${data.firstname || ''} ${data.lastname || ''}`.trim(),
      sex: data.sex,
      weightKg: data.icu?.weight || data.weight || null,
      restingHR: data.icu?.restingHR || data.resting_hr || null,
      maxHR: data.icu?.maxHR || data.max_hr || null,
      lthr: data.icu?.lthr || null,
      ctl: data.icu?.ctl !== undefined ? Math.round(data.icu.ctl) : null,
      atl: data.icu?.atl !== undefined ? Math.round(data.icu.atl) : null,
      form: (data.icu?.ctl !== undefined && data.icu?.atl !== undefined) ? Math.round(data.icu.ctl - data.icu.atl) : null,
      thresholdPace: data.icu?.threshold_pace || data.run_threshold_pace || null,
      ftp: data.icu?.ftp || data.ftp || null
    };
  } catch (error: any) {
    console.error("Error in fetchAthleteFullProfile:", error);
    return { error: error.message };
  }
}

export interface IntervalsActivity {
  id: string | number;
  name: string;
  type: string;
  start_date_local: string;
  distance: number; // in meters
  moving_time: number; // in seconds
  elapsed_time: number; // in seconds
  total_elevation_gain: number; // in meters
  icu_tss?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed?: number; // in m/s
  has_gps?: boolean;
  stream_types?: string[];
  trainer?: boolean;
  description?: string;
  icu_recording_time?: number;
  race?: boolean;
  isRace?: boolean;
  isExplicitCourseTitle?: boolean;
  kmEffort?: number;
  empiricalItra?: number;
  stopRatioPct?: number;
  decoupling?: number;
}

/**
 * Détecte si une activité est clairement intitulée "Course" ou marquée comme compétition.
 */
export function detectRaceActivity(act: {
  name?: string;
  description?: string;
  race?: boolean;
  category?: string;
  type?: string;
}): { isRace: boolean; isExplicitCourseTitle: boolean } {
  const title = (act.name || '').trim();
  const desc = (act.description || '').trim();
  const explicitCourseRegex = /\b(course|race|comp[eé]tition|dossard)\b/i;
  const broaderRaceRegex = /\b(course|race|trail|ultra|marathon|semi[-\s]?marathon|kv|kilom[eè]tre vertical|dossard|comp[eé]tition|championnat|utmb|ccc|occ|tds|templiers|diagonale|saint[eé]lyon|skyrace|skytrail| Ecotrail)\b/i;

  const isExplicitCourseTitle = explicitCourseRegex.test(title) || Boolean(act.race) || act.category === 'RACE';
  const isRace = isExplicitCourseTitle || broaderRaceRegex.test(title) || explicitCourseRegex.test(desc);

  return { isRace, isExplicitCourseTitle };
}

/**
 * Vitesse de référence 1000 ITRA (en km-effort / heure) selon le volume (km + D+/100).
 * Loi de puissance physiologique Riegel / ITRA.
 */
export function getReferenceSpeed1000Itra(kmEffort: number): number {
  const safeKe = Math.max(12, kmEffort || 40);
  return 24.0 * Math.pow(safeKe, -0.068) * 1.03;
}

/**
 * Calcule la cote ITRA empirique d'une course ou sortie sans surévaluation sur le court/plat.
 */
export function calculateEmpiricalItraFromPerformance(
  distanceKm: number,
  elevationGainM: number,
  elapsedHours: number,
  isTrainingFallback: boolean = false
): number {
  if (!distanceKm || distanceKm < 3 || !elapsedHours || elapsedHours <= 0.15) return 500;
  const ke = distanceKm + (elevationGainM || 0) / 100;
  const vRef1000 = getReferenceSpeed1000Itra(ke);
  const actualSpeedKeH = ke / elapsedHours;

  const vertDensity = (elevationGainM || 0) / Math.max(1, distanceKm);
  const shortBonusDiscount = ke < 45 ? 0.93 + (ke / 45) * 0.05 : 0.98;
  const flatBonusDiscount = vertDensity < 25 ? 0.94 : vertDensity < 45 ? 0.97 : 1.0;
  const trainingFactor = isTrainingFallback ? 0.96 : 1.0;

  const rawItra = (actualSpeedKeH / vRef1000) * 1000 * shortBonusDiscount * flatBonusDiscount * trainingFactor;
  return Math.max(250, Math.min(940, Math.round(rawItra)));
}

/**
 * Estime le temps global de course (en heures décimales) pour un parcours donné
 * sans être trop conservateur sur les 50K ni trop agressif sur les ultras (100K / 100M).
 */
export function estimateRaceTargetHoursForCourse(params: {
  distanceKm: number;
  elevationGainM: number;
  itraIndex: number;
  fatiguePercent?: number;
  upCostDivider?: number;
  downCostModifier?: number;
  pauseMinutesTotal?: number;
}): number {
  const safeDist = Math.max(1, Number(params.distanceKm) || 20);
  const safeEle = Math.max(0, Number(params.elevationGainM) || 0);
  const safeItra = Math.max(250, Math.min(950, Number(params.itraIndex) || 550));

  const standardKe = safeDist + safeEle / 100;
  const vRef1000 = getReferenceSpeed1000Itra(standardKe);
  let runnerKeSpeed = (safeItra / 1000) * vRef1000;

  const vertRatio = safeEle / safeDist;
  const upAptitudeRatio = (Number(params.upCostDivider) || 88) / 90;
  const downAptitudeRatio = 1.0 - ((Number(params.downCostModifier) || 0.95) - 0.95) * 0.18;
  const terrainWeight = Math.min(1, vertRatio / 60);
  const aptitudeMultiplier = 1 + terrainWeight * ((upAptitudeRatio - 1) * 0.45 + (downAptitudeRatio - 1) * 0.35);
  runnerKeSpeed *= Math.max(0.82, Math.min(1.18, aptitudeMultiplier));

  const expectedFatigueForItra = Math.round(45 - ((safeItra - 200) / 800) * 30);
  const fatigueDelta = (Number(params.fatiguePercent) || expectedFatigueForItra) - expectedFatigueForItra;
  const fatigueAdjustment = 1 + (fatigueDelta / 100) * 0.32;

  let ultraDriftMultiplier = 1.0;
  if (standardKe > 65) {
    const ultraExcess = (standardKe - 65) / 100;
    const amateurFactor = Math.max(0.25, Math.min(1.45, (820 - safeItra) / 350));
    ultraDriftMultiplier = 1 + Math.pow(ultraExcess, 1.15) * 0.24 * amateurFactor;
  }

  const runningHours = (standardKe / Math.max(3.2, runnerKeSpeed)) * fatigueAdjustment * ultraDriftMultiplier;
  let effectivePauseHours = (Number(params.pauseMinutesTotal) || 0) / 60;
  if (effectivePauseHours < 0.05 && standardKe > 65) {
    effectivePauseHours = ((standardKe - 55) / 25) * 0.12;
  }

  return Number(Math.max(0.25, runningHours + effectivePauseHours).toFixed(2));
}

export interface RaceCalibrationProfile {
  racesCount: number;
  explicitCoursesCount: number;
  streamsAnalyzedCount?: number;
  avgEmpiricalItra: number;
  recommendedFatiguePercent: number;
  recommendedPacingStrategy: 'regular' | 'prudent' | 'aggressive';
  recommendedUpCostDivider: number;
  recommendedDownCostModifier: number;
  recommendedWalkThreshold: number;
  recommendedDescentThreshold: number;
  avgPauseMinutesPer20Km: number;
  estimatedTargetHoursForRoadbook?: number;
  estimatedTargetFormatted?: string;
  runnerArchetype?: string;
  flatSpeedKmh?: number;
  uphillEfficiencyScore?: number;
  downhillAgilityScore?: number;
  enduranceScore?: number;
  referenceRaces: Array<{
    id: string | number;
    name: string;
    date: string;
    distanceKm: number;
    elevationGainM: number;
    durationSec: number;
    kmEffort: number;
    empiricalItra: number;
    isExplicitCourseTitle: boolean;
  }>;
}

/**
 * Analyse les sorties clairement intitulées "Course" (ou compétitions) d'un athlète
 * pour moduler automatiquement un Roadbook et calibrer ses estimations physiologiques.
 */
export function analyzeRaceActivitiesForCalibration(
  activities: IntervalsActivity[],
  roadbookDistanceKm?: number,
  roadbookElevationGainM?: number,
  roadbookWaypointsCount?: number
): RaceCalibrationProfile | null {
  // 1. Filtrer en priorité les sorties identifiées comme "Course" (> 5 km)
  let runRaces = activities.filter(
    (a) =>
      a.isRace &&
      a.distance >= 5000 &&
      (a.moving_time > 900 || a.elapsed_time > 900) &&
      ['Run', 'TrailRun', 'Hike', 'Walk'].includes(a.type)
  );

  // Fallback intelligent : si aucune sortie ne porte explicitement le tag/mot "Course",
  // utiliser les 4 plus grosses sorties Trail/Run (> 15 km) pour pouvoir quand même profiler l'athlète
  if (runRaces.length === 0) {
    runRaces = activities
      .filter(
        (a) =>
          a.distance >= 15000 &&
          (a.moving_time > 2400 || a.elapsed_time > 2400) &&
          ['Run', 'TrailRun'].includes(a.type)
      )
      .sort((a, b) => (b.kmEffort || b.distance) - (a.kmEffort || a.distance))
      .slice(0, 4);
  }

  if (runRaces.length === 0) return null;

  // Prioriser les sorties explicitement intitulées "Course" avec une pondération double
  let weightedItraSum = 0;
  let weightSum = 0;
  let weightedStopRatioSum = 0;
  let weightedDecouplingSum = 0;
  let decouplingWeightSum = 0;
  let weightedDplusRatioSum = 0;

  const referenceRaces = runRaces.map((act) => {
    const distKm = act.distance / 1000;
    const eleM = act.total_elevation_gain || 0;
    const kmEffort = distKm + eleM / 100;
    const totalSec = act.elapsed_time > act.moving_time ? act.elapsed_time : act.moving_time;
    const movingSec = act.moving_time || totalSec;
    const hoursTotal = Math.max(0.25, totalSec / 3600);
    const empiricalItra = calculateEmpiricalItraFromPerformance(
      distKm,
      eleM,
      hoursTotal,
      !act.isExplicitCourseTitle
    );

    const stopSec = Math.max(0, totalSec - movingSec);
    const stopRatio = totalSec > 0 ? stopSec / totalSec : 0;
    const dplusPerKm = distKm > 0 ? eleM / distKm : 0;

    // Pondération : x2.5 si le titre contient explicitement "Course", bonus pour les vrais trails (>25 ke et >30m D+/km)
    const trailRelevance = (kmEffort >= 28 ? 1.35 : kmEffort >= 18 ? 1.0 : 0.65) * (dplusPerKm >= 30 ? 1.25 : 0.85);
    let w = (act.isExplicitCourseTitle ? 2.5 : 1.0) * trailRelevance;
    if (roadbookDistanceKm && roadbookDistanceKm > 0) {
      const distDiffRatio = Math.abs(distKm - roadbookDistanceKm) / Math.max(10, roadbookDistanceKm);
      if (distDiffRatio < 0.35) w *= 1.6;
    }

    weightedItraSum += empiricalItra * w;
    weightSum += w;
    weightedStopRatioSum += stopRatio * w;
    weightedDplusRatioSum += dplusPerKm * w;

    if (act.decoupling !== undefined && act.decoupling !== null && !isNaN(act.decoupling)) {
      weightedDecouplingSum += Math.abs(act.decoupling) * w;
      decouplingWeightSum += w;
    }

    return {
      id: act.id,
      name: act.name,
      date: act.start_date_local ? act.start_date_local.split('T')[0] : '',
      distanceKm: Math.round(distKm * 10) / 10,
      elevationGainM: Math.round(eleM),
      durationSec: totalSec,
      kmEffort: Math.round(kmEffort * 10) / 10,
      empiricalItra,
      isExplicitCourseTitle: Boolean(act.isExplicitCourseTitle),
    };
  });

  const avgEmpiricalItra = Math.round(weightedItraSum / (weightSum || 1));
  const avgStopRatio = weightedStopRatioSum / (weightSum || 1);
  const avgDecoupling = decouplingWeightSum > 0 ? weightedDecouplingSum / decouplingWeightSum : null;
  const avgDplusPerKm = weightedDplusRatioSum / (weightSum || 1);

  // Dérivation des paramètres physiologiques Roadbook à partir de l'ITRA empirique et des "Courses"
  const baseFatigue = Math.round(45 - ((Math.max(200, Math.min(1000, avgEmpiricalItra)) - 200) / 800) * 30);
  const recommendedFatiguePercent =
    avgDecoupling !== null
      ? Math.max(5, Math.min(40, Math.round(baseFatigue * 0.65 + avgDecoupling * 1.4)))
      : baseFatigue;

  const recommendedPacingStrategy: 'regular' | 'prudent' | 'aggressive' =
    recommendedFatiguePercent >= 22 ? 'prudent' : recommendedFatiguePercent <= 11 ? 'aggressive' : 'regular';

  // Si le coureur fait beaucoup de courses montagneuses (>50m D+/km) avec un bon ITRA, son upCostDivider monte
  const baseUpDivider = Math.round(80 + ((avgEmpiricalItra - 200) / 800) * 20);
  const mountainBonus = avgDplusPerKm > 55 ? 4 : avgDplusPerKm > 35 ? 2 : 0;
  const recommendedUpCostDivider = Math.max(70, Math.min(108, baseUpDivider + mountainBonus));

  const recommendedDownCostModifier = Number(
    Math.max(0.3, Math.min(1.5, 1.5 - ((avgEmpiricalItra - 200) / 800) * 1.25)).toFixed(2)
  );
  const recommendedWalkThreshold = Math.round(8 + ((avgEmpiricalItra - 200) / 800) * 12);
  const recommendedDescentThreshold = Math.round(10 + ((avgEmpiricalItra - 200) / 800) * 15);

  const avgPauseMinutesPer20Km = Math.max(2, Math.round(avgStopRatio * 180));
  const flatSpeedKmh = Number(((avgEmpiricalItra / 1000) * 21.0).toFixed(1));
  const uphillEfficiencyScore = Math.min(99, Math.max(30, Math.round(((recommendedUpCostDivider - 65) / 45) * 100)));
  const downhillAgilityScore = Math.min(99, Math.max(30, Math.round(((1.55 - recommendedDownCostModifier) / 1.2) * 100)));
  const enduranceScore = Math.min(99, Math.max(30, Math.round(100 - recommendedFatiguePercent * 1.8)));

  let runnerArchetype = 'Traileur Polyvalent';
  if (uphillEfficiencyScore >= downhillAgilityScore + 8 && avgDplusPerKm >= 40) {
    runnerArchetype = 'Grimpeur Montagnard';
  } else if (downhillAgilityScore >= uphillEfficiencyScore + 8) {
    runnerArchetype = 'Descendeur Agile & Relanceur';
  } else if (enduranceScore >= 75) {
    runnerArchetype = 'Diesel Ultra-Endurant';
  }

  // Si on a les caractéristiques d'un Roadbook cible, estimer le Temps Cible modulé par ces "Courses"
  let estimatedTargetHoursForRoadbook: number | undefined = undefined;
  let estimatedTargetFormatted: string | undefined = undefined;

  if (roadbookDistanceKm && roadbookDistanceKm > 0) {
    const rbEle = roadbookElevationGainM || 0;
    const pausesMin = (roadbookWaypointsCount || Math.floor(roadbookDistanceKm / 12)) * 4.0;
    const totalEstH = estimateRaceTargetHoursForCourse({
      distanceKm: roadbookDistanceKm,
      elevationGainM: rbEle,
      itraIndex: avgEmpiricalItra,
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
    racesCount: runRaces.length,
    explicitCoursesCount: runRaces.filter((r) => r.isExplicitCourseTitle).length,
    streamsAnalyzedCount: 0,
    avgEmpiricalItra,
    recommendedFatiguePercent,
    recommendedPacingStrategy,
    recommendedUpCostDivider,
    recommendedDownCostModifier,
    recommendedWalkThreshold,
    recommendedDescentThreshold,
    avgPauseMinutesPer20Km,
    estimatedTargetHoursForRoadbook,
    estimatedTargetFormatted,
    runnerArchetype,
    flatSpeedKmh,
    uphillEfficiencyScore,
    downhillAgilityScore,
    enduranceScore,
    referenceRaces: referenceRaces.sort((a, b) => (b.isExplicitCourseTitle ? 1 : 0) - (a.isExplicitCourseTitle ? 1 : 0)),
  };
}

/**
 * Calibrage haute précision par analyse des flux GPS/Altitude/Vitesse (streams) des meilleures sorties "Course".
 * Permet de mesurer empiriquement sur le terrain :
 * - le vrai seuil de marche en montée (pente % où la vitesse passe sous ~5.6 km/h)
 * - le vrai coût énergétique en montée (`upCostDivider`)
 * - l'agilité et le seuil de freinage en descente (`downCostModifier`, `descentThreshold`)
 * - la perte de vitesse entre la 1ère et la 2ème moitié des courses (`fatiguePercent`, `pacingStrategy`)
 */
export async function calibrateAthleteProfileWithStreams(
  activities: IntervalsActivity[],
  apiKey: string,
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

  const cleanKey = normalizeIntervalsApiKey(apiKey);
  if (!cleanKey) return baseProfile;

  // Sélectionner jusqu'à 3 courses de référence possédant une trace GPS pour analyser leurs streams seconde par seconde
  const topRaceIds = baseProfile.referenceRaces.slice(0, 3).map((r) => r.id);

  let flatSpeedSum = 0, flatCount = 0;
  let upSpeedSum = 0, upGradeSum = 0, upCount = 0;
  let downFastSpeedSum = 0, downSteepSpeedSum = 0, downFastCount = 0, downSteepCount = 0;
  const walkTransitionGrades: number[] = [];
  const halfFadeRatios: number[] = [];
  let streamsAnalyzedCount = 0;

  for (const actId of topRaceIds) {
    try {
      const streams = await fetchActivityStreams(
        actId,
        cleanKey,
        'time,altitude,fixed_altitude,velocity_smooth,grade_smooth,heartrate'
      );
      const timeArr = streams.find((s) => s.type === 'time')?.data || [];
      const altArr =
        streams.find((s) => s.type === 'fixed_altitude')?.data ||
        streams.find((s) => s.type === 'altitude')?.data ||
        [];
      const velArr = streams.find((s) => s.type === 'velocity_smooth')?.data || [];
      const gradeArr = streams.find((s) => s.type === 'grade_smooth')?.data || [];

      if (velArr.length < 60) continue;
      streamsAnalyzedCount++;

      const n = velArr.length;
      let firstHalfSpdSum = 0, firstHalfCnt = 0;
      let secondHalfSpdSum = 0, secondHalfCnt = 0;

      for (let i = 5; i < n; i += 3) {
        const vMs = Number(velArr[i]);
        if (!vMs || vMs < 0.45 || vMs > 7.5) continue; // ignorer pauses et spikes GPS
        const vKmh = vMs * 3.6;

        let gradePct = gradeArr[i] !== undefined ? Number(gradeArr[i]) : NaN;
        if (isNaN(gradePct) && altArr.length > i && timeArr.length > i) {
          const dt = Number(timeArr[i]) - Number(timeArr[i - 5]);
          const dAlt = Number(altArr[i]) - Number(altArr[i - 5]);
          const dDist = vMs * dt;
          if (dDist > 8) {
            gradePct = (dAlt / dDist) * 100;
          }
        }
        if (isNaN(gradePct) || gradePct < -45 || gradePct > 45) continue;

        if (i < n / 2) {
          firstHalfSpdSum += vKmh;
          firstHalfCnt++;
        } else {
          secondHalfSpdSum += vKmh;
          secondHalfCnt++;
        }

        if (gradePct >= -2 && gradePct <= 2) {
          flatSpeedSum += vKmh;
          flatCount++;
        } else if (gradePct >= 6 && gradePct <= 25) {
          upSpeedSum += vKmh;
          upGradeSum += gradePct;
          upCount++;
          if (vKmh >= 4.8 && vKmh <= 6.2) {
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
          const lossPct = Math.max(4, Math.min(45, ((avg1 - avg2) / avg1) * 100));
          halfFadeRatios.push(lossPct);
        }
      }
    } catch {
      // Continuer si une activité n'a pas de streams disponibles
    }
  }

  if (streamsAnalyzedCount === 0) {
    return baseProfile;
  }

  let {
    recommendedUpCostDivider,
    recommendedDownCostModifier,
    recommendedWalkThreshold,
    recommendedDescentThreshold,
    recommendedFatiguePercent,
    recommendedPacingStrategy,
  } = baseProfile;

  const avgFlatKmh = flatCount > 20 ? flatSpeedSum / flatCount : (baseProfile.avgEmpiricalItra / 1000) * 16.5;

  // Affiner le seuil de marche réel en côte
  if (walkTransitionGrades.length >= 8) {
    walkTransitionGrades.sort((a, b) => a - b);
    const medianWalkGrade = walkTransitionGrades[Math.floor(walkTransitionGrades.length * 0.5)];
    recommendedWalkThreshold = Math.max(6, Math.min(22, Math.round(medianWalkGrade)));
  }

  // Affiner l'efficacité en montée (upCostDivider)
  if (upCount > 25 && avgFlatKmh > 5) {
    const avgUpKmh = upSpeedSum / upCount;
    const avgUpGrade = upGradeSum / upCount;
    // Ratio vitesse montée vs vitesse plat attendu pour la pente moyenne
    const expectedRatio = 1 / (1 + (avgUpGrade / 100) * 10);
    const actualRatio = avgUpKmh / avgFlatKmh;
    const climbFactor = actualRatio / Math.max(0.2, expectedRatio);
    recommendedUpCostDivider = Math.max(
      70,
      Math.min(112, Math.round(baseProfile.recommendedUpCostDivider * (0.7 + 0.3 * climbFactor)))
    );
  }

  // Affiner l'agilité en descente (downCostModifier & descentThreshold)
  if (downFastCount > 15 && downSteepCount > 10) {
    const fastDownKmh = downFastSpeedSum / downFastCount;
    const steepDownKmh = downSteepSpeedSum / downSteepCount;
    const retention = steepDownKmh / Math.max(4, fastDownKmh);
    // Si le coureur maintient >85% de sa vitesse dans du > -12%, il est très agile en descente technique
    const agilityAdj = (retention - 0.78) * 1.4;
    recommendedDownCostModifier = Number(
      Math.max(0.3, Math.min(1.5, baseProfile.recommendedDownCostModifier - agilityAdj * 0.35)).toFixed(2)
    );
    recommendedDescentThreshold = Math.max(
      9,
      Math.min(26, Math.round(baseProfile.recommendedDescentThreshold + agilityAdj * 8))
    );
  }

  // Affiner le coefficient de fatigue et la stratégie d'effort
  if (halfFadeRatios.length > 0) {
    const empiricalFade = halfFadeRatios.reduce((a, b) => a + b, 0) / halfFadeRatios.length;
    recommendedFatiguePercent = Math.max(
      6,
      Math.min(42, Math.round(baseProfile.recommendedFatiguePercent * 0.5 + empiricalFade * 1.1))
    );
    recommendedPacingStrategy =
      recommendedFatiguePercent >= 22 ? 'prudent' : recommendedFatiguePercent <= 11 ? 'aggressive' : 'regular';
  }

  const uphillEfficiencyScore = Math.min(99, Math.max(30, Math.round(((recommendedUpCostDivider - 65) / 45) * 100)));
  const downhillAgilityScore = Math.min(99, Math.max(30, Math.round(((1.55 - recommendedDownCostModifier) / 1.2) * 100)));
  const enduranceScore = Math.min(99, Math.max(30, Math.round(100 - recommendedFatiguePercent * 1.8)));

  let runnerArchetype = 'Traileur Polyvalent';
  if (uphillEfficiencyScore >= downhillAgilityScore + 7) {
    runnerArchetype = 'Grimpeur Montagnard';
  } else if (downhillAgilityScore >= uphillEfficiencyScore + 7) {
    runnerArchetype = 'Descendeur Technique & Relanceur';
  } else if (enduranceScore >= 75) {
    runnerArchetype = 'Diesel Ultra-Endurant';
  }

  let estimatedTargetHoursForRoadbook = baseProfile.estimatedTargetHoursForRoadbook;
  let estimatedTargetFormatted = baseProfile.estimatedTargetFormatted;

  if (roadbookDistanceKm && roadbookDistanceKm > 0) {
    const rbEle = roadbookElevationGainM || 0;
    const pausesMin = (roadbookWaypointsCount || Math.floor(roadbookDistanceKm / 12)) * 4.0;
    const totalEstH = estimateRaceTargetHoursForCourse({
      distanceKm: roadbookDistanceKm,
      elevationGainM: rbEle,
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
    recommendedUpCostDivider,
    recommendedDownCostModifier,
    recommendedWalkThreshold,
    recommendedDescentThreshold,
    recommendedFatiguePercent,
    recommendedPacingStrategy,
    estimatedTargetHoursForRoadbook,
    estimatedTargetFormatted,
    runnerArchetype,
    flatSpeedKmh: Number(avgFlatKmh.toFixed(1)),
    uphillEfficiencyScore,
    downhillAgilityScore,
    enduranceScore,
  };
}

/**
 * Fetches the list of activities (trainings/races) for an athlete over a given date range.
 * Defaults to the last 90 days if not provided.
 */
export async function fetchIntervalsActivities(
  athleteId: string,
  apiKey: string,
  oldest?: string,
  newest?: string
): Promise<IntervalsActivity[]> {
  const now = new Date();
  const defaultNewest = newest || now.toISOString().split('T')[0];
  const defaultOldest = oldest || new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { response } = await fetchAthleteEndpointWithFallback(
    athleteId,
    apiKey,
    `/activities?oldest=${defaultOldest}&newest=${defaultNewest}`
  );
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Erreur 401 (Accès refusé par Intervals.icu) : vérifiez que votre Clé API est bien la 'Developer API Key' générée tout en bas de intervals.icu/settings (et non votre mot de passe), et que votre ID Athlète commence par 'i' (ex: i123456) ou '0'.`
      );
    }
    const errText = await response.text();
    throw new Error(`Erreur récupération activités Intervals.icu (${response.status}) : ${errText}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) return [];

  return data.map((act: any) => {
    const streamTypes: string[] = Array.isArray(act.stream_types) ? act.stream_types : [];
    const hasLatlng = streamTypes.includes('latlng') || streamTypes.includes('lat_lng');
    const outdoorGps = !act.trainer && (act.distance > 0) && ['Run', 'TrailRun', 'Ride', 'Gravel', 'Hike', 'Walk', 'NordicSki'].includes(act.type);
    const { isRace, isExplicitCourseTitle } = detectRaceActivity(act);

    const distKm = (act.distance || 0) / 1000;
    const eleM = act.total_elevation_gain || 0;
    const kmEffort = Math.round((distKm + eleM / 100) * 10) / 10;
    const totalSec = (act.elapsed_time && act.elapsed_time > act.moving_time) ? act.elapsed_time : (act.moving_time || 0);
    const hours = totalSec > 0 ? totalSec / 3600 : 0;
    const empiricalItra =
      hours > 0.2 && distKm >= 3
        ? calculateEmpiricalItraFromPerformance(distKm, eleM, hours, !isExplicitCourseTitle)
        : undefined;

    return {
      id: act.id,
      name: act.name || 'Entraînement sans nom',
      type: act.type || 'Run',
      start_date_local: act.start_date_local || '',
      distance: act.distance || 0,
      moving_time: act.moving_time || 0,
      elapsed_time: act.elapsed_time || 0,
      total_elevation_gain: act.total_elevation_gain || 0,
      icu_tss: act.icu_tss ?? act.tss ?? undefined,
      average_heartrate: act.average_heartrate ? Math.round(act.average_heartrate) : undefined,
      max_heartrate: act.max_heartrate ? Math.round(act.max_heartrate) : undefined,
      average_speed: act.average_speed || 0,
      has_gps: hasLatlng || outdoorGps,
      stream_types: streamTypes,
      trainer: Boolean(act.trainer),
      description: act.description || undefined,
      icu_recording_time: act.icu_recording_time,
      race: Boolean(act.race),
      isRace,
      isExplicitCourseTitle,
      kmEffort,
      empiricalItra,
      decoupling: act.decoupling !== undefined ? Number(act.decoupling) : undefined,
    };
  });
}

/**
 * Fetches time-series stream data (GPS lat/lon, altitude, time, heartrate) for a specific activity.
 */
export async function fetchActivityStreams(
  activityId: string | number,
  apiKey: string,
  types: string = 'time,latlng,altitude,fixed_altitude,heartrate,velocity_smooth'
): Promise<Array<{ type: string; data?: any[]; data2?: any[] }>> {
  const url = `https://intervals.icu/api/v1/activity/${activityId}/streams.json?types=${encodeURIComponent(types)}`;
  const headers = new Headers();
  headers.append('Authorization', getBasicAuth(apiKey));
  headers.append('Content-Type', 'application/json');

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Erreur récupération flux GPS de l'activité ${activityId} (${response.status}) : ${errText}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Format de flux inattendu renvoyé par Intervals.icu");
  }
  return data;
}

/**
 * Fetches recent activities over the last `days` days for the Coach IA diagnostic view.
 */
export async function fetchAthleteActivities(
  athleteId: string,
  apiKey: string,
  days: number = 14
): Promise<any[]> {
  const now = new Date();
  const newest = now.toISOString().split('T')[0];
  const oldest = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const acts = await fetchIntervalsActivities(athleteId, apiKey, oldest, newest);
  return acts.map((a) => ({
    ...a,
    icu_training_load: a.icu_tss ?? 0,
  }));
}


