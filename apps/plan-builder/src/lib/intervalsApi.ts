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

  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/events/bulk?upsert=true`;

  const payload = workouts.map((workout) => ({
    category: 'WORKOUT',
    type: workout.sport || 'Run', // Use actual sport
    start_date_local: workout.date.toISOString().split('T')[0] + 'T00:00:00', // Just dates for now
    name: workout.name,
    description: generateIntervalsWorkoutText(workout, isSimplified),
    external_id: workout.id, // Using our internal ID for upserting
    color: SPORT_COLORS[workout.sport || 'Run'] || SPORT_COLORS['Other']
  }));

  const headers = new Headers();
  headers.append('Authorization', 'Basic ' + btoa(`API_KEY:${apiKey}`));
  headers.append('Content-Type', 'application/json');

  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload),
  });

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
  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/events/bulk-delete`;

  const payload = workouts.map((workout) => ({
    external_id: workout.id,
  }));

  const headers = new Headers();
  headers.append('Authorization', 'Basic ' + btoa(`API_KEY:${apiKey}`));
  headers.append('Content-Type', 'application/json');

  const response = await fetch(url, {
    method: 'PUT',
    headers: headers,
    body: JSON.stringify(payload),
  });

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
  const url = `https://intervals.icu/api/v1/athlete/${athleteId}`;
  const headers = new Headers();
  headers.append('Authorization', 'Basic ' + btoa(`API_KEY:${apiKey}`));
  headers.append('Content-Type', 'application/json');

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch athlete data: ${response.status}`);
    }
    const data = await response.json();
    
    // Pour le coach (ou les athlètes complets), le CTL/ATL exact est dans les données de wellness.
    // On va chercher le wellness d'aujourd'hui.
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const wellnessUrl = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness?oldest=${today}`;
    
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
    const activitiesUrl = `https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${fourWeeksAgo}&newest=${today}`;
    
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
  // Use specific coachId as athlete ID to get the authenticated user's athletes
  let url = `https://intervals.icu/api/v1/athlete/${coachId}/athletes`;
  
  const headers = new Headers();
  headers.append('Authorization', 'Basic ' + btoa(`API_KEY:${apiKey}`));
  headers.append('Content-Type', 'application/json');

  try {
    let response = await fetch(url, { headers });
    
    if (response.status === 403 || response.status === 401 || response.status === 404) {
      // Try the athlete-summary endpoint as a backup for coaches
      url = `https://intervals.icu/api/v1/athlete/${coachId}/athlete-summary`;
      response = await fetch(url, { headers });
    }
    
    if (!response.ok) {
      // If it fails for another reason, fallback to fetching just the coach profile
      const fallbackUrl = `https://intervals.icu/api/v1/athlete/${coachId}`;
      const fallbackResponse = await fetch(fallbackUrl, { headers });
      if (!fallbackResponse.ok) {
        throw new Error(`Failed to fetch athletes: ${response.status}`);
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

  const headers = new Headers();
  headers.append('Authorization', 'Basic ' + btoa(`API_KEY:${apiKey}`));
  headers.append('Content-Type', 'application/json');

  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload),
  });

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
  let url = `https://intervals.icu/api/v1/athlete/${athleteId}/events`;
  
  const params = new URLSearchParams();
  if (start) params.append('oldest', start);
  if (end) params.append('newest', end);
  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  const headers = new Headers();
  headers.append('Authorization', 'Basic ' + btoa(`API_KEY:${apiKey}`));
  headers.append('Content-Type', 'application/json');

  try {
    const response = await fetch(url, { headers });
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

  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/events/bulk?upsert=true`;
  const headers = new Headers();
  headers.append('Authorization', 'Basic ' + btoa(`API_KEY:${apiKey}`));
  headers.append('Content-Type', 'application/json');

  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload),
  });

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

function getBasicAuth(apiKey: string): string {
  if (typeof btoa !== 'undefined') {
    return 'Basic ' + btoa(`API_KEY:${apiKey}`);
  }
  return 'Basic ' + Buffer.from(`API_KEY:${apiKey}`).toString('base64');
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

  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${defaultOldest}&newest=${defaultNewest}`;
  const headers = new Headers();
  headers.append('Authorization', getBasicAuth(apiKey));
  headers.append('Content-Type', 'application/json');

  try {
    const response = await fetch(url, { headers });
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

  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness?oldest=${defaultOldest}&newest=${defaultNewest}`;
  const headers = new Headers();
  headers.append('Authorization', getBasicAuth(apiKey));
  headers.append('Content-Type', 'application/json');

  try {
    const response = await fetch(url, { headers });
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
  const url = `https://intervals.icu/api/v1/athlete/${athleteId}`;
  const headers = new Headers();
  headers.append('Authorization', getBasicAuth(apiKey));
  headers.append('Content-Type', 'application/json');

  try {
    const response = await fetch(url, { headers });
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

