"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Crosshair, Maximize2, Minimize2, MapPin, Mountain, 
  Flag, Layers, Compass, Play, Activity, Clock 
} from 'lucide-react';
import styles from './CourseComparatorMap.module.css';
import { ParsedCourse, getPointAtTime, haversineDistance } from '@/lib/courseParser';

// Fix standard Leaflet icon paths in Next.js bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function fmtDelta(gainSec: number): string {
  if (isNaN(gainSec) || gainSec === null || gainSec === undefined) return '0:00';
  const sign = gainSec >= 0 ? '+' : '-';
  const abs = Math.abs(Math.round(gainSec));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m} min ${String(s).padStart(2, '0')} s`;
}

function fmtTime(sec: number): string {
  if (isNaN(sec) || sec === null || sec === undefined) return '00:00';
  const isNeg = sec < 0;
  const abs = Math.abs(Math.round(sec));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const sign = isNeg ? '-' : '';
  if (h > 0) {
    return `${sign}${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }
  return `${sign}${m}m ${String(s).padStart(2, '0')}s`;
}

export interface CourseComparatorMapProps {
  dualPts: number[][];
  course1: ParsedCourse;
  course2: ParsedCourse;
  activeIdx: number;
  simTime?: number;
  mapMode: 'dual' | 'thermal';
  onChangeMapMode: (mode: 'dual' | 'thermal') => void;
  onSelectPoint: (idx: number) => void;
  isPlaying?: boolean;
}

type TileSource = 'osm' | 'topo' | 'satellite';

const TILE_PROVIDERS: Record<TileSource, { url: string; attribution: string; maxZoom: number }> = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    maxZoom: 17,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri World Imagery &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping',
    maxZoom: 18,
  },
};

