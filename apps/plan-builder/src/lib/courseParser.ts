import FitParser, { FitParsedData } from 'fit-file-parser';

export interface TrackPoint {
  lat: number;
  lon: number;
  ele: number;
  time?: Date;
  elapsedSec: number;
  distKm: number;
  hr?: number;
  speedKmH?: number;
}

export interface ParsedCourse {
  name: string;
  points: TrackPoint[];
  totalDistanceKm: number;
  totalDurationSec: number;
  elevationGainM: number;
  elevationLossM: number;
  minElevationM: number;
  maxElevationM: number;
  avgHr?: number;
  maxHr?: number;
  dateStr?: string;
  sourceType: 'GPX' | 'TCX' | 'FIT' | 'INTERVALS';
}

export interface KmSplit {
  km: number;
  lbl: string;
  gain_s: number; // >0 means Trace 2 is faster than Trace 1
  spd22: number;  // Speed Trace 1 (km/h)
  spd26: number;  // Speed Trace 2 (km/h)
  grade: number;  // Slope percentage (%)
}

export interface ComparisonResult {
  course1: ParsedCourse;
  course2: ParsedCourse;
  // [km1, lat1, lon1, alt1, t1_s, hr1,  km2, lat2, lon2, alt2, t2_s, hr2, dist_ecart_m]
  dualPts: number[][];
  kmSplits: KmSplit[];
  medianErrorM: number;
  maxErrorM: number;
  maxErrorKm: number;
  totalTimeDeltaSec: number; // t1_total - t2_total (>0: candidate is faster)
  notes: { km: number; min: number; txt: string; dy: number }[];
}

// Haversine formula to compute distance in km
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Normalizes raw points: calculates cumulative distance, smoothed elevation gain/loss,
 * elapsed times, and speeds.
 */
function normalizePoints(rawPoints: Array<{ lat: number; lon: number; ele: number; time?: Date; hr?: number }>, defaultName: string, sourceType: 'GPX' | 'TCX' | 'FIT' | 'INTERVALS'): ParsedCourse {
  if (rawPoints.length === 0) {
    throw new Error('Fichier sans coordonnées GPS valides.');
  }

  let totalDist = 0;
  let gain = 0;
  let loss = 0;
  let minEle = rawPoints[0].ele || 0;
  let maxEle = rawPoints[0].ele || 0;
  let sumHr = 0;
  let hrCount = 0;
  let maxHr = 0;

  const firstTime = rawPoints[0].time ? rawPoints[0].time.getTime() : null;

  const points: TrackPoint[] = [];

  for (let i = 0; i < rawPoints.length; i++) {
    const cur = rawPoints[i];
    if (i > 0) {
      const prev = rawPoints[i - 1];
      const d = haversineDistance(prev.lat, prev.lon, cur.lat, cur.lon);
      totalDist += d;

      const dEle = cur.ele - prev.ele;
      if (Math.abs(dEle) > 0.5) { // noise filter
        if (dEle > 0) gain += dEle;
        else loss += Math.abs(dEle);
      }
    }

    if (cur.ele < minEle) minEle = cur.ele;
    if (cur.ele > maxEle) maxEle = cur.ele;

    if (cur.hr && cur.hr > 30 && cur.hr < 250) {
      sumHr += cur.hr;
      hrCount++;
      if (cur.hr > maxHr) maxHr = cur.hr;
    }

    let elapsedSec = 0;
    if (cur.time && firstTime) {
      elapsedSec = Math.max(0, Math.round((cur.time.getTime() - firstTime) / 1000));
    } else {
      // Fallback pace: 10 km/h average + adjustment for slope
      elapsedSec = Math.round((totalDist / 9.5) * 3600);
    }

    points.push({
      lat: cur.lat,
      lon: cur.lon,
      ele: Math.round(cur.ele * 10) / 10,
      time: cur.time,
      elapsedSec,
      distKm: Math.round(totalDist * 1000) / 1000,
      hr: cur.hr ? Math.round(cur.hr) : undefined,
    });
  }

  // Calculate speed
  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      points[i].speedKmH = points.length > 1 && points[1].elapsedSec > 0
        ? Math.min(30, (points[1].distKm / (points[1].elapsedSec / 3600)))
        : 10;
    } else {
      const dSec = points[i].elapsedSec - points[i - 1].elapsedSec;
      const dKm = points[i].distKm - points[i - 1].distKm;
      points[i].speedKmH = dSec > 0 ? Math.min(40, (dKm / (dSec / 3600))) : points[i - 1].speedKmH;
    }
  }

  const totalDurationSec = points.length > 0 ? points[points.length - 1].elapsedSec : 0;
  const startDate = points[0]?.time;

  return {
    name: defaultName,
    points,
    totalDistanceKm: Math.round(totalDist * 100) / 100,
    totalDurationSec,
    elevationGainM: Math.round(gain),
    elevationLossM: Math.round(loss),
    minElevationM: Math.round(minEle),
    maxElevationM: Math.round(maxEle),
    avgHr: hrCount > 0 ? Math.round(sumHr / hrCount) : undefined,
    maxHr: maxHr > 0 ? maxHr : undefined,
    dateStr: startDate ? startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined,
    sourceType,
  };
}

