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
