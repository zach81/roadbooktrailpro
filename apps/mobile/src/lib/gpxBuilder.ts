import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function generateAndShareGPX(roadbook: any) {
  try {
    const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="mykairn" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${roadbook.title}</name>
  </metadata>`;
    
    // Waypoints (Ravitos, etc)
    const wpts = roadbook.waypoints.map((wp: any) => 
      `  <wpt lat="${wp.lat}" lon="${wp.lon}">
    <ele>${wp.ele || 0}</ele>
    <name>${wp.name}</name>
    <desc>${wp.desc || ''}</desc>
    <type>${wp.type || 'generic'}</type>
  </wpt>`
    ).join('\n');

    // Trk
    const trkHeader = `
  <trk>
    <name>${roadbook.title}</name>
    <trkseg>`;
    
    const trkpts = roadbook.points.map((p: any) =>
      `      <trkpt lat="${p.lat}" lon="${p.lon}">
        <ele>${p.ele || 0}</ele>
      </trkpt>`
    ).join('\n');
    
    const trkFooter = `
    </trkseg>
  </trk>
</gpx>`;

    const gpxContent = header + '\n' + wpts + trkHeader + '\n' + trkpts + trkFooter;

    const fileUri = FileSystem.cacheDirectory + 'roadbook_export.gpx';
    await FileSystem.writeAsStringAsync(fileUri, gpxContent, { encoding: FileSystem.EncodingType.UTF8 });
    
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { UTI: 'public.xml', mimeType: 'application/gpx+xml' });
    } else {
      console.warn('Sharing is not available on this device');
    }
  } catch (err) {
    console.error("Erreur lors de la génération du GPX", err);
  }
}