/**
 * Parses GPX XML text into a standardized ParsedCourse.
 */
export function parseGPXText(gpxText: string, fileName: string): ParsedCourse {
  const parser = new DOMParser();
  const xml = parser.parseFromString(gpxText, 'application/xml');

  if (xml.querySelector('parsererror')) {
    throw new Error('Erreur de parsing XML dans le fichier GPX.');
  }

  const trkpts = Array.from(xml.querySelectorAll('trkpt'));
  const pts = trkpts.length > 0 ? trkpts : Array.from(xml.querySelectorAll('rtept'));

  if (pts.length === 0) {
    throw new Error('Aucun point GPS trouvé dans le fichier GPX.');
  }

  const trackName = xml.querySelector('name')?.textContent || fileName.replace(/\.[^/.]+$/, '');

  const rawPoints = pts.map((pt) => {
    const lat = parseFloat(pt.getAttribute('lat') || '0');
    const lon = parseFloat(pt.getAttribute('lon') || '0');
    const eleNode = pt.querySelector('ele');
    const ele = eleNode ? parseFloat(eleNode.textContent || '0') : 0;
    const timeNode = pt.querySelector('time');
    const time = timeNode?.textContent ? new Date(timeNode.textContent) : undefined;

    // Heart rate can be in various extensions
    let hr: number | undefined;
    const hrNode =
      pt.querySelector('hr') ||
      pt.querySelector('gpxtpx\\:hr') ||
      pt.getElementsByTagNameNS('*', 'hr')[0];
    if (hrNode?.textContent) {
      const parsedHr = parseInt(hrNode.textContent, 10);
      if (!isNaN(parsedHr)) hr = parsedHr;
    }

    return { lat, lon, ele, time, hr };
  });

  return normalizePoints(rawPoints, trackName, 'GPX');
}

/**
 * Parses TCX XML text into a standardized ParsedCourse.
 */
export function parseTCXText(tcxText: string, fileName: string): ParsedCourse {
  const parser = new DOMParser();
  const xml = parser.parseFromString(tcxText, 'application/xml');

  if (xml.querySelector('parsererror')) {
    throw new Error('Erreur de parsing XML dans le fichier TCX.');
  }

  const trackpoints = Array.from(xml.querySelectorAll('Trackpoint'));
  if (trackpoints.length === 0) {
    throw new Error('Aucun Trackpoint trouvé dans le fichier TCX.');
  }

  const rawPoints: Array<{ lat: number; lon: number; ele: number; time?: Date; hr?: number }> = [];

  for (const tp of trackpoints) {
    const latNode =
      tp.querySelector('LatitudeDegrees') ||
      tp.getElementsByTagNameNS('*', 'LatitudeDegrees')[0];
    const lonNode =
      tp.querySelector('LongitudeDegrees') ||
      tp.getElementsByTagNameNS('*', 'LongitudeDegrees')[0];

    if (!latNode || !lonNode) continue; // Skip points without coordinates

    const lat = parseFloat(latNode.textContent || '0');
    const lon = parseFloat(lonNode.textContent || '0');

    const eleNode =
      tp.querySelector('AltitudeMeters') ||
      tp.getElementsByTagNameNS('*', 'AltitudeMeters')[0];
    const ele = eleNode ? parseFloat(eleNode.textContent || '0') : 0;

    const timeNode =
      tp.querySelector('Time') ||
      tp.getElementsByTagNameNS('*', 'Time')[0];
    const time = timeNode?.textContent ? new Date(timeNode.textContent) : undefined;

    const hrNode =
      tp.querySelector('HeartRateBpm Value') ||
      tp.getElementsByTagNameNS('*', 'HeartRateBpm')[0]?.getElementsByTagNameNS('*', 'Value')[0];
    const hr = hrNode?.textContent ? parseInt(hrNode.textContent, 10) : undefined;

    rawPoints.push({ lat, lon, ele, time, hr: !isNaN(hr as number) ? hr : undefined });
  }

  if (rawPoints.length === 0) {
    throw new Error('Aucune coordonnée GPS valide dans les points TCX.');
  }

  const trackName = fileName.replace(/\.[^/.]+$/, '');
  return normalizePoints(rawPoints, trackName, 'TCX');
}

