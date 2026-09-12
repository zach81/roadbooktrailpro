import { calculateTraceStats } from './roadbookCalculator';

/**
 * Parse un fichier GPX et extrait les données globales et les points.
 * @param {string} gpxText Le contenu du fichier GPX sous forme de chaîne de caractères
 * @returns {Promise<Object>} Les statistiques et les points extraits
 */
export async function parseGPX(gpxText) {
  const GPXParserModule = await import('gpxparser');
  const GPXParser = GPXParserModule.default || GPXParserModule;
  const gpx = new GPXParser();
  gpx.parse(gpxText);

  // Vérifier s'il y a des traces
  if (gpx.tracks.length === 0 && gpx.routes.length === 0) {
    throw new Error("Le fichier GPX ne contient ni trace (track) ni route (route).");
  }

  // La première trace
  const track = gpx.tracks.length > 0 ? gpx.tracks[0] : gpx.routes[0];
  
  // Extraction des waypoints (ravitaillements préexistants)
  const waypoints = gpx.waypoints.map(wp => ({
    name: wp.name || "Waypoint",
    lat: wp.lat,
    lon: wp.lon,
    ele: wp.ele,
    desc: wp.desc || ""
  }));

  // Extraire le profil de la trace (points simplifiés pour les calculs)
  const points = track.points.map(p => ({
    lat: p.lat,
    lon: p.lon,
    ele: p.ele
  }));

  // Statistiques lissées pour éviter la surévaluation du D+ due au bruit GPS
  const smoothedStats = calculateTraceStats(points);
  const stats = {
    distance: smoothedStats.distance, // en km
    elevation: {
      max: track.elevation.max,
      min: track.elevation.min,
      pos: smoothedStats.elevation.pos, // D+ lissé
      neg: smoothedStats.elevation.neg  // D- lissé
    }
  };

  return {
    stats,
    points,
    waypoints
  };
}

/**
 * Lit un fichier File et retourne son contenu texte (GPX).
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}
