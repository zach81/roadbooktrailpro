"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { 
  Upload, Play, Pause, RotateCcw, ArrowLeftRight, ZoomIn, 
  MapPin, Mountain, Gauge, Heart, Clock, Compass, Activity,
  ChevronDown, ChevronUp, FileCode, CheckCircle2, AlertTriangle, Layers, Loader2,
  Trash2, Sparkles, Navigation, Zap, BookOpen, Repeat, SkipBack, SkipForward,
  Coffee, Award, Flag, ChevronRight, TrendingUp
} from 'lucide-react';
import styles from './CourseComparator.module.css';
import { 
  ComparisonResult, ParsedCourse, parseCourseFile, compareCourses, createSingleCourseComparison, getPointAtTime 
} from '@/lib/courseParser';
import { getSampleComparison } from '@/lib/sampleCourseData';
import IntervalsActivityModal from './IntervalsActivityModal';
import RoadbookSelectModal from './RoadbookSelectModal';
import ComparatorExplainerModal from './ComparatorExplainerModal';

const CourseComparatorMap = dynamic(
  () => import('./CourseComparatorMap'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[440px] w-full items-center justify-center bg-slate-100/60 rounded-2xl text-slate-500 font-semibold text-xs gap-2">
        <Loader2 className="animate-spin" size={20} />
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
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m} min ${String(s).padStart(2, '0')} s`;
}

interface CourseComparatorProps {
  initialAthleteName?: string;
  initialAthleteId?: string;
}

export default function CourseComparator({ initialAthleteName, initialAthleteId }: CourseComparatorProps) {
  // State: starts clean with null comparison (no dummy data)
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [mapMode, setMapMode] = useState<'dual' | 'thermal'>('dual');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showUploads, setShowUploads] = useState<boolean>(true);
  const [showCheckpoints, setShowCheckpoints] = useState<boolean>(true);
  const [simTime, setSimTime] = useState<number | undefined>(undefined);

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

  // 2. Draw Delta Chart
  const drawDeltaChart = useCallback(() => {
    const canvas = deltaCanvasRef.current;
    if (!canvas || dualPts.length === 0) return;
    const { ctx, w, h } = setupUltraHD(canvas);
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);

    const padL = 52, padR = 48, padT = 20, padB = 28;
    const cw = w - padL - padR;
    const ch = h - padT - padB;

    const maxX = dualPts[dualPts.length - 1][0] || 1;

    // Determine min/max delta
    let minDeltaMin = 0;
    let maxDeltaMin = 0;
    let maxAlt = 0;

    dualPts.forEach((p) => {
      const dMin = (p[4] - p[10]) / 60.0;
      if (dMin < minDeltaMin) minDeltaMin = dMin;
      if (dMin > maxDeltaMin) maxDeltaMin = dMin;
      if (p[3] > maxAlt) maxAlt = p[3];
      if (p[9] > maxAlt) maxAlt = p[9];
    });

    minDeltaMin = Math.floor(minDeltaMin) - 1;
    maxDeltaMin = Math.ceil(maxDeltaMin) + 1;
    maxAlt = Math.ceil(maxAlt / 200) * 200 + 100;

    const toX = (km: number) => padL + (km / maxX) * cw;
    const toY = (dMin: number) => padT + ((maxDeltaMin - dMin) / (maxDeltaMin - minDeltaMin || 1)) * ch;
    const toYAlt = (alt: number) => h - padB - (alt / (maxAlt || 1)) * (ch * 0.75);

    // 1. Grid & Axes
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '600 10px sans-serif';

    // Horizontal grid for delta
    const stepDelta = Math.max(1, Math.round((maxDeltaMin - minDeltaMin) / 6));
    for (let d = minDeltaMin; d <= maxDeltaMin; d += stepDelta) {
      const y = toY(d);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      const lbl = d === 0 ? '±0m' : d > 0 ? `+${d}m` : `${d}m`;
      ctx.fillText(lbl, 16, y + 3.5);
    }

    // Altitude right-axis labels
    const stepAlt = Math.max(200, Math.round(maxAlt / 4 / 100) * 100);
    for (let a = 0; a <= maxAlt; a += stepAlt) {
      const y = toYAlt(a);
      ctx.fillText(`${a}m`, w - padR + 6, y + 3.5);
    }

    // Zero delta reference line (Bold Slate)
    const yZero = toY(0);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(padL, yZero);
    ctx.lineTo(w - padR, yZero);
    ctx.stroke();

    const isSingleCourse = Boolean(!comparison?.course2 || comparison?.course1 === comparison?.course2);

    // Elevation profiles
    // Trace 1 Elevation Profile (Rose / Coral with subtle fill)
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
    ctx.fillStyle = 'rgba(225, 29, 72, 0.08)';
    ctx.fill();

    ctx.strokeStyle = '#e11d48';
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

      // Delta Chrono Area fill (Green above 0, Red below 0)
      for (let i = 0; i < dualPts.length - 1; i++) {
        const p1 = dualPts[i];
        const p2 = dualPts[i + 1];
        const x1 = toX(p1[0]);
        const x2 = toX(p2[0]);
        const y1 = toY((p1[4] - p1[10]) / 60.0);
        const y2 = toY((p2[4] - p2[10]) / 60.0);

        const avgGain = (p1[4] - p1[10] + p2[4] - p2[10]) / 2;
        ctx.fillStyle = avgGain >= 0 ? 'rgba(16, 185, 129, 0.22)' : 'rgba(239, 68, 68, 0.22)';
        ctx.beginPath();
        ctx.moveTo(x1, yZero);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2, yZero);
        ctx.closePath();
        ctx.fill();
      }

      // Delta line curve (Thick Charcoal)
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      dualPts.forEach((p, idx) => {
        const x = toX(p[0]);
        const y = toY((p[4] - p[10]) / 60.0);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Strategic notes / callouts
      if (comparison?.notes) {
        comparison.notes.forEach((nt) => {
          const nx = toX(nt.km);
          const ny = toY(nt.min) + nt.dy;

          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(nx, toY(nt.min));
          ctx.lineTo(nx, ny);
          ctx.stroke();

          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 9.5px sans-serif';
          ctx.fillText(nt.txt, nx + 4, ny - 2);
        });
      }
    }

    // Active Cursor Point
    const cur = dualPts[activeIdx] || dualPts[0];
    if (cur) {
      const cx = toX(cur[0]);
      const cy = isSingleCourse ? toYAlt(cur[3]) : toY((cur[4] - cur[10]) / 60.0);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, padT);
      ctx.lineTo(cx, h - padB);
      ctx.stroke();

      ctx.fillStyle = isSingleCourse ? '#e11d48' : (cur[4] - cur[10] >= 0 ? '#10b981' : '#ef4444');
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }, [dualPts, activeIdx, comparison?.notes, comparison?.course1, comparison?.course2, setupUltraHD]);

  // 3. Draw Splits Chart
  const drawSplitsChart = useCallback(() => {
    const canvas = splitsCanvasRef.current;
    if (!canvas || kmSplits.length === 0) return;
    const { ctx, w, h } = setupUltraHD(canvas);
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);

    const padL = 52, padR = 48, padT = 20, padB = 26;
    const cw = w - padL - padR;
    const ch = h - padT - padB;

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

    const totalKm = kmSplits.length;
    const toX = (km: number) => padL + (km / totalKm) * cw;
    const toY = (sec: number) => padT + ((maxS - sec) / (maxS - minS || 1)) * ch;
    const toYGrade = (g: number) => padT + ((maxG - g) / (maxG - minG || 1)) * ch;

    // Horizontal grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '600 10px sans-serif';

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
    const curPt = dualPts[activeIdx] || dualPts[0];
    const activeKmFloor = curPt ? Math.min(totalKm, Math.floor(curPt[0]) + 1) : 1;

    // Bars
    kmSplits.forEach((sp) => {
      const xCenter = toX(sp.km - 0.5);
      const yVal = toY(sp.gain_s);
      const top = Math.min(y0, yVal);
      const height = Math.max(2, Math.abs(yVal - y0));

      ctx.fillStyle = sp.gain_s >= 0 ? '#10b981' : '#ef4444';
      ctx.globalAlpha = sp.km === activeKmFloor ? 1.0 : 0.75;
      ctx.fillRect(xCenter - barW / 2, top, barW, height);

      if (sp.km === activeKmFloor) {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.strokeRect(xCenter - barW / 2, top, barW, height);
      }
      ctx.globalAlpha = 1.0;

      // Text label
      ctx.fillStyle = sp.gain_s >= 0 ? '#065f46' : '#991b1b';
      ctx.font = 'bold 9px sans-serif';
      const lbl = `${sp.gain_s > 0 ? '+' : ''}${sp.gain_s}s`;
      const ly = sp.gain_s >= 0 ? top - 4 : top + height + 10;
      ctx.fillText(lbl, xCenter - 10, ly);

      ctx.fillStyle = '#64748b';
      ctx.font = '600 9.5px sans-serif';
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

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, y0);
    ctx.lineTo(w - padR, y0);
    ctx.stroke();
  }, [kmSplits, dualPts, activeIdx, setupUltraHD]);

  // Update all canvases on activeIdx or comparison change
  useEffect(() => {
    if (comparison) {
      drawDeltaChart();
      drawSplitsChart();
    }
  }, [drawDeltaChart, drawSplitsChart, comparison]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (comparison) {
        drawDeltaChart();
        drawSplitsChart();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawDeltaChart, drawSplitsChart, comparison]);

  // Animation player (Virtual Race Simulation with realistic time progression)
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

    // Duration of a full course replay at 1x in seconds (35 seconds)
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

      // Find closest index in dualPts
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
    try {
      const parsed = await parseCourseFile(file);
      setCourse1(parsed);
      if (course2) {
        setComparison(compareCourses(parsed, course2));
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
  const handleSelectRoadbook = (roadbookCourse: ParsedCourse, raceFitCourse?: ParsedCourse) => {
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
    setShowCheckpoints(true);
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
  };

  // Clear / Reset all data
  const handleClear = () => {
    setComparison(null);
    setCourse1(null);
    setCourse2(null);
    setFile1(null);
    setFile2(null);
    setActiveIdx(0);
    setErrorMessage(null);
    setShowUploads(true);
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

  // Instantaneous Runner 2 position at same elapsed time t1
  const p2AtT1 = useMemo(() => {
    if (isSingleMode || !course2?.points || course2.points.length === 0) return null;
    return getPointAtTime(course2.points, t1);
  }, [isSingleMode, course2?.points, t1]);

  const liveT2LeadM = p2AtT1 ? Math.round((p2AtT1.distKm - km1) * 1000) : 0;

  const kIdx = Math.min(Math.max(Math.floor(km1), 0), Math.max(0, kmSplits.length - 1));
  const activeSplit = kmSplits[kIdx] || { gain_s: 0, spd22: 0, spd26: 0, grade: 0, lbl: '' };

  const c1 = comparison?.course1;
  const c2 = comparison?.course2;

  return (
    <div className={styles.container}>
      {/* Top Header */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <h1 className={styles.title}>
            <Compass className="text-orange-500" size={22} />
            Virtual Partner Ultra-HD — Comparateur Course & Trace
          </h1>
          {comparison ? (
            isSingleMode ? (
              <span className={`${styles.badge} ${c1?.sourceType === 'ROADBOOK' ? styles.badgeRoadbook : styles.badgeT1}`}>
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block mr-1"></span>
                {c1?.sourceType === 'ROADBOOK' ? '📖 Roadbook (Pacing Idéal)' : 'Trace 1'} : {c1?.name}
              </span>
            ) : (
              <>
                <span className={`${styles.badge} ${c1?.sourceType === 'ROADBOOK' ? styles.badgeRoadbook : styles.badgeT1}`}>
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block mr-1"></span>
                  {c1?.sourceType === 'ROADBOOK' ? '📖 Pacing Idéal Roadbook' : 'T1 (Norme)'} : {c1?.name}
                </span>
                <span className={`${styles.badge} ${c2?.sourceType === 'FIT' ? styles.badgeFit : styles.badgeT2}`}>
                  <span className="w-2 h-2 rounded-full bg-sky-500 inline-block mr-1"></span>
                  {c2?.sourceType === 'FIT' ? '⌚ Course Réelle .FIT' : 'T2 (Comparée)'} : {c2?.name}
                </span>
              </>
            )
          ) : (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              Prêt pour analyse
            </span>
          )}
          {athleteName && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/30 flex items-center gap-1.5">
              <span>👤</span>
              <span>Athlète : <strong className="text-white">{athleteName}</strong></span>
            </span>
          )}
        </div>

        {comparison && (
          <div className={styles.kpiBar}>
            <div className={styles.kpiPill}>
              <span className={styles.kpiLbl}>Trace 1 (Norme)</span>
              <span className={styles.kpiVal}>
                {c1?.totalDistanceKm} km • {fmtTime(c1?.totalDurationSec || 0)} • D+ {c1?.elevationGainM}m
              </span>
            </div>
            {!isSingleMode && (
              <>
                <div className={styles.kpiPill}>
                  <span className={styles.kpiLbl}>Trace 2 (Comparée)</span>
                  <span className={styles.kpiVal}>
                    {c2?.totalDistanceKm} km • {fmtTime(c2?.totalDurationSec || 0)} • D+ {c2?.elevationGainM}m
                  </span>
                </div>
                <div className={styles.kpiPill}>
                  <span className={styles.kpiLbl}>Écart Chrono Global</span>
                  <span
                    className={styles.kpiVal}
                    style={{ color: comparison.totalTimeDeltaSec >= 0 ? '#10b981' : '#f87171' }}
                  >
                    {fmtDelta(comparison.totalTimeDeltaSec)} {comparison.totalTimeDeltaSec >= 0 ? '(Avance)' : '(Retard)'}
                  </span>
                </div>
                {comparison.pacingAnalysis && (
                  <div className={styles.kpiPill}>
                    <span className={styles.kpiLbl}>Fidélité au Pacing</span>
                    <span
                      className={styles.kpiVal}
                      style={{ color: comparison.pacingAnalysis.adherenceScore >= 80 ? '#10b981' : '#fbbf24' }}
                    >
                      {comparison.pacingAnalysis.adherenceScore}%
                    </span>
                  </div>
                )}
                <div className={styles.kpiPill}>
                  <span className={styles.kpiLbl}>Écart Tracé GPS</span>
                  <span className={styles.kpiVal}>
                    Médian : {comparison.medianErrorM} m
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        <div className={styles.headerActions}>
          <button
            onClick={() => setIsRoadbookModalOpen(true)}
            className={styles.roadbookHeroBtn}
            title="Sélectionner un Roadbook pour comparer le .FIT à l'allure idéale"
          >
            <Zap size={14} className="text-amber-300" />
            <span>⚡ Duel .FIT vs Roadbook</span>
          </button>

          <button
            onClick={() => setIsExplainerOpen(true)}
            className={styles.explainerBtn}
            title="Consulter la note explicative et le guide méthodologique"
          >
            <BookOpen size={14} />
            <span>Note explicative</span>
          </button>

          <button
            onClick={() => {
              setIntervalsTargetTrace(comparison?.course1 ? 2 : 1);
              setIsIntervalsModalOpen(true);
            }}
            className={styles.headerBtn}
            style={{ background: 'rgba(234, 88, 12, 0.22)', borderColor: 'rgba(234, 88, 12, 0.45)', color: '#fdba74' }}
            title="Importer une séance ou course depuis Intervals.icu"
          >
            <Activity size={14} className="text-orange-400" />
            <span>Intervals.icu</span>
          </button>

          <button
            onClick={() => setShowUploads(!showUploads)}
            className={styles.headerBtn}
            title="Importer des fichiers FIT, TCX ou GPX"
          >
            <Upload size={14} />
            <span>Importer (.fit, .tcx, .gpx)</span>
            {showUploads ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {comparison && !isSingleMode && (
            <button
              onClick={handleSwapTraces}
              className={styles.headerBtn}
              title="Inverser Référence et Comparée"
            >
              <ArrowLeftRight size={14} />
              <span>Inverser</span>
            </button>
          )}

          {comparison ? (
            <button
              onClick={handleClear}
              className={styles.headerBtn}
              title="Effacer les données actuelles et réinitialiser"
            >
              <Trash2 size={14} />
              <span>Effacer</span>
            </button>
          ) : (
            <button
              onClick={handleLoadSample}
              className={styles.headerBtn}
              title="Charger un exemple de démonstration (Roc de France)"
            >
              <Sparkles size={14} className="text-amber-400" />
              <span>Exemple</span>
            </button>
          )}
        </div>
      </header>

      {/* Expandable Upload Drawer */}
      {showUploads && (
        <section className={styles.uploadSection}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FileCode size={16} className="text-orange-600" />
                Charger vos activités GPS (Garmin, Coros, Suunto, Polar, Wahoo, Apple Watch...)
              </h2>
              <p className="text-xs text-slate-500">
                Glissez-déposez ou sélectionnez des fichiers au format <strong>.fit</strong> (binaire natif montre), <strong>.tcx</strong> ou <strong>.gpx</strong>.
              </p>
            </div>
            {course1 && course2 && (
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1.5">
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
              <div className={`${styles.dropzoneLabel} text-rose-600`}>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                Trace 1 : Référence / Norme (ex: Course N-1, Trace Officielle, Pacing)
              </div>
              <p className={styles.dropzoneHint}>
                {loadingFile1
                  ? 'Décodage en cours...'
                  : file1
                  ? file1.name
                  : 'Cliquez ou glissez-déposez votre fichier .fit, .tcx, .gpx'}
              </p>
              {course1 && (
                <div className={styles.fileLoadedInfo}>
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-bold text-xs text-slate-800 truncate">{course1.name}</span>
                    {course1.sourceType === 'INTERVALS' && (
                      <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 shrink-0">
                        Intervals.icu
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-rose-600 shrink-0">
                    {course1.totalDistanceKm} km • D+ {course1.elevationGainM}m
                  </span>
                </div>
              )}
              <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIntervalsTargetTrace(1);
                    setIsIntervalsModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 transition flex items-center gap-1.5 shadow-2xs"
                  title="Sélectionner une séance Intervals.icu pour Trace 1"
                >
                  <Activity size={13} className="text-rose-600" />
                  <span>Choisir depuis Intervals.icu</span>
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
                Trace 2 : Comparée / Réalisé (ex: Course actuelle, Reconnaissance, Test)
              </div>
              <p className={styles.dropzoneHint}>
                {loadingFile2
                  ? 'Décodage en cours...'
                  : file2
                  ? file2.name
                  : 'Cliquez ou glissez-déposez votre fichier .fit, .tcx, .gpx'}
              </p>
              {course2 && (
                <div className={styles.fileLoadedInfo}>
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-bold text-xs text-slate-800 truncate">{course2.name}</span>
                    {course2.sourceType === 'INTERVALS' && (
                      <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 shrink-0">
                        Intervals.icu
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-sky-600 shrink-0">
                    {course2.totalDistanceKm} km • D+ {course2.elevationGainM}m
                  </span>
                </div>
              )}
              <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIntervalsTargetTrace(2);
                    setIsIntervalsModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold border border-sky-200 transition flex items-center gap-1.5 shadow-2xs"
                  title="Sélectionner une séance Intervals.icu pour Trace 2"
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
            <Navigation size={18} className="text-emerald-600" />
            <span>
              <strong>Trace 1 chargée :</strong> {c1.name} ({c1.totalDistanceKm} km • D+ {c1.elevationGainM}m). Sélectionnez votre 2ème séance depuis <strong>Intervals.icu</strong> ou glissez un fichier dans <strong>Trace 2</strong> pour lancer la comparaison d'allure et le duel Virtual Partner !
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setIntervalsTargetTrace(2);
                setIsIntervalsModalOpen(true);
              }}
              className="px-3.5 py-1.5 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition flex items-center gap-1.5 shadow-xs"
              title="Sélectionner une séance Intervals.icu pour la Trace 2"
            >
              <Activity size={13} />
              <span>Trace 2 (Intervals.icu)</span>
            </button>
            <button
              onClick={() => setShowUploads(true)}
              className={styles.singleTraceAction}
            >
              Fichier Trace 2
            </button>
          </div>
        </div>
      )}

      {/* Checkpoints & Aid Stations Table (Roadbook vs .FIT) */}
      {comparison?.waypointSplits && comparison.waypointSplits.length > 0 && (
        <section className={styles.checkpointsSection}>
          <div
            className={styles.checkpointsHeader}
            onClick={() => setShowCheckpoints(!showCheckpoints)}
          >
            <div className="flex items-center gap-2">
              <Flag size={15} className="text-orange-600" />
              <span>Tableau de Marche & Ravitaillements ({comparison.waypointSplits.length} Postes Roadbook)</span>
              {!isSingleMode && (
                <span className="text-[11px] font-bold text-slate-500 hidden sm:inline">
                  • Confrontation temps prévus au plan vs passage réel .FIT
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <span>{showCheckpoints ? 'Masquer' : 'Afficher'}</span>
              {showCheckpoints ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </div>

          {showCheckpoints && (
            <div className={styles.checkpointsTableWrapper}>
              <table className={styles.checkpointsTable}>
                <thead>
                  <tr>
                    <th>Poste & Type</th>
                    <th>Distance</th>
                    <th>Altitude</th>
                    <th>Horaire Prévu (Roadbook)</th>
                    {!isSingleMode && <th>Chrono Réel (.FIT)</th>}
                    {!isSingleMode && <th>Écart au Poste</th>}
                    <th>Pause Prévue</th>
                    {!isSingleMode && <th>Arrêt Réel</th>}
                    <th>Barrière Horaire</th>
                    <th>Navigation</th>
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
                          if (dualPts[bestIdx]) {
                            currentSimTimeRef.current = dualPts[bestIdx][4];
                            if (isPlaying) setSimTime(dualPts[bestIdx][4]);
                          }
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
                          <td className="font-extrabold" style={{ color: wp.deltaSec >= 0 ? '#10b981' : '#ef4444' }}>
                            {wp.deltaSec >= 0 ? `+${fmtDelta(wp.deltaSec).replace('+', '')} (Avance)` : `${fmtDelta(wp.deltaSec)} (Retard)`}
                          </td>
                        )}
                        <td>{wp.plannedPauseMin > 0 ? `${wp.plannedPauseMin} min` : '0 min'}</td>
                        {!isSingleMode && (
                          <td>
                            {wp.actualPauseSec ? `${Math.round(wp.actualPauseSec / 60)} min` : '-'}
                          </td>
                        )}
                        <td>{wp.cutoffTime ? <span className="text-amber-700 font-bold">{wp.cutoffTime}</span> : '-'}</td>
                        <td>
                          <button
                            type="button"
                            className="px-2 py-0.5 rounded bg-slate-100 hover:bg-orange-50 text-[10px] font-bold text-slate-700 border border-slate-200 transition"
                          >
                            Pointer
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Main Content Area */}
      {!comparison ? (
        /* Empty State Banner */
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
                <Zap size={16} className="text-amber-400" />
                <span>Pacing Idéal Roadbook</span>
              </div>
              <p className={styles.featureCardText}>
                Intègre la formule Minetti (coût selon la pente), l'index ITRA, la fatigue exponentielle et les pauses prévues aux ravitaillements.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureCardTitle}>
                <Layers size={16} className="text-sky-400" />
                <span>Décodage .FIT Garmin, Coros, Suunto</span>
              </div>
              <p className={styles.featureCardText}>
                Support natif binaire des montres de sport avec horodatage, fréquence cardiaque réelle et détection des temps d'arrêt.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureCardTitle}>
                <TrendingUp size={16} className="text-emerald-400" />
                <span>Simulation Duel Virtual Partner</span>
              </div>
              <p className={styles.featureCardText}>
                Rejouez la course seconde par seconde avec écart en mètres et graphiques de splits nets kilométriques.
              </p>
            </div>
          </div>

          <div className={styles.emptyStateActions}>
            <button
              onClick={() => setIsRoadbookModalOpen(true)}
              className={styles.primaryActionBtn}
              style={{ background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)' }}
            >
              <Zap size={16} />
              <span>⚡ Comparer .FIT vs Roadbook</span>
            </button>
            <button
              onClick={() => setIsExplainerOpen(true)}
              className={styles.secondaryActionBtn}
            >
              <BookOpen size={16} />
              <span>Note explicative & Guide</span>
            </button>
            <button
              onClick={() => {
                setIntervalsTargetTrace(1);
                setIsIntervalsModalOpen(true);
              }}
              className={styles.secondaryActionBtn}
            >
              <Activity size={16} />
              <span>Intervals.icu</span>
            </button>
            <button
              onClick={() => setShowUploads(true)}
              className={styles.secondaryActionBtn}
            >
              <Upload size={16} />
              <span>Glisser vos fichiers</span>
            </button>
            <button
              onClick={handleLoadSample}
              className={styles.secondaryActionBtn}
            >
              <Sparkles size={16} className="text-amber-400" />
              <span>Exemple Roc de France</span>
            </button>
          </div>
        </div>
      ) : (
        /* Main Grid: Left Map + Telemetry | Right Ultra-HD Charts */
        <div className={styles.mainGrid}>
          {/* Left Column: Interactive Vector Map + Controls + Telemetry */}
          <div className={styles.leftCol}>
            <div className={styles.card} style={{ flex: 1, overflow: 'hidden' }}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>
                  <Layers size={15} className="text-orange-500" />
                  Carte Leaflet GPX — {isSingleMode ? 'Visualisation de Trace' : 'Superposition & Virtual Partner'}
                </span>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-rose-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block"></span>
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
                title="Reculer de 1 km"
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
                title={isPlaying ? 'Pause' : 'Lire la simulation'}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                onClick={() => handleStepKm(1)}
                className={styles.stepBtn}
                title="Avancer de 1 km"
              >
                +1 km
              </button>
              <button
                onClick={() => setIsLooping(!isLooping)}
                className={`${styles.loopBtn} ${isLooping ? styles.activeLoop : ''}`}
                title={isLooping ? 'Boucle active' : 'Activer la lecture en boucle'}
              >
                <Repeat size={13} />
              </button>
              <span className="font-bold text-xs text-slate-700">Progression :</span>
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
              <div className="flex flex-col items-end min-w-20 shrink-0">
                <span className="font-extrabold text-xs text-orange-600">
                  Km {km1.toFixed(2)}
                </span>
                <span className="text-[10px] font-semibold text-slate-500">
                  {fmtTime(isPlaying && simTime !== undefined ? simTime : t1)}
                </span>
              </div>
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                className="text-[11px] font-bold bg-slate-100 rounded px-1.5 py-1 border border-slate-200 outline-none cursor-pointer"
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
                <span className={styles.teleLabel}>Altitude</span>
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
                  style={{ color: isSingleMode ? '#0f172a' : (gainSec >= 0 ? 'var(--color-accent, #10b981)' : '#ef4444') }}
                >
                  {isSingleMode ? fmtTime(t1) : fmtDelta(gainSec)}
                </span>
                <span className={styles.teleSub}>
                  {isSingleMode ? `Sur ${fmtTime(c1?.totalDurationSec || 0)}` : (gainSec >= 0 ? 'En AVANCE sur T1' : 'En RETARD sur T1')}
                </span>
              </div>

              <div className={styles.teleBox} style={{ borderLeft: '3px solid #e11d48' }}>
                <span className={styles.teleLabel} style={{ color: '#e11d48' }}>
                  {isSingleMode ? 'Coureur' : 'Coureur T1 (Norme)'}
                </span>
                <span className={styles.teleVal}>{fmtTime(t1)}</span>
                <span className={styles.teleSub}>
                  {hr1 > 0 ? `FC : ${hr1} bpm` : `${(c1 && c1.totalDurationSec > 0 ? (c1.totalDistanceKm / (c1.totalDurationSec / 3600)).toFixed(1) : '10.0')} km/h`}
                </span>
              </div>

              {!isSingleMode ? (
                <div className={styles.teleBox} style={{ borderLeft: '3px solid #0284c7' }}>
                  <span className={styles.teleLabel} style={{ color: '#0284c7' }}>
                    Coureur T2 (Comparée)
                  </span>
                  <span className={styles.teleVal}>{fmtTime(t2)}</span>
                  <span className={styles.teleSub}>
                    {hr2 > 0 ? `FC : ${hr2} bpm (${hr2 - hr1 > 0 ? '+' : ''}${hr2 - hr1} bpm)` : 'Chrono réel'}
                  </span>
                </div>
              ) : (
                <div className={styles.teleBox} style={{ borderLeft: '3px solid #10b981' }}>
                  <span className={styles.teleLabel} style={{ color: '#10b981' }}>
                    Dénivelé Total
                  </span>
                  <span className={styles.teleVal}>+{c1?.elevationGainM} m</span>
                  <span className={styles.teleSub}>
                    -{c1?.elevationLossM} m
                  </span>
                </div>
              )}

              <div className={styles.teleBox}>
                <span className={styles.teleLabel}>Allure ce Km</span>
                <span
                  className={styles.teleVal}
                  style={{ color: isSingleMode ? '#0f172a' : (activeSplit.gain_s >= 0 ? 'var(--color-accent, #10b981)' : '#ef4444') }}
                >
                  {isSingleMode
                    ? `${activeSplit.spd22} km/h`
                    : `${activeSplit.gain_s >= 0 ? '+' : ''}${activeSplit.gain_s} s (${activeSplit.lbl})`}
                </span>
                <span className={styles.teleSub}>
                  {isSingleMode ? `Pente : ${activeSplit.grade}%` : `Vit : ${activeSplit.spd26} vs ${activeSplit.spd22} km/h`}
                </span>
              </div>

              {comparison.pacingAnalysis && (
                <div className={styles.teleBox} style={{ borderLeft: '3px solid #8b5cf6' }}>
                  <span className={styles.teleLabel} style={{ color: '#8b5cf6' }}>
                    Adhérence Stratégie
                  </span>
                  <span className={styles.teleVal}>
                    {comparison.pacingAnalysis.adherenceScore}%
                  </span>
                  <span className={styles.teleSub}>
                    D+ {comparison.pacingAnalysis.uphillDeltaSec >= 0 ? '+' : ''}{comparison.pacingAnalysis.uphillDeltaSec}s | D- {comparison.pacingAnalysis.downhillDeltaSec >= 0 ? '+' : ''}{comparison.pacingAnalysis.downhillDeltaSec}s
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: High-Density Vector Graphs */}
          <div className={styles.rightCol}>
            {/* Chart 1: Cumulative Delta & Elevation Superposition */}
            <div className={styles.card} style={{ flex: 1.25 }}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>
                  <Mountain size={15} className="text-orange-500" />
                  {isSingleMode
                    ? `1. Profil Altimétrique (${c1?.totalDistanceKm} km • D+ ${c1?.elevationGainM}m)`
                    : '1. Écart Temporel Cumulé (Norme T1 = 0:00) & Profils Altimétriques'}
                </span>
                <div className={styles.legendInline}>
                  {!isSingleMode && (
                    <span>
                      <i className={styles.lineSwatch} style={{ background: '#0f172a' }}></i>Écart Chrono
                    </span>
                  )}
                  <span>
                    <i className={styles.lineSwatch} style={{ background: '#e11d48' }}></i>Alt. {isSingleMode ? 'Trace' : 'T1'}
                  </span>
                  {!isSingleMode && (
                    <span>
                      <i className={styles.lineSwatch} style={{ background: '#0284c7' }}></i>Alt. T2
                    </span>
                  )}
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

            {/* Chart 2: Net Split Gain/Loss per Km + Grade % */}
            <div className={styles.card} style={{ flex: 1 }}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>
                  <Activity size={15} className="text-orange-500" />
                  {isSingleMode
                    ? '2. Profil par Kilomètre (Dénivelé & Pente %)'
                    : '2. Gain (+) ou Perte (-) Net par Kilomètre & Courbe de Pente (%)'}
                </span>
                <div className={styles.legendInline}>
                  {!isSingleMode ? (
                    <>
                      <span>
                        <i className={styles.lineSwatch} style={{ background: '#10b981', height: '7px' }}></i>Temps Gagné (+)
                      </span>
                      <span>
                        <i className={styles.lineSwatch} style={{ background: '#ef4444', height: '7px' }}></i>Temps Perdu (-)
                      </span>
                    </>
                  ) : (
                    <span>
                      <i className={styles.lineSwatch} style={{ background: '#10b981', height: '7px' }}></i>Kilomètre
                    </span>
                  )}
                  <span>
                    <i className={styles.lineSwatch} style={{ background: '#475569' }}></i>Pente (%)
                  </span>
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
