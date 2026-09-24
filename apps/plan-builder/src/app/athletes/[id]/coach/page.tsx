"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { 
  ArrowLeft, Calendar as CalendarIcon, Flag, Target, TrendingUp, 
  Activity, Zap, BarChart2, CheckCircle2, Sliders, Mountain, 
  Heart, Watch, Dumbbell, Route, HelpCircle
} from 'lucide-react';
import { Race, TargetType, ProgressionParams } from '@/types';
import { fetchAthleteLoad } from '@/lib/intervalsApi';
import { generateMacrocycle, generateWorkoutsForMacrocycle } from '@/lib/trainingEngine';
import { saveAthletePlan } from '@/lib/firebaseUtils';
import { BarChart, Bar, Cell, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function PlanBuilderPage() {
  const router = useRouter();
  const params = useParams();
  const athleteId = params.id as string;

  const [athleteName, setAthleteName] = useState("Athlète");
  const [intervalsApiKey, setIntervalsApiKey] = useState("");
  const [intervalsAthleteId, setIntervalsAthleteId] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Plan State
  const [planName, setPlanName] = useState('Objectif Principal');
  const [sports, setSports] = useState<{id: string, name: string, hours: number}[]>([
    { id: '1', name: 'Trail', hours: 7.0 }
  ]);
  const [targetTypes, setTargetTypes] = useState<Record<TargetType, boolean>>({ Charge: true, Durée: false, Distance: false });
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
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
  
  const [aiNotes, setAiNotes] = useState('');
  
  const [loadData, setLoadData] = useState<{ctl: number, atl: number, form: number, avgWeeklyTss?: number} | null>(null);
  const [isLoadingLoad, setIsLoadingLoad] = useState(false);

  const [races, setRaces] = useState<Race[]>([
    { id: '1', name: 'Madeloc Skytrail', date: new Date(Date.now() + 16 * 7 * 24 * 60 * 60 * 1000), priority: 'A', isTarget: true, daysAway: 112 }
  ]);

  const [progression, setProgression] = useState<ProgressionParams>({
    mesocycleProgressionRate: 5,
    intramesocycleProgressionRate: 5,
    plateauThreshold: 70,
    recoveryVolumeReduction: 30,
    recoveryFrequency: 4
  });

  useEffect(() => {
    // Basic setup from local storage or context if needed
    const storedKey = localStorage.getItem("intervalsApiKey");
    const storedId = localStorage.getItem("intervalsAthleteId");
    if (storedKey) setIntervalsApiKey(storedKey);
    if (storedId) setIntervalsAthleteId(storedId);

    if (athleteId && storedKey) {
      setIsLoadingLoad(true);
      fetchAthleteLoad(athleteId, storedKey).then(data => {
        if (data) setLoadData(data);
        else setLoadData({ ctl: 43, atl: 44, form: -1 }); // fallback
        setIsLoadingLoad(false);
      });
    } else {
      setLoadData({ ctl: 43, atl: 44, form: -1 });
    }
  }, [athleteId]);

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

  const handleGenerate = async () => {
    setIsGenerating(true);
    const config = {
      planName,
      hoursPerWeek: sports.reduce((acc, s) => acc + s.hours, 0),
      sports,
      targetTypes,
      startDate,
      startWithRecovery,
      races,
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
      aiNotes
    };

    try {
      const newPlan = generateMacrocycle(athleteId, config);
      
      let finalWorkouts: any[] = [];
      if (config.aiNotes) {
        // Appeler l'API IA pour les 4 premières semaines
        try {
          const response = await fetch('/api/generate-workouts', {
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

      // Save to Firebase
      if (intervalsAthleteId) {
        await saveAthletePlan(intervalsAthleteId, athleteId, {
          macrocycle: newPlan,
          workouts: finalWorkouts,
          config: config
        });
      }

      // Save to localStorage so dashboard can auto-load if needed
      localStorage.setItem(`latestPlan_${athleteId}`, JSON.stringify({
        macrocycle: newPlan,
        workouts: finalWorkouts,
        config: config
      }));

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
  const totalHours = sports.reduce((acc, s) => acc + s.hours, 0);
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
    planName, hoursPerWeek: totalHours, sports, targetTypes, startDate, startWithRecovery,
    races, progression, planMode, manualPhases, sessionsPerWeek, availableDays, longRunDays,
    distributionModel, targetModality, includeHomeTrainer, includeStrength, weChocFrequency,
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
    Base: "#4ade80", Build: "#3b82f6", Peak: "#f59e0b", Taper: "#fcd34d", Recovery: "#9ca3af",
  };

  return (
    <div className="min-h-screen bg-[var(--bg-body)] text-[var(--text-primary)]">
      {/* Premium Header */}
      <div className="sticky top-0 z-50 bg-[var(--bg-surface)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => router.push(`/athletes/${athleteId}`)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--bg-body)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-all shadow-sm"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-3">
                <Zap className="text-blue-600" size={24} />
                Coach IA Studio
              </h1>
              <p className="text-sm font-medium text-[var(--text-secondary)] mt-0.5">
                Création d'un plan sur-mesure pour <span className="text-[var(--text-primary)] font-semibold">{athleteName}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {loadData && (
              <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-xl bg-blue-50/50 border border-blue-100/50">
                <div className="text-xs font-bold text-blue-800 uppercase tracking-wider">Fitness Actuel</div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-blue-600">CTL {loadData.ctl}</span>
                </div>
              </div>
            )}
            <button 
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white transition-all shadow-lg ${isGenerating ? 'bg-blue-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-blue-500/25 hover:-translate-y-0.5'}`}
            >
              {isGenerating ? (
                <><svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Génération...</>
              ) : (
                <><CheckCircle2 size={20} /> Générer le plan</>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          
          {/* Main Configuration Area */}
          <div className="xl:col-span-8 space-y-8">
            
            {/* Objectif Section */}
            <div className="bg-[var(--bg-surface)] rounded-3xl p-1 shadow-sm border border-[var(--border-subtle)]">
              <div className="bg-[var(--bg-body)] rounded-[1.35rem] p-6 sm:p-8 border border-[var(--border-subtle)]/50">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center shadow-inner">
                    <Flag size={24} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">Cible & Période</h2>
                    <p className="text-sm text-[var(--text-secondary)] font-medium">Définissez l'objectif majeur de ce bloc d'entraînement.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider ml-1">Nom du Bloc</label>
                    <input 
                      type="text" 
                      value={planName}
                      onChange={(e) => setPlanName(e.target.value)}
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-xl px-4 py-3.5 font-semibold text-[var(--text-primary)] outline-none transition-all shadow-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider ml-1">Date de début</label>
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-xl px-4 py-3.5 font-semibold text-[var(--text-primary)] outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>

                {/* Races */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider ml-1">Calendrier de Courses</label>
                    <button 
                      onClick={() => setRaces([...races, { id: Date.now().toString(), name: 'Nouvelle', date: new Date(Date.now() + 8*7*24*60*60*1000), priority: 'B', isTarget: false, daysAway: 56 }])} 
                      className="text-orange-600 text-sm font-bold bg-orange-50 px-3 py-1.5 rounded-lg hover:bg-orange-100 transition-colors"
                    >
                      + Ajouter
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {races.map((race) => (
                      <div key={race.id} className={`flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 rounded-2xl border ${race.isTarget ? 'bg-orange-50/50 border-orange-200' : 'bg-[var(--bg-surface)] border-[var(--border-subtle)]'} transition-all`}>
                        <label className="flex items-center gap-3 cursor-pointer shrink-0">
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${race.isTarget ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`}>
                            {race.isTarget && <CheckCircle2 size={14} className="text-white" />}
                          </div>
                          <input type="radio" checked={race.isTarget} onChange={() => setRaces(races.map(r => ({ ...r, isTarget: r.id === race.id })))} className="hidden" />
                          <span className="font-bold text-sm text-[var(--text-primary)]">{race.isTarget ? 'Objectif A' : 'Préparation'}</span>
                        </label>
                        
                        <div className="flex-1 grid grid-cols-2 gap-3 w-full">
                          <input 
                            type="text" 
                            value={race.name}
                            onChange={(e) => setRaces(races.map(r => r.id === race.id ? { ...r, name: e.target.value } : r))}
                            className="bg-[var(--bg-body)] border border-[var(--border-subtle)] focus:border-orange-500 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--text-primary)] outline-none"
                            placeholder="Nom"
                          />
                          <input 
                            type="date" 
                            value={race.date.toISOString().split('T')[0]}
                            onChange={(e) => setRaces(races.map(r => r.id === race.id ? { ...r, date: new Date(e.target.value) } : r))}
                            className="bg-[var(--bg-body)] border border-[var(--border-subtle)] focus:border-orange-500 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--text-primary)] outline-none"
                          />
                        </div>
                        
                        <select 
                          value={race.priority} 
                          onChange={(e) => setRaces(races.map(r => r.id === race.id ? { ...r, priority: e.target.value as any } : r))}
                          className="bg-[var(--bg-body)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm font-bold text-[var(--text-primary)] outline-none shrink-0"
                        >
                          <option value="A">Priorité A</option>
                          <option value="B">Priorité B</option>
                          <option value="C">Priorité C</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Architecture Section */}
            <div className="bg-[var(--bg-surface)] rounded-3xl p-1 shadow-sm border border-[var(--border-subtle)]">
              <div className="bg-[var(--bg-body)] rounded-[1.35rem] p-6 sm:p-8 border border-[var(--border-subtle)]/50">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner">
                    <Sliders size={24} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">Architecture & Volume</h2>
                    <p className="text-sm text-[var(--text-secondary)] font-medium">Répartition hebdomadaire et paramétrages structurels.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider ml-1 mb-2 block">Jours Disponibles</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          {id: 1, label: 'Lun'}, {id: 2, label: 'Mar'}, {id: 3, label: 'Mer'}, 
                          {id: 4, label: 'Jeu'}, {id: 5, label: 'Ven'}, {id: 6, label: 'Sam'}, {id: 0, label: 'Dim'}
                        ].map(day => (
                          <button
                            key={day.id}
                            onClick={() => setAvailableDays(availableDays.includes(day.id) ? availableDays.filter(d => d !== day.id) : [...availableDays, day.id])}
                            className={`px-3 py-2 rounded-xl text-sm font-bold transition-all ${availableDays.includes(day.id) ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-blue-300 hover:text-blue-600'}`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider ml-1 mb-2 block">Sortie Longue (SL)</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          {id: 5, label: 'Ven'}, {id: 6, label: 'Sam'}, {id: 0, label: 'Dim'}
                        ].map(day => (
                          <button
                            key={day.id}
                            onClick={() => setLongRunDays(longRunDays.includes(day.id) ? longRunDays.filter(d => d !== day.id) : [...longRunDays, day.id])}
                            className={`px-3 py-2 rounded-xl text-sm font-bold transition-all ${longRunDays.includes(day.id) ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-indigo-300 hover:text-indigo-600'}`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider ml-1 mb-2 block">Volume Estimé</label>
                      <div className="flex items-center gap-4 bg-[var(--bg-surface)] p-3 rounded-xl border border-[var(--border-subtle)]">
                        <input 
                          type="number"
                          step="0.5"
                          value={sports[0].hours}
                          onChange={(e) => setSports([{ ...sports[0], hours: Number(e.target.value) }])}
                          className="w-20 text-2xl font-black text-blue-600 bg-transparent border-none focus:ring-0 p-0 text-center"
                        />
                        <span className="font-bold text-[var(--text-secondary)]">heures / semaine</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider ml-1 mb-2 block">Modèle de Distribution</label>
                      <select 
                        value={distributionModel}
                        onChange={(e) => setDistributionModel(e.target.value as any)}
                        className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-blue-500 rounded-xl px-4 py-3 font-semibold text-[var(--text-primary)] outline-none"
                      >
                        <option value="POLARIZED">Polarisé (80% Basse intensité)</option>
                        <option value="PYRAMIDAL">Pyramidal (Équilibré)</option>
                        <option value="THRESHOLD">Seuil (Spécifique Route/Marathon)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <label className="flex items-center justify-between sm:justify-start gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] cursor-pointer hover:border-blue-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <Dumbbell size={18} className="text-blue-500" />
                      <span className="font-bold text-sm text-[var(--text-primary)]">Renforcement</span>
                    </div>
                    <input type="checkbox" checked={includeStrength} onChange={e => setIncludeStrength(e.target.checked)} className="w-5 h-5 text-blue-600 rounded" />
                  </label>
                  
                  <label className="flex items-center justify-between sm:justify-start gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] cursor-pointer hover:border-blue-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <Route size={18} className="text-blue-500" />
                      <span className="font-bold text-sm text-[var(--text-primary)]">Week-end Choc</span>
                    </div>
                    <select 
                      value={weChocFrequency} 
                      onChange={e => setWeChocFrequency(Number(e.target.value))}
                      className="bg-transparent border-none font-bold text-blue-600 focus:ring-0 p-0 text-right w-16 cursor-pointer"
                    >
                      <option value="0">Non</option>
                      <option value="3">3 sem</option>
                      <option value="4">4 sem</option>
                    </select>
                  </label>

                  <label className="flex items-center justify-between sm:justify-start gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] cursor-pointer hover:border-blue-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <Heart size={18} className="text-blue-500" />
                      <span className="font-bold text-sm text-[var(--text-primary)]">Modalité</span>
                    </div>
                    <select 
                      value={targetModality} 
                      onChange={e => setTargetModality(e.target.value as any)}
                      className="bg-transparent border-none font-bold text-blue-600 focus:ring-0 p-0 text-right w-20 cursor-pointer"
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
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-1 shadow-lg">
              <div className="bg-white/95 dark:bg-[#1a1c23]/95 backdrop-blur-xl rounded-[1.35rem] p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner">
                    <Zap size={24} strokeWidth={2.5} className="fill-indigo-600/20" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-indigo-950 dark:text-indigo-100">Directives IA (Coach Assistant)</h2>
                    <p className="text-sm text-indigo-800/70 dark:text-indigo-300/70 font-medium">Donnez des indications textuelles pour générer les séances.</p>
                  </div>
                </div>
                
                <textarea 
                  value={aiNotes}
                  onChange={(e) => setAiNotes(e.target.value)}
                  placeholder="Ex: Je prépare la Diagonale des Fous. J'ai besoin de beaucoup de dénivelé le dimanche, et je veux travailler la descente technique. J'ai mal au genou droit, éviter les impacts violents..."
                  className="w-full h-32 p-5 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 text-sm font-medium bg-indigo-50/30 dark:bg-black/20 text-indigo-950 dark:text-indigo-100 resize-none transition-all placeholder:text-indigo-950/30 dark:placeholder:text-indigo-100/30"
                />
              </div>
            </div>

          </div>

          {/* Sidebar / Preview Area */}
          <div className="xl:col-span-4 space-y-6">
            
            {/* Recap Card */}
            <div className="bg-[var(--bg-surface)] rounded-3xl shadow-sm border border-[var(--border-subtle)] overflow-hidden">
              <div className="p-6 bg-[var(--bg-body)] border-b border-[var(--border-subtle)] flex items-center gap-3">
                <BarChart2 size={20} className="text-blue-500" />
                <h3 className="font-bold text-[var(--text-primary)]">Synthèse du Plan</h3>
              </div>
              <div className="p-6">
                <div className="flex items-center justify-center py-4 mb-4">
                  <div className="text-center">
                    <div className="text-5xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-1">{totalWeeks}</div>
                    <div className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Semaines</div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-3 border-b border-[var(--border-subtle)]/50">
                    <span className="text-[var(--text-secondary)] text-sm font-semibold">Début</span>
                    <span className="font-bold text-[var(--text-primary)]">{new Date(startDate).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'})}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-[var(--border-subtle)]/50">
                    <span className="text-[var(--text-secondary)] text-sm font-semibold">Course Cible</span>
                    <span className="font-bold text-[var(--text-primary)]">{endDateStr}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-[var(--border-subtle)]/50">
                    <span className="text-[var(--text-secondary)] text-sm font-semibold">Jours d'ent.</span>
                    <span className="font-bold text-[var(--text-primary)]">{availableDays.length} j / sem</span>
                  </div>
                </div>
              </div>
            </div>

            {/* TSS Preview Chart */}
            <div className="bg-[var(--bg-surface)] rounded-3xl shadow-sm border border-[var(--border-subtle)] overflow-hidden">
              <div className="p-6 bg-[var(--bg-body)] border-b border-[var(--border-subtle)] flex items-center gap-3">
                <TrendingUp size={20} className="text-purple-500" />
                <h3 className="font-bold text-[var(--text-primary)]">Projection de Charge (TSS)</h3>
              </div>
              <div className="p-5">
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
                <div className="flex flex-wrap gap-2.5 mt-5 justify-center">
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
    </div>
  );
}
