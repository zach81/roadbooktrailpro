"use client";

import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Line } from 'react-chartjs-2';
import { generateChartData, getNightIntensity } from '@/lib/roadbookCalculator';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  zoomPlugin
);

export default function ElevationProfile({ points, segments, onAddWaypointByDistance, startTime, onHoverDistance, distanceFactor = 1 }) {

  // 1. Génération des données XY pour le graphique (Distance, Altitude, Pente)
  const chartData = useMemo(() => {
    const rawData = generateChartData(points, distanceFactor);

    // Downsampling pour éviter le lag au survol (max ~800 points)
    if (rawData.length <= 800) return rawData;

    const step = Math.ceil(rawData.length / 800);
    const downsampled = [];
    for (let i = 0; i < rawData.length; i += step) {
      downsampled.push(rawData[i]);
    }
    // S'assurer de toujours inclure le tout dernier point (l'arrivée)
    if (downsampled[downsampled.length - 1] !== rawData[rawData.length - 1]) {
      downsampled.push(rawData[rawData.length - 1]);
    }

    return downsampled;
  }, [points, distanceFactor]);

  // 2. Configuration du graphique
  const data = useMemo(() => {
    return {
      datasets: [
        {
          // 1. Remplissage solide sans segment (pour éviter les lignes blanches de séparation)
          label: 'Surface',
          data: chartData,
          fill: true,
          normalized: true,
          backgroundColor: 'rgba(239, 68, 68, 0.15)', // Rouge très clair
          borderWidth: 0, // Pas de bordure ici
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0.1
        },
        {
          // 2. Ligne colorée par-dessus (sans remplissage)
          label: 'Altitude',
          data: chartData,
          fill: false,
          normalized: true,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.1,
          segment: {
            borderColor: ctx => {
              const index = ctx.p1DataIndex;
              if (index === undefined) return '#10B981';

              const slope = chartData[index]?.slope || 0;
              if (slope > 10) return '#7F1D1D'; // Montée très forte
              if (slope > 3) return '#EF4444'; // Montée
              if (slope > -3) return '#F59E0B'; // Plat / Faux-plat
              if (slope > -10) return '#10B981'; // Descente
              return '#065F46'; // Descente très forte
            }
          }
        }
      ]
    };
  }, [chartData]);

  const segmentsRef = React.useRef(segments);
  const startTimeRef = React.useRef(startTime);
  const callbacksRef = React.useRef({ onAddWaypointByDistance, onHoverDistance });

  const pointsRef = React.useRef(points);

  React.useEffect(() => {
    segmentsRef.current = segments;
    startTimeRef.current = startTime;
    pointsRef.current = points;
    callbacksRef.current = { onAddWaypointByDistance, onHoverDistance };
  }, [segments, startTime, onAddWaypointByDistance, onHoverDistance, points]);

  const nightZonesPlugin = useMemo(() => {
    return {
      id: 'nightZonesPlugin',
      beforeDraw: (chart) => {
        const { ctx, chartArea: { top, bottom, left, right }, scales: { x } } = chart;
        const currentSegments = segmentsRef.current;
        const start = startTimeRef.current;
        if (!currentSegments || currentSegments.length === 0 || !start) return;

        const startTimestamp = new Date(start).getTime();
        if (isNaN(startTimestamp)) return; // Invalid date
        
        ctx.save();
        
        const startX = Math.max(left, x.getPixelForValue(0));
        const endX = Math.min(right, x.getPixelForValue(x.max));
        const width = 2; // draw 2px rectangles for performance
        
        for (let px = startX; px < endX; px += width) {
          const dist = x.getValueForPixel(px);
          
          const segIndex = currentSegments.findIndex(s => s.cumulDistance >= dist);
          if (segIndex === -1) continue;
          
          const seg = currentSegments[segIndex];
          const prevDist = segIndex === 0 ? 0 : currentSegments[segIndex-1].cumulDistance;
          const prevTime = segIndex === 0 ? startTimestamp : new Date(currentSegments[segIndex-1].arr_slow).getTime();
          const currTime = new Date(seg.arr_slow).getTime();
          
          const distRatio = seg.distance === 0 ? 0 : (dist - prevDist) / seg.distance;
          const timeAtDist = prevTime + distRatio * (currTime - prevTime);
          
          const dateAtDist = new Date(timeAtDist);
          
          const pts = pointsRef.current;
          const lat = pts && pts.length > 0 ? pts[0].lat : 45.9; // Default approx to Mont Blanc
          const lon = pts && pts.length > 0 ? pts[0].lon : 6.8;
          
          const nightIntensity = getNightIntensity(dateAtDist, lat, lon);
          const isNight = nightIntensity > 0;
          
          if (isNight) {
            const opacity = 0.05 + (0.35 * nightIntensity);
            ctx.fillStyle = `rgba(15, 23, 42, ${opacity})`; // Slate 900
            ctx.fillRect(px, top, width, bottom - top);
          }
        }
        ctx.restore();
      }
    };
  }, []);

  // 3. Plugin très léger pour marquer les waypoints existants sans surcharger le visuel
  const simpleWaypointsPlugin = useMemo(() => {
    return {
      id: 'simpleWaypointsPlugin',
      afterDraw: (chart) => {
        const { ctx, chartArea: { top, bottom, left, right }, scales: { x } } = chart;
        const currentSegments = segmentsRef.current;
        if (!currentSegments || currentSegments.length === 0) return;

        // Draw start point
        const startX = x.getPixelForValue(0);
        if (startX >= left - 1 && startX <= right + 1) {
          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([2, 4]);
          ctx.moveTo(startX, top);
          ctx.lineTo(startX, bottom);
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)'; // Vert
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.beginPath();
          ctx.setLineDash([]);
          ctx.arc(startX, bottom, 8, 0, 2 * Math.PI);
          ctx.fillStyle = '#10B981';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 9px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText("D", startX, bottom + 1);
          ctx.restore();
        }

        currentSegments.forEach((seg, index) => {
          if (seg.cumulDistance === undefined) return;
          const xPos = x.getPixelForValue(seg.cumulDistance);
          if (xPos < left - 1 || xPos > right + 1) return;

          ctx.save();

          ctx.beginPath();
          ctx.setLineDash([2, 4]);
          ctx.moveTo(xPos, top);
          ctx.lineTo(xPos, bottom);
          ctx.strokeStyle = 'rgba(17, 24, 39, 0.4)'; // Gris foncé semi-transparent
          ctx.lineWidth = 2;
          ctx.stroke();

          // Draw a small circle with the number at the bottom (on the X-axis)
          const wpIndex = index + 1;
          const label = wpIndex === currentSegments.length ? "A" : wpIndex.toString();

          ctx.beginPath();
          ctx.setLineDash([]);
          ctx.arc(xPos, bottom, 8, 0, 2 * Math.PI);
          ctx.fillStyle = wpIndex === currentSegments.length ? '#EF4444' : '#3B82F6';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 9px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, xPos, bottom + 1); // +1 to visually center depending on baseline

          ctx.restore();
        });
      }
    };
  }, []); // Vide, le plugin est créé une seule fois

  const options = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      // Détection du survol sur tout l'axe vertical
      interaction: {
        mode: 'index',
        intersect: false,
      },
      layout: {
        padding: {
          top: 10,
          bottom: 10
        }
      },
      plugins: {
        legend: { display: false },
        zoom: {
          pan: {
            enabled: true,
            mode: 'x',
          },
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true
            },
            mode: 'x',
          }
        },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          titleColor: '#6B7280', // Text secondary (gris)
          bodyColor: '#111827', // Text primary (foncé)
          borderColor: '#E5E7EB',
          borderWidth: 1,
          padding: 8,
          displayColors: false,
          titleFont: { size: 10, weight: 'normal' },
          bodyFont: { size: 11, weight: 'bold' },
          filter: (tooltipItem) => tooltipItem.datasetIndex === 1, // Ne montrer que la ligne d'altitude
          callbacks: {
            title: (context) => {
              return `Distance : ${context[0].raw.x.toFixed(2)} km`;
            },
            label: (context) => {
              const p = context.raw;
              return `${Math.round(p.y)} m (Pente: ${p.slope > 0 ? '+' : ''}${p.slope.toFixed(1)}%)`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          display: true,
          title: { display: false },
          ticks: {
            callback: (value) => value.toFixed(1) + ' km'
          }
        },
        y: {
          display: true,
          title: { display: false },
          ticks: {
            callback: (value) => value + ' m'
          }
        }
      },
      onClick: (event, elements, chart) => {
        const { onAddWaypointByDistance } = callbacksRef.current;
        if (!onAddWaypointByDistance) return;

        const xValue = chart.scales.x.getValueForPixel(event.x);

        if (xValue >= chart.scales.x.min && xValue <= chart.scales.x.max) {
          onAddWaypointByDistance(xValue);
        }
      },
      onHover: (event, elements, chart) => {
        const { onHoverDistance } = callbacksRef.current;
        if (!onHoverDistance) return;

        if (elements && elements.length > 0) {
          const index = elements[0].index;
          const dist = chart.data.datasets[0].data[index].x;
          onHoverDistance(dist);
        }
      }
    };
  }, []); // Tableau de dépendances vide pour ne jamais recréer les options et casser le zoom !

  const chartRef = React.useRef(null);

  React.useEffect(() => {
    if (chartRef.current) {
      chartRef.current.update('none');
    }
  }, [segments]);

  if (!chartData || chartData.length === 0) {
    return <div>Pas assez de données pour afficher le profil.</div>;
  }

  return (
    <div
      style={{ height: '220px', width: '100%', position: 'relative' }}
      onMouseLeave={() => onHoverDistance && onHoverDistance(null)}
    >
      <Line ref={chartRef} data={data} options={options} plugins={[simpleWaypointsPlugin, nightZonesPlugin]} />
    </div>
  );
}
