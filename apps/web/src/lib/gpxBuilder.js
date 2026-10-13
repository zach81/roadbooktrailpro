/**
 * Service pour la génération et le téléchargement de fichiers GPX 1.1 enrichis
 * pour montres GPS (Suunto, Garmin, Coros) et applications tierces.
 * 
 * Intègre les temps de passage calculés (ETA, chrono cumulé, pauses, barrières horaires)
 * directement sur les waypoints et dans les horodatages de trace (trkpt).
 */

import { calculateDistance } from "./roadbookCalculator";

function escapeXml(unsafe) {
  if (!unsafe) return "";
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function formatDurationMs(ms) {
  if (!ms || ms < 0) return "0h00";
  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

function formatClockTime(isoString) {
  if (!isoString) return "--:--";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return "--:--";
  }
}

/**
 * Construit le contenu XML d'un fichier GPX 1.1 valide avec waypoints enrichis
 * et trace chronométrée.
 * 
 * @param {Object} params
 * @param {string} params.name - Nom de la course
 * @param {Array} params.points - Liste brute des coordonnées [{ lat, lon, ele }]
 * @param {Array} [params.segments] - Segments calculés par le roadbook (avec temps, arr_fast/slow, cumulDistance)
 * @param {Array} [params.waypoints] - Waypoints bruts de secours si segments non fournis
 * @param {string|Date} [params.startTime] - Heure de départ ISO
 * @param {Object} [params.options] - Options d'export
 * @param {string} [params.options.paceType] - 'fast' (défaut) ou 'slow'
 * @param {string} [params.options.nameFormat] - 'both' (Ravito · 2h15 (08h15)), 'elapsed' (Ravito · 2h15), 'clock' (Ravito · 08h15), 'raw'
 * @param {boolean} [params.options.timestampTrack] - Vrai pour horodater chaque trkpt (défaut: true)
 */
export function buildGPXString({
  name,
  points = [],
  segments = [],
  waypoints = [],
  startTime = null,
  options = {}
}) {
  const safeName = escapeXml(name || "Tracé Trail Roadbook");
  const paceType = options.paceType || "fast";
  const nameFormat = options.nameFormat || "both"; // 'both' | 'elapsed' | 'clock' | 'raw'
  const timestampTrack = options.timestampTrack !== false;

  // Déterminer l'heure de départ de référence
  let raceStartMs;
  if (startTime) {
    raceStartMs = new Date(startTime).getTime();
  } else if (segments.length > 0 && segments[0].arr_fast) {
    const firstArr = new Date(paceType === "slow" ? segments[0].arr_slow : segments[0].arr_fast).getTime();
    const firstDur = paceType === "slow" ? segments[0].durationSlowMs : segments[0].durationFastMs;
    raceStartMs = firstArr - firstDur;
  } else {
    raceStartMs = new Date().setHours(8, 0, 0, 0);
  }
  const isoTime = new Date(raceStartMs).toISOString();

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TrailRoadbookPro" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${safeName}</name>
    <desc>Exporté depuis Trail Roadbook Pro avec temps de passage et allures prévues</desc>
    <time>${isoTime}</time>
  </metadata>
`;

  // ── 1. GÉNÉRATION DES WAYPOINTS ENRICHIS AVEC LES TEMPS PRÉVUS ────────────
  if (segments && segments.length > 0) {
    // 1.1 Départ (km 0)
    const firstSeg = segments[0];
    const startWp = firstSeg.from;
    const startEle = (startWp && startWp.ele != null) ? Math.round(startWp.ele) : (points[0]?.ele != null ? Math.round(points[0].ele) : 0);
    const startLat = (startWp && startWp.lat != null) ? Number(startWp.lat).toFixed(6) : (points[0] ? Number(points[0].lat).toFixed(6) : "0");
    const startLon = (startWp && startWp.lon != null) ? Number(startWp.lon).toFixed(6) : (points[0] ? Number(points[0].lon).toFixed(6) : "0");
    const startClock = formatClockTime(isoTime);

    let startTitle = escapeXml(startWp?.name || "Départ");
    if (nameFormat === "both" || nameFormat === "clock") {
      startTitle += ` · 0h00 (${startClock})`;
    } else if (nameFormat === "elapsed") {
      startTitle += ` · 0h00`;
    }

    xml += `  <wpt lat="${startLat}" lon="${startLon}">
    <ele>${startEle}</ele>
    <time>${isoTime}</time>
    <name>${startTitle}</name>
    <desc>Départ de la course | 0.0 km</desc>
    <sym>Flag, Green</sym>
    <type>Start</type>
  </wpt>\n`;

    // 1.2 Points de passage intermédiaires et Arrivée
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const wp = seg.to;
      if (!wp) continue;

      const wpLat = Number(wp.lat != null ? wp.lat : points[wp.pointIndex]?.lat || 0).toFixed(6);
      const wpLon = Number(wp.lon != null ? wp.lon : points[wp.pointIndex]?.lon || 0).toFixed(6);
      const wpEle = Math.round(wp.ele != null ? wp.ele : points[wp.pointIndex]?.ele || 0);

      // Calcul du temps exact d'arrivée
      const arrIso = paceType === "slow" ? seg.arr_slow : seg.arr_fast;
      const arrMs = new Date(arrIso).getTime();
      const elapsedMs = Math.max(0, arrMs - raceStartMs);
      const elapsedHhMm = formatDurationMs(elapsedMs);
      const clockHhMm = formatClockTime(arrIso);

      // Nom enrichi pour l'écran de la montre Suunto
      let displayName = wp.name || `Point ${i + 1}`;
      if (nameFormat === "both") {
        displayName = `${displayName} · ${elapsedHhMm} (${clockHhMm})`;
      } else if (nameFormat === "elapsed") {
        displayName = `${displayName} · ${elapsedHhMm}`;
      } else if (nameFormat === "clock") {
        displayName = `${displayName} · ${clockHhMm}`;
      }
      displayName = escapeXml(displayName);

      // Description détaillée du ravitaillement
      let descParts = [
        `Temps prévu: ${elapsedHhMm}`,
        `Heure estimée: ${clockHhMm}`,
        `km ${seg.cumulDistance.toFixed(1)}`,
        `D+ +${Math.round(seg.cumulElevation)}m`
      ];
      if (wp.pause) descParts.push(`Pause prévue: ${wp.pause} min`);
      if (wp.cutoffTime) descParts.push(`Barrière horaire: ${wp.cutoffTime}`);
      if (wp.has_dropbag) descParts.push("Dropbag");
      if (wp.assistance_allowed) descParts.push("Assistance");
      if (wp.desc) descParts.push(wp.desc);

      const isFinish = (i === segments.length - 1);
      const sym = isFinish ? "Flag, Red" : "Aid Station";
      const type = isFinish ? "Finish" : (wp.type || "Aid Station");

      xml += `  <wpt lat="${wpLat}" lon="${wpLon}">
    <ele>${wpEle}</ele>
    <time>${new Date(arrIso).toISOString()}</time>
    <name>${displayName}</name>
    <desc>${escapeXml(descParts.join(" | "))}</desc>
    <sym>${sym}</sym>
    <type>${escapeXml(type)}</type>
  </wpt>\n`;
    }

  } else if (Array.isArray(waypoints) && waypoints.length > 0) {
    // Mode de secours si segments non calculés
    for (const wp of waypoints) {
      if (wp.lat === undefined || wp.lon === undefined) continue;
      const wpName = escapeXml(wp.name || "Waypoint");
      let descParts = [];
      if (wp.cutoffTime) descParts.push(`BH: ${wp.cutoffTime}`);
      if (wp.has_dropbag) descParts.push("Dropbag");
      if (wp.assistance_allowed) descParts.push("Assistance");
      if (wp.desc) descParts.push(wp.desc);

      xml += `  <wpt lat="${Number(wp.lat).toFixed(6)}" lon="${Number(wp.lon).toFixed(6)}">
    <ele>${wp.ele !== undefined && wp.ele !== null ? Math.round(wp.ele) : 0}</ele>
    <name>${wpName}</name>
    ${descParts.length > 0 ? `<desc>${escapeXml(descParts.join(" | "))}</desc>` : ''}
    <sym>Aid Station</sym>
    <type>${escapeXml(wp.type || "Food")}</type>
  </wpt>\n`;
    }
  }

  // ── 2. CALCUL DES HORODATAGES INTERPOLÉS SUR TOUS LES TRACKPOINTS ──────────
  let pointTimestamps = null;

  if (timestampTrack && segments && segments.length > 0 && points.length > 0) {
    pointTimestamps = new Array(points.length);
    pointTimestamps[0] = raceStartMs;

    let curDepMs = raceStartMs;
    for (let s = 0; s < segments.length; s++) {
      const seg = segments[s];
      const pStart = seg.from.pointIndex ?? 0;
      const pEnd = seg.to.pointIndex ?? (points.length - 1);
      const arrIso = paceType === "slow" ? seg.arr_slow : seg.arr_fast;
      const arrMs = new Date(arrIso).getTime();
      const segDurMs = Math.max(1000, arrMs - curDepMs);

      const count = pEnd - pStart;
      if (count > 0) {
        for (let k = 0; k <= count; k++) {
          const idx = pStart + k;
          if (idx < points.length) {
            pointTimestamps[idx] = Math.round(curDepMs + (k / count) * segDurMs);
          }
        }
      }

      // Si le ravito comporte une pause, le départ du prochain segment commence après la pause
      const pauseMs = (seg.to.pause || 0) * 60000;
      curDepMs = arrMs + pauseMs;
    }

    // Sécurité pour les points restants éventuels
    for (let p = 1; p < points.length; p++) {
      if (!pointTimestamps[p]) {
        pointTimestamps[p] = (pointTimestamps[p - 1] || raceStartMs) + 5000;
      }
    }
  }

  // ── 3. TRACE COMPLETE (TRKPT) ──────────────────────────────────────────────
  xml += `  <trk>
    <name>${safeName}</name>
    <trkseg>\n`;

  if (Array.isArray(points)) {
    for (let idx = 0; idx < points.length; idx++) {
      const p = points[idx];
      if (p.lat === undefined || p.lon === undefined) continue;
      const eleTag = (p.ele !== undefined && p.ele !== null) ? `<ele>${Math.round(p.ele)}</ele>` : '';
      const timeTag = (pointTimestamps && pointTimestamps[idx])
        ? `<time>${new Date(pointTimestamps[idx]).toISOString()}</time>`
        : '';
      xml += `      <trkpt lat="${Number(p.lat).toFixed(6)}" lon="${Number(p.lon).toFixed(6)}">${eleTag}${timeTag}</trkpt>\n`;
    }
  }

  xml += `    </trkseg>
  </trk>
</gpx>`;

  return xml;
}

/**
 * Déclenche le téléchargement du fichier GPX dans le navigateur
 */
export function downloadGPXFile(filename, gpxString) {
  const safeFilename = (filename || "trace")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_") + ".gpx";

  const blob = new Blob([gpxString], { type: "application/gpx+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Associe le type de waypoint Trail Roadbook Pro à l'énumération officielle
 * CoursePointType du schéma Garmin TCX v2.
 */
function mapGarminPointType(wpType, wpName = "") {
  const t = (wpType || "").toLowerCase();
  const n = (wpName || "").toLowerCase();

  if (t.includes("water") || t.includes("eau") || n.includes("point d'eau") || n.includes("eau")) return "Water";
  if (t.includes("food") || t.includes("ravito") || t.includes("aid station") || n.includes("ravito") || n.includes("solide") || n.includes("repas")) return "Food";
  if (t.includes("first aid") || t.includes("secours") || t.includes("médical") || n.includes("secours") || n.includes("médical")) return "First Aid";
  if (t.includes("summit") || t.includes("sommet") || t.includes("col") || t.includes("pic") || n.includes("sommet") || n.includes("col") || n.includes("pic")) return "Summit";
  if (t.includes("danger") || n.includes("danger") || n.includes("technique")) return "Danger";
  return "Generic";
}

/**
 * Construit le contenu XML d'un fichier TCX Garmin v2 Course.
 * 
 * Ce format est nativement supporté par Garmin Connect et les montres Garmin
 * (Fenix, Forerunner, Enduro, Epix).
 * Il permet d'alimenter directement l'écran « Sur mon itinéraire » (Up Ahead) avec des
 * icônes natives et le « Partenaire Virtuel » avec les allures cibles calculées.
 */
export function buildTCXString({
  name,
  points = [],
  segments = [],
  waypoints = [],
  startTime = null,
  options = {}
}) {
  const safeName = escapeXml(name || "Tracé Trail Roadbook");
  const paceType = options.paceType || "fast";
  const nameFormat = options.nameFormat || "both"; // 'both' | 'elapsed' | 'clock' | 'raw'

  // Déterminer l'heure de départ
  let raceStartMs;
  if (startTime) {
    raceStartMs = new Date(startTime).getTime();
  } else if (segments.length > 0 && segments[0].arr_fast) {
    const firstArr = new Date(paceType === "slow" ? segments[0].arr_slow : segments[0].arr_fast).getTime();
    const firstDur = paceType === "slow" ? segments[0].durationSlowMs : segments[0].durationFastMs;
    raceStartMs = firstArr - firstDur;
  } else {
    raceStartMs = new Date().setHours(8, 0, 0, 0);
  }

  // Calcul des temps interpolés sur tous les trackpoints
  let pointTimestamps = new Array(points.length);
  pointTimestamps[0] = raceStartMs;
  let curDepMs = raceStartMs;

  if (segments && segments.length > 0 && points.length > 0) {
    for (let s = 0; s < segments.length; s++) {
      const seg = segments[s];
      const pStart = seg.from.pointIndex ?? 0;
      const pEnd = seg.to.pointIndex ?? (points.length - 1);
      const arrIso = paceType === "slow" ? seg.arr_slow : seg.arr_fast;
      const arrMs = new Date(arrIso).getTime();
      const segDurMs = Math.max(1000, arrMs - curDepMs);

      const count = pEnd - pStart;
      if (count > 0) {
        for (let k = 0; k <= count; k++) {
          const idx = pStart + k;
          if (idx < points.length) {
            pointTimestamps[idx] = Math.round(curDepMs + (k / count) * segDurMs);
          }
        }
      }
      const pauseMs = (seg.to.pause || 0) * 60000;
      curDepMs = arrMs + pauseMs;
    }
    for (let p = 1; p < points.length; p++) {
      if (!pointTimestamps[p]) {
        pointTimestamps[p] = (pointTimestamps[p - 1] || raceStartMs) + 5000;
      }
    }
  }

  // Calcul des distances cumulées en mètres pour Garmin Trackpoint DistanceMeters
  let cumulativeDistMeters = new Array(points.length).fill(0);
  let totalDistMeters = 0;
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const dKm = calculateDistance(p1.lat, p1.lon, p2.lat, p2.lon);
    totalDistMeters += (dKm * 1000);
    cumulativeDistMeters[i] = Math.round(totalDistMeters);
  }

  const endMs = pointTimestamps[points.length - 1] || (raceStartMs + 3600000);
  const totalDurationSec = Math.max(1, Math.round((endMs - raceStartMs) / 1000));
  const startPt = points[0] || { lat: 0, lon: 0 };
  const endPt = points[points.length - 1] || { lat: 0, lon: 0 };

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Courses>
    <Course>
      <Name>${safeName}</Name>
      <Lap>
        <TotalTimeSeconds>${totalDurationSec}</TotalTimeSeconds>
        <DistanceMeters>${Math.round(totalDistMeters)}</DistanceMeters>
        <BeginPosition>
          <LatitudeDegrees>${Number(startPt.lat).toFixed(6)}</LatitudeDegrees>
          <LongitudeDegrees>${Number(startPt.lon).toFixed(6)}</LongitudeDegrees>
        </BeginPosition>
        <EndPosition>
          <LatitudeDegrees>${Number(endPt.lat).toFixed(6)}</LatitudeDegrees>
          <LongitudeDegrees>${Number(endPt.lon).toFixed(6)}</LongitudeDegrees>
        </EndPosition>
        <Intensity>Active</Intensity>
      </Lap>
      <Track>\n`;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const tIso = new Date(pointTimestamps[i] || raceStartMs).toISOString();
    const ele = (p.ele != null) ? `\n          <AltitudeMeters>${Math.round(p.ele)}</AltitudeMeters>` : '';
    xml += `        <Trackpoint>
          <Time>${tIso}</Time>
          <Position>
            <LatitudeDegrees>${Number(p.lat).toFixed(6)}</LatitudeDegrees>
            <LongitudeDegrees>${Number(p.lon).toFixed(6)}</LongitudeDegrees>
          </Position>${ele}
          <DistanceMeters>${cumulativeDistMeters[i]}</DistanceMeters>
        </Trackpoint>\n`;
  }

  xml += `      </Track>\n`;

  // CoursePoints (alimente « Sur mon itinéraire » / Up Ahead sur Garmin)
  if (segments && segments.length > 0) {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const wp = seg.to;
      if (!wp) continue;

      const wpLat = Number(wp.lat != null ? wp.lat : points[wp.pointIndex]?.lat || 0).toFixed(6);
      const wpLon = Number(wp.lon != null ? wp.lon : points[wp.pointIndex]?.lon || 0).toFixed(6);
      const wpEle = Math.round(wp.ele != null ? wp.ele : points[wp.pointIndex]?.ele || 0);

      const arrIso = paceType === "slow" ? seg.arr_slow : seg.arr_fast;
      const arrMs = new Date(arrIso).getTime();
      const elapsedMs = Math.max(0, arrMs - raceStartMs);
      const elapsedHhMm = formatDurationMs(elapsedMs);
      const clockHhMm = formatClockTime(arrIso);

      let displayName = wp.name || `Point ${i + 1}`;
      if (nameFormat === "both") {
        displayName = `${displayName} · ${elapsedHhMm} (${clockHhMm})`;
      } else if (nameFormat === "elapsed") {
        displayName = `${displayName} · ${elapsedHhMm}`;
      } else if (nameFormat === "clock") {
        displayName = `${displayName} · ${clockHhMm}`;
      }

      let notesParts = [
        `km ${seg.cumulDistance.toFixed(1)}`,
        `D+ +${Math.round(seg.cumulElevation)}m`,
        `ETA: ${clockHhMm}`
      ];
      if (wp.pause) notesParts.push(`Pause: ${wp.pause}m`);
      if (wp.cutoffTime) notesParts.push(`BH: ${wp.cutoffTime}`);

      const pointType = mapGarminPointType(wp.type, wp.name);

      xml += `      <CoursePoint>
        <Name>${escapeXml(displayName)}</Name>
        <Time>${new Date(arrIso).toISOString()}</Time>
        <Position>
          <LatitudeDegrees>${wpLat}</LatitudeDegrees>
          <LongitudeDegrees>${wpLon}</LongitudeDegrees>
        </Position>
        <AltitudeMeters>${wpEle}</AltitudeMeters>
        <PointType>${pointType}</PointType>
        <Notes>${escapeXml(notesParts.join(" | "))}</Notes>
      </CoursePoint>\n`;
    }
  }

  xml += `    </Course>
  </Courses>
</TrainingCenterDatabase>`;

  return xml;
}

/**
 * Déclenche le téléchargement du fichier TCX dans le navigateur
 */
export function downloadTCXFile(filename, tcxString) {
  const safeFilename = (filename || "trace")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_") + ".tcx";

  const blob = new Blob([tcxString], { type: "application/vnd.garmin.tcx+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

