"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { 
  ArrowLeft, Calendar as CalendarIcon, Flag, Target, TrendingUp, 
  Activity, Zap, BarChart2, CheckCircle2, Sliders, Mountain, 
  Heart, Watch, Dumbbell, Route, HelpCircle, Trash2, GitCompare
} from 'lucide-react';
import { Race, TargetType, ProgressionParams } from '@/types';
import { fetchAthleteLoad, fetchAthleteEvents } from '@/lib/intervalsApi';
import { generateMacrocycle, generateWorkoutsForMacrocycle } from '@/lib/trainingEngine';
import { saveAthletePlan, getUserIntervalsCredentials } from '@/lib/firebaseUtils';
import { BarChart, Bar, Cell, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/context/AuthContext';
import styles from './page.module.css';
import { RefreshCw, Plus } from 'lucide-react';
import { getApiUrl } from '@/lib/apiHelper';

const formatDateForInput = (d: Date | string) => {
  try {
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch(e) {
    return new Date().toISOString().split('T')[0];
  }
};

export default function PlanBuilderPage() {
  const router = useRouter();
  const params = useParams();
  const athleteId = params.id as string;
  const { currentUser, isAdmin, loading: authLoading } = useAuth();

  const [athleteName, setAthleteName] = useState("Athlète");
  const [intervalsApiKey, setIntervalsApiKey] = useState("");
  const [intervalsAthleteId, setIntervalsAthleteId] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFetchingRaces, setIsFetchingRaces] = useState(false);

  // Plan State
  const [planName, setPlanName] = useState('Objectif Principal');
  const [sports, setSports] = useState<{id: string, name: string, hours: number}[]>([
    { id: '1', name: 'Trail', hours: 7.0 }
  ]);
  const [targetTypes, setTargetTypes] = useState<Record<TargetType, boolean>>({ Charge: true, Durée: false, Distance: false });
  const [startDate, setStartDate] = useState(formatDateForInput(new Date()));
  const [startWithRecovery, setStartWithRecovery] = useState(false);
  const [planMode, setPlanMode] = useState<'RACE' | 'MANUAL'>('RACE');
  const [manualPhases, setManualPhases] = useState({ base: 8, build: 4, peak: 4, taper: 4 });

  const [sessionsPerWeek, setSessionsPerWeek] = useState(4);
  const [availableDays, setAvailableDays] = useState<number[]>([1, 2, 4, 6, 0]); 
  const [longRunDays, setLongRunDays] = useState<number[]>([0]); 
  const [distributionModel, setDistributionModel] = useState<'POLARIZED' | 'PYRAMIDAL' | 'THRESHOLD'>('POLARIZED');
  const [targetModality, setTargetModality] = useState<'RPE' | 'HR' | 'POWER' | 'PACE'>('RPE');
  const [includeHomeTrainer, setIncludeHomeTrainer] = useState(false);
  const [includeStrength, setIncludeStrength] = useState(false);
  const [weChocFrequency, setWeChocFrequency] = useState(0);
  const [useAiForWorkouts, setUseAiForWorkouts] = useState(true);
  
  const [aiNotes, setAiNotes] = useState('');
  
  const [loadData, setLoadData] = useState<{ctl: number, atl: number, form: number, avgWeeklyTss?: number} | null>(null);
  const [isLoadingLoad, setIsLoadingLoad] = useState(false);

  const [races, setRaces] = useState<Race[]>([
    { id: '1', name: 'Madeloc Skytrail', date: new Date(Date.now() + 16 * 7 * 24 * 60 * 60 * 1000), priority: 'A', isTarget: true, daysAway: 112, distance: 42 }
  ]);

  const [progression, setProgression] = useState<ProgressionParams>({
    mesocycleProgressionRate: 5,
    intramesocycleProgressionRate: 5,
    plateauThreshold: 70,
    recoveryVolumeReduction: 30,
    recoveryFrequency: 4
  });

  useEffect(() => {
    if (authLoading || !isAdmin || !currentUser?.uid) return;
    let cancelled = false;

    getUserIntervalsCredentials(currentUser.uid).then((creds) => {
      if (cancelled) return;
      const storedKey = creds.apiKey;
      const storedId = creds.athleteId;
      if (storedKey) setIntervalsApiKey(storedKey);
      if (storedId) setIntervalsAthleteId(storedId);

      if (athleteId && storedKey) {
        setIsLoadingLoad(true);
        fetchAthleteLoad(athleteId, storedKey).then(data => {
          if (cancelled) return;
          if (data) {
            setLoadData(data);
            if (data.name) setAthleteName(data.name);
          } else {
            setLoadData({ ctl: 43, atl: 44, form: -1 });
          }
          setIsLoadingLoad(false);
        });
      } else {
        setLoadData({ ctl: 43, atl: 44, form: -1 });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [athleteId, currentUser?.uid, isAdmin, authLoading]);

  useEffect(() => {
    if (loadData) {
      const estimatedHours = Math.round((loadData.ctl * 7) / 50 * 10) / 10;
      setSports(prev => {
        const newSports = [...prev];
        newSports[0] = { ...newSports[0], hours: estimatedHours > 0 ? estimatedHours : 7.0 };
        return newSports;
      });
    }
  }, [loadData]);

  const handleFetchRaces = async () => {
    if (!intervalsAthleteId || !intervalsApiKey) {
      alert("Veuillez configurer vos identifiants Intervals.icu pour cet athlète (retournez à la liste ou au dashboard).");
      return;
    }
    
    setIsFetchingRaces(true);
    try {
      const startStr = new Date().toISOString().split('T')[0];
      const endStr = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const events = await fetchAthleteEvents(intervalsAthleteId, intervalsApiKey, startStr, endStr);
      
      const newRaces = events
        .filter((e: any) => e.category === 'RACE' || e.name.toLowerCase().includes('course') || e.name.toLowerCase().includes('race'))
        .map((e: any) => ({
          id: e.id ? e.id.toString() : Date.now().toString() + Math.random(),
          name: e.name || 'Course importée',
          date: new Date(e.start_date_local || e.start_date),
          priority: 'B',
          isTarget: false,
          daysAway: Math.ceil((new Date(e.start_date_local || e.start_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
          distance: e.distance ? Math.round(e.distance / 1000) : undefined
        }));
        
      if (newRaces.length > 0) {
        setRaces(prev => {
          const merged = [...prev];
          newRaces.forEach((nr: Race) => {
            if (!merged.some(r => r.name === nr.name && r.date.toDateString() === nr.date.toDateString())) {
              merged.push(nr);
            }
          });
          return merged;
        });
        alert(`${newRaces.length} courses importées avec succès !`);
      } else {
        alert("Aucune course future trouvée sur Intervals.icu.");
      }
    } catch (e) {
      console.error(e);
      alert("Erreur lors de l'importation des courses.");
    } finally {
      setIsFetchingRaces(false);
    }
  };

  const handleDateChange = (id: string, value: string) => {
    if (!value) return;
    const [y, m, d] = value.split('-');
    const newDate = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0); // Midi pour éviter le décalage de fuseau horaire
    setRaces(races.map(r => r.id === id ? { ...r, date: newDate } : r));
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    const config = {
      planName,
      hoursPerWeek: sports.reduce((acc, s) => acc + (Number(s.hours) || 0), 0),
      sports: sports.map(s => ({ ...s, hours: Number(s.hours) || 0 })),
      targetTypes,
      startDate,
      startWithRecovery,
      races: races.map(r => ({ ...r, distance: r.distance !== undefined && r.distance !== null && (r.distance as any) !== '' ? Number(r.distance) || 0 : undefined })),
      progression,
      planMode,
      manualPhases,
      sessionsPerWeek,
      availableDays,
      longRunDays,
      distributionModel,
      targetModality,
      includeHomeTrainer,
      includeStrength,
      weChocFrequency,
      initialTss: loadData?.avgWeeklyTss,
      useAiForWorkouts,
      aiNotes
    };

    try {
      const newPlan = generateMacrocycle(athleteId, config);
      
      let finalWorkouts: any[] = [];
      if (useAiForWorkouts) {
        // Appeler l'API IA pour les 4 premières semaines
        try {
          const response = await fetch(getApiUrl('/api/generate-workouts'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ macrocycle: newPlan, config, weeksToGenerate: 4 })
          });
          if (response.ok) {
            const data = await response.json();
            if (data.workouts) {
              finalWorkouts = data.workouts.map((w: any) => ({ ...w, date: new Date(w.date) }));
            }
          }
        } catch (e) {
          console.error("AI Generation failed", e);
        }
      }

      if (finalWorkouts.length === 0) {
         finalWorkouts = await generateWorkoutsForMacrocycle(newPlan, config);
      }

      // Save to Firebase & scoped localStorage so dashboard can auto-load if needed
      if (currentUser?.uid) {
        await saveAthletePlan(currentUser.uid, athleteId, {
          macrocycle: newPlan,
          workouts: finalWorkouts,
          config: config
        });
        localStorage.setItem(`latestPlan_${currentUser.uid}_${athleteId}`, JSON.stringify({
          macrocycle: newPlan,
          workouts: finalWorkouts,
          config: config
        }));
      }

      // Redirect back to dashboard
      router.push(`/athletes/${athleteId}`);
      
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la génération.");
    } finally {
      setIsGenerating(false);
    }
  };

  // UI Helpers
  const totalHours = sports.reduce((acc, s) => acc + (Number(s.hours) || 0), 0);
  const start = new Date(startDate);
  let totalDays = 0, totalWeeks = 0;
  let endDateStr = 'N/A';
  
  if (planMode === 'RACE') {
    const targetRace = races.find(r => r.isTarget) || races[0];
    totalDays = targetRace ? Math.ceil((targetRace.date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    totalWeeks = Math.max(4, Math.ceil(totalDays / 7));
    endDateStr = targetRace ? targetRace.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric'}) : 'N/A';
  } else {
    totalWeeks = manualPhases.base + manualPhases.build + manualPhases.peak + manualPhases.taper;
    totalDays = totalWeeks * 7;
    const end = new Date(start.getTime() + totalDays * 24 * 60 * 60 * 1000);
    endDateStr = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric'});
  }

  const previewConfig = {
    planName,
    hoursPerWeek: totalHours,
    sports: sports.map(s => ({ ...s, hours: Number(s.hours) || 0 })),
    targetTypes,
    startDate,
    startWithRecovery,
    races: races.map(r => ({ ...r, distance: r.distance !== undefined && r.distance !== null && (r.distance as any) !== '' ? Number(r.distance) || 0 : undefined })),
    progression,
    planMode,
    manualPhases,
    sessionsPerWeek,
    availableDays,
    longRunDays,
    distributionModel,
    targetModality,
    includeHomeTrainer,
    includeStrength,
    weChocFrequency,
    initialTss: loadData?.avgWeeklyTss
  };
  
  let chartData: any[] = [];
  try {
    const previewPlan = generateMacrocycle("preview-athlete", previewConfig);
    let weekIndex = 1;
    chartData = previewPlan.mesocycles.flatMap((mc) => 
      mc.targetTssPerWeek.map((tss) => ({
        week: weekIndex++,
        tss: Math.round(tss),
        phase: mc.phase
      }))
    );
  } catch (e) {}

  const phaseColors: Record<string, string> = {
    Base: "#4ade80", Build: "#f97316", Peak: "#f59e0b", Taper: "#fcd34d", Recovery: "#9ca3af",
  };

  if (!authLoading && currentUser && !isAdmin) {
    return null;
  }

  return (
    <div className={styles.dashboardContainer}>
      {/* Premium Header */}
      <div className={styles.header}>
        <div className="flex items-center gap-6">
          <button 
            onClick={() => router.push(`/athletes/${athleteId}`)}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--bg-body)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-all shadow-sm"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className={styles.headerTitle}>
              <Zap className="text-orange-600" size={24} />
              Coach IA Studio
            </h1>
            <p className={styles.headerSubtitle}>
              Création d'un plan sur-mesure pour <span className="text-[var(--text-primary)] font-semibold">{athleteName}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {loadData && (
            <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-xl bg-orange-50/50 border border-orange-100/50">
              <div className="text-xs font-bold text-orange-800 uppercase tracking-wider">Fitness Actuel</div>
              <div className="flex items-center gap-2">
                <span className="font-black text-orange-600">CTL {loadData.ctl}</span>
              </div>
            </div>
          )}
          <button 
            type="button"
            onClick={() => router.push(`/comparator?athlete=${encodeURIComponent(athleteName || '')}&athleteId=${encodeURIComponent(athleteId || '')}`)}
            className="btn btn-secondary flex items-center gap-2"
            title="Comparateur de trace & Virtual Partner"
          >
            <GitCompare size={18} className="text-orange-600" />
            <span className="hidden sm:inline">Comparateur</span>
          </button>
          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`btn btn-primary ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isGenerating ? (
              <><RefreshCw size={20} className="animate-spin" /> Génération...</>
            ) : (
              <><CheckCircle2 size={20} /> Générer le plan</>
            )}
          </button>
        </div>
      </div>

      <div className={styles.grid}>
        
        {/* Main Configuration Area */}
        <div className={styles.mainColumn}>
            
          {/* Objectif Section */}
          <div className={styles.roadbookCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardHeaderTitle}>
                <Flag size={20} className={styles.iconPrimary} />
                Cible & Période
              </h2>
            </div>

            <div className={styles.cardBody}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-2">
                <div className={styles.formGroup}>
                  <label className={styles.label}>Nom du Bloc</label>
                  <input 
                    type="text" 
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    className={styles.input}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Date de début</label>
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={styles.input}
                  />
                </div>
              </div>

              {/* Races */}
              <div className={styles.formGroup}>
                <div className="flex justify-between items-center mb-2">
                  <label className={styles.label}>Calendrier de Courses</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleFetchRaces}
                      disabled={isFetchingRaces}
                      className="text-emerald-600 text-sm font-bold bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors flex items-center gap-1"
                    >
                      {isFetchingRaces ? <RefreshCw size={14} className="animate-spin" /> : <CalendarIcon size={14} />}
                      Importer
                    </button>
                    <button 
                      onClick={() => setRaces([...races, { id: Date.now().toString(), name: 'Nouvelle', date: new Date(Date.now() + 8*7*24*60*60*1000), priority: 'B', isTarget: false, daysAway: 56 }])} 
                      className="text-orange-600 text-sm font-bold bg-orange-50 px-3 py-1.5 rounded-lg hover:bg-orange-100 transition-colors flex items-center gap-1"
                    >
                      <Plus size={14} /> Ajouter
                    </button>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {races.map((race) => (
                    <div key={race.id} className={`${styles.raceItem} ${race.isTarget ? styles.target : ''} relative group overflow-hidden`}>
                      {race.isTarget && (
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-orange-400 to-orange-600"></div>
                      )}
                      
                      <div className="flex flex-col gap-4 pl-1 sm:pl-3">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-3 cursor-pointer group-hover:opacity-100 transition-opacity">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${race.isTarget ? 'border-orange-500 bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.4)]' : 'border-gray-300 hover:border-orange-300'}`}>
                              {race.isTarget && <CheckCircle2 size={12} className="text-white" />}
                            </div>
                            <input type="radio" checked={race.isTarget} onChange={() => setRaces(races.map(r => ({ ...r, isTarget: r.id === race.id })))} className="hidden" />
                            <span className={`font-bold text-sm ${race.isTarget ? 'text-orange-600' : 'text-[var(--text-secondary)]'}`}>
                              {race.isTarget ? 'Objectif A (Fin du Plan)' : 'Préparation'}
                            </span>
                          </label>
                          {races.length > 1 && (
                            <button 
                              onClick={() => setRaces(races.filter(r => r.id !== race.id))}
                              className="text-[var(--text-tertiary)] hover:text-red-500 transition-colors p-2 rounded hover:bg-red-50"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <div className="md:col-span-6">
                            <input 
                              type="text" 
                              value={race.name}
                              onChange={(e) => setRaces(races.map(r => r.id === race.id ? { ...r, name: e.target.value } : r))}
                              className={`${styles.input} w-full`}
                              placeholder="Nom de l'événement"
                            />
                          </div>
                          <div className="md:col-span-3">
                            <div className="relative flex items-center">
                              <input 
                                type="number" 
                                value={race.distance === undefined || race.distance === null || (race.distance as any) === '' ? '' : race.distance}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setRaces(races.map(r => r.id === race.id ? { ...r, distance: e.target.value === '' ? '' as any : Number(e.target.value) } : r))}
                                className={`${styles.input} w-full pr-8`}
                                placeholder="Distance"
                              />
                              <span className="absolute right-4 text-xs font-bold text-[var(--text-tertiary)]">km</span>
                            </div>
                          </div>
                          <div className="md:col-span-3">
                            <input 
                              type="date" 
                              value={formatDateForInput(race.date)}
                              onChange={(e) => handleDateChange(race.id, e.target.value)}
                              className={`${styles.input} w-full`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Architecture Section */}
          <div className={styles.roadbookCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardHeaderTitle}>
                <Sliders size={20} className={styles.iconPrimary} />
                Architecture & Volume
              </h2>
            </div>
            
            <div className={styles.cardBody}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <div className="space-y-6">
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Jours Disponibles</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        {id: 1, label: 'Lun'}, {id: 2, label: 'Mar'}, {id: 3, label: 'Mer'}, 
                        {id: 4, label: 'Jeu'}, {id: 5, label: 'Ven'}, {id: 6, label: 'Sam'}, {id: 0, label: 'Dim'}
                      ].map(day => (
                        <button
                          key={day.id}
                          onClick={() => setAvailableDays(availableDays.includes(day.id) ? availableDays.filter(d => d !== day.id) : [...availableDays, day.id])}
                          className={`${styles.btnSelect} ${availableDays.includes(day.id) ? styles.active : ''}`}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Sortie Longue (SL)</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        {id: 5, label: 'Ven'}, {id: 6, label: 'Sam'}, {id: 0, label: 'Dim'}
                      ].map(day => (
                        <button
                          key={day.id}
                          onClick={() => setLongRunDays(longRunDays.includes(day.id) ? longRunDays.filter(d => d !== day.id) : [...longRunDays, day.id])}
                          className={`${styles.btnSelect} ${longRunDays.includes(day.id) ? styles.activeAlt : ''}`}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className={styles.formGroup}>
                    <div className="flex justify-between items-center mb-2">
                      <label className={styles.label}>Sports & Volumes Cibles</label>
                      <button 
                        onClick={() => setSports([...sports, { id: Date.now().toString(), name: 'Vélo', hours: 2.0 }])}
                        className="text-orange-600 text-sm font-bold bg-orange-50 px-2 py-1 rounded-lg hover:bg-orange-100 transition-colors"
                      >
                        + Ajouter Sport
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {sports.map((sport, idx) => (
                        <div key={sport.id} className="flex items-center gap-3 bg-[var(--bg-body)] p-2 pr-3 rounded-xl border border-[var(--border-subtle)] focus-within:border-orange-300 focus-within:shadow-[0_0_0_2px_rgba(249,115,22,0.1)] transition-all">
                          <input 
                            type="text"
                            value={sport.name}
                            onChange={(e) => setSports(sports.map(s => s.id === sport.id ? { ...s, name: e.target.value } : s))}
                            className="flex-1 bg-transparent border-none px-3 py-2 font-semibold text-[var(--text-primary)] outline-none"
                            placeholder="Sport (ex: Trail)"
                          />
                          <div className="w-px h-6 bg-[var(--border-subtle)]"></div>
                          <div className="flex items-center gap-1">
                            <input 
                              type="number"
                              step="0.5"
                              value={sport.hours === undefined || sport.hours === null || (sport.hours as any) === '' ? '' : sport.hours}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => setSports(sports.map(s => s.id === sport.id ? { ...s, hours: e.target.value === '' ? '' as any : Number(e.target.value) } : s))}
                              className="w-16 bg-transparent border-none text-lg font-black text-orange-600 px-1 py-1 text-right outline-none appearance-none"
                            />
                            <span className="text-sm font-bold text-[var(--text-secondary)] mr-2">h</span>
                          </div>
                          {sports.length > 1 && (
                            <button 
                              onClick={() => setSports(sports.filter(s => s.id !== sport.id))}
                              className="text-[var(--text-tertiary)] hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-3 flex justify-between items-center bg-orange-50 p-3 rounded-lg">
                      <span className="text-sm font-bold text-orange-800">Volume Total Hebdomadaire:</span>
                      <span className="text-lg font-black text-orange-600">{totalHours} h</span>
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Modèle de Distribution</label>
                    <select 
                      value={distributionModel}
                      onChange={(e) => setDistributionModel(e.target.value as any)}
                      className={styles.input}
                    >
                      <option value="POLARIZED">Polarisé (80% Basse intensité)</option>
                      <option value="PYRAMIDAL">Pyramidal (Équilibré)</option>
                      <option value="THRESHOLD">Seuil (Spécifique Route/Marathon)</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 pt-6 border-t border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="flex items-center justify-between sm:justify-start gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] cursor-pointer hover:border-orange-300 transition-colors">
                  <div className="flex items-center gap-3">
                    <Dumbbell size={18} className="text-orange-500" />
                    <span className="font-bold text-sm text-[var(--text-primary)]">Renforcement</span>
                  </div>
                  <input type="checkbox" checked={includeStrength} onChange={e => setIncludeStrength(e.target.checked)} className="w-5 h-5 text-orange-600 rounded" />
                </label>
                
                <label className="flex items-center justify-between sm:justify-start gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] cursor-pointer hover:border-orange-300 transition-colors">
                  <div className="flex items-center gap-3">
                    <Route size={18} className="text-orange-500" />
                    <span className="font-bold text-sm text-[var(--text-primary)]">Week-end Choc</span>
                  </div>
                  <select 
                    value={weChocFrequency} 
                    onChange={e => setWeChocFrequency(Number(e.target.value))}
                    className="bg-transparent border-none font-bold text-orange-600 focus:ring-0 p-0 text-right w-16 cursor-pointer"
                  >
                    <option value="0">Non</option>
                    <option value="3">3 sem</option>
                    <option value="4">4 sem</option>
                  </select>
                </label>

                <label className="flex items-center justify-between sm:justify-start gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] cursor-pointer hover:border-orange-300 transition-colors">
                  <div className="flex items-center gap-3">
                    <Heart size={18} className="text-orange-500" />
                    <span className="font-bold text-sm text-[var(--text-primary)]">Modalité</span>
                  </div>
                  <select 
                    value={targetModality} 
                    onChange={e => setTargetModality(e.target.value as any)}
                    className="bg-transparent border-none font-bold text-orange-600 focus:ring-0 p-0 text-right w-20 cursor-pointer"
                  >
                    <option value="RPE">RPE</option>
                    <option value="HR">Cardio</option>
                    <option value="POWER">Power</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          {/* AI Prompts Section */}
          <div className={styles.roadbookCard} style={{ borderColor: 'rgba(16, 185, 129, 0.3)', backgroundColor: 'var(--bg-surface)' }}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardHeaderTitle}>
                <Zap size={20} className={styles.iconPrimary} style={{ color: 'var(--color-success)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }} />
                Directives IA (Coach Assistant)
              </h2>
            </div>
            
            <div className={styles.cardBody} style={{ backgroundColor: 'transparent', padding: '0 20px 20px 20px' }}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Indications Textuelles</label>
                <textarea 
                  value={aiNotes}
                  onChange={(e) => setAiNotes(e.target.value)}
                  placeholder="Ex: Je prépare la Diagonale des Fous. J'ai besoin de beaucoup de dénivelé le dimanche, et je veux travailler la descente technique. J'ai mal au genou droit, éviter les impacts violents..."
                  className={styles.input}
                  style={{ minHeight: '120px', resize: 'vertical' }}
                />
                <label className="flex items-center gap-3 mt-4 p-3 rounded-lg bg-gradient-to-r from-orange-50 to-orange-100/50 border border-orange-200 cursor-pointer shadow-sm hover:shadow-md transition-shadow">
                  <input 
                    type="checkbox" 
                    checked={useAiForWorkouts} 
                    onChange={e => setUseAiForWorkouts(e.target.checked)} 
                    className="w-5 h-5 text-orange-600 rounded border-orange-300 focus:ring-orange-500" 
                  />
                  <div>
                    <span className="block font-bold text-sm text-orange-900">Génération par IA (Recommandé)</span>
                    <span className="block text-xs text-orange-700 font-medium">Créera des séances structurées (4 premières semaines) avec Gemini</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar / Preview Area */}
        <div className={styles.sidebarColumn}>
          
          {/* Recap Card */}
          <div className={styles.roadbookCard}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardHeaderTitle}>
                <BarChart2 size={20} className={styles.iconPrimary} />
                Synthèse du Plan
              </h3>
            </div>
            
            <div className={styles.cardBody}>
              <div className="flex items-center justify-center py-2 mb-2">
                <div className="text-center">
                  <div className="text-5xl font-black bg-gradient-to-r from-orange-600 to-emerald-600 bg-clip-text text-transparent mb-1">{totalWeeks}</div>
                  <div className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Semaines</div>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Début</span>
                  <span className={styles.statValue}>{new Date(startDate).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'})}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Course Cible</span>
                  <span className={styles.statValue}>{endDateStr}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Jours d'ent.</span>
                  <span className={styles.statValue}>{availableDays.length} j / sem</span>
                </div>
              </div>
            </div>
          </div>

          {/* TSS Preview Chart */}
          <div className={styles.roadbookCard}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardHeaderTitle}>
                <TrendingUp size={20} className={styles.iconPrimary} style={{ color: '#a855f7', backgroundColor: 'rgba(168, 85, 247, 0.1)' }} />
                Projection (TSS)
              </h3>
            </div>
            
            <div className={styles.cardBody}>
              {chartData.length > 0 ? (
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="week" tick={{fontSize: 10, fill: 'var(--text-tertiary)', fontWeight: 600}} axisLine={false} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: 'var(--shadow-lg)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 'bold' }}
                        cursor={{fill: 'var(--bg-body)'}}
                        formatter={(value: any) => [`${value} TSS`, 'Charge']}
                        labelFormatter={(label) => `Sem. ${label}`}
                      />
                      <Bar dataKey="tss" radius={[6, 6, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={phaseColors[entry.phase] || '#ccc'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center bg-[var(--bg-body)] rounded-2xl text-[var(--text-tertiary)] text-sm font-medium border border-dashed border-[var(--border-subtle)]">
                  Aperçu indisponible
                </div>
              )}
              
              <div className="flex flex-wrap gap-2.5 mt-2 justify-center">
                {Object.entries(phaseColors).map(([phase, color]) => (
                  <div key={phase} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--bg-body)] border border-[var(--border-subtle)]">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}></div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">{phase}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
