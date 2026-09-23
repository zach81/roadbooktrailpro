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
import { Line } from 'react-chartjs-2';
import { generateChartData } from '@/lib/roadbookCalculator';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler
);

export default function SegmentElevationProfile({ points, baseCumulDist = 0, distanceFactor = 1 }) {

  const chartData = useMemo(() => {
    if (!points || points.length === 0) return [];
    
    // Generate data for this specific segment
    // generateChartData starts at x=0 for its first point, so we need to offset it by baseCumulDist
    const rawData = generateChartData(points, distanceFactor);
    return rawData.map(p => ({
      ...p,
      x: p.x + baseCumulDist
    }));
  }, [points, baseCumulDist, distanceFactor]);

  const data = useMemo(() => {
    return {
      datasets: [
        {
          label: 'Surface',
          data: chartData,
          fill: true,
          normalized: true,
          backgroundColor: 'rgba(239, 68, 68, 0.15)', // Rouge clair
          borderWidth: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0.1
        },
        {
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

  const options = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
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
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          titleColor: '#6B7280',
          bodyColor: '#111827',
          borderColor: '#E5E7EB',
          borderWidth: 1,
          padding: 8,
          displayColors: false,
          titleFont: { size: 10, weight: 'normal' },
          bodyFont: { size: 11, weight: 'bold' },
          filter: (tooltipItem) => tooltipItem.datasetIndex === 1,
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
      }
    };
  }, []);

  if (!chartData || chartData.length === 0) {
    return <div style={{height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280', fontSize: '0.875rem'}}>Pas de profil</div>;
  }

  return (
    <div style={{ height: '180px', width: '100%', position: 'relative' }}>
      <Line data={data} options={options} />
    </div>
  );
}