export default function CourseComparatorMap({
  dualPts,
  course1,
  course2,
  activeIdx,
  simTime,
  mapMode,
  onChangeMapMode,
  onSelectPoint,
  isPlaying = false,
}: CourseComparatorMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  
  // Layer groups for clean management
  const tracksLayerGroupRef = useRef<L.FeatureGroup | null>(null);
  const staticMarkersLayerGroupRef = useRef<L.FeatureGroup | null>(null);

  // Dynamic runner markers refs
  const runner1MarkerRef = useRef<L.Marker | null>(null);
  const runner2MarkerRef = useRef<L.Marker | null>(null);
  const connectorLineRef = useRef<L.Polyline | null>(null);
  const gapTrailLineRef = useRef<L.Polyline | null>(null);

  // State
  const [tileSource, setTileSource] = useState<TileSource>('osm');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [followRunner, setFollowRunner] = useState<boolean>(false);
  const [syncMode, setSyncMode] = useState<'time' | 'distance'>('time');

  // Active point telemetry
  const curPoint = dualPts[activeIdx] || dualPts[0];
  const deltaSec = curPoint ? (curPoint[4] - curPoint[10]) : 0;

  // Peak index & altitude
  const { peakIdx, peakAlt } = useMemo(() => {
    let pIdx = 0;
    let pAlt = -Infinity;
    dualPts.forEach((p, idx) => {
      if (p[3] > pAlt) {
        pAlt = p[3];
        pIdx = idx;
      }
    });
    return { peakIdx: pIdx, peakAlt: Math.max(0, pAlt) };
  }, [dualPts]);

  // Combined bounds of all trackpoints
  const trackBounds = useMemo(() => {
    if (dualPts.length === 0) return null;
    const latLngs: L.LatLngTuple[] = [];
    dualPts.forEach((p) => {
      latLngs.push([p[1], p[2]]);
      latLngs.push([p[7], p[8]]);
    });
    return L.latLngBounds(latLngs);
  }, [dualPts]);

  // 1. Initialize Leaflet Map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: L.LatLngTuple = dualPts.length > 0 
      ? [dualPts[0][1], dualPts[0][2]] 
      : [42.45, 2.75];

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: 13,
      zoomControl: false,
    });

    // Custom zoom control in bottom-right so top-right toolbar has plenty of space
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Initial tile layer
    const provider = TILE_PROVIDERS[tileSource];
    const tileLayer = L.tileLayer(provider.url, {
      attribution: provider.attribution,
      maxZoom: provider.maxZoom,
    }).addTo(map);
    tileLayerRef.current = tileLayer;

    // Feature groups
    const tracksGroup = L.featureGroup().addTo(map);
    tracksLayerGroupRef.current = tracksGroup;

    const markersGroup = L.featureGroup().addTo(map);
    staticMarkersLayerGroupRef.current = markersGroup;

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // Run once on mount

  // Automatically fit bounds whenever a new trace is loaded or bounds change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !trackBounds) return;
    map.invalidateSize();
    map.fitBounds(trackBounds, { padding: [40, 40], animate: true });
  }, [trackBounds]);

  // Check if only a single course is loaded
  const isSingleCourse = Boolean(
    course1 && course2 && (course1 === course2 || (course1.name === course2.name && course1.totalDistanceKm === course2.totalDistanceKm))
  );

  // 2. Handle tile source switch
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const provider = TILE_PROVIDERS[tileSource];
    const newTileLayer = L.tileLayer(provider.url, {
      attribution: provider.attribution,
      maxZoom: provider.maxZoom,
    }).addTo(map);
    tileLayerRef.current = newTileLayer;
  }, [tileSource]);

  // 3. Render Static Tracks and Markers when dualPts or mapMode changes
  useEffect(() => {
    const map = mapRef.current;
    const tracksGroup = tracksLayerGroupRef.current;
    const markersGroup = staticMarkersLayerGroupRef.current;
    if (!map || !tracksGroup || !markersGroup || dualPts.length === 0) return;

    tracksGroup.clearLayers();
    markersGroup.clearLayers();

    // Trace 1 positions & Trace 2 positions
    const pos1: L.LatLngTuple[] = dualPts.map((p) => [p[1], p[2]]);
    const pos2: L.LatLngTuple[] = dualPts.map((p) => [p[7], p[8]]);

    // Click handler on polylines to jump timeline
    const handlePolyClick = (e: L.LeafletMouseEvent) => {
      const clickLat = e.latlng.lat;
      const clickLng = e.latlng.lng;
      let bestIdx = 0;
      let minDistance = Infinity;

      dualPts.forEach((p, idx) => {
        const d1 = Math.pow(p[1] - clickLat, 2) + Math.pow(p[2] - clickLng, 2);
        const d2 = Math.pow(p[7] - clickLat, 2) + Math.pow(p[8] - clickLng, 2);
        const d = Math.min(d1, d2);
        if (d < minDistance) {
          minDistance = d;
          bestIdx = idx;
        }
      });
      onSelectPoint(bestIdx);
    };

    if (mapMode === 'dual') {
      if (!isSingleCourse) {
        // Divergence lines between traces when distance > 30m
        dualPts.forEach((p, idx) => {
          if (p[12] > 30) {
            const divLine = L.polyline(
              [
                [p[1], p[2]],
                [p[7], p[8]],
              ],
              {
                color: '#f59e0b',
                weight: 2,
                dashArray: '3, 4',
                opacity: 0.85,
              }
            );
            divLine.bindTooltip(`Écart de trace : ${Math.round(p[12])} m (Km ${p[0].toFixed(1)})`);
            tracksGroup.addLayer(divLine);
          }
        });
      }

      // 1. Trace 1 (Référence / Norme) — Coral / Rose with subtle white outline
      const halo1 = L.polyline(pos1, {
        color: '#ffffff',
        weight: 6,
        opacity: 0.75,
        lineCap: 'round',
        lineJoin: 'round',
      });
      tracksGroup.addLayer(halo1);

      const line1 = L.polyline(pos1, {
        color: '#e11d48',
        weight: 3.8,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      });
      line1.bindTooltip(
        `<strong>${isSingleCourse ? 'Tracé' : 'Trace 1 (Référence)'}</strong><br/>${course1.name}<br/>${course1.totalDistanceKm} km • D+ ${course1.elevationGainM}m`
      );
      line1.on('click', handlePolyClick);
      tracksGroup.addLayer(line1);

      if (!isSingleCourse) {
        // 2. Trace 2 (Comparée / Réalisée) — Electric Sky Blue Dashed with white outline
        const halo2 = L.polyline(pos2, {
          color: '#ffffff',
          weight: 6,
          opacity: 0.75,
          lineCap: 'round',
          lineJoin: 'round',
        });
        tracksGroup.addLayer(halo2);

        const line2 = L.polyline(pos2, {
          color: '#0284c7',
          weight: 3.5,
          opacity: 0.95,
          dashArray: '7, 5',
          lineCap: 'round',
          lineJoin: 'round',
        });
        line2.bindTooltip(
          `<strong>Trace 2 (Comparée)</strong><br/>${course2.name}<br/>${course2.totalDistanceKm} km • D+ ${course2.elevationGainM}m`
        );
        line2.on('click', handlePolyClick);
        tracksGroup.addLayer(line2);
      }

    } else {
      // Thermal mode: Green = gained time, Red = lost time
      for (let i = 0; i < dualPts.length - 1; i++) {
        const p1 = dualPts[i];
        const p2 = dualPts[i + 1];
        const localGain = (p2[4] - p1[4]) - (p2[10] - p1[10]);
        const isGaining = localGain >= 0;

        const segmentHalo = L.polyline(
          [
            [p1[1], p1[2]],
            [p2[1], p2[2]],
          ],
          {
            color: '#ffffff',
            weight: 6,
            opacity: 0.7,
            lineCap: 'round',
          }
        );
        tracksGroup.addLayer(segmentHalo);

        const segment = L.polyline(
          [
            [p1[1], p1[2]],
            [p2[1], p2[2]],
          ],
          {
            color: isGaining ? '#10b981' : '#ef4444',
            weight: 4.2,
            opacity: 0.95,
            lineCap: 'round',
          }
        );
        segment.bindTooltip(
          `Km ${p1[0].toFixed(1)} &rarr; ${p2[0].toFixed(1)} : ${isGaining ? 'Avance (Gain)' : 'Retard (Perte)'} (${Math.abs(localGain).toFixed(1)}s)`
        );
        segment.on('click', handlePolyClick);
        tracksGroup.addLayer(segment);
      }
    }

    // Departure Marker (D)
    const startPt = dualPts[0];
    const startIcon = L.divIcon({
      className: 'comparator-pin-marker comparator-pin-start',
      html: 'D',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    const startMarker = L.marker([startPt[1], startPt[2]], { icon: startIcon });
    startMarker.bindPopup(
      `<strong>Départ</strong><br/>Altitude : ${Math.round(startPt[3])}m<br/>Km 0.0`
    );
    markersGroup.addLayer(startMarker);

    // Finish Marker (A)
    const endPt = dualPts[dualPts.length - 1];
    const finishIcon = L.divIcon({
      className: 'comparator-pin-marker comparator-pin-finish',
      html: 'A',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    const finishMarker = L.marker([endPt[1], endPt[2]], { icon: finishIcon });
    finishMarker.bindPopup(
      `<strong>Arrivée</strong><br/>Distance : ${endPt[0].toFixed(1)} km<br/>Altitude : ${Math.round(endPt[3])}m`
    );
    markersGroup.addLayer(finishMarker);

    // Summit / Peak Marker (▲)
    const peakPt = dualPts[peakIdx];
    if (peakPt) {
      const summitIcon = L.divIcon({
        className: 'comparator-summit-badge',
        html: `⛰️ Sommet ${Math.round(peakAlt)}m`,
        iconSize: [100, 22],
        iconAnchor: [50, 11],
      });
      const summitMarker = L.marker([peakPt[1], peakPt[2]], { icon: summitIcon });
      summitMarker.bindPopup(
        `<strong>Point Culminant</strong><br/>Altitude max : ${Math.round(peakAlt)}m<br/>Km : ${peakPt[0].toFixed(1)}`
      );
      markersGroup.addLayer(summitMarker);
    }

    // Roadbook Waypoints & Aid Stations (Ravitos, Cols, Postes)
    if (course1?.waypoints && course1.waypoints.length > 0) {
      course1.waypoints.forEach((wp) => {
        // Skip extreme boundaries handled by Start/Finish
        if (wp.km < 0.2 || wp.km > (course1.totalDistanceKm - 0.2)) return;

        let iconEmoji = '📍';
        if (wp.type === 'food' || wp.type === 'ravito') iconEmoji = '🥪';
        else if (wp.type === 'water') iconEmoji = '💧';
        else if (wp.type === 'peak') iconEmoji = '⛰️';

        const lat = wp.lat ?? dualPts.find((p) => p[0] >= wp.km)?.[1] ?? dualPts[0][1];
        const lon = wp.lon ?? dualPts.find((p) => p[0] >= wp.km)?.[2] ?? dualPts[0][2];

        const aidIcon = L.divIcon({
          className: 'comparator-aid-badge',
          html: `${iconEmoji} ${wp.name}`,
          iconSize: [120, 22],
          iconAnchor: [60, 11],
        });

        const aidMarker = L.marker([lat, lon], { icon: aidIcon });
        const timeStr = wp.plannedTimeSec ? fmtTime(wp.plannedTimeSec) : '';
        const pauseStr = wp.pauseMin ? `<br/>Pause prévue : ${wp.pauseMin} min` : '';
        const cutoffStr = wp.cutoffTime ? `<br/>Barrière horaire : ${wp.cutoffTime}` : '';

        aidMarker.bindPopup(
          `<strong>${wp.name}</strong><br/>Km ${wp.km.toFixed(1)} • ${Math.round(wp.ele)}m${timeStr ? `<br/>Horaire prévu : ${timeStr}` : ''}${pauseStr}${cutoffStr}`
        );

        aidMarker.on('click', () => {
          let closestIdx = 0;
          let minD = Infinity;
          dualPts.forEach((p, idx) => {
            const d = Math.abs(p[0] - wp.km);
            if (d < minD) {
              minD = d;
              closestIdx = idx;
            }
          });
          onSelectPoint(closestIdx);
        });

        markersGroup.addLayer(aidMarker);
      });
    }
  }, [dualPts, mapMode, course1, course2, peakIdx, peakAlt, onSelectPoint]);

  // 4. Create and update Active Virtual Partner Runner markers (T1 and T2)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || dualPts.length === 0) return;

    const cur = dualPts[activeIdx] || dualPts[0];
    const tCurrent = (isPlaying && simTime !== undefined) ? simTime : cur[4];

    // Determine Runner 1 (T1) position and telemetry
    let p1LatLng: L.LatLngTuple;
    let dist1 = cur[0];
    let alt1 = cur[3];
    let isT1Finished = false;

    if (isPlaying && simTime !== undefined && course1?.points?.length > 0) {
      const pos1 = getPointAtTime(course1.points, tCurrent);
      p1LatLng = [pos1.lat, pos1.lon];
      dist1 = pos1.distKm;
      alt1 = pos1.ele;
      isT1Finished = tCurrent >= course1.totalDurationSec;
    } else {
      p1LatLng = [cur[1], cur[2]];
      dist1 = cur[0];
      alt1 = cur[3];
      isT1Finished = cur[0] >= course1.totalDistanceKm - 0.05;
    }

    // Create or update Runner 1 (T1) marker
    const t1Icon = L.divIcon({
      className: 'comparator-runner-marker comparator-runner-t1',
      html: `
        <div class="comparator-runner-pulse"></div>
        <div class="comparator-runner-inner">${isT1Finished ? '🏁' : 'T1'}</div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });

    if (!runner1MarkerRef.current) {
      const m1 = L.marker(p1LatLng, { icon: t1Icon, zIndexOffset: 1000 }).addTo(map);
      m1.bindTooltip(
        `<strong>T1 (Référence)</strong><br/>Dist : ${dist1.toFixed(2)} km<br/>Alt : ${Math.round(alt1)}m<br/>Temps : ${fmtTime(tCurrent)}${isT1Finished ? '<br/>🏁 Arrivé(e) !' : ''}`
      );
      runner1MarkerRef.current = m1;
    } else {
      runner1MarkerRef.current.setIcon(t1Icon);
      runner1MarkerRef.current.setLatLng(p1LatLng);
      runner1MarkerRef.current.setTooltipContent(
        `<strong>T1 (Référence)</strong><br/>Dist : ${dist1.toFixed(2)} km<br/>Alt : ${Math.round(alt1)}m<br/>Temps : ${fmtTime(tCurrent)}${isT1Finished ? '<br/>🏁 Arrivé(e) !' : ''}`
      );
    }

    if (!isSingleCourse) {
      // Determine Runner 2 (T2) position according to syncMode
      let p2LatLng: L.LatLngTuple;
      let dist2 = cur[6];
      let alt2 = cur[9];
      let isT2Finished = false;

      if (syncMode === 'time' && course2?.points && course2.points.length > 0) {
        const pos2 = getPointAtTime(course2.points, tCurrent);
        p2LatLng = [pos2.lat, pos2.lon];
        dist2 = pos2.distKm;
        alt2 = pos2.ele;
        isT2Finished = tCurrent >= course2.totalDurationSec;
      } else {
        // Distance mode: same kilometer
        p2LatLng = [cur[7], cur[8]];
        dist2 = cur[6];
        alt2 = cur[9];
      }

      const t2LeadM = Math.round((dist2 - dist1) * 1000);
      const gainSec = cur[4] - cur[10];

      // Create or update Runner 2 (T2) marker
      const t2Icon = L.divIcon({
        className: 'comparator-runner-marker comparator-runner-t2',
        html: `
          <div class="comparator-runner-pulse"></div>
          <div class="comparator-runner-inner">${isT2Finished ? '🏁' : 'T2'}</div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const t2TooltipHtml = syncMode === 'time'
        ? `<strong>T2 (Comparée)</strong><br/>` +
          (isT2Finished
            ? `🏁 <span style="color:#10b981;font-weight:bold;">Arrivé(e) en ${fmtTime(course2.totalDurationSec)}</span><br/>${t2LeadM > 0 ? `Avance de ${t2LeadM} m` : ''}`
            : `Dist : ${dist2.toFixed(2)} km<br/>Alt : ${Math.round(alt2)}m<br/>Temps : ${fmtTime(tCurrent)}<br/>` +
              (t2LeadM > 20
                ? `<span style="color:#10b981;font-weight:bold;">▲ En AVANCE de ${t2LeadM} m (${fmtDelta(gainSec)})</span>`
                : t2LeadM < -20
                ? `<span style="color:#ef4444;font-weight:bold;">▼ En RETARD de ${Math.abs(t2LeadM)} m (${fmtDelta(gainSec)})</span>`
                : `Au coude à coude (<20m)`)
          )
        : `<strong>T2 (Comparée)</strong><br/>Dist : ${dist2.toFixed(2)} km<br/>Alt : ${Math.round(alt2)}m<br/>Temps : ${fmtTime(cur[10])}<br/>Écart : ${fmtDelta(gainSec)}`;

      if (!runner2MarkerRef.current) {
        const m2 = L.marker(p2LatLng, { icon: t2Icon, zIndexOffset: 1000 }).addTo(map);
        m2.bindTooltip(t2TooltipHtml);
        runner2MarkerRef.current = m2;
      } else {
        runner2MarkerRef.current.setIcon(t2Icon);
        runner2MarkerRef.current.setLatLng(p2LatLng);
        runner2MarkerRef.current.setTooltipContent(t2TooltipHtml);
      }

      // Trail Gap Polyline along the course track (Time Mode)
      if (syncMode === 'time' && Math.abs(t2LeadM) > 25 && course1?.points) {
        const gapCoords: L.LatLngTuple[] = [];
        const startPos = dist1 <= dist2 ? p1LatLng : p2LatLng;
        const endPos = dist1 <= dist2 ? p2LatLng : p1LatLng;
        gapCoords.push(startPos);

        const minK = Math.min(dist1, dist2);
        const maxK = Math.max(dist1, dist2);
        for (const pt of course1.points) {
          if (pt.distKm > minK && pt.distKm < maxK) {
            gapCoords.push([pt.lat, pt.lon]);
          }
        }
        gapCoords.push(endPos);

        const gapColor = t2LeadM > 0 ? '#10b981' : '#f43f5e';
        const gapTooltip = `<strong>Écart Virtual Partner</strong><br/>${t2LeadM > 0 ? 'T2 en avance de' : 'T2 en retard de'} ${Math.abs(t2LeadM)} m (${fmtDelta(gainSec)})`;

        if (!gapTrailLineRef.current) {
          const gLine = L.polyline(gapCoords, {
            color: gapColor,
            weight: 5,
            opacity: 0.9,
            dashArray: '6, 6',
            lineCap: 'round',
          }).addTo(map);
          gLine.bindTooltip(gapTooltip);
          gapTrailLineRef.current = gLine;
        } else {
          gapTrailLineRef.current.setLatLngs(gapCoords);
          gapTrailLineRef.current.setStyle({ color: gapColor });
          gapTrailLineRef.current.setTooltipContent(gapTooltip);
        }
      } else {
        if (gapTrailLineRef.current) {
          gapTrailLineRef.current.remove();
          gapTrailLineRef.current = null;
        }
      }

      // Direct connector line between Runner 1 and Runner 2
      const connColor = syncMode === 'time'
        ? (t2LeadM > 0 ? '#10b981' : '#f43f5e')
        : '#0f172a';
      const connTooltip = syncMode === 'time'
        ? `Écart direct : ${Math.round(haversineDistance(p1LatLng[0], p1LatLng[1], p2LatLng[0], p2LatLng[1]) * 1000)} m`
        : `Écart physique : ${Math.round(cur[12])} m`;

      if (!connectorLineRef.current) {
        const conn = L.polyline([p1LatLng, p2LatLng], {
          color: connColor,
          weight: 2,
          dashArray: '3, 4',
          opacity: 0.75,
        }).addTo(map);
        conn.bindTooltip(connTooltip);
        connectorLineRef.current = conn;
      } else {
        connectorLineRef.current.setLatLngs([p1LatLng, p2LatLng]);
        connectorLineRef.current.setStyle({ color: connColor });
        connectorLineRef.current.setTooltipContent(connTooltip);
      }
    } else {
      if (runner2MarkerRef.current) {
        runner2MarkerRef.current.remove();
        runner2MarkerRef.current = null;
      }
      if (connectorLineRef.current) {
        connectorLineRef.current.remove();
        connectorLineRef.current = null;
      }
      if (gapTrailLineRef.current) {
        gapTrailLineRef.current.remove();
        gapTrailLineRef.current = null;
      }
    }

    // Follow runner auto-pan during simulation if enabled
    if (followRunner && map) {
      map.panTo(p1LatLng, { animate: true, duration: 0.12 });
    }
  }, [activeIdx, simTime, isPlaying, dualPts, followRunner, isSingleCourse, syncMode, course1, course2]);

  // Clean up runner markers on unmount
  useEffect(() => {
    return () => {
      runner1MarkerRef.current?.remove();
      runner1MarkerRef.current = null;
      runner2MarkerRef.current?.remove();
      runner2MarkerRef.current = null;
      connectorLineRef.current?.remove();
      connectorLineRef.current = null;
      gapTrailLineRef.current?.remove();
      gapTrailLineRef.current = null;
    };
  }, []);

  // Quick navigation helpers
  const handleRecenter = () => {
    if (mapRef.current && trackBounds) {
      mapRef.current.fitBounds(trackBounds, { padding: [40, 40], animate: true });
    }
  };

  const handleFocus = (target: 'start' | 'summit' | 'finish' | 'runners') => {
    const map = mapRef.current;
    if (!map || dualPts.length === 0) return;

    if (target === 'start') {
      const p = dualPts[0];
      map.flyTo([p[1], p[2]], 15, { duration: 0.8 });
      onSelectPoint(0);
    } else if (target === 'summit') {
      const p = dualPts[peakIdx];
      map.flyTo([p[1], p[2]], 15, { duration: 0.8 });
      onSelectPoint(peakIdx);
    } else if (target === 'finish') {
      const p = dualPts[dualPts.length - 1];
      map.flyTo([p[1], p[2]], 15, { duration: 0.8 });
      onSelectPoint(dualPts.length - 1);
    } else if (target === 'runners') {
      const p = dualPts[activeIdx] || dualPts[0];
      map.flyTo([p[1], p[2]], 15, { duration: 0.8 });
    }
  };

  const handleToggleExpand = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
          if (trackBounds) {
            mapRef.current.fitBounds(trackBounds, { padding: [40, 40] });
          }
        }
      }, 360);
      return next;
    });
  };

  // Telemetry distance gap calculation for bottom badge
  const activeT1 = isPlaying && simTime !== undefined ? simTime : (curPoint ? curPoint[4] : 0);
  const activeDist1 = isPlaying && simTime !== undefined && course1?.points?.length
    ? getPointAtTime(course1.points, activeT1).distKm
    : (curPoint ? curPoint[0] : 0);

  const p2AtT1 = useMemo(() => {
    if (isSingleCourse || !course2?.points || course2.points.length === 0) return null;
    return getPointAtTime(course2.points, activeT1);
  }, [isSingleCourse, course2?.points, activeT1]);

  const liveT2LeadM = p2AtT1 ? Math.round((p2AtT1.distKm - activeDist1) * 1000) : 0;

  return (
    <div className={`${styles.mapContainerWrapper} ${isExpanded ? styles.mapExpanded : ''}`}>
      {/* Top Floating Controls */}
      <div className={styles.topControls}>
        {/* Left: Mode toggles */}
        <div className={styles.controlGroup}>
          <button
            type="button"
            onClick={() => onChangeMapMode('dual')}
            className={`${styles.mapBtn} ${mapMode === 'dual' ? styles.mapBtnActive : ''}`}
            title="Afficher les 2 traces superposées"
          >
            <span className={styles.legendDotT1}></span>
            <span className={styles.legendDotT2}></span>
            <span>2 Traces</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeMapMode('thermal')}
            className={`${styles.mapBtn} ${mapMode === 'thermal' ? styles.mapBtnActive : ''}`}
            title="Afficher les segments gain (vert) / perte (rouge)"
          >
            <span className={styles.legendDotGain}></span>
            <span className={styles.legendDotLoss}></span>
            <span>Gain/Perte</span>
          </button>

          {!isSingleCourse && (
            <button
              type="button"
              onClick={() => setSyncMode(syncMode === 'time' ? 'distance' : 'time')}
              className={`${styles.mapBtn} ${syncMode === 'time' ? styles.mapBtnActive : ''}`}
              title={
                syncMode === 'time'
                  ? "Mode Duel Chrono (Virtual Partner) actif : les 2 coureurs sont positionnés au même instant T, montrant l'écart réel de course. Cliquez pour comparer au même kilomètre."
                  : "Mode Même Kilomètre actif : les 2 coureurs sont positionnés au même kilomètre géographique. Cliquez pour passer au duel chrono en temps réel."
              }
            >
              <Clock size={12} className={syncMode === 'time' ? "text-amber-400" : "text-slate-400"} />
              <span>{syncMode === 'time' ? '⏱️ Duel Chrono' : '📍 Même Km'}</span>
            </button>
          )}
        </div>

        {/* Right: Map Actions (Layers, Focus, Recenter, Fullscreen) */}
        <div className={styles.controlGroup}>
          <select
            value={tileSource}
            onChange={(e) => setTileSource(e.target.value as TileSource)}
            className={styles.layerSelect}
            title="Changer le fond de carte"
          >
            <option value="osm">Plan (OSM)</option>
            <option value="topo">Topo (IGN/OTM)</option>
            <option value="satellite">Satellite (Esri)</option>
          </select>

          <button
            type="button"
            onClick={() => setFollowRunner(!followRunner)}
            className={`${styles.mapBtn} ${followRunner ? styles.mapBtnActive : ''}`}
            title="Suivre automatiquement le coureur pendant la simulation"
          >
            <span>🏃 Suivre</span>
          </button>

          <button
            type="button"
            onClick={() => handleFocus('start')}
            className={styles.mapBtn}
            title="Zoomer sur le Départ"
          >
            <span>Départ</span>
          </button>

          <button
            type="button"
            onClick={() => handleFocus('summit')}
            className={styles.mapBtn}
            title="Zoomer sur le Sommet"
          >
            <Mountain size={13} />
            <span>Sommet</span>
          </button>

          <button
            type="button"
            onClick={() => handleFocus('finish')}
            className={styles.mapBtn}
            title="Zoomer sur l'Arrivée"
          >
            <span>Arrivée</span>
          </button>

          <button
            type="button"
            onClick={handleRecenter}
            className={styles.mapBtn}
            title="Recentrer sur la totalité de la trace"
          >
            <Crosshair size={13} />
            <span>Recentrer</span>
          </button>

          <button
            type="button"
            onClick={handleToggleExpand}
            className={styles.mapBtn}
            title={isExpanded ? 'Réduire la carte' : 'Agrandir la carte'}
          >
            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Leaflet Map Div */}
      <div ref={containerRef} className={styles.leafletMap} />

      {/* Bottom Left Floating Telemetry Badge */}
      {curPoint && (
        <div className={styles.telemetryBadge}>
          <div className={styles.telemetryItem}>
            <MapPin size={13} className="text-orange-400" />
            <span>Km {activeDist1.toFixed(1)}</span>
          </div>

          <div className={styles.telemetryDivider}></div>

          <div className={styles.telemetryItem}>
            <Mountain size={13} className="text-sky-400" />
            <span>{Math.round(curPoint[3])}m</span>
          </div>

          <div className={styles.telemetryDivider}></div>

          <div className={styles.telemetryItem}>
            {isSingleCourse ? (
              <>
                <span className="text-xs text-slate-300">Temps :</span>
                <span className="text-xs font-bold text-slate-100">
                  {fmtTime(activeT1)}
                </span>
              </>
            ) : (
              <>
                <span className="text-xs text-slate-300">Écart :</span>
                <span className={deltaSec >= 0 ? styles.badgeDeltaPos : styles.badgeDeltaNeg}>
                  {fmtDelta(deltaSec)}
                </span>
                {syncMode === 'time' && (
                  <span className={`text-[11px] font-bold ${liveT2LeadM > 15 ? 'text-emerald-400' : liveT2LeadM < -15 ? 'text-rose-400' : 'text-slate-300'}`}>
                    ({liveT2LeadM > 15 ? `+${liveT2LeadM}m T2` : liveT2LeadM < -15 ? `${liveT2LeadM}m T2` : 'Égalité'})
                  </span>
                )}
              </>
            )}
          </div>

          {!isSingleCourse && curPoint[12] > 10 && (
            <>
              <div className={styles.telemetryDivider}></div>
              <div className={styles.telemetryItem}>
                <span className="text-xs text-amber-300">Divergence : {Math.round(curPoint[12])}m</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Bottom Right Floating Legend Badge */}
      <div className={styles.legendBadge}>
        {isSingleCourse ? (
          <div className={styles.legendItem}>
            <span className={styles.legendDotT1}></span>
            <span>{course1.name.slice(0, 20)}</span>
          </div>
        ) : mapMode === 'dual' ? (
          <>
            <div className={styles.legendItem}>
              <span className={styles.legendDotT1}></span>
              <span>{course1.name.slice(0, 16)}</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendDotT2}></span>
              <span>{course2.name.slice(0, 16)}</span>
            </div>
          </>
        ) : (
          <>
            <div className={styles.legendItem}>
              <span className={styles.legendDotGain}></span>
              <span>Avance (Gain)</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendDotLoss}></span>
              <span>Retard (Perte)</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
