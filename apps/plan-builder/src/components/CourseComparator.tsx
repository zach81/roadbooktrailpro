"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { 
  Upload, Play, Pause, ArrowLeftRight, 
  MapPin, Mountain, Gauge, Heart, Clock, Compass, Activity,
  ChevronDown, ChevronUp, FileCode, CheckCircle2, AlertTriangle, Layers, Loader2,
  Trash2, Sparkles, Navigation, Zap, BookOpen, Repeat,
  Award, Flag, TrendingUp, Download, Sliders, BarChart3, Bot, Send, Trophy, RefreshCw, Save
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import styles from './CourseComparator.module.css';
import { 
  ComparisonResult, ParsedCourse, parseCourseFile, compareCourses, createSingleCourseComparison, getPointAtTime 
} from '@/lib/courseParser';
import { getSampleComparison } from '@/lib/sampleCourseData';
import { 
  RoadbookDoc, 
  convertRoadbookToParsedCourse, 
  computeRoadbookRetroSync, 
  computeRoadbookModulationFromRaces,
  applyRetroSyncToRoadbookAndProfile,
  RetroSyncRecommendation
} from '@/lib/roadbookPacing';
import { 
  fetchIntervalsActivities, 
  analyzeRaceActivitiesForCalibration,
  calibrateAthleteProfileWithStreams,
  RaceCalibrationProfile 
} from '@/lib/intervalsApi';
import { useAuth } from '@/context/AuthContext';
import { getApiUrl } from '@/lib/apiHelper';
import { getUserIntervalsCredentials } from '@/lib/firebaseUtils';
import IntervalsActivityModal from './IntervalsActivityModal';
import RoadbookSelectModal from './RoadbookSelectModal';
import ComparatorExplainerModal from './ComparatorExplainerModal';

const CourseComparatorMap = dynamic(
  () => import('./CourseComparatorMap'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[440px] w-full items-center justify-center bg-slate-100/60 rounded-2xl text-slate-500 font-semibold text-xs gap-2">
        <Loader2 className="animate-spin text-orange-500" size={20} />
        Chargement de la carte Leaflet...
      </div>
    ),
  }
);

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