/**
 * Parses FIT binary ArrayBuffer using fit-file-parser.
 */
export async function parseFITBuffer(buffer: ArrayBuffer, fileName: string): Promise<ParsedCourse> {
  return new Promise((resolve, reject) => {
    try {
      const ParserClass = typeof FitParser === 'function' ? FitParser : (FitParser as any).default || FitParser;

      const parseWithOptions = (mode: 'both' | 'list', onDone: (err: any, data: any) => void) => {
        try {
          const parser = new ParserClass({
            force: true,
            speedUnit: 'km/h',
            lengthUnit: 'm',
            temperatureUnit: 'celsius',
            elapsedRecordField: true,
            mode,
          });
          parser.parse(buffer, onDone);
        } catch (err) {
          onDone(err, null);
        }
      };

      const processParsedFitData = (data: any) => {
        if (!data) {
          return reject(new Error('Le fichier FIT ne contient aucune donnée décodable.'));
        }

        // Collect records from all possible locations in FIT structure
        let records: any[] = [];
        if (Array.isArray(data.records) && data.records.length > 0) {
          records = data.records;
        } else if (data.messages && Array.isArray(data.messages.record) && data.messages.record.length > 0) {
          records = data.messages.record;
        } else if (Array.isArray(data.course_points) && data.course_points.length > 0) {
          records = data.course_points;
        } else if (data.activity && Array.isArray(data.activity.sessions)) {
          for (const session of data.activity.sessions) {
            if (Array.isArray(session.laps)) {
              for (const lap of session.laps) {
                if (Array.isArray(lap.records)) {
                  records.push(...lap.records);
                }
              }
            }
          }
        } else if (Array.isArray(data.sessions)) {
          for (const session of data.sessions) {
            if (Array.isArray(session.laps)) {
              for (const lap of session.laps) {
                if (Array.isArray(lap.records)) {
                  records.push(...lap.records);
                }
              }
            }
          }
        } else if (Array.isArray(data.laps)) {
          for (const lap of data.laps) {
            if (Array.isArray(lap.records)) {
              records.push(...lap.records);
            }
          }
        }

        // Fallback: search any array in data that contains coordinates
        if (records.length === 0) {
          for (const key of Object.keys(data)) {
            if (Array.isArray(data[key]) && data[key].length > 0) {
              const first = data[key][0];
              if (
                first &&
                (first.position_lat !== undefined ||
                  first.lat !== undefined ||
                  first.latitude !== undefined ||
                  first.start_position_lat !== undefined)
              ) {
                records = data[key];
                break;
              }
            }
          }
        }

        if (records.length === 0) {
          return reject(
            new Error(
              'Aucun enregistrement GPS trouvé dans le fichier FIT. Assurez-vous que le fichier provient d\'une séance extérieure avec signal GPS actif.'
            )
          );
        }

        const rawPoints: Array<{ lat: number; lon: number; ele: number; time?: Date; hr?: number }> = [];

        for (const rec of records) {
          let rawLat = rec.position_lat ?? rec.lat ?? rec.latitude ?? rec.start_position_lat;
          let rawLon = rec.position_long ?? rec.position_lon ?? rec.lon ?? rec.long ?? rec.longitude ?? rec.start_position_long;

          if (rawLat === undefined || rawLon === undefined || rawLat === null || rawLon === null) {
            continue;
          }

          let lat = Number(rawLat);
          let lon = Number(rawLon);

          if (isNaN(lat) || isNaN(lon)) continue;

          // Convert semicircles to degrees if needed (Garmin native semicircles format)
          if (Math.abs(lat) > 90) {
            lat = lat * (180 / Math.pow(2, 31));
          }
          if (Math.abs(lon) > 180) {
            lon = lon * (180 / Math.pow(2, 31));
          }

          // Discard invalid sentinel values (0x7FFFFFFF = ~180) and invalid coordinates
          if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 89.9 || Math.abs(lon) > 179.9) continue;
          // Filter out (0,0) null-island GPS dropouts
          if (Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001) continue;

          const ele = rec.altitude ?? rec.enhanced_altitude ?? rec.ele ?? rec.elevation ?? 0;
          const time = rec.timestamp ? new Date(rec.timestamp) : undefined;
          const hr = rec.heart_rate ?? rec.hr;

          rawPoints.push({ lat, lon, ele: Number(ele) || 0, time, hr });
        }

        if (rawPoints.length === 0) {
          return reject(
            new Error(
              'Aucune coordonnée GPS valide trouvée dans les enregistrements FIT (séance d\'intérieur sans satellite ou fichier sans coordonnées valides).'
            )
          );
        }

        const trackName = fileName.replace(/\.[^/.]+$/, '');
        resolve(normalizePoints(rawPoints, trackName, 'FIT'));
      };

      // Attempt parsing with 'both' mode first, fallback to 'list'
      parseWithOptions('both', (err: any, data: any) => {
        if (err || !data || (!data.records?.length && !data.activity?.sessions?.length && !data.messages?.record?.length)) {
          parseWithOptions('list', (err2: any, data2: any) => {
            if (err2 || !data2) {
              return reject(new Error('Erreur de décodage FIT : ' + (err?.message || err || err2?.message || err2 || 'données illisibles')));
            }
            processParsedFitData(data2);
          });
          return;
        }
        processParsedFitData(data);
      });
    } catch (e: any) {
      reject(new Error('Impossible de lire le fichier FIT: ' + (e.message || e)));
    }
  });
}

