"use client";

import React, { useState, useEffect } from "react";
import { X, Calendar, Activity, Info, Plus, Trash2, DownloadCloud } from "lucide-react";
import { PlanConfig, Race, RacePriority, PlanMode, TargetType } from "@/types";

interface PlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  athleteId: string;
  athleteName: string;
  athleteData?: any;
  intervalsApiKey?: string;
  onGeneratePlan: (config: PlanConfig) => void;
}

export default function PlanModal({ isOpen, onClose, athleteId, athleteName, athleteData, intervalsApiKey, onGeneratePlan }: PlanModalProps) {
  const [activeTab, setActiveTab] = useState<"general" | "sports" | "races" | "advanced">("general");

  // Load and dates
  const [planName, setPlanName] = useState(`Plan ${athleteName}`);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [hoursPerWeek, setHoursPerWeek] = useState(10);
  const [initialTss, setInitialTss] = useState(0);

  // Mode and phases
  const [planMode, setPlanMode] = useState<PlanMode>("RACE");
  const [manualPhases, setManualPhases] = useState({ base: 4, build: 4, peak: 2, taper: 2 });

  // Sports
  const [sports, setSports] = useState<{ id: string, name: string, hours: number }[]>([
    { id: "run", name: "Course à pied", hours: 6 },
    { id: "ride", name: "Vélo", hours: 3 },
    { id: "strength", name: "Renforcement", hours: 1 }
  ]);

  // Races
  const [races, setRaces] = useState<Race[]>([]);
  const [newRaceName, setNewRaceName] = useState("");
  const [newRaceDate, setNewRaceDate] = useState("");
  const [newRaceDistance, setNewRaceDistance] = useState(50);
  const [newRacePriority, setNewRacePriority] = useState<RacePriority>("A");

  // Advanced
  const [startWithRecovery, setStartWithRecovery] = useState(false);
  const [progressionRate, setProgressionRate] = useState(5);
  const [recoveryFreq, setRecoveryFreq] = useState(4);
  const [distributionModel, setDistributionModel] = useState<"POLARIZED" | "PYRAMIDAL" | "THRESHOLD">("POLARIZED");

  useEffect(() => {
    if (athleteData && athleteData.ctl) {
      setInitialTss(Math.round(athleteData.ctl * 7)); // Roughly CTL * 7 for weekly TSS
    }
  }, [athleteData]);

  if (!isOpen) return null;

  const handleFetchIntervalsRaces = async () => {
    if (!intervalsApiKey || !athleteId) {
      alert("Clé API ou ID athlète manquant pour récupérer les courses depuis Intervals.icu");
      return;
    }
    // Fetch races logic here
    alert("Fonctionnalité en cours de développement : Récupération des courses depuis Intervals.icu");
  };

  const handleAddRace = () => {
    if (newRaceName && newRaceDate) {
      const newRace: Race = {
        id: `race-${Date.now()}`,
        name: newRaceName,
        date: new Date(newRaceDate),
        priority: newRacePriority,
        isTarget: newRacePriority === "A"
      };
      setRaces([...races, newRace]);
      setNewRaceName("");
      setNewRaceDate("");
    }
  };

  const handleGenerate = () => {
    const config: PlanConfig = {
      planName,
      hoursPerWeek,
      sports,
      targetTypes: { "Charge": true, "Durée": true, "Distance": false },
      startDate,
      startWithRecovery,
      races: races.length > 0 ? races : [{ id: "default", name: "Objectif Principal", date: new Date(new Date(startDate).getTime() + 16 * 7 * 24 * 60 * 60 * 1000), priority: "A", isTarget: true, daysAway: 112 }],
      progression: {
        mesocycleProgressionRate: progressionRate,
        intramesocycleProgressionRate: progressionRate / 2,
        plateauThreshold: 20,
        recoveryVolumeReduction: 40,
        recoveryFrequency: recoveryFreq
      },
      planMode,
      manualPhases: planMode === "MANUAL" ? manualPhases : undefined,
      sessionsPerWeek: 5,
      availableDays: [1, 2, 3, 5, 6, 0],
      longRunDays: [0],
      distributionModel,
      targetModality: "RPE",
      includeHomeTrainer: false,
      includeStrength: sports.some(s => s.name.includes("Renforcement")),
      weChocFrequency: 0,
      initialTss
    };
    onGeneratePlan(config);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Nouveau Plan : {athleteName}</h2>
            <p className="text-sm text-gray-500">Configurez les paramètres du nouveau macrocycle</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 border-r border-gray-100 bg-slate-50 p-4 flex flex-col gap-2">
            <button 
              className={`text-left px-4 py-3 rounded-xl font-medium transition ${activeTab === 'general' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-slate-200'}`}
              onClick={() => setActiveTab('general')}
            >
              1. Base & Charge
            </button>
            <button 
              className={`text-left px-4 py-3 rounded-xl font-medium transition ${activeTab === 'sports' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-slate-200'}`}
              onClick={() => setActiveTab('sports')}
            >
              2. Sports & Volumes
            </button>
            <button 
              className={`text-left px-4 py-3 rounded-xl font-medium transition ${activeTab === 'races' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-slate-200'}`}
              onClick={() => setActiveTab('races')}
            >
              3. Calendrier & Courses
            </button>
            <button 
              className={`text-left px-4 py-3 rounded-xl font-medium transition ${activeTab === 'advanced' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-slate-200'}`}
              onClick={() => setActiveTab('advanced')}
            >
              4. Périodisation
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'general' && (
              <div className="space-y-6 animate-in fade-in">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Nom du plan</label>
                  <input type="text" value={planName} onChange={e => setPlanName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Date de début</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Charge Hebdo Initiale (TSS)</label>
                    <div className="flex items-center gap-2">
                      <input type="number" value={initialTss} onChange={e => setInitialTss(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500" />
                      <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">CTL suggéré: {Math.round(athleteData?.ctl || 0)}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Mode de planification</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={planMode === 'RACE'} onChange={() => setPlanMode('RACE')} />
                      Jusqu'à l'objectif principal
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={planMode === 'MANUAL'} onChange={() => setPlanMode('MANUAL')} />
                      Durée manuelle (blocs)
                    </label>
                  </div>
                </div>

                {planMode === 'MANUAL' && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-4 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500">Base (semaines)</label>
                      <input type="number" value={manualPhases.base} onChange={e => setManualPhases({...manualPhases, base: Number(e.target.value)})} className="w-full border border-gray-300 rounded-lg px-2 py-1 mt-1" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500">Build (semaines)</label>
                      <input type="number" value={manualPhases.build} onChange={e => setManualPhases({...manualPhases, build: Number(e.target.value)})} className="w-full border border-gray-300 rounded-lg px-2 py-1 mt-1" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500">Peak (semaines)</label>
                      <input type="number" value={manualPhases.peak} onChange={e => setManualPhases({...manualPhases, peak: Number(e.target.value)})} className="w-full border border-gray-300 rounded-lg px-2 py-1 mt-1" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500">Taper (semaines)</label>
                      <input type="number" value={manualPhases.taper} onChange={e => setManualPhases({...manualPhases, taper: Number(e.target.value)})} className="w-full border border-gray-300 rounded-lg px-2 py-1 mt-1" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'sports' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="flex justify-between items-end">
                  <div>
                    <h3 className="font-bold text-gray-800">Volume cible</h3>
                    <p className="text-sm text-gray-500">Répartition des heures par sport</p>
                  </div>
                  <div className="text-2xl font-bold text-blue-600">{sports.reduce((a, b) => a + Number(b.hours), 0)}h / sem</div>
                </div>

                <div className="space-y-3">
                  {sports.map((sport, index) => (
                    <div key={sport.id} className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <input type="text" value={sport.name} onChange={e => {
                        const newSports = [...sports];
                        newSports[index].name = e.target.value;
                        setSports(newSports);
                      }} className="flex-1 border-none bg-transparent font-medium" />
                      <div className="flex items-center gap-2">
                        <input type="number" step="0.5" value={sport.hours} onChange={e => {
                          const newSports = [...sports];
                          newSports[index].hours = Number(e.target.value);
                          setSports(newSports);
                        }} className="w-20 border border-gray-300 rounded px-2 py-1 text-center" />
                        <span className="text-gray-500">heures</span>
                      </div>
                      <button onClick={() => setSports(sports.filter((_, i) => i !== index))} className="text-red-500 hover:bg-red-50 p-1 rounded">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setSports([...sports, { id: `sport-${Date.now()}`, name: "Nouveau sport", hours: 1 }])} className="flex items-center gap-2 text-blue-600 font-medium text-sm hover:underline mt-2">
                    <Plus size={16} /> Ajouter un sport
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'races' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-gray-800">Courses prévues</h3>
                  <button onClick={handleFetchIntervalsRaces} className="flex items-center gap-2 text-sm bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg hover:bg-orange-200 transition">
                    <DownloadCloud size={16} />
                    Importer depuis Intervals.icu
                  </button>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Nom de la course</label>
                    <input type="text" value={newRaceName} onChange={e => setNewRaceName(e.target.value)} placeholder="Ex: UTMB, Templiers..." className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                    <input type="date" value={newRaceDate} onChange={e => setNewRaceDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                  </div>
                  <div className="w-24">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Dist. (km)</label>
                    <input type="number" value={newRaceDistance} onChange={e => setNewRaceDistance(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Priorité</label>
                    <select value={newRacePriority} onChange={e => setNewRacePriority(e.target.value as RacePriority)} className="w-full border border-gray-300 rounded-lg px-3 py-2">
                      <option value="A">A (Objectif principal)</option>
                      <option value="B">B (Préparation)</option>
                      <option value="C">C (Entraînement)</option>
                    </select>
                  </div>
                  <button onClick={handleAddRace} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 h-10 w-10 flex items-center justify-center">
                    <Plus size={20} />
                  </button>
                </div>

                <div className="space-y-2">
                  {races.length === 0 ? (
                    <p className="text-gray-500 text-sm italic text-center py-4">Aucune course prévue. Si aucune n'est ajoutée, le plan durera 16 semaines par défaut.</p>
                  ) : (
                    races.map((race) => (
                      <div key={race.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                        <div>
                          <p className="font-bold text-gray-800">{race.name} <span className={`text-xs ml-2 px-2 py-0.5 rounded-full ${race.priority === 'A' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>Objectif {race.priority}</span></p>
                          <p className="text-xs text-gray-500">{new Date(race.date).toLocaleDateString()}</p>
                        </div>
                        <button onClick={() => setRaces(races.filter(r => r.id !== race.id))} className="text-red-500 hover:bg-red-50 p-2 rounded">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="space-y-6 animate-in fade-in">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Modèle de répartition (TID)</label>
                  <select value={distributionModel} onChange={e => setDistributionModel(e.target.value as any)} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500">
                    <option value="POLARIZED">Polarisé (80% facile, 20% intense)</option>
                    <option value="PYRAMIDAL">Pyramidal (Beaucoup de tempo/sweetspot)</option>
                    <option value="THRESHOLD">Seuil (Orienté intensité moyenne/haute)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Taux de progression (%)</label>
                    <input type="number" value={progressionRate} onChange={e => setProgressionRate(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500" />
                    <p className="text-xs text-gray-500 mt-1">Augmentation TSS/semaine</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Récupération toutes les (semaines)</label>
                    <input type="number" value={recoveryFreq} onChange={e => setRecoveryFreq(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={startWithRecovery} onChange={e => setStartWithRecovery(e.target.checked)} className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                    <span className="font-medium text-gray-800">Commencer par une semaine de récupération</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 font-medium hover:bg-slate-200 rounded-lg transition">Annuler</button>
          <button onClick={handleGenerate} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition shadow-md shadow-blue-500/30 flex items-center gap-2">
            <Calendar size={18} />
            Générer le plan
          </button>
        </div>
      </div>
    </div>
  );
}