function fmtDelta(gainSec: number): string {
  if (isNaN(gainSec)) return '0:00';
  const sign = gainSec >= 0 ? '+' : '-';
  const abs = Math.abs(Math.round(gainSec));
  if (abs < 60) return `${sign}${abs} s`;
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (h > 0) {
    return `${sign}${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }
  return `${sign}${m} min ${String(s).padStart(2, '0')} s`;
}

interface CourseComparatorProps {
  initialAthleteName?: string;
  initialAthleteId?: string;
}

export default function CourseComparator({ initialAthleteName, initialAthleteId }: CourseComparatorProps) {
  const { currentUser } = useAuth();

  // Core comparison state
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [mapMode, setMapMode] = useState<'dual' | 'thermal'>('dual');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showUploads, setShowUploads] = useState<boolean>(true);
  const [simTime, setSimTime] = useState<number | undefined>(undefined);

  // Navigation Tabs & Chart Modes
  const [activeMainTab, setActiveMainTab] = useState<'workspace' | 'checkpoints' | 'diagnostic'>('workspace');
  const [topChartMode, setTopChartMode] = useState<'delta' | 'hr_speed'>('delta');
  const [bottomChartMode, setBottomChartMode] = useState<'splits' | 'speeds'>('splits');

  // Active Roadbook Document for live pacing calibration & Retro-synchronization
  const [activeRoadbookDoc, setActiveRoadbookDoc] = useState<RoadbookDoc | null>(null);
  const [roadbookPaceProfile, setRoadbookPaceProfile] = useState<'target' | 'fast' | 'slow'>('target');
  const [customTargetHours, setCustomTargetHours] = useState<number | undefined>(undefined);

  // Retro-Synchronization & Race Modulation state
  const [syncTargetTime, setSyncTargetTime] = useState<boolean>(true);
  const [syncPhysiology, setSyncPhysiology] = useState<boolean>(true);
  const [syncSlopes, setSyncSlopes] = useState<boolean>(true);
  const [syncWaypoints, setSyncWaypoints] = useState<boolean>(true);
  const [syncGlobalProfile, setSyncGlobalProfile] = useState<boolean>(false);
  const [isSavingRetroSync, setIsSavingRetroSync] = useState<boolean>(false);
  const [retroSyncSuccessMsg, setRetroSyncSuccessMsg] = useState<string | null>(null);
  const [raceModulationRec, setRaceModulationRec] = useState<RetroSyncRecommendation | null>(null);
  const [isLoadingRacesForCalib, setIsLoadingRacesForCalib] = useState<boolean>(false);

  // AI Coach Debrief state
  const [aiDebriefText, setAiDebriefText] = useState<string | null>(null);
  const [isGeneratingDebrief, setIsGeneratingDebrief] = useState<boolean>(false);
  const [aiDebriefError, setAiDebriefError] = useState<string | null>(null);

  // Roadbook & Explainer Modals
  const [isRoadbookModalOpen, setIsRoadbookModalOpen] = useState<boolean>(false);
  const [isExplainerOpen, setIsExplainerOpen] = useState<boolean>(false);

  // Intervals.icu Modal state
  const [isIntervalsModalOpen, setIsIntervalsModalOpen] = useState<boolean>(false);
  const [intervalsTargetTrace, setIntervalsTargetTrace] = useState<1 | 2>(1);
  const [athleteName, setAthleteName] = useState<string | undefined>(initialAthleteName);
  const [athleteId, setAthleteId] = useState<string | undefined>(initialAthleteId);

  // File loading state
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [course1, setCourse1] = useState<ParsedCourse | null>(null);
  const [course2, setCourse2] = useState<ParsedCourse | null>(null);
  const [loadingFile1, setLoadingFile1] = useState<boolean>(false);
  const [loadingFile2, setLoadingFile2] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs for canvases & interactions
  const deltaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const splitsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastAnimTimeRef = useRef<number | null>(null);
  const currentSimTimeRef = useRef<number>(0);

  const dualPts = comparison?.dualPts || [];
  const kmSplits = comparison?.kmSplits || [];

  // Ultra-HD Canvas supersampling setup
  const setupUltraHD = useCallback((canvas: HTMLCanvasElement) => {
    const dpr = Math.max(window.devicePixelRatio || 1, 2.8);
    const rect = canvas.parentElement?.getBoundingClientRect() || { width: 500, height: 300 };
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }
    return { ctx, w: rect.width, h: rect.height };
  }, []);

  // 1. Draw Top Chart (Mode 'delta': Cumulative Delta & Elevation | Mode 'hr_speed': Heart Rate & Speed)
  const drawDeltaChart = useCallback(() => {
    const canvas = deltaCanvasRef.current;
    if (!canvas || dualPts.length === 0) return;
    const { ctx, w, h } = setupUltraHD(canvas);
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);

    const padL = 56, padR = 48, padT = 20, padB = 28;
    const cw = w - padL - padR;
    const ch = h - padT - padB;
    const maxX = dualPts[dualPts.length - 1][0] || 1;
    const isSingleCourse = Boolean(!comparison?.course2 || comparison?.course1 === comparison?.course2);

    const toX = (km: number) => padL + (km / maxX) * cw;

    if (topChartMode === 'hr_speed') {
      // Heart Rate & Speed / Altitude profile mode
      let minHr = 90, maxHr = 195;
      let maxAlt = 0;
      let hasHr = false;

      dualPts.forEach((p) => {
        if (p[5] > 40 || p[11] > 40) hasHr = true;
        if (p[5] > maxHr) maxHr = p[5] + 5;
        if (p[11] > maxHr) maxHr = p[11] + 5;
        if (p[3] > maxAlt) maxAlt = p[3];
        if (p[9] > maxAlt) maxAlt = p[9];
      });

      maxAlt = Math.ceil(maxAlt / 200) * 200 + 100;
      const toYHr = (hr: number) => padT + ((maxHr - hr) / (maxHr - minHr || 1)) * ch;
      const toYAlt = (alt: number) => h - padB - (alt / (maxAlt || 1)) * (ch * 0.72);

      // Grid
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.fillStyle = '#6b7280';
      ctx.font = '600 10px Inter, sans-serif';

      for (let hrVal = 100; hrVal <= maxHr; hrVal += 20) {
        const y = toYHr(hrVal);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
        ctx.fillText(`${hrVal} bpm`, 10, y + 3.5);
      }

      const stepAlt = Math.max(200, Math.round(maxAlt / 4 / 100) * 100);
      for (let a = 0; a <= maxAlt; a += stepAlt) {
        const y = toYAlt(a);
        ctx.fillText(`${a}m`, w - padR + 6, y + 3.5);
      }

      // Background elevation fill
      ctx.beginPath();
      dualPts.forEach((p, idx) => {
        const x = toX(p[0]);
        const y = toYAlt(p[3]);
        if (idx === 0) {
          ctx.moveTo(x, h - padB);
          ctx.lineTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.lineTo(toX(maxX), h - padB);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 90, 54, 0.08)';
      ctx.fill();

      // HR 1 curve
      if (hasHr) {
        ctx.strokeStyle = '#FF5A36';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        let started1 = false;
        dualPts.forEach((p) => {
          if (p[5] > 40) {
            const x = toX(p[0]);
            const y = toYHr(p[5]);
            if (!started1) { ctx.moveTo(x, y); started1 = true; }
            else ctx.lineTo(x, y);
          }
        });
        ctx.stroke();

        if (!isSingleCourse) {
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          let started2 = false;
          dualPts.forEach((p) => {
            if (p[11] > 40) {
              const x = toX(p[0]);
              const y = toYHr(p[11]);
              if (!started2) { ctx.moveTo(x, y); started2 = true; }
              else ctx.lineTo(x, y);
            }
          });
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#6b7280';
        ctx.font = '600 12px Inter, sans-serif';
        ctx.fillText('Aucune donnée de Fréquence Cardiaque (BPM) présente dans ces traces', padL + 24, padT + ch / 2);
      }

      // Active Cursor
      const cur = dualPts[activeIdx] || dualPts[0];
      if (cur) {
        const cx = toX(cur[0]);
        ctx.strokeStyle = '#FF5A36';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(cx, padT);
        ctx.lineTo(cx, h - padB);
        ctx.stroke();
      }
      return;
    }

    // Standard 'delta' mode: High-Resolution Altimetry & Adaptive Time Delta
    let minDeltaSec = 0;
    let maxDeltaSec = 0;
    let maxAlt = 0;

    dualPts.forEach((p) => {
      const dSec = p[4] - p[10];
      if (dSec < minDeltaSec) minDeltaSec = dSec;
      if (dSec > maxDeltaSec) maxDeltaSec = dSec;
      if (p[3] > maxAlt) maxAlt = p[3];
      if (p[9] > maxAlt) maxAlt = p[9];
    });

    const rangeSec = Math.max(20, maxDeltaSec - minDeltaSec);
    let stepSec = 60;
    if (rangeSec <= 60) stepSec = 15;
    else if (rangeSec <= 150) stepSec = 30;
    else if (rangeSec <= 360) stepSec = 60;
    else if (rangeSec <= 900) stepSec = 120;
    else if (rangeSec <= 2400) stepSec = 300;
    else if (rangeSec <= 4800) stepSec = 600;
    else if (rangeSec <= 9000) stepSec = 900;
    else stepSec = 1800;

    const axisMinSec = Math.floor(minDeltaSec / stepSec) * stepSec - stepSec;
    const axisMaxSec = Math.ceil(maxDeltaSec / stepSec) * stepSec + stepSec;
    maxAlt = Math.ceil(maxAlt / 200) * 200 + 100;

    const toY = (dSec: number) => padT + ((axisMaxSec - dSec) / (axisMaxSec - axisMinSec || 1)) * ch;
    const toYAlt = (alt: number) => h - padB - (alt / (maxAlt || 1)) * (ch * 0.75);

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#6b7280';
    ctx.font = '600 10px Inter, sans-serif';

    const fmtAxisDelta = (sec: number): string => {
      if (sec === 0) return '±0';
      const sign = sec > 0 ? '+' : '-';
      const abs = Math.abs(Math.round(sec));
      if (abs < 60) return `${sign}${abs}s`;
      const m = Math.floor(abs / 60);
      const s = abs % 60;
      if (s === 0) {
        if (m >= 60) {
          const hr = Math.floor(m / 60);
          const remM = m % 60;
          return `${sign}${hr}h${remM > 0 ? `${remM}m` : ''}`;
        }
        return `${sign}${m}m`;
      }
      return `${sign}${m}m${String(s).padStart(2, '0')}`;
    };

    for (let s = axisMinSec; s <= axisMaxSec; s += stepSec) {
      const y = toY(s);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      const lbl = fmtAxisDelta(s);
      ctx.fillText(lbl, 14, y + 3.5);
    }

    const stepAlt = Math.max(200, Math.round(maxAlt / 4 / 100) * 100);
    for (let a = 0; a <= maxAlt; a += stepAlt) {
      const y = toYAlt(a);
      ctx.fillText(`${a}m`, w - padR + 6, y + 3.5);
    }

    const yZero = toY(0);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(padL, yZero);
    ctx.lineTo(w - padR, yZero);
    ctx.stroke();

    // Trace 1 Elevation Profile (Brand Coral #FF5A36 with subtle fill)
    ctx.beginPath();
    dualPts.forEach((p, idx) => {
      const x = toX(p[0]);
      const y = toYAlt(p[3]);
      if (idx === 0) {
        ctx.moveTo(x, h - padB);
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.lineTo(toX(maxX), h - padB);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 90, 54, 0.09)';
    ctx.fill();

    ctx.strokeStyle = '#FF5A36';
    ctx.lineWidth = 2;
    ctx.beginPath();
    dualPts.forEach((p, idx) => {
      const x = toX(p[0]);
      const y = toYAlt(p[3]);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    if (!isSingleCourse) {
      // Trace 2 Elevation Profile (Sky Blue Dashed)
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      dualPts.forEach((p, idx) => {
        const x = toX(p[6]);
        const y = toYAlt(p[9]);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Delta Chrono Area fill (Brand Mint #14C38E above 0, Rose below 0)
      for (let i = 0; i < dualPts.length - 1; i++) {
        const p1 = dualPts[i];
        const p2 = dualPts[i + 1];
        const x1 = toX(p1[0]);
        const x2 = toX(p2[0]);
        const y1 = toY(p1[4] - p1[10]);
        const y2 = toY(p2[4] - p2[10]);

        const avgGain = (p1[4] - p1[10] + p2[4] - p2[10]) / 2;
        ctx.fillStyle = avgGain >= 0 ? 'rgba(20, 195, 142, 0.24)' : 'rgba(239, 68, 68, 0.22)';
        ctx.beginPath();
        ctx.moveTo(x1, yZero);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2, yZero);
        ctx.closePath();
        ctx.fill();
      }

      // Delta line curve
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      dualPts.forEach((p, idx) => {
        const x = toX(p[0]);
        const y = toY(p[4] - p[10]);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Strategic notes / callouts
      if (comparison?.notes) {
        comparison.notes.forEach((nt) => {
          const nx = toX(nt.km);
          const ny = toY(nt.min * 60) + nt.dy;

          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(nx, toY(nt.min * 60));
          ctx.lineTo(nx, ny);
          ctx.stroke();

          ctx.fillStyle = '#111827';
          ctx.font = 'bold 9.5px Inter, sans-serif';
          ctx.fillText(nt.txt, nx + 4, ny - 2);
        });
      }
    }

    // Active Cursor Point & High-Resolution Tooltip
    const cur = dualPts[activeIdx] || dualPts[0];
    if (cur) {
      const cx = toX(cur[0]);
      const cy = isSingleCourse ? toYAlt(cur[3]) : toY(cur[4] - cur[10]);
      ctx.strokeStyle = '#FF5A36';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, padT);
      ctx.lineTo(cx, h - padB);
      ctx.stroke();

      ctx.fillStyle = isSingleCourse ? '#FF5A36' : (cur[4] - cur[10] >= 0 ? '#14C38E' : '#ef4444');
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const curKm = cur[0];
      const curAlt = cur[3];
      const curGainSec = cur[4] - cur[10];
      const tooltipW = 166;
      const tooltipH = isSingleCourse ? 44 : 58;
      let tx = cx + 12;
      if (tx + tooltipW > w - padR) {
        tx = cx - tooltipW - 12;
      }
      const ty = Math.max(padT + 4, Math.min(h - padB - tooltipH - 4, cy - tooltipH / 2));

      ctx.save();
      ctx.fillStyle = 'rgba(17, 24, 39, 0.92)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if ((ctx as any).roundRect) {
        (ctx as any).roundRect(tx, ty, tooltipW, tooltipH, 8);
      } else {
        ctx.rect(tx, ty, tooltipW, tooltipH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#9ca3af';
      ctx.font = '600 9.5px Inter, sans-serif';
      ctx.fillText(`Km ${curKm.toFixed(2)} • Alt ${Math.round(curAlt)}m`, tx + 9, ty + 15);

      if (!isSingleCourse) {
        ctx.fillStyle = curGainSec >= 0 ? '#14C38E' : '#f87171';
        ctx.font = 'bold 11px Inter, sans-serif';
        const deltaLabel = `Écart : ${fmtDelta(curGainSec)} ${curGainSec >= 0 ? '(Avance)' : '(Retard)'}`;
        ctx.fillText(deltaLabel, tx + 9, ty + 32);

        ctx.fillStyle = '#e5e7eb';
        ctx.font = '500 9px Inter, sans-serif';
        ctx.fillText(`T1 : ${fmtTime(cur[4])} | T2 : ${fmtTime(cur[10])}`, tx + 9, ty + 48);
      } else {
        ctx.fillStyle = '#FF5A36';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText(`Chrono : ${fmtTime(cur[4])}`, tx + 9, ty + 32);
      }
      ctx.restore();
    }
  }, [dualPts, activeIdx, topChartMode, comparison?.notes, comparison?.course1, comparison?.course2, setupUltraHD]);

  // 2. Draw Bottom Chart (Mode 'splits': Net Gain/Loss per Km | Mode 'speeds': Speed T1 vs T2 km/h)
  const drawSplitsChart = useCallback(() => {
    const canvas = splitsCanvasRef.current;
    if (!canvas || kmSplits.length === 0) return;
    const { ctx, w, h } = setupUltraHD(canvas);
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);

    const padL = 52, padR = 48, padT = 20, padB = 26;
    const cw = w - padL - padR;
    const ch = h - padT - padB;
    const totalKm = kmSplits.length;
    const toX = (km: number) => padL + (km / totalKm) * cw;
    const curPt = dualPts[activeIdx] || dualPts[0];
    const activeKmFloor = curPt ? Math.min(totalKm, Math.floor(curPt[0]) + 1) : 1;

    if (bottomChartMode === 'speeds') {
      let maxSpd = 16;
      kmSplits.forEach((sp) => {
        if (sp.spd22 > maxSpd) maxSpd = sp.spd22;
        if (sp.spd26 > maxSpd) maxSpd = sp.spd26;
      });
      maxSpd = Math.ceil(maxSpd / 2) * 2 + 2;
      const toYSpd = (spd: number) => padT + ((maxSpd - spd) / (maxSpd || 1)) * ch;

      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.fillStyle = '#6b7280';
      ctx.font = '600 10px Inter, sans-serif';

      for (let s = 0; s <= maxSpd; s += 4) {
        const y = toYSpd(s);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
        ctx.fillText(`${s} km/h`, 8, y + 4);
      }

      const groupW = (cw / totalKm) * 0.76;
      const singleBarW = groupW / 2.2;

      kmSplits.forEach((sp) => {
        const xCenter = toX(sp.km - 0.5);
        const y1 = toYSpd(sp.spd22);
        const y2 = toYSpd(sp.spd26);
        const yBase = toYSpd(0);

        // Bar T1 (Coral)
        ctx.fillStyle = '#FF5A36';
        ctx.globalAlpha = sp.km === activeKmFloor ? 1.0 : 0.78;
        ctx.fillRect(xCenter - singleBarW - 1, y1, singleBarW, Math.max(2, yBase - y1));

        // Bar T2 (Sky Blue)
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(xCenter + 1, y2, singleBarW, Math.max(2, yBase - y2));
        ctx.globalAlpha = 1.0;

        ctx.fillStyle = '#6b7280';
        ctx.font = '600 9.5px Inter, sans-serif';
        ctx.fillText(String(sp.km), xCenter - 3, h - 8);
      });
      return;
    }

    // Standard 'splits' mode
    let minS = -60, maxS = 60;
    let minG = -15, maxG = 15;

    kmSplits.forEach((sp) => {
      if (sp.gain_s < minS) minS = sp.gain_s;
      if (sp.gain_s > maxS) maxS = sp.gain_s;
      if (sp.grade < minG) minG = sp.grade;
      if (sp.grade > maxG) maxG = sp.grade;
    });

    minS = Math.floor(minS / 10) * 10 - 10;
    maxS = Math.ceil(maxS / 10) * 10 + 10;
    minG = Math.floor(minG / 5) * 5 - 5;
    maxG = Math.ceil(maxG / 5) * 5 + 5;

    const toY = (sec: number) => padT + ((maxS - sec) / (maxS - minS || 1)) * ch;
    const toYGrade = (g: number) => padT + ((maxG - g) / (maxG - minG || 1)) * ch;

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#6b7280';
    ctx.font = '600 10px Inter, sans-serif';

    const stepS = Math.max(10, Math.round((maxS - minS) / 5 / 10) * 10);
    for (let s = minS; s <= maxS; s += stepS) {
      const y = toY(s);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(`${s > 0 ? '+' : ''}${s}s`, 12, y + 4);
    }

    const stepG = Math.max(5, Math.round((maxG - minG) / 4 / 5) * 5);
    for (let g = minG; g <= maxG; g += stepG) {
      const y = toYGrade(g);
      ctx.fillText(`${g > 0 ? '+' : ''}${g}%`, w - padR + 6, y + 4);
    }

    const y0 = toY(0);
    const barW = (cw / totalKm) * 0.72;

    kmSplits.forEach((sp) => {
      const xCenter = toX(sp.km - 0.5);
      const yVal = toY(sp.gain_s);
      const top = Math.min(y0, yVal);
      const height = Math.max(2, Math.abs(yVal - y0));

      ctx.fillStyle = sp.gain_s >= 0 ? '#14C38E' : '#ef4444';
      ctx.globalAlpha = sp.km === activeKmFloor ? 1.0 : 0.78;
      ctx.fillRect(xCenter - barW / 2, top, barW, height);

      if (sp.km === activeKmFloor) {
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 2;
        ctx.strokeRect(xCenter - barW / 2, top, barW, height);
      }
      ctx.globalAlpha = 1.0;

      ctx.fillStyle = sp.gain_s >= 0 ? '#065f46' : '#991b1b';
      ctx.font = 'bold 9px Inter, sans-serif';
      const lbl = `${sp.gain_s > 0 ? '+' : ''}${sp.gain_s}s`;
      const ly = sp.gain_s >= 0 ? top - 4 : top + height + 10;
      ctx.fillText(lbl, xCenter - 10, ly);

      ctx.fillStyle = '#6b7280';
      ctx.font = '600 9.5px Inter, sans-serif';
      ctx.fillText(String(sp.km), xCenter - 3, h - 8);
    });

    // Overlaid slope line (%)
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    kmSplits.forEach((sp, i) => {
      const x = toX(sp.km - 0.5);
      const y = toYGrade(sp.grade);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    kmSplits.forEach((sp) => {
      const x = toX(sp.km - 0.5);
      const y = toYGrade(sp.grade);
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, y0);
    ctx.lineTo(w - padR, y0);
    ctx.stroke();
  }, [kmSplits, dualPts, activeIdx, bottomChartMode, setupUltraHD]);

  // Update all canvases on activeIdx, tab, or comparison change
  useEffect(() => {
    if (comparison && activeMainTab === 'workspace') {
      drawDeltaChart();
      drawSplitsChart();
    }
  }, [drawDeltaChart, drawSplitsChart, comparison, activeMainTab]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (comparison && activeMainTab === 'workspace') {
        drawDeltaChart();
        drawSplitsChart();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawDeltaChart, drawSplitsChart, comparison, activeMainTab]);

  // Keyboard shortcuts (Space: Play/Pause, Arrows: -/+ 1 point, Shift+Arrows: -/+ 1 km)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!comparison || dualPts.length === 0) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          handleStepKm(1);
        } else {
          setActiveIdx((prev) => Math.min(dualPts.length - 1, prev + 1));
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          handleStepKm(-1);
        } else {
          setActiveIdx((prev) => Math.max(0, prev - 1));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Animation player (Virtual Race Simulation)
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      lastAnimTimeRef.current = null;
      setSimTime(undefined);
      return;
    }

    const c1Duration = course1?.totalDurationSec || dualPts[dualPts.length - 1]?.[4] || 3600;
    const c2Duration = course2?.totalDurationSec || dualPts[dualPts.length - 1]?.[10] || c1Duration;
    const maxRaceDuration = Math.max(c1Duration, c2Duration);

    const baseReplayDurationSec = 35;
    const raceSecPerRealSec = (maxRaceDuration / baseReplayDurationSec) * playbackSpeed;

    lastAnimTimeRef.current = performance.now();

    const loop = (now: number) => {
      if (lastAnimTimeRef.current === null) {
        lastAnimTimeRef.current = now;
      }
      const dtRealSec = Math.min(0.2, (now - lastAnimTimeRef.current) / 1000);
      lastAnimTimeRef.current = now;

      currentSimTimeRef.current += dtRealSec * raceSecPerRealSec;

      if (currentSimTimeRef.current >= maxRaceDuration) {
        if (isLooping) {
          currentSimTimeRef.current = 0;
          setSimTime(0);
          setActiveIdx(0);
        } else {
          currentSimTimeRef.current = maxRaceDuration;
          setSimTime(maxRaceDuration);
          setActiveIdx(dualPts.length - 1);
          setIsPlaying(false);
          return;
        }
      }

      const curT = currentSimTimeRef.current;
      setSimTime(curT);

      let bestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < dualPts.length; i++) {
        const diff = Math.abs(dualPts[i][4] - curT);
        if (diff < minDiff) {
          minDiff = diff;
          bestIdx = i;
        }
      }
      setActiveIdx(bestIdx);

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isPlaying, isLooping, playbackSpeed, dualPts, course1?.totalDurationSec, course2?.totalDurationSec]);

  // Chart hover interaction
  const handleChartHover = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dualPts.length === 0) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padL = 52, padR = 48;
    const cw = rect.width - padL - padR;
    const maxX = dualPts[dualPts.length - 1][0] || 1;
    const targetKm = Math.max(0, Math.min(maxX, ((x - padL) / cw) * maxX));

    let bestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < dualPts.length; i++) {
      const d = Math.abs(dualPts[i][0] - targetKm);
      if (d < minDiff) {
        minDiff = d;
        bestIdx = i;
      }
    }
    setActiveIdx(bestIdx);
    if (dualPts[bestIdx]) {
      currentSimTimeRef.current = dualPts[bestIdx][4];
      if (isPlaying) setSimTime(dualPts[bestIdx][4]);
    }
  };

  // Process File 1 loading
  const processLoadedFile1 = async (file: File) => {
    setFile1(file);
    setLoadingFile1(true);
    setErrorMessage(null);
    setActiveRoadbookDoc(null);
    try {
      const parsed = await parseCourseFile(file);
      setCourse1(parsed);
      if (course2) {
        setComparison(compareCourses(parsed, course2));
        setShowUploads(false);
      } else {
        setComparison(createSingleCourseComparison(parsed));
      }
      setActiveIdx(0);
    } catch (err: any) {
      setErrorMessage(`Erreur fichier 1 (${file.name}) : ${err.message || err}`);
    } finally {
      setLoadingFile1(false);
    }
  };

  // Process File 2 loading
  const processLoadedFile2 = async (file: File) => {
    setFile2(file);
    setLoadingFile2(true);
    setErrorMessage(null);
    try {
      const parsed = await parseCourseFile(file);
      setCourse2(parsed);
      if (course1) {
        setComparison(compareCourses(course1, parsed));
        setShowUploads(false);
      } else {
        setComparison(createSingleCourseComparison(parsed));
      }
      setActiveIdx(0);
    } catch (err: any) {
      setErrorMessage(`Erreur fichier 2 (${file.name}) : ${err.message || err}`);
    } finally {
      setLoadingFile2(false);
    }
  };

  const handleLoadFile1 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processLoadedFile1(f);
  };

  const handleLoadFile2 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processLoadedFile2(f);
  };

  const handleDropFile1 = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) processLoadedFile1(f);
  };

  const handleDropFile2 = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) processLoadedFile2(f);
  };

  // Handle workout/activity selected directly from Intervals.icu
  const handleSelectIntervalsActivity = (course: ParsedCourse, targetTrace: 1 | 2) => {
    if (targetTrace === 1) {
      setActiveRoadbookDoc(null);
      setCourse1(course);
      setFile1(null);
      if (course2) {
        setComparison(compareCourses(course, course2));
      } else {
        setComparison(createSingleCourseComparison(course));
      }
    } else {
      setCourse2(course);
      setFile2(null);
      if (course1) {
        setComparison(compareCourses(course1, course));
      } else {
        setComparison(createSingleCourseComparison(course));
      }
    }
    setActiveIdx(0);
    setShowUploads(false);
  };

  // Handle Roadbook selected (Pacing Idéal) with optional .FIT activity
  const handleSelectRoadbook = (roadbookCourse: ParsedCourse, raceFitCourse?: ParsedCourse, rawRoadbookDoc?: RoadbookDoc) => {
    if (rawRoadbookDoc) {
      setActiveRoadbookDoc(rawRoadbookDoc);
      setCustomTargetHours(Number(rawRoadbookDoc.targetTime) || undefined);
    }
    setCourse1(roadbookCourse);
    setFile1(null);
    if (raceFitCourse) {
      setCourse2(raceFitCourse);
      setFile2(null);
      setComparison(compareCourses(roadbookCourse, raceFitCourse));
    } else if (course2) {
      setComparison(compareCourses(roadbookCourse, course2));
    } else {
      setComparison(createSingleCourseComparison(roadbookCourse));
    }
    setActiveIdx(0);
    setShowUploads(false);
  };

  // Live recalibration of Roadbook Pacing without reopening modal
  const handleRecalibrateRoadbook = (newProfile: 'target' | 'fast' | 'slow', newCustomHours?: number) => {
    if (!activeRoadbookDoc) return;
    setRoadbookPaceProfile(newProfile);
    const updatedCourse1 = convertRoadbookToParsedCourse(activeRoadbookDoc, {
      paceProfile: newProfile,
      customTargetTimeH: newCustomHours ?? customTargetHours,
    });
    setCourse1(updatedCourse1);
    if (course2 && course2 !== course1) {
      setComparison(compareCourses(updatedCourse1, course2));
    } else {
      setComparison(createSingleCourseComparison(updatedCourse1));
    }
  };

  // Calcul automatique de la recommandation de Rétro-Synchronisation (.FIT / Trace 2 -> Roadbook)
  const retroSyncRecommendation = useMemo<RetroSyncRecommendation | null>(() => {
    if (!activeRoadbookDoc) return null;
    if (raceModulationRec) return raceModulationRec;
    if (!comparison || !course2 || comparison.course1 === comparison.course2) return null;
    return computeRoadbookRetroSync(activeRoadbookDoc, comparison);
  }, [activeRoadbookDoc, comparison, course2, raceModulationRec]);

  // Appliquer la Rétro-synchronisation au Roadbook actif (et optionnellement dans Firestore)
  const handleApplyRetroSync = async () => {
    if (!activeRoadbookDoc || !retroSyncRecommendation) return;
    setIsSavingRetroSync(true);
    setRetroSyncSuccessMsg(null);

    try {
      const { updatedRoadbook, savedToFirestore, savedToProfile } = await applyRetroSyncToRoadbookAndProfile(
        activeRoadbookDoc,
        retroSyncRecommendation,
        {
          syncTargetTime,
          syncPhysiology,
          syncSlopes,
          syncWaypoints,
          updateGlobalUserProfile: syncGlobalProfile,
          userId: currentUser?.uid,
        }
      );

      setActiveRoadbookDoc(updatedRoadbook);
      if (syncTargetTime) {
        setCustomTargetHours(retroSyncRecommendation.newTargetTimeH);
      }

      const recalibratedCourse1 = convertRoadbookToParsedCourse(updatedRoadbook, {
        paceProfile: roadbookPaceProfile,
        customTargetTimeH: syncTargetTime ? retroSyncRecommendation.newTargetTimeH : customTargetHours,
      });

      setCourse1(recalibratedCourse1);
      if (course2 && course2 !== course1) {
        setComparison(compareCourses(recalibratedCourse1, course2));
      } else {
        setComparison(createSingleCourseComparison(recalibratedCourse1));
      }

      setRaceModulationRec(null);

      const statusParts = ['Graphiques & Pacing Roadbook mis à jour en direct'];
      if (savedToFirestore) statusParts.push('Roadbook sauvegardé dans Firestore');
      else if (activeRoadbookDoc.id.startsWith('demo-')) statusParts.push('Mode Démo (modifié en session)');
      if (savedToProfile) statusParts.push('Profil physiologique global mis à jour');

      setRetroSyncSuccessMsg(statusParts.join(' • '));
    } catch (err: any) {
      setErrorMessage(`Erreur lors de la rétro-synchronisation : ${err.message || err}`);
    } finally {
      setIsSavingRetroSync(false);
    }
  };

  // Moduler le Roadbook à partir des sorties clairement intitulées "Course" (Intervals.icu)
  const handleCalibrateFromRacesProfile = (profile: RaceCalibrationProfile) => {
    if (!activeRoadbookDoc) return;
    const rec = computeRoadbookModulationFromRaces(activeRoadbookDoc, profile);
    setRaceModulationRec(rec);
    setRetroSyncSuccessMsg(null);
    setActiveMainTab('diagnostic');
  };

  const handleFetchAndModulateFromRaces = async () => {
    if (!activeRoadbookDoc) return;
    const creds = await getUserIntervalsCredentials(currentUser?.uid);
    const storedId = athleteId || creds.athleteId;
    const storedKey = creds.apiKey;

    if (!storedId || !storedKey) {
      setIsIntervalsModalOpen(true);
      return;
    }

    setIsLoadingRacesForCalib(true);
    setErrorMessage(null);
    try {
      const now = new Date();
      const oldest = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const newest = now.toISOString().split('T')[0];
      const acts = await fetchIntervalsActivities(storedId, storedKey, oldest, newest);
      const profile = await calibrateAthleteProfileWithStreams(
        acts,
        storedKey,
        course1?.totalDistanceKm || Number(activeRoadbookDoc.officialDistance),
        course1?.elevationGainM || Number(activeRoadbookDoc.officialElevation)
      );
      if (!profile) {
        setErrorMessage("Aucune sortie intitulée 'Course' ou compétition (> 5 km) trouvée sur les 12 derniers mois dans Intervals.icu.");
        return;
      }
      handleCalibrateFromRacesProfile(profile);
    } catch (err: any) {
      setErrorMessage(err.message || "Impossible de récupérer vos sorties 'Course' depuis Intervals.icu.");
    } finally {
      setIsLoadingRacesForCalib(false);
    }
  };

  // Step +/- 1 kilometer along the track
  const handleStepKm = (deltaKm: number) => {
    if (dualPts.length === 0) return;
    const curKm = dualPts[activeIdx]?.[0] || 0;
    const maxKm = dualPts[dualPts.length - 1][0] || 1;
    const targetKm = Math.max(0, Math.min(maxKm, curKm + deltaKm));
    let bestIdx = 0;
    let minD = Infinity;
    for (let i = 0; i < dualPts.length; i++) {
      const d = Math.abs(dualPts[i][0] - targetKm);
      if (d < minD) {
        minD = d;
        bestIdx = i;
      }
    }
    setActiveIdx(bestIdx);
    if (dualPts[bestIdx]) {
      currentSimTimeRef.current = dualPts[bestIdx][4];
      if (isPlaying) setSimTime(dualPts[bestIdx][4]);
    }
  };

  // Swap traces
  const handleSwapTraces = () => {
    if (!comparison) return;
    if (course1 && course2) {
      const res = compareCourses(course2, course1);
      setComparison(res);
      const tempCourse = course1;
      setCourse1(course2);
      setCourse2(tempCourse);
      const tempFile = file1;
      setFile1(file2);
      setFile2(tempFile);
    } else {
      const newCourse1 = { ...comparison.course2 };
      const newCourse2 = { ...comparison.course1 };
      const res = compareCourses(newCourse1, newCourse2);
      setComparison(res);
    }
    setActiveIdx(0);
  };

  // Load sample demo
  const handleLoadSample = () => {
    const sample = getSampleComparison();
    setComparison(sample);
    setCourse1(sample.course1);
    setCourse2(sample.course2);
    setActiveIdx(66);
    setErrorMessage(null);
    setFile1(null);
    setFile2(null);
    setShowUploads(false);
    setAiDebriefText(null);
  };

  // Clear / Reset all data
  const handleClear = () => {
    setComparison(null);
    setCourse1(null);
    setCourse2(null);
    setFile1(null);
    setFile2(null);
    setActiveRoadbookDoc(null);
    setActiveIdx(0);
    setErrorMessage(null);
    setShowUploads(true);
    setAiDebriefText(null);
    setActiveMainTab('workspace');
  };

  // Export CSV Splits & Waypoints
  const handleExportCsv = () => {
    if (!comparison) return;
    const rows: string[] = [];
    rows.push('Km;Segment;Pente (%);Vitesse T1 (km/h);Vitesse T2 (km/h);Gain/Perte Net (s)');
    comparison.kmSplits.forEach((sp) => {
      rows.push(`${sp.km};${sp.lbl};${sp.grade};${sp.spd22};${sp.spd26};${sp.gain_s}`);
    });
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `comparaison_splits_${comparison.course1.name.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Generate AI Coach Debrief from comparison telemetry
  const handleGenerateAiDebrief = async () => {
    if (!comparison) return;
    setIsGeneratingDebrief(true);
    setAiDebriefError(null);

    const pa = comparison.pacingAnalysis;
    const c1 = comparison.course1;
    const c2 = comparison.course2;

    const promptSummary = `Réalise un débriefing tactique et physiologique de ma course en comparant la Trace 1 de référence ("${c1.name}", ${c1.totalDistanceKm} km, D+ ${c1.elevationGainM}m, Temps: ${fmtTime(c1.totalDurationSec)}) et la Trace 2 réalisée ("${c2.name}", ${c2.totalDistanceKm} km, D+ ${c2.elevationGainM}m, Temps: ${fmtTime(c2.totalDurationSec)}).
Données clés du comparateur :
- Écart chrono final : ${fmtDelta(comparison.totalTimeDeltaSec)} (${comparison.totalTimeDeltaSec >= 0 ? 'Avance' : 'Retard'})
- Score de fidélité au pacing : ${pa?.adherenceScore ?? 80}%
- Écart en montée (>3%) : ${fmtDelta(pa?.uphillDeltaSec ?? 0)}
- Écart en descente (<-3%) : ${fmtDelta(pa?.downhillDeltaSec ?? 0)}
- Écart sur le plat : ${fmtDelta(pa?.flatDeltaSec ?? 0)}
- 1ère moitié de course : ${fmtDelta(pa?.firstHalfDeltaSec ?? 0)} | 2ème moitié : ${fmtDelta(pa?.secondHalfDeltaSec ?? 0)}
- Temps d'arrêt détecté : ${Math.round((pa?.stoppedTimeActualSec ?? 0) / 60)} min (prévu : ${Math.round((pa?.stoppedTimePlannedSec ?? 0) / 60)} min)
- Meilleur km : Km ${pa?.bestSplitKm} (${pa?.bestSplitGainSec}s) | Pire km : Km ${pa?.worstSplitKm} (${pa?.worstSplitLossSec}s)
${pa?.cardiacDriftPct !== undefined ? `- Dérive cardiaque observée entre 1ère et 2ème moitié : ${pa.cardiacDriftPct > 0 ? '+' : ''}${pa.cardiacDriftPct}%` : ''}

Structure ta réponse en 3 points clairs et actionnables :
1. **Diagnostic de la gestion d'allure (Pacing & Pacing Split)**
2. **Analyse par profil de pente (Montées, Descentes, Ravitaillements)**
3. **3 séances ou axes d'entraînement prioritaires pour progresser sur le prochain objectif.**`;

    try {
      const creds = await getUserIntervalsCredentials(currentUser?.uid);
      const storedId = athleteId || creds.athleteId;
      const storedKey = creds.apiKey;
      const response = await fetch(getApiUrl('/api/coach'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: promptSummary,
          history: [],
          intervalsAthleteId: storedId,
          intervalsApiKey: storedKey,
          athleteName: athleteName || 'Athlète',
        }),
      });
      if (!response.ok) {
        throw new Error(`Erreur serveur (${response.status})`);
      }
      const data = await response.json();
      setAiDebriefText(data.text);
    } catch (err: any) {
      setAiDebriefError(err.message || "Impossible de joindre le Coach IA.");
    } finally {
      setIsGeneratingDebrief(false);
    }
  };

  // Active Point Telemetry
  const isSingleMode = Boolean(comparison && (!course2 || comparison.course1 === comparison.course2));
  const cur = dualPts[activeIdx] || dualPts[0] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const km1 = cur[0];
  const alt1 = cur[3];
  const t1 = cur[4];
  const hr1 = cur[5];

  const km2 = cur[6];
  const alt2 = cur[9];
  const t2 = cur[10];
  const hr2 = cur[11];
  const errM = cur[12];
  const gainSec = t1 - t2; // >0: ahead, <0: behind

  const p2AtT1 = useMemo(() => {
    if (isSingleMode || !course2?.points || course2.points.length === 0) return null;
    return getPointAtTime(course2.points, t1);
  }, [isSingleMode, course2?.points, t1]);

  const liveT2LeadM = p2AtT1 ? Math.round((p2AtT1.distKm - km1) * 1000) : 0;

  const kIdx = Math.min(Math.max(Math.floor(km1), 0), Math.max(0, kmSplits.length - 1));
  const activeSplit = kmSplits[kIdx] || { gain_s: 0, spd22: 0, spd26: 0, grade: 0, lbl: '' };

  const c1 = comparison?.course1;
  const c2 = comparison?.course2;
  const pa = comparison?.pacingAnalysis;

  return (
    <div className={styles.container}>
      {/* Page Header Card aligned with Plan-Builder & Roadbook Editor */}
      <header className={styles.header}>
        <div className={styles.headerTopRow}>
          <div className={styles.brand}>
            <div className={styles.brandIconBox}>
              <Compass size={22} />
            </div>
            <div className={styles.titleGroup}>
              <h1 className={styles.title}>
                <span>Comparateur Course & Virtual Partner</span>
                <div className={styles.badgesRow}>
                  {comparison ? (
                    isSingleMode ? (
                      <span className={`${styles.badge} ${c1?.sourceType === 'ROADBOOK' ? styles.badgeRoadbook : styles.badgeT1}`}>
                        <span className="w-2 h-2 rounded-full bg-[#FF5A36] inline-block"></span>
                        {c1?.sourceType === 'ROADBOOK' ? 'Roadbook (Pacing Idéal)' : 'Trace 1'} : {c1?.name}
                      </span>
                    ) : (
                      <>
                        <span className={`${styles.badge} ${c1?.sourceType === 'ROADBOOK' ? styles.badgeRoadbook : styles.badgeT1}`}>
                          <span className="w-2 h-2 rounded-full bg-[#FF5A36] inline-block"></span>
                          T1 : {c1?.name}
                        </span>
                        <span className={`${styles.badge} ${c2?.sourceType === 'FIT' ? styles.badgeFit : styles.badgeT2}`}>
                          <span className="w-2 h-2 rounded-full bg-sky-500 inline-block"></span>
                          T2 : {c2?.name}
                        </span>
                      </>
                    )
                  ) : (
                    <span className={`${styles.badge} ${styles.badgeAthlete}`}>
                      Prêt pour analyse (.FIT, .GPX, .TCX, Roadbook, Intervals.icu)
                    </span>
                  )}
                  {athleteName && (
                    <span className={`${styles.badge} ${styles.badgeAthlete}`}>
                      👤 {athleteName}
                    </span>
                  )}
                </div>
              </h1>
              <p className={styles.subtitle}>
                Confrontez votre trace réelle (.FIT / Intervals.icu) au Pacing Idéal de votre Roadbook ou comparez deux courses seconde par seconde.
              </p>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button
              onClick={() => setIsRoadbookModalOpen(true)}
              className={styles.roadbookHeroBtn}
              title="Sélectionner un Roadbook pour comparer le .FIT à l'allure idéale"
            >
              <Zap size={14} />
              <span>Duel .FIT vs Roadbook</span>
            </button>

            <button
              onClick={() => {
                setIntervalsTargetTrace(comparison?.course1 ? 2 : 1);
                setIsIntervalsModalOpen(true);
              }}
              className={`${styles.headerBtn} ${styles.headerBtnIntervals}`}
              title="Importer une séance ou course depuis Intervals.icu"
            >
              <Activity size={14} />
              <span>Intervals.icu</span>
            </button>

            <button
              onClick={() => setShowUploads(!showUploads)}
              className={styles.headerBtn}
              title="Importer des fichiers FIT, TCX ou GPX"
            >
              <Upload size={14} />
              <span>Fichiers GPS</span>
              {showUploads ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            <button
              onClick={() => setIsExplainerOpen(true)}
              className={styles.explainerBtn}
              title="Consulter la note explicative et le guide méthodologique"
            >
              <BookOpen size={14} />
              <span>Guide</span>
            </button>

            {comparison && !isSingleMode && (
              <button
                onClick={handleSwapTraces}
                className={styles.headerBtn}
                title="Inverser Référence (T1) et Comparée (T2)"
              >
                <ArrowLeftRight size={14} />
                <span>Inverser</span>
              </button>
            )}

            {comparison && (
              <button
                onClick={handleExportCsv}
                className={styles.headerBtn}
                title="Exporter les splits kilométriques en CSV"
              >
                <Download size={14} />
                <span>CSV</span>
              </button>
            )}

            {comparison ? (
              <button
                onClick={handleClear}
                className={styles.headerBtn}
                title="Effacer les données actuelles et réinitialiser"
              >
                <Trash2 size={14} />
                <span>Réinitialiser</span>
              </button>
            ) : (
              <button
                onClick={handleLoadSample}
                className={styles.headerBtn}
                title="Charger un exemple de démonstration (Roc de France)"
              >
                <Sparkles size={14} className="text-orange-500" />
                <span>Démo</span>
              </button>
            )}
          </div>
        </div>

        {/* KPI Unified Stats Bar (Matches Roadbook Editor statsBar) */}
        {comparison && (
          <div className={styles.statsBar}>
            <div className={styles.statBox}>
              <span className={styles.statBoxLabel}>
                <span className="w-2 h-2 rounded-full bg-[#FF5A36]"></span>
                Trace 1 (Référence)
              </span>
              <strong className={styles.statBoxValue}>
                {c1?.totalDistanceKm} km • {fmtTime(c1?.totalDurationSec || 0)}
              </strong>
              <span className={styles.statBoxSub}>D+ {c1?.elevationGainM} m {c1?.avgHr ? `• FC moy ${c1.avgHr} bpm` : ''}</span>
            </div>

            {!isSingleMode && (
              <>
                <div className={styles.statBox}>
                  <span className={styles.statBoxLabel}>
                    <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                    Trace 2 (Comparée)
                  </span>
                  <strong className={styles.statBoxValue}>
                    {c2?.totalDistanceKm} km • {fmtTime(c2?.totalDurationSec || 0)}
                  </strong>
                  <span className={styles.statBoxSub}>D+ {c2?.elevationGainM} m {c2?.avgHr ? `• FC moy ${c2.avgHr} bpm` : ''}</span>
                </div>

                <div className={styles.statBox}>
                  <span className={styles.statBoxLabel}>Écart Chrono Final</span>
                  <strong
                    className={styles.statBoxValue}
                    style={{ color: comparison.totalTimeDeltaSec >= 0 ? 'var(--color-accent)' : '#ef4444' }}
                  >
                    {fmtDelta(comparison.totalTimeDeltaSec)}
                  </strong>
                  <span className={styles.statBoxSub}>
                    {comparison.totalTimeDeltaSec >= 0 ? 'Avance finale sur T1' : 'Retard final sur T1'}
                  </span>
                </div>

                {pa && (
                  <div className={styles.statBox}>
                    <span className={styles.statBoxLabel}>Fidélité au Pacing</span>
                    <strong
                      className={styles.statBoxValue}
                      style={{ color: pa.adherenceScore >= 80 ? 'var(--color-accent)' : '#f59e0b' }}
                    >
                      {pa.adherenceScore}%
                    </strong>
                    <span className={styles.statBoxSub}>
                      1ère moitié {fmtDelta(pa.firstHalfDeltaSec)} • 2e {fmtDelta(pa.secondHalfDeltaSec)}
                    </span>
                  </div>
                )}

                <div className={styles.statBox}>
                  <span className={styles.statBoxLabel}>Bilan Pentes (D+ / D-)</span>
                  <strong className={styles.statBoxValue}>
                    <span style={{ color: (pa?.uphillDeltaSec ?? 0) >= 0 ? 'var(--color-accent)' : '#ef4444' }}>
                      ⛰️ {fmtDelta(pa?.uphillDeltaSec ?? 0)}
                    </span>
                  </strong>
                  <span className={styles.statBoxSub}>
                    Descente : {fmtDelta(pa?.downhillDeltaSec ?? 0)} • Plat : {fmtDelta(pa?.flatDeltaSec ?? 0)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Live Roadbook Calibration Bar (Only when a Roadbook is loaded as Trace 1) */}
        {comparison && activeRoadbookDoc && (
          <div className={styles.calibrationBar}>
            <div className={styles.calibrationGroup}>
              <Sliders size={15} className="text-orange-500" />
              <span className="text-xs font-bold text-slate-800">
                Calibrage Pacing Roadbook en direct :
              </span>
              <button
                type="button"
                onClick={() => handleRecalibrateRoadbook('target')}
                className={`${styles.calibChip} ${roadbookPaceProfile === 'target' ? styles.calibChipActive : ''}`}
              >
                🎯 Cible Roadbook
              </button>
              <button
                type="button"
                onClick={() => handleRecalibrateRoadbook('fast')}
                className={`${styles.calibChip} ${roadbookPaceProfile === 'fast' ? styles.calibChipActive : ''}`}
              >
                ⚡ Optimiste (-6%)
              </button>
              <button
                type="button"
                onClick={() => handleRecalibrateRoadbook('slow')}
                className={`${styles.calibChip} ${roadbookPaceProfile === 'slow' ? styles.calibChipActive : ''}`}
              >
                🛡️ Prudent (+12%)
              </button>
            </div>

            <div className={styles.calibrationGroup}>
              <label className="text-xs font-semibold text-slate-600">
                Ajuster Temps Cible (heures) :
              </label>
              <input
                type="number"
                step="0.25"
                min="0.5"
                max="60"
                value={customTargetHours ?? Number(activeRoadbookDoc.targetTime) ?? 5}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val > 0) {
                    setCustomTargetHours(val);
                    handleRecalibrateRoadbook(roadbookPaceProfile, val);
                  }
                }}
                style={{ width: '80px', padding: '4px 8px', fontSize: '0.76rem', fontWeight: 700 }}
              />

              <button
                type="button"
                onClick={handleFetchAndModulateFromRaces}
                disabled={isLoadingRacesForCalib}
                className="px-3 py-1.5 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-extrabold border border-amber-300 transition flex items-center gap-1.5"
                title="Utiliser vos sorties clairement intitulées 'Course' (Intervals.icu) pour moduler le Roadbook et ses estimations"
              >
                {isLoadingRacesForCalib ? <Loader2 size={13} className="animate-spin" /> : <Trophy size={13} className="text-orange-600" />}
                <span>Moduler via mes sorties « Course »</span>
              </button>

              {!isSingleMode && (
                <button
                  type="button"
                  onClick={() => {
                    setRaceModulationRec(null);
                    setActiveMainTab('diagnostic');
                  }}
                  className="px-3 py-1.5 rounded-full bg-[#FF5A36] hover:bg-[#E04826] text-white text-xs font-extrabold shadow-xs transition flex items-center gap-1.5"
                  title="Rétro-synchroniser le Roadbook avec les temps réels, l'ITRA observé et les pauses de la Trace 2"
                >
                  <RefreshCw size={13} />
                  <span>Rétro-synchroniser ce Roadbook</span>
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Expandable Upload Drawer */}
      {showUploads && (
        <section className={styles.uploadSection}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FileCode size={16} className="text-orange-600" />
                Sélectionner ou glisser-déposer vos activités GPS (.FIT, .TCX, .GPX)
              </h2>
              <p className="text-xs text-slate-500">
                Compatible Garmin, Coros, Suunto, Polar, Wahoo, Apple Watch, Roadbooks et Intervals.icu.
              </p>
            </div>
            {course1 && course2 && (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1.5">
                <CheckCircle2 size={14} /> 2 Traces synchronisées
              </span>
            )}
          </div>

          <div className={styles.uploadGrid}>
            {/* Dropzone 1 */}
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropFile1}
              className={`${styles.dropzone} ${styles.dropzoneT1} cursor-pointer`}
            >
              <input
                type="file"
                accept=".fit,.tcx,.gpx"
                onChange={handleLoadFile1}
                className="hidden"
              />
              <div className={styles.dropzoneLabel} style={{ color: 'var(--color-primary)' }}>
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF5A36]"></span>
                Trace 1 : Référence / Norme (Roadbook, Course N-1, Trace Cible)
              </div>
              <p className={styles.dropzoneHint}>
                {loadingFile1
                  ? 'Décodage en cours...'
                  : file1
                  ? file1.name
                  : 'Cliquez ou glissez-déposez un fichier .fit, .tcx ou .gpx'}
              </p>
              {course1 && (
                <div className={styles.fileLoadedInfo}>
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-bold text-xs text-slate-800 truncate">{course1.name}</span>
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 shrink-0">
                      {course1.sourceType}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-orange-600 shrink-0">
                    {course1.totalDistanceKm} km • D+ {course1.elevationGainM}m
                  </span>
                </div>
              )}
              <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIsRoadbookModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-full bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold border border-orange-200 transition flex items-center gap-1.5"
                >
                  <Zap size={13} />
                  <span>Choisir un Roadbook</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIntervalsTargetTrace(1);
                    setIsIntervalsModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition flex items-center gap-1.5"
                >
                  <Activity size={13} />
                  <span>Depuis Intervals.icu</span>
                </button>
              </div>
            </label>

            {/* Dropzone 2 */}
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropFile2}
              className={`${styles.dropzone} cursor-pointer`}
            >
              <input
                type="file"
                accept=".fit,.tcx,.gpx"
                onChange={handleLoadFile2}
                className="hidden"
              />
              <div className={`${styles.dropzoneLabel} text-sky-600`}>
                <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
                Trace 2 : Comparée / Réalisée (Fichier .FIT montre, Course actuelle)
              </div>
              <p className={styles.dropzoneHint}>
                {loadingFile2
                  ? 'Décodage en cours...'
                  : file2
                  ? file2.name
                  : 'Cliquez ou glissez-déposez un fichier .fit, .tcx ou .gpx'}
              </p>
              {course2 && (
                <div className={styles.fileLoadedInfo}>
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-bold text-xs text-slate-800 truncate">{course2.name}</span>
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200 shrink-0">
                      {course2.sourceType}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-sky-600 shrink-0">
                    {course2.totalDistanceKm} km • D+ {course2.elevationGainM}m
                  </span>
                </div>
              )}
              <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIntervalsTargetTrace(2);
                    setIsIntervalsModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 rounded-full bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold border border-sky-200 transition flex items-center gap-1.5"
                >
                  <Activity size={13} className="text-sky-600" />
                  <span>Choisir depuis Intervals.icu</span>
                </button>
              </div>
            </label>
          </div>

          {errorMessage && (
            <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </section>
      )}

      {/* Single Trace Active Notice Banner */}
      {comparison && isSingleMode && c1 && (
        <div className={styles.singleTraceNotice}>
          <div className={styles.singleTraceNoticeText}>
            <Navigation size={18} className="text-emerald-600 shrink-0" />
            <span>
              <strong>Trace 1 chargée :</strong> {c1.name} ({c1.totalDistanceKm} km • D+ {c1.elevationGainM}m). Ajoutez maintenant une <strong>Trace 2</strong> (.FIT ou séance Intervals.icu) pour lancer le duel Virtual Partner !
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setIntervalsTargetTrace(2);
                setIsIntervalsModalOpen(true);
              }}
              className="px-3.5 py-1.5 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-full transition flex items-center gap-1.5"
            >
              <Activity size={13} />
              <span>Trace 2 (Intervals.icu)</span>
            </button>
            <button
              onClick={() => setShowUploads(true)}
              className={styles.singleTraceAction}
            >
              Importer Fichier Trace 2
            </button>
          </div>
        </div>
      )}

      {/* Sub-Navigation Segmented Tabs (When comparison is loaded) */}
      {comparison && (
        <div className={styles.subNavRow}>
          <div className={styles.tabsContainer}>
            <button
              type="button"
              onClick={() => setActiveMainTab('workspace')}
              className={`${styles.tabBtn} ${activeMainTab === 'workspace' ? styles.tabBtnActive : ''}`}
            >
              <Compass size={15} />
              <span>Carte & Graphiques Synchronisés</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMainTab('checkpoints')}
              className={`${styles.tabBtn} ${activeMainTab === 'checkpoints' ? styles.tabBtnActive : ''}`}
            >
              <Flag size={15} />
              <span>
                Tableau de Marche & Splits ({comparison.waypointSplits?.length ? `${comparison.waypointSplits.length} Postes` : `${kmSplits.length} Km`})
              </span>
            </button>

            {(!isSingleMode || activeRoadbookDoc) && (
              <button
                type="button"
                onClick={() => setActiveMainTab('diagnostic')}
                className={`${styles.tabBtn} ${activeMainTab === 'diagnostic' ? styles.tabBtnActive : ''}`}
              >
                <Sparkles size={15} />
                <span>
                  {activeRoadbookDoc
                    ? 'Rétro-synchronisation Roadbook & Débriefing IA'
                    : 'Diagnostic Pacing & Débriefing Coach IA'}
                </span>
              </button>
            )}
          </div>

          <div className="text-xs font-medium text-slate-400 hidden lg:flex items-center gap-2">
            <span>Raccourcis clavier :</span>
            <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] font-semibold text-slate-600">Espace</kbd>
            <span>Play/Pause</span>
            <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] font-semibold text-slate-600">← / →</kbd>
            <span>Curseur</span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {!comparison ? (
        /* Empty State Card aligned with Site Design */
        <div className={styles.emptyStateBanner}>
          <div className={styles.emptyStateIcon}>
            <Compass size={32} />
          </div>
          <h2 className={styles.emptyStateTitle}>
            Virtual Partner Ultra-HD — Pacing Roadbook vs .FIT de Course
          </h2>
          <p className={styles.emptyStateDesc}>
            Comparez le <strong>fichier .FIT</strong> de votre montre de sport avec le <strong>pacing idéal calculé dans Trail Roadbook Pro</strong>, ou superposez deux activités GPS pour analyser vos allures, vos dérives en montée et vos arrêts aux ravitaillements.
          </p>

          <div className={styles.emptyStateFeatures}>
            <div className={styles.featureCard}>
              <div className={styles.featureCardTitle}>
                <Zap size={16} className="text-orange-500" />
                <span>Pacing Idéal Roadbook</span>
              </div>
              <p className={styles.featureCardText}>
                Intègre la formule Minetti (coût énergétique selon la pente), l'index ITRA, la fatigue exponentielle et les pauses prévues aux ravitaillements.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureCardTitle}>
                <Layers size={16} className="text-sky-500" />
                <span>Décodage .FIT Garmin, Coros, Suunto</span>
              </div>
              <p className={styles.featureCardText}>
                Support natif binaire des montres de sport avec horodatage, fréquence cardiaque réelle, dérive cardiaque et détection automatique des arrêts.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureCardTitle}>
                <Sparkles size={16} className="text-emerald-500" />
                <span>Débriefing Tactique Coach IA</span>
              </div>
              <p className={styles.featureCardText}>
                Analyse automatique par terrain (Montées &gt;3%, Descentes &lt;-3%, Plat) et recommandations d'entraînement personnalisées par l'IA.
              </p>
            </div>
          </div>

          <div className={styles.emptyStateActions}>
            <button
              onClick={() => setIsRoadbookModalOpen(true)}
              className={styles.primaryActionBtn}
            >
              <Zap size={16} />
              <span>Comparer .FIT vs Roadbook</span>
            </button>
            <button
              onClick={() => {
                setIntervalsTargetTrace(1);
                setIsIntervalsModalOpen(true);
              }}
              className={styles.secondaryActionBtn}
            >
              <Activity size={16} className="text-orange-500" />
              <span>Importer depuis Intervals.icu</span>
            </button>
            <button
              onClick={handleLoadSample}
              className={styles.secondaryActionBtn}
            >
              <Sparkles size={16} className="text-emerald-500" />
              <span>Charger la Démo (Roc de France)</span>
            </button>
            <button
              onClick={() => setIsExplainerOpen(true)}
              className={styles.secondaryActionBtn}
            >
              <BookOpen size={16} className="text-slate-500" />
              <span>Note explicative & Guide</span>
            </button>
          </div>
        </div>
      ) : activeMainTab === 'workspace' ? (
        /* TAB 1: WORKSPACE (Interactive Vector Map + Telemetry + Dual Ultra-HD Charts) */
        <div className={styles.mainGrid}>
          {/* Left Column: Interactive Vector Map + Controls + Telemetry */}
          <div className={styles.leftCol}>
            <div className={styles.card} style={{ flex: 1, overflow: 'hidden' }}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>
                  <Layers size={15} className="text-orange-500" />
                  Carte Interactive — {isSingleMode ? 'Visualisation de Trace' : 'Superposition & Virtual Partner'}
                </span>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-[#FF5A36]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FF5A36] inline-block"></span>
                    {c1?.name.slice(0, 18)}
                  </span>
                  {!isSingleMode && c2 && (
                    <>
                      <span className="text-slate-400">vs</span>
                      <span className="flex items-center gap-1.5 text-sky-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-sky-600 inline-block"></span>
                        {c2.name.slice(0, 18)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <CourseComparatorMap
                dualPts={dualPts}
                course1={comparison.course1}
                course2={comparison.course2}
                activeIdx={activeIdx}
                simTime={simTime}
                mapMode={mapMode}
                onChangeMapMode={setMapMode}
                onSelectPoint={(idx) => {
                  setActiveIdx(idx);
                  if (dualPts[idx]) {
                    currentSimTimeRef.current = dualPts[idx][4];
                    if (isPlaying) setSimTime(dualPts[idx][4]);
                  }
                }}
                isPlaying={isPlaying}
              />
            </div>

            {/* Timeline Slider & Playback */}
            <div className={styles.sliderBar}>
              <button
                onClick={() => handleStepKm(-1)}
                className={styles.stepBtn}
                title="Reculer de 1 km (Shift + Flèche Gauche)"
              >
                -1 km
              </button>
              <button
                onClick={() => {
                  if (!isPlaying) {
                    if (activeIdx >= dualPts.length - 1) {
                      setActiveIdx(0);
                      currentSimTimeRef.current = dualPts[0]?.[4] || 0;
                    } else {
                      currentSimTimeRef.current = dualPts[activeIdx]?.[4] || 0;
                    }
                    lastAnimTimeRef.current = performance.now();
                    setIsPlaying(true);
                  } else {
                    setIsPlaying(false);
                    lastAnimTimeRef.current = null;
                    setSimTime(undefined);
                  }
                }}
                className={styles.playBtn}
                title={isPlaying ? 'Pause (Espace)' : 'Lire la simulation (Espace)'}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                onClick={() => handleStepKm(1)}
                className={styles.stepBtn}
                title="Avancer de 1 km (Shift + Flèche Droite)"
              >
                +1 km
              </button>
              <button
                onClick={() => setIsLooping(!isLooping)}
                className={`${styles.loopBtn} ${isLooping ? styles.loopBtnActive : ''}`}
                title={isLooping ? 'Boucle active' : 'Activer la lecture en boucle'}
              >
                <Repeat size={13} />
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(1, dualPts.length - 1)}
                value={activeIdx}
                onChange={(e) => {
                  const newIdx = parseInt(e.target.value, 10);
                  setActiveIdx(newIdx);
                  if (dualPts[newIdx]) {
                    currentSimTimeRef.current = dualPts[newIdx][4];
                    if (isPlaying) setSimTime(dualPts[newIdx][4]);
                  }
                }}
                className={styles.sliderInput}
              />
              <div className="flex flex-col items-end min-w-24 shrink-0">
                <span className="font-extrabold text-xs text-orange-600">
                  Km {km1.toFixed(2)}
                </span>
                <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                  <span>{fmtTime(isPlaying && simTime !== undefined ? simTime : t1)}</span>
                  {!isSingleMode && (
                    <span className="font-bold text-[10px]" style={{ color: gainSec >= 0 ? 'var(--color-accent)' : '#ef4444' }}>
                      ({gainSec >= 0 ? '+' : ''}{fmtDelta(gainSec)})
                    </span>
                  )}
                </span>
              </div>
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                style={{ width: 'auto', padding: '4px 8px', fontSize: '0.72rem', fontWeight: 700 }}
                title="Vitesse de simulation"
              >
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
            </div>

            {/* Telemetry Panel */}
            <div className={styles.telemetryPanel}>
              <div className={styles.teleBox}>
                <span className={styles.teleLabel}>Position</span>
                <span className={styles.teleVal}>Km {km1.toFixed(2)}</span>
                <span className={styles.teleSub} style={{ color: '#0284c7' }}>
                  {isSingleMode 
                    ? `Sur ${c1?.totalDistanceKm} km` 
                    : p2AtT1
                    ? `T2 à cet instant : Km ${p2AtT1.distKm.toFixed(2)} (${liveT2LeadM >= 0 ? `+${liveT2LeadM} m` : `${liveT2LeadM} m`})`
                    : `T2 : Km ${km2.toFixed(2)} (Écart : ${errM} m)`}
                </span>
              </div>

              <div className={styles.teleBox}>
                <span className={styles.teleLabel}>Altitude & Pente</span>
                <span className={styles.teleVal}>
                  {isSingleMode ? `${Math.round(alt1)} m` : `${Math.round(alt1)} m / ${Math.round(alt2)} m`}
                </span>
                <span className={styles.teleSub}>
                  Pente locale : {activeSplit.grade > 0 ? '+' : ''}{activeSplit.grade}%
                </span>
              </div>

              <div className={styles.teleBox}>
                <span className={styles.teleLabel}>{isSingleMode ? 'Temps Écoulé' : 'Écart Chrono'}</span>
                <span
                  className={styles.teleVal}
                  style={{ color: isSingleMode ? 'var(--text-primary)' : (gainSec >= 0 ? 'var(--color-accent)' : '#ef4444') }}
                >
                  {isSingleMode ? fmtTime(t1) : fmtDelta(gainSec)}
                </span>
                <span className={styles.teleSub}>
                  {isSingleMode ? `Sur ${fmtTime(c1?.totalDurationSec || 0)}` : (gainSec >= 0 ? 'En AVANCE sur T1' : 'En RETARD sur T1')}
                </span>
              </div>

              <div className={styles.teleBox} style={{ borderLeft: '3px solid #FF5A36' }}>
                <span className={styles.teleLabel} style={{ color: '#FF5A36' }}>
                  {isSingleMode ? 'Coureur' : 'Coureur T1 (Norme)'}
                </span>
                <span className={styles.teleVal}>{fmtTime(t1)}</span>
                <span className={styles.teleSub}>
                  {hr1 > 0 ? `FC : ${hr1} bpm` : `${activeSplit.spd22} km/h`}
                </span>
              </div>

              {!isSingleMode ? (
                <div className={styles.teleBox} style={{ borderLeft: '3px solid #0284c7' }}>
                  <span className={styles.teleLabel} style={{ color: '#0284c7' }}>
                    Coureur T2 (Comparée)
                  </span>
                  <span className={styles.teleVal}>{fmtTime(t2)}</span>
                  <span className={styles.teleSub}>
                    {hr2 > 0 ? `FC : ${hr2} bpm (${hr2 - hr1 > 0 ? '+' : ''}${hr2 - hr1} bpm)` : `${activeSplit.spd26} km/h`}
                  </span>
                </div>
              ) : (
                <div className={styles.teleBox} style={{ borderLeft: '3px solid #14C38E' }}>
                  <span className={styles.teleLabel} style={{ color: '#14C38E' }}>
                    Dénivelé Total
                  </span>
                  <span className={styles.teleVal}>+{c1?.elevationGainM} m</span>
                  <span className={styles.teleSub}>
                    -{c1?.elevationLossM} m
                  </span>
                </div>
              )}

              <div className={styles.teleBox}>
                <span className={styles.teleLabel}>Allure ce Km ({activeSplit.lbl})</span>
                <span
                  className={styles.teleVal}
                  style={{ color: isSingleMode ? 'var(--text-primary)' : (activeSplit.gain_s >= 0 ? 'var(--color-accent)' : '#ef4444') }}
                >
                  {isSingleMode
                    ? `${activeSplit.spd22} km/h`
                    : `${activeSplit.gain_s >= 0 ? '+' : ''}${activeSplit.gain_s} s`}
                </span>
                <span className={styles.teleSub}>
                  {isSingleMode ? `Pente : ${activeSplit.grade}%` : `Vit : ${activeSplit.spd26} vs ${activeSplit.spd22} km/h`}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: High-Density Vector Graphs with Mode Switchers */}
          <div className={styles.rightCol}>
            {/* Chart 1: Cumulative Delta & Elevation OR Heart Rate */}
            <div className={styles.card} style={{ flex: 1.25 }}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>
                  <Mountain size={15} className="text-orange-500" />
                  {topChartMode === 'delta'
                    ? (isSingleMode
                        ? `1. Profil Altimétrique (${c1?.totalDistanceKm} km • D+ ${c1?.elevationGainM}m)`
                        : '1. Écart Temporel Cumulé (Norme T1 = 0:00) & Profils Altimétriques')
                    : '1. Comparaison Fréquence Cardiaque (BPM) & Profil Altimétrique'}
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className={styles.toolbar}>
                    <button
                      type="button"
                      onClick={() => setTopChartMode('delta')}
                      className={`${styles.btn} ${topChartMode === 'delta' ? styles.btnActive : ''}`}
                    >
                      <Clock size={12} />
                      <span>Écart Chrono</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopChartMode('hr_speed')}
                      className={`${styles.btn} ${topChartMode === 'hr_speed' ? styles.btnActive : ''}`}
                    >
                      <Heart size={12} />
                      <span>Cardio (BPM)</span>
                    </button>
                  </div>
                </div>
              </div>
              <div className={styles.canvasWrap}>
                <canvas
                  ref={deltaCanvasRef}
                  className={`${styles.canvas} ${styles.chartCanvas}`}
                  onMouseMove={handleChartHover}
                />
              </div>
            </div>

            {/* Chart 2: Net Split Gain/Loss per Km OR Speed Comparison */}
            <div className={styles.card} style={{ flex: 1 }}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>
                  <BarChart3 size={15} className="text-orange-500" />
                  {bottomChartMode === 'splits'
                    ? '2. Gain (+) ou Perte (-) Net par Kilomètre & Courbe de Pente (%)'
                    : '2. Comparaison des Vitesses Moyennes par Kilomètre (T1 vs T2 en km/h)'}
                </span>
                <div className={styles.toolbar}>
                  <button
                    type="button"
                    onClick={() => setBottomChartMode('splits')}
                    className={`${styles.btn} ${bottomChartMode === 'splits' ? styles.btnActive : ''}`}
                  >
                    <TrendingUp size={12} />
                    <span>Gains / Pertes (s)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBottomChartMode('speeds')}
                    className={`${styles.btn} ${bottomChartMode === 'speeds' ? styles.btnActive : ''}`}
                  >
                    <Gauge size={12} />
                    <span>Vitesses (km/h)</span>
                  </button>
                </div>
              </div>
              <div className={styles.canvasWrap}>
                <canvas
                  ref={splitsCanvasRef}
                  className={`${styles.canvas} ${styles.chartCanvas}`}
                  onMouseMove={handleChartHover}
                />
              </div>
            </div>
          </div>
        </div>
      ) : activeMainTab === 'checkpoints' ? (
        /* TAB 2: CHECKPOINTS & KILOMETER SPLITS TABLE */
        <div className="space-y-4">
          {comparison.waypointSplits && comparison.waypointSplits.length > 0 && (
            <section className={styles.checkpointsSection}>
              <div className={styles.checkpointsHeader}>
                <div className="flex items-center gap-2">
                  <Flag size={16} className="text-orange-600" />
                  <span>Postes de Ravitaillement & Points de Passage Roadbook ({comparison.waypointSplits.length} Postes)</span>
                </div>
                <span className="text-xs font-semibold text-slate-500">
                  Cliquez sur une ligne pour positionner le coureur sur la carte
                </span>
              </div>

              <div className={styles.checkpointsTableWrapper}>
                <table className={styles.checkpointsTable}>
                  <thead>
                    <tr>
                      <th>Poste & Type</th>
                      <th>Distance</th>
                      <th>Altitude</th>
                      <th>Horaire Prévu (T1)</th>
                      {!isSingleMode && <th>Passage Réel (T2)</th>}
                      {!isSingleMode && <th>Écart au Poste</th>}
                      <th>Pause Prévue</th>
                      {!isSingleMode && <th>Arrêt Réel Détecté</th>}
                      <th>Barrière Horaire</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.waypointSplits.map((wp, idx) => {
                      const isClosest = Math.abs(km1 - wp.km) < 0.6;
                      let iconEmoji = '📍';
                      if (wp.type === 'food' || wp.type === 'ravito') iconEmoji = '🥪';
                      else if (wp.type === 'water') iconEmoji = '💧';
                      else if (wp.type === 'peak') iconEmoji = '⛰️';
                      else if (wp.type === 'start') iconEmoji = '🚩';
                      else if (wp.type === 'finish') iconEmoji = '🏁';

                      return (
                        <tr
                          key={wp.id || idx}
                          className={isClosest ? styles.checkpointActiveRow : ''}
                          onClick={() => {
                            let bestIdx = 0;
                            let minD = Infinity;
                            dualPts.forEach((p, i) => {
                              const d = Math.abs(p[0] - wp.km);
                              if (d < minD) {
                                minD = d;
                                bestIdx = i;
                              }
                            });
                            setActiveIdx(bestIdx);
                            setActiveMainTab('workspace');
                          }}
                        >
                          <td>
                            <span className="font-bold flex items-center gap-1.5">
                              <span>{iconEmoji}</span>
                              <span>{wp.name}</span>
                            </span>
                          </td>
                          <td>Km {wp.km.toFixed(1)}</td>
                          <td>{wp.ele} m</td>
                          <td className="font-semibold text-slate-700">{fmtTime(wp.plannedTimeSec)}</td>
                          {!isSingleMode && (
                            <td className="font-semibold text-sky-700">
                              {fmtTime(wp.actualTimeSec)}
                            </td>
                          )}
                          {!isSingleMode && (
                            <td className="font-extrabold" style={{ color: wp.deltaSec >= 0 ? 'var(--color-accent)' : '#ef4444' }}>
                              {wp.deltaSec >= 0 ? `+${fmtDelta(wp.deltaSec).replace('+', '')} (Avance)` : `${fmtDelta(wp.deltaSec)} (Retard)`}
                            </td>
                          )}
                          <td>{wp.plannedPauseMin > 0 ? `${wp.plannedPauseMin} min` : '0 min'}</td>
                          {!isSingleMode && (
                            <td>
                              {wp.actualPauseSec ? `${Math.round(wp.actualPauseSec / 60)} min (${wp.actualPauseSec}s)` : '-'}
                            </td>
                          )}
                          <td>{wp.cutoffTime ? <span className="text-amber-700 font-bold">{wp.cutoffTime}</span> : '-'}</td>
                          <td>
                            <button
                              type="button"
                              className="px-2.5 py-1 rounded-full bg-orange-50 hover:bg-orange-100 text-[11px] font-bold text-orange-700 border border-orange-200 transition"
                            >
                              Voir sur carte
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Detailed Kilometer Splits Table */}
          <section className={styles.checkpointsSection}>
            <div className={styles.checkpointsHeader}>
              <div className="flex items-center gap-2">
                <BarChart3 size={16} className="text-orange-600" />
                <span>Détail Kilomètre par Kilomètre ({kmSplits.length} Splits)</span>
              </div>
              <button onClick={handleExportCsv} className={styles.btn}>
                <Download size={13} />
                <span>Exporter en CSV</span>
              </button>
            </div>
            <div className={styles.checkpointsTableWrapper}>
              <table className={styles.checkpointsTable}>
                <thead>
                  <tr>
                    <th>Kilomètre</th>
                    <th>Pente Moyenne</th>
                    <th>Vitesse T1 (Référence)</th>
                    {!isSingleMode && <th>Vitesse T2 (Comparée)</th>}
                    {!isSingleMode && <th>Gain / Perte sur ce Km</th>}
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {kmSplits.map((sp) => (
                    <tr
                      key={sp.km}
                      onClick={() => {
                        let bestIdx = 0;
                        let minD = Infinity;
                        dualPts.forEach((p, i) => {
                          const d = Math.abs(p[0] - (sp.km - 0.5));
                          if (d < minD) {
                            minD = d;
                            bestIdx = i;
                          }
                        });
                        setActiveIdx(bestIdx);
                        setActiveMainTab('workspace');
                      }}
                    >
                      <td className="font-bold">{sp.lbl}</td>
                      <td>
                        <span className={`font-semibold ${sp.grade > 5 ? 'text-rose-600' : sp.grade < -5 ? 'text-sky-600' : 'text-slate-600'}`}>
                          {sp.grade > 0 ? `+${sp.grade}%` : `${sp.grade}%`}
                        </span>
                      </td>
                      <td className="font-semibold">{sp.spd22} km/h</td>
                      {!isSingleMode && <td className="font-semibold text-sky-700">{sp.spd26} km/h</td>}
                      {!isSingleMode && (
                        <td className="font-extrabold" style={{ color: sp.gain_s >= 0 ? 'var(--color-accent)' : '#ef4444' }}>
                          {sp.gain_s >= 0 ? `+${sp.gain_s} s (Gain)` : `${sp.gain_s} s (Perte)`}
                        </td>
                      )}
                      <td>
                        <button
                          type="button"
                          className="px-2.5 py-0.5 rounded-full bg-slate-100 hover:bg-orange-50 text-[11px] font-bold text-slate-700 border border-slate-200 transition"
                        >
                          Cibler Km {sp.km}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        /* TAB 3: DIAGNOSTIC PACING & AI COACH DEBRIEF */
        <div className="space-y-5">
          {pa && (
            <div className={styles.diagnosticGrid}>
              {/* Card 1: Terrain Breakdown */}
              <div className={styles.diagCard}>
                <div className={styles.diagCardHeader}>
                  <span className={styles.diagCardTitle}>
                    <Mountain size={18} className="text-orange-500" />
                    Bilan par Profil de Pente
                  </span>
                </div>
                <p className="text-xs text-slate-500 m-0">
                  Où avez-vous gagné ou perdu du temps par rapport à la référence T1 ?
                </p>

                <div className="space-y-3 mt-1">
                  <div className={styles.terrainBarRow}>
                    <div className={styles.terrainBarLabel}>
                      <span>⛰️ Montées (&gt; +3%)</span>
                      <strong style={{ color: pa.uphillDeltaSec >= 0 ? 'var(--color-accent)' : '#ef4444' }}>
                        {fmtDelta(pa.uphillDeltaSec)}
                      </strong>
                    </div>
                    <div className={styles.terrainBarTrack}>
                      <div
                        className={styles.terrainBarFill}
                        style={{
                          width: `${Math.min(100, Math.max(15, 50 + pa.uphillDeltaSec / 10))}%`,
                          background: pa.uphillDeltaSec >= 0 ? 'var(--color-accent)' : '#ef4444',
                        }}
                      />
                    </div>
                  </div>

                  <div className={styles.terrainBarRow}>
                    <div className={styles.terrainBarLabel}>
                      <span>📉 Descentes (&lt; -3%)</span>
                      <strong style={{ color: pa.downhillDeltaSec >= 0 ? 'var(--color-accent)' : '#ef4444' }}>
                        {fmtDelta(pa.downhillDeltaSec)}
                      </strong>
                    </div>
                    <div className={styles.terrainBarTrack}>
                      <div
                        className={styles.terrainBarFill}
                        style={{
                          width: `${Math.min(100, Math.max(15, 50 + pa.downhillDeltaSec / 10))}%`,
                          background: pa.downhillDeltaSec >= 0 ? 'var(--color-accent)' : '#ef4444',
                        }}
                      />
                    </div>
                  </div>

                  <div className={styles.terrainBarRow}>
                    <div className={styles.terrainBarLabel}>
                      <span>🏃 Portions Roulantes / Plat (-3% à +3%)</span>
                      <strong style={{ color: pa.flatDeltaSec >= 0 ? 'var(--color-accent)' : '#ef4444' }}>
                        {fmtDelta(pa.flatDeltaSec)}
                      </strong>
                    </div>
                    <div className={styles.terrainBarTrack}>
                      <div
                        className={styles.terrainBarFill}
                        style={{
                          width: `${Math.min(100, Math.max(15, 50 + pa.flatDeltaSec / 10))}%`,
                          background: pa.flatDeltaSec >= 0 ? 'var(--color-accent)' : '#ef4444',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Pacing Split (1st Half vs 2nd Half) */}
              <div className={styles.diagCard}>
                <div className={styles.diagCardHeader}>
                  <span className={styles.diagCardTitle}>
                    <Gauge size={18} className="text-orange-500" />
                    Gestion d'Allure & Endurance
                  </span>
                  <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                    Adhérence : {pa.adherenceScore}%
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 my-auto">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">1ère Moitié Course</span>
                    <strong
                      className="text-base font-extrabold"
                      style={{ color: pa.firstHalfDeltaSec >= 0 ? 'var(--color-accent)' : '#ef4444' }}
                    >
                      {fmtDelta(pa.firstHalfDeltaSec)}
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">2ème Moitié Course</span>
                    <strong
                      className="text-base font-extrabold"
                      style={{ color: pa.secondHalfDeltaSec >= 0 ? 'var(--color-accent)' : '#ef4444' }}
                    >
                      {fmtDelta(pa.secondHalfDeltaSec)}
                    </strong>
                  </div>
                </div>

                <div className="text-xs text-slate-600 flex items-center justify-between pt-2 border-t border-slate-100">
                  <span>
                    🏆 Meilleur split : <strong>Km {pa.bestSplitKm}</strong> ({pa.bestSplitGainSec > 0 ? `+${pa.bestSplitGainSec}s` : `${pa.bestSplitGainSec}s`})
                  </span>
                  <span>
                    ⚠️ Point faible : <strong>Km {pa.worstSplitKm}</strong> ({pa.worstSplitLossSec}s)
                  </span>
                </div>
              </div>

              {/* Card 3: Stops & Cardiac Drift */}
              <div className={styles.diagCard}>
                <div className={styles.diagCardHeader}>
                  <span className={styles.diagCardTitle}>
                    <Clock size={18} className="text-orange-500" />
                    Temps d'Arrêt & Physiologie
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 my-auto">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Temps d'Arrêt Détecté</span>
                    <strong className="text-base font-extrabold text-slate-800">
                      {Math.round(pa.stoppedTimeActualSec / 60)} min {pa.stoppedTimeActualSec % 60}s
                    </strong>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      Prévu : {Math.round(pa.stoppedTimePlannedSec / 60)} min
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Dérive Cardiaque</span>
                    <strong className="text-base font-extrabold text-rose-600">
                      {pa.cardiacDriftPct !== undefined ? `${pa.cardiacDriftPct > 0 ? '+' : ''}${pa.cardiacDriftPct}%` : 'Non mesurée'}
                    </strong>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      {c2?.avgHr ? `FC moy T2 : ${c2.avgHr} bpm` : 'Pas de capteur FC'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Retro-Synchronization & Race Modulation Panel (When Roadbook is active) */}
          {activeRoadbookDoc && (
            <div className="p-5 rounded-3xl bg-white border border-orange-200/90 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-orange-200 text-[#FF5A36] flex items-center justify-center">
                    <RefreshCw size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-extrabold text-slate-900 m-0">
                        Rétro-synchronisation & Modulation du Roadbook ({activeRoadbookDoc.name})
                      </h3>
                      {retroSyncRecommendation && (
                        <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                          Source : {retroSyncRecommendation.sourceLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 m-0">
                      Calibrez automatiquement les estimations du Roadbook (Temps cible, ITRA, Fatigue, Coût Montée/Descente et Pauses Ravitos) à partir de votre trace réelle ou de vos sorties intitulées <strong>« Course »</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleFetchAndModulateFromRaces}
                    disabled={isLoadingRacesForCalib}
                    className="px-3.5 py-2 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-extrabold border border-amber-300 transition flex items-center gap-1.5"
                  >
                    {isLoadingRacesForCalib ? <Loader2 size={14} className="animate-spin" /> : <Trophy size={14} className="text-orange-600" />}
                    <span>Calibrer depuis mes sorties « Course » (Intervals.icu)</span>
                  </button>

                  {raceModulationRec && !isSingleMode && (
                    <button
                      type="button"
                      onClick={() => setRaceModulationRec(null)}
                      className="px-3 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                    >
                      Revenir au duel Trace 2 ({c2?.name.slice(0, 18)})
                    </button>
                  )}
                </div>
              </div>

              {retroSyncSuccessMsg && (
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>{retroSyncSuccessMsg}</span>
                </div>
              )}

              {retroSyncRecommendation ? (
                <>
                  {/* Reasons / Diagnostic bullets */}
                  {retroSyncRecommendation.summaryReasons.length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-orange-50/60 border border-orange-200/70 space-y-1.5">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-orange-800 block">
                        Synthèse des modulations détectées :
                      </span>
                      <ul className="list-disc list-inside text-xs text-slate-700 space-y-1 m-0">
                        {retroSyncRecommendation.summaryReasons.map((reason, idx) => (
                          <li key={idx} className="font-medium">{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Parameter Diff Grid with Checkboxes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* 1. Target Time */}
                    <label
                      className={`p-3.5 rounded-2xl border transition cursor-pointer flex flex-col justify-between gap-2 ${
                        syncTargetTime ? 'bg-orange-50/40 border-orange-300 shadow-2xs' : 'bg-slate-50 border-slate-200 opacity-70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                          <Clock size={14} className="text-orange-500" />
                          1. Temps Cible Course
                        </span>
                        <input
                          type="checkbox"
                          checked={syncTargetTime}
                          onChange={(e) => setSyncTargetTime(e.target.checked)}
                          className="w-4 h-4 rounded text-orange-600"
                        />
                      </div>
                      <div className="flex items-baseline gap-2 my-1">
                        <span className="text-xs text-slate-400 line-through font-semibold">
                          {retroSyncRecommendation.oldTargetTimeFormatted}
                        </span>
                        <span className="text-slate-400">→</span>
                        <strong className="text-base font-extrabold text-emerald-600">
                          {retroSyncRecommendation.newTargetTimeFormatted}
                        </strong>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        Recalibre tous les horaires de passage du Roadbook
                      </span>
                    </label>

                    {/* 2. Physiology (ITRA & Fatigue) */}
                    <label
                      className={`p-3.5 rounded-2xl border transition cursor-pointer flex flex-col justify-between gap-2 ${
                        syncPhysiology ? 'bg-orange-50/40 border-orange-300 shadow-2xs' : 'bg-slate-50 border-slate-200 opacity-70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                          <Activity size={14} className="text-orange-500" />
                          2. ITRA & Courbe Fatigue
                        </span>
                        <input
                          type="checkbox"
                          checked={syncPhysiology}
                          onChange={(e) => setSyncPhysiology(e.target.checked)}
                          className="w-4 h-4 rounded text-orange-600"
                        />
                      </div>
                      <div className="space-y-1 my-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Cote ITRA :</span>
                          <span>
                            <del className="text-slate-400 mr-1">{retroSyncRecommendation.oldItraIndex}</del>
                            <strong className="text-slate-900 font-extrabold">{retroSyncRecommendation.newItraIndex}</strong>
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Fatigue (%) :</span>
                          <span>
                            <del className="text-slate-400 mr-1">{retroSyncRecommendation.oldFatiguePercent}%</del>
                            <strong className="text-orange-600 font-extrabold">{retroSyncRecommendation.newFatiguePercent}%</strong>
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        Stratégie : <strong>{retroSyncRecommendation.newPacingStrategy}</strong>
                      </span>
                    </label>

                    {/* 3. Slopes (Uphill / Downhill Cost) */}
                    <label
                      className={`p-3.5 rounded-2xl border transition cursor-pointer flex flex-col justify-between gap-2 ${
                        syncSlopes ? 'bg-orange-50/40 border-orange-300 shadow-2xs' : 'bg-slate-50 border-slate-200 opacity-70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                          <Mountain size={14} className="text-orange-500" />
                          3. Rendement D+ / D-
                        </span>
                        <input
                          type="checkbox"
                          checked={syncSlopes}
                          onChange={(e) => setSyncSlopes(e.target.checked)}
                          className="w-4 h-4 rounded text-orange-600"
                        />
                      </div>
                      <div className="space-y-1 my-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Coût D+ (div) :</span>
                          <span>
                            <del className="text-slate-400 mr-1">{retroSyncRecommendation.oldUpCostDivider}</del>
                            <strong className="text-slate-900 font-extrabold">{retroSyncRecommendation.newUpCostDivider}</strong>
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Coeff Descente :</span>
                          <span>
                            <del className="text-slate-400 mr-1">{retroSyncRecommendation.oldDownCostModifier}</del>
                            <strong className="text-sky-700 font-extrabold">{retroSyncRecommendation.newDownCostModifier}</strong>
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        Seuil marche : {retroSyncRecommendation.newWalkThreshold}% • Desc : {retroSyncRecommendation.newDescentThreshold}%
                      </span>
                    </label>

                    {/* 4. Aid Station Pauses & Segment Modifiers */}
                    <label
                      className={`p-3.5 rounded-2xl border transition cursor-pointer flex flex-col justify-between gap-2 ${
                        syncWaypoints ? 'bg-orange-50/40 border-orange-300 shadow-2xs' : 'bg-slate-50 border-slate-200 opacity-70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                          <Flag size={14} className="text-orange-500" />
                          4. Pauses & Tronçons
                        </span>
                        <input
                          type="checkbox"
                          checked={syncWaypoints}
                          onChange={(e) => setSyncWaypoints(e.target.checked)}
                          className="w-4 h-4 rounded text-orange-600"
                        />
                      </div>
                      <div className="my-1 text-xs text-slate-700">
                        <strong className="text-slate-900 font-extrabold">
                          {retroSyncRecommendation.waypointChanges.length} postes
                        </strong>{' '}
                        modulés (pauses réelles & modificateurs de vitesse %).
                      </div>
                      <span className="text-[11px] text-slate-500">
                        Adapte chaque segment à votre vitesse terrain réelle
                      </span>
                    </label>
                  </div>

                  {/* Action Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={syncGlobalProfile}
                        onChange={(e) => setSyncGlobalProfile(e.target.checked)}
                        className="w-4 h-4 rounded text-orange-600"
                      />
                      <span>
                        Mettre aussi à jour mon <strong>Profil Physiologique global</strong> (appliqué par défaut à mes futurs Roadbooks)
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={handleApplyRetroSync}
                      disabled={isSavingRetroSync || (!syncTargetTime && !syncPhysiology && !syncSlopes && !syncWaypoints)}
                      className={styles.primaryActionBtn}
                    >
                      {isSavingRetroSync ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Synchronisation en cours...</span>
                        </>
                      ) : (
                        <>
                          <Save size={16} />
                          <span>
                            {retroSyncRecommendation.isDemoRoadbook
                              ? 'Appliquer la Rétro-synchronisation (Session Démo)'
                              : 'Appliquer & Sauvegarder dans le Roadbook'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-3">
                  <span>
                    Importez une <strong>Trace 2 (.FIT ou séance Intervals.icu)</strong> pour rétro-synchroniser cette course, ou cliquez sur <strong>« Calibrer depuis mes sorties Course »</strong> pour moduler les estimations du Roadbook avant même de courir.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* AI Coach Debrief Section */}
          <div className={styles.aiDebriefBox}>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FF5A36] text-white flex items-center justify-center shadow-sm">
                  <Bot size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 m-0">
                    Débriefing Tactique & Recommandations du Coach IA
                  </h3>
                  <p className="text-xs text-slate-600 m-0">
                    Générez une analyse complète de vos écarts chrono, de votre gestion des pentes et des séances à planifier.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerateAiDebrief}
                disabled={isGeneratingDebrief}
                className={styles.primaryActionBtn}
              >
                {isGeneratingDebrief ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Analyse de la course par l'IA...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>{aiDebriefText ? 'Relancer le Débriefing IA' : 'Générer le Débriefing Coach IA'}</span>
                  </>
                )}
              </button>
            </div>

            {aiDebriefError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs mt-2">
                {aiDebriefError}
              </div>
            )}

            {aiDebriefText && (
              <div className="mt-4 p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs prose prose-sm max-w-none text-slate-800">
                <ReactMarkdown>{aiDebriefText}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Intervals.icu Activity Selection Modal */}
      <IntervalsActivityModal
        isOpen={isIntervalsModalOpen}
        onClose={() => setIsIntervalsModalOpen(false)}
        onSelectActivity={handleSelectIntervalsActivity}
        targetTrace={intervalsTargetTrace}
        initialAthleteId={athleteId}
        initialAthleteName={athleteName}
        onAthleteChange={(newId, newName) => {
          setAthleteId(newId);
          setAthleteName(newName);
        }}
        onCalibrateFromRaces={activeRoadbookDoc ? handleCalibrateFromRacesProfile : undefined}
        activeRoadbookName={activeRoadbookDoc?.name}
        activeRoadbookDistanceKm={course1?.totalDistanceKm || Number(activeRoadbookDoc?.officialDistance)}
        activeRoadbookElevationGainM={course1?.elevationGainM || Number(activeRoadbookDoc?.officialElevation)}
      />

      {/* Roadbook Selection Modal (.FIT vs Roadbook Pacing) */}
      <RoadbookSelectModal
        isOpen={isRoadbookModalOpen}
        onClose={() => setIsRoadbookModalOpen(false)}
        onSelectRoadbook={handleSelectRoadbook}
      />

      {/* Methodology & Explanatory Note Modal */}
      <ComparatorExplainerModal
        isOpen={isExplainerOpen}
        onClose={() => setIsExplainerOpen(false)}
      />
    </div>
  );
}