/**
 * Creates a single course comparison result.
 * Allows displaying the Leaflet map and elevation profile as soon as a single file is imported.
 */
export function createSingleCourseComparison(course: ParsedCourse): ComparisonResult {
  const pts = course.points;
  const sampleCount = Math.max(60, Math.min(220, Math.round(course.totalDistanceKm * 6)));
  const stepKm = course.totalDistanceKm / Math.max(1, sampleCount - 1);

  const dualPts: number[][] = [];
  for (let i = 0; i < sampleCount; i++) {
    const km = Math.round(i * stepKm * 100) / 100;
    let p = pts[0];
    for (let j = 0; j < pts.length; j++) {
      if (pts[j].distKm >= km) {
        p = pts[j];
        break;
      }
    }

    dualPts.push([
      km,
      Math.round(p.lat * 100000) / 100000,
      Math.round(p.lon * 100000) / 100000,
      Math.round(p.ele * 10) / 10,
      p.elapsedSec,
      p.hr || 0,
      km,
      Math.round(p.lat * 100000) / 100000,
      Math.round(p.lon * 100000) / 100000,
      Math.round(p.ele * 10) / 10,
      p.elapsedSec,
      p.hr || 0,
      0,
    ]);
  }

  const totalKm = Math.ceil(course.totalDistanceKm);
  const kmSplits: KmSplit[] = [];
  for (let k = 1; k <= totalKm; k++) {
    const prevKm = k - 1;
    const pPrev = pts.find((pt) => pt.distKm >= prevKm) || pts[0];
    const pCur = pts.find((pt) => pt.distKm >= k) || pts[pts.length - 1];
    const dEle = pCur.ele - pPrev.ele;
    const dDistM = Math.max(1, (pCur.distKm - pPrev.distKm) * 1000);
    const grade = Math.round((dEle / dDistM) * 100);
    const dt = Math.max(1, pCur.elapsedSec - pPrev.elapsedSec);
    const spd = Math.round(((pCur.distKm - pPrev.distKm) / (dt / 3600)) * 10) / 10;

    kmSplits.push({
      km: k,
      lbl: `Km ${k}`,
      gain_s: 0,
      spd22: spd,
      spd26: spd,
      grade,
    });
  }

  return {
    course1: course,
    course2: course,
    dualPts,
    kmSplits,
    medianErrorM: 0,
    maxErrorM: 0,
    maxErrorKm: 0,
    totalTimeDeltaSec: 0,
    notes: [],
  };
}

/**
 * Universal file loader: detects extension and parses FIT, TCX, or GPX.
 */
