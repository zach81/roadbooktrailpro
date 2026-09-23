"use client";

import { useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMapEvents, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix leaflet icon issue in Next.js
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createNumberedIcon = (label, color = '#3B82F6') => {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${label}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  });
};

// Composant pour écouter les clics sur la carte
function MapClickHandler({ onClick }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng);
    },
  });
  return null;
}

export default function MapComponent({ points, segments, onAddWaypoint, onRemoveWaypoint, onUpdateWaypoint, hoveredPoint, waypointCount }) {
  const mapRef = useRef(null);

  const polylinePositions = useMemo(() => {
    return points.map(p => [p.lat, p.lon]);
  }, [points]);

  // Centrer la carte sur la trace
  const bounds = useMemo(() => {
    if (polylinePositions.length === 0) return null;
    return L.latLngBounds(polylinePositions);
  }, [polylinePositions]);

  // Trouver le point de la trace le plus proche du clic
  const handleMapClick = (latlng) => {
    if (points.length === 0) return;
    
    // Simplification: Trouver le point le plus proche sur la trace
    let closestPoint = points[0];
    let minDistance = Infinity;

    points.forEach((p) => {
      const dist = Math.pow(p.lat - latlng.lat, 2) + Math.pow(p.lon - latlng.lng, 2);
      if (dist < minDistance) {
        minDistance = dist;
        closestPoint = p;
      }
    });

    if (minDistance < 0.001) {
      const name = `R${(waypointCount || 0) + 1}`;
      onAddWaypoint({
        name,
        lat: closestPoint.lat,
        lon: closestPoint.lon,
        ele: closestPoint.ele,
        id: Date.now().toString()
      });
    } else {
      alert("Veuillez cliquer plus près de la trace (ligne bleue).");
    }
  };

  return (
    <div style={{ height: '400px', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-subtle)', zIndex: 10 }}>
      {bounds && (
        <MapContainer bounds={bounds} style={{ height: '100%', width: '100%' }} ref={mapRef}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Polyline positions={polylinePositions} pathOptions={{ color: 'var(--color-primary)', weight: 4 }} />
          
          <MapClickHandler onClick={handleMapClick} />

          {segments && segments.length > 0 && (() => {
            const allWps = [segments[0].from, ...segments.map(s => s.to)];
            return allWps.map((wp, index) => {
              let label = index;
              let color = '#3B82F6'; // Default blue
              
              if (index === 0) {
                label = "D";
                color = '#10B981'; // Green for start
              } else if (index === allWps.length - 1) {
                label = "A";
                color = '#EF4444'; // Red for end
              }

              return (
                <Marker key={wp.id} position={[wp.lat, wp.lon]} icon={createNumberedIcon(label, color)}>
                  <Popup>
                    <div style={{ textAlign: 'center', minWidth: '150px' }}>
                      <input 
                        type="text" 
                        value={wp.name || ""} 
                        onChange={(e) => onUpdateWaypoint && onUpdateWaypoint(wp.id, { name: e.target.value })}
                        style={{ fontWeight: 'bold', width: '100%', marginBottom: '4px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px', padding: '2px' }}
                      /><br/>
                      <select 
                        value={wp.type || 'point'} 
                        onChange={(e) => onUpdateWaypoint && onUpdateWaypoint(wp.id, { type: e.target.value })}
                        style={{ width: '100%', marginBottom: '8px', padding: '2px', borderRadius: '4px', border: '1px solid #ccc' }}
                      >
                        <option value="point">Point de passage</option>
                        <option value="water">Point d'eau</option>
                        <option value="full">Ravito complet</option>
                        <option value="base">Base vie</option>
                      </select><br/>
                      Alt: {Math.round(wp.ele)}m
                      <br/>
                      {!wp.id.startsWith("wp-start") && !wp.id.startsWith("wp-end") && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); onRemoveWaypoint(wp.id); }}
                          style={{ marginTop: '8px', padding: '4px 8px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%' }}
                        >
                          Supprimer
                        </button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            });
          })()}
          
          {hoveredPoint && (
            <CircleMarker
              center={[hoveredPoint.lat, hoveredPoint.lon]}
              radius={7}
              pathOptions={{ color: '#111827', fillColor: '#3B82F6', fillOpacity: 1, weight: 2 }}
            />
          )}
        </MapContainer>
      )}
    </div>
  );
}