export async function parseCourseFile(file: File): Promise<ParsedCourse> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'fit') {
    const buffer = await file.arrayBuffer();
    return parseFITBuffer(buffer, file.name);
  } else if (extension === 'tcx') {
    const text = await file.text();
    return parseTCXText(text, file.name);
  } else if (extension === 'gpx') {
    const text = await file.text();
    return parseGPXText(text, file.name);
  } else {
    // Try text first, if fails try FIT
    try {
      const text = await file.text();
      if (text.includes('<gpx')) return parseGPXText(text, file.name);
      if (text.includes('<TrainingCenterDatabase') || text.includes('<Trackpoint')) {
        return parseTCXText(text, file.name);
      }
    } catch (e) {
      // ignore
    }
    const buffer = await file.arrayBuffer();
    return parseFITBuffer(buffer, file.name);
  }
}

/**
 * Interpolates a TrackPoint along a course at a given elapsed time in seconds.
 * Performs binary search on pts[].elapsedSec and linearly interpolates coordinates,
 * elevation, distance, heart rate, and speed.
 */
export function getPointAtTime(pts: TrackPoint[], targetSec: number): TrackPoint {
  if (!pts || pts.length === 0) {
    return { lat: 0, lon: 0, ele: 0, elapsedSec: 0, distKm: 0 };
  }
  if (targetSec <= pts[0].elapsedSec) return pts[0];
  const last = pts[pts.length - 1];
  if (targetSec >= last.elapsedSec) return last;

  let low = 0;
  let high = pts.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (pts[mid].elapsedSec < targetSec) low = mid + 1;
    else high = mid - 1;
  }

  const idx2 = Math.min(pts.length - 1, Math.max(1, low));
  const idx1 = idx2 - 1;
  const p1 = pts[idx1];
  const p2 = pts[idx2];
  const dt = p2.elapsedSec - p1.elapsedSec;
  const ratio = dt > 0 ? (targetSec - p1.elapsedSec) / dt : 0;

  return {
    lat: p1.lat + (p2.lat - p1.lat) * ratio,
    lon: p1.lon + (p2.lon - p1.lon) * ratio,
    ele: Math.round((p1.ele + (p2.ele - p1.ele) * ratio) * 10) / 10,
    elapsedSec: targetSec,
    distKm: Math.round((p1.distKm + (p2.distKm - p1.distKm) * ratio) * 1000) / 1000,
    hr: p1.hr && p2.hr ? Math.round(p1.hr + (p2.hr - p1.hr) * ratio) : (p1.hr || p2.hr),
    speedKmH: p1.speedKmH && p2.speedKmH ? p1.speedKmH + (p2.speedKmH - p1.speedKmH) * ratio : p1.speedKmH,
  };
}

/**
 * Interpolates a TrackPoint on a trace at target distance in kilometers.
 */
export function getPointAtDist(pts: TrackPoint[], targetKm: number): TrackPoint {
  if (!pts || pts.length === 0) {
    return { lat: 0, lon: 0, ele: 0, elapsedSec: 0, distKm: 0 };
  }
  if (targetKm <= pts[0].distKm) return pts[0];
  const last = pts[pts.length - 1];
  if (targetKm >= last.distKm) return last;

  let low = 0;
  let high = pts.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (pts[mid].distKm < targetKm) low = mid + 1;
    else high = mid - 1;
  }

  const idx2 = Math.min(pts.length - 1, Math.max(1, low));
  const idx1 = idx2 - 1;
  const p1 = pts[idx1];
  const p2 = pts[idx2];
  const segLen = p2.distKm - p1.distKm;
  const ratio = segLen > 0 ? (targetKm - p1.distKm) / segLen : 0;

  return {
    lat: p1.lat + (p2.lat - p1.lat) * ratio,
    lon: p1.lon + (p2.lon - p1.lon) * ratio,
    ele: Math.round((p1.ele + (p2.ele - p1.ele) * ratio) * 10) / 10,
    elapsedSec: Math.round(p1.elapsedSec + (p2.elapsedSec - p1.elapsedSec) * ratio),
    distKm: targetKm,
    hr: p1.hr && p2.hr ? Math.round(p1.hr + (p2.hr - p1.hr) * ratio) : (p1.hr || p2.hr),
    speedKmH: p1.speedKmH && p2.speedKmH ? p1.speedKmH + (p2.speedKmH - p1.speedKmH) * ratio : p1.speedKmH,
  };
}

/**
 * Compares two courses (course1 as reference/norm, course2 as candidate/comparison).
 * Interpolates and correlates points at regular distance intervals, computes
 * dual points, deviation metrics, and kilometer splits.
 */
export function compareCourses(course1: ParsedCourse, course2: ParsedCourse): ComparisonResult {
  const refPts = course1.points;
  const candPts = course2.points;

  const totalDist1 = course1.totalDistanceKm;
  const totalDist2 = course2.totalDistanceKm;

  // Choose sampling density (around 100 to 180 points for optimal chart/map smoothness)
  const sampleCount = Math.max(80, Math.min(220, Math.round(totalDist1 * 7)));
  const stepKm = totalDist1 / (sampleCount - 1);

  const dualPts: number[][] = [];
  const errors: number[] = [];
  let maxErrorM = 0;
  let maxErrorKm = 0;

  for (let i = 0; i < sampleCount; i++) {
    const km1 = Math.round(i * stepKm * 100) / 100;
    const p1 = getPointAtDist(refPts, km1);

    // Corresponding distance on Trace 2 (proportionally or by distance)
    const targetKm2 = Math.min(totalDist2, km1 * (totalDist2 / Math.max(0.1, totalDist1)));
    const p2 = getPointAtDist(candPts, targetKm2);

    // Compute geographic distance difference in meters
    const errM = Math.round(haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon) * 1000);
    errors.push(errM);
    if (errM > maxErrorM) {
      maxErrorM = errM;
      maxErrorKm = km1;
    }

    dualPts.push([
      Math.round(km1 * 100) / 100,
      Math.round(p1.lat * 100000) / 100000,
      Math.round(p1.lon * 100000) / 100000,
      Math.round(p1.ele * 10) / 10,
      p1.elapsedSec,
      p1.hr || 0,
      Math.round(p2.distKm * 100) / 100,
      Math.round(p2.lat * 100000) / 100000,
      Math.round(p2.lon * 100000) / 100000,
      Math.round(p2.ele * 10) / 10,
      p2.elapsedSec,
      p2.hr || 0,
      errM,
    ]);
  }

  // Median error
  const sortedErrors = [...errors].sort((a, b) => a - b);
  const medianErrorM = sortedErrors[Math.floor(sortedErrors.length / 2)] || 0;

  // Kilometer splits
  const kmSplits: KmSplit[] = [];
  const maxKm = Math.ceil(totalDist1);

  for (let k = 1; k <= maxKm; k++) {
    const prevKm = k - 1;
    const curKm = Math.min(totalDist1, k);

    const p1Start = getPointAtDist(refPts, prevKm);
    const p1End = getPointAtDist(refPts, curKm);

    const candPrevDist = prevKm * (totalDist2 / Math.max(0.1, totalDist1));
    const candCurDist = curKm * (totalDist2 / Math.max(0.1, totalDist1));

    const p2Start = getPointAtDist(candPts, candPrevDist);
    const p2End = getPointAtDist(candPts, candCurDist);

    const t1Diff = Math.max(1, p1End.elapsedSec - p1Start.elapsedSec);
    const t2Diff = Math.max(1, p2End.elapsedSec - p2Start.elapsedSec);

    // Gain in seconds (t1 - t2): positive = Trace 2 is faster on this km
    const gain_s = Math.round(t1Diff - t2Diff);

    const distSeg1 = curKm - prevKm;
    const distSeg2 = candCurDist - candPrevDist;

    const spd1 = distSeg1 > 0 ? Math.round((distSeg1 / (t1Diff / 3600)) * 10) / 10 : 0;
    const spd2 = distSeg2 > 0 ? Math.round((distSeg2 / (t2Diff / 3600)) * 10) / 10 : 0;

    const dEle = p1End.ele - p1Start.ele;
    const grade = distSeg1 > 0 ? Math.round((dEle / (distSeg1 * 1000)) * 1000) / 10 : 0;

    kmSplits.push({
      km: k,
      lbl: `Km ${prevKm}-${k}`,
      gain_s,
      spd22: spd1,
      spd26: spd2,
      grade,
    });
  }

  const totalTimeDeltaSec = course1.totalDurationSec - course2.totalDurationSec;

  // Generate notable landmark annotations
  const notes: { km: number; min: number; txt: string; dy: number }[] = [];
  if (dualPts.length > 5) {
    if (maxErrorM > 30) {
      const ptErr = dualPts.find((p) => p[0] >= maxErrorKm) || dualPts[0];
      const deltaMin = (ptErr[4] - ptErr[10]) / 60;
      notes.push({
        km: maxErrorKm,
        min: deltaMin,
        txt: `Écart trace max (${maxErrorM}m)`,
        dy: 18,
      });
    }

    // Peak elevation annotation
    let peakIdx = 0;
    let peakEle = 0;
    dualPts.forEach((p, idx) => {
      if (p[3] > peakEle) {
        peakEle = p[3];
        peakIdx = idx;
      }
    });
    const peakPt = dualPts[peakIdx];
    const peakDeltaMin = (peakPt[4] - peakPt[10]) / 60;
    notes.push({
      km: peakPt[0],
      min: peakDeltaMin,
      txt: `Point culminant (${Math.round(peakEle)}m)`,
      dy: -14,
    });
  }

  return {
    course1,
    course2,
    dualPts,
    kmSplits,
    medianErrorM,
    maxErrorM,
    maxErrorKm,
    totalTimeDeltaSec,
    notes,
  };
}

/**
 * Converts an Intervals.icu activity and its stream data (latlng, time, altitude, heartrate)
 * into a standardized ParsedCourse object.
 */
export function parseIntervalsActivityToCourse(
  activity: {
    id: string | number;
    name?: string;
    type?: string;
    start_date_local?: string;
    distance?: number;
    total_elevation_gain?: number;
    moving_time?: number;
  },
  streams: Array<{ type: string; data?: any[]; data2?: any[] }>
): ParsedCourse {
  const latlngStream = streams.find((s) => s.type === 'latlng' || s.type === 'lat_lng');
  if (!latlngStream) {
    throw new Error("Cette séance ne contient pas de données GPS (aucun flux latlng).");
  }

  let lats: number[] = [];
  let lons: number[] = [];

  if (Array.isArray(latlngStream.data2) && Array.isArray(latlngStream.data)) {
    // Intervals.icu format: data is lats, data2 is lons
    lats = latlngStream.data;
    lons = latlngStream.data2;
  } else if (Array.isArray(latlngStream.data) && latlngStream.data.length > 0) {
    if (Array.isArray(latlngStream.data[0])) {
      // Array of pairs [lat, lon]
      lats = latlngStream.data.map((p: any) => p[0]);
      lons = latlngStream.data.map((p: any) => p[1]);
    }
  }

  if (lats.length === 0 || lons.length === 0) {
    throw new Error("Le flux GPS de cette séance Intervals.icu est vide.");
  }

  const timeStream = streams.find((s) => s.type === 'time')?.data || [];
  const altStream =
    streams.find((s) => s.type === 'fixed_altitude')?.data ||
    streams.find((s) => s.type === 'altitude')?.data ||
    [];
  const hrStream = streams.find((s) => s.type === 'heartrate')?.data || [];

  const startMs = activity.start_date_local ? new Date(activity.start_date_local).getTime() : Date.now();
  const rawPoints: Array<{ lat: number; lon: number; ele: number; time?: Date; hr?: number }> = [];

  const n = Math.min(lats.length, lons.length);
  for (let i = 0; i < n; i++) {
    const lat = lats[i];
    const lon = lons[i];
    if (lat === null || lat === undefined || lon === null || lon === undefined) continue;
    // Skip impossible coordinates
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    // Skip 0,0 GPS null points
    if (Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001) continue;

    const elapsed = timeStream[i] !== undefined && timeStream[i] !== null ? Number(timeStream[i]) : i;
    const ele = altStream[i] !== undefined && altStream[i] !== null ? Number(altStream[i]) : 0;
    const hr = hrStream[i] !== undefined && hrStream[i] !== null ? Math.round(Number(hrStream[i])) : undefined;
    const pointTime = new Date(startMs + elapsed * 1000);

    rawPoints.push({
      lat,
      lon,
      ele,
      time: pointTime,
      hr,
    });
  }

  if (rawPoints.length === 0) {
    throw new Error("Aucun point GPS valide n'a pu être extrait de la séance Intervals.icu.");
  }

  const defaultName = activity.name || `Intervals ${activity.id}`;
  return normalizePoints(rawPoints, defaultName, 'INTERVALS');
}
