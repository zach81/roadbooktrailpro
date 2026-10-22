"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Activity, Compass, Calendar, Search, Filter, Loader2, 
  AlertCircle, CheckCircle2, Key, RefreshCw, ChevronDown, ChevronUp,
  Mountain, Heart, Timer, Zap, ExternalLink, ArrowRight, ArrowLeftRight, User
} from 'lucide-react';
import { 
  fetchIntervalsActivities, 
  fetchActivityStreams, 
  fetchCoachedAthletes, 
  fetchAthleteFullProfile,
  IntervalsActivity 
} from '@/lib/intervalsApi';
import { parseIntervalsActivityToCourse, ParsedCourse } from '@/lib/courseParser';
import { useAuth } from '@/context/AuthContext';
import { getAthletesFromFirebase } from '@/lib/firebaseUtils';

export interface CoachedAthleteOption {
  id: string;
  name: string;
  isCoach?: boolean;
}

interface IntervalsActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectActivity: (course: ParsedCourse, targetTrace: 1 | 2) => void;
  targetTrace: 1 | 2;
  initialAthleteId?: string;
  initialAthleteName?: string;
  onAthleteChange?: (athleteId: string, athleteName: string) => void;
}

function formatPace(metersPerSec: number): string {
  if (!metersPerSec || metersPerSec <= 0) return '';
  const secPerKm = 1000 / metersPerSec;
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}/km`;
}

function formatDuration(totalSec: number): string {
  if (!totalSec || totalSec <= 0) return '0m';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

export default function IntervalsActivityModal({
  isOpen,
  onClose,
  onSelectActivity,
  targetTrace,
  initialAthleteId,
  initialAthleteName,
  onAthleteChange
}: IntervalsActivityModalProps) {
  const { currentUser } = useAuth();

  // Credentials
  const [athleteId, setAthleteId] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [activeTrace, setActiveTrace] = useState<1 | 2>(targetTrace);

  // Athletes list (if coach)
  const [coachedAthletes, setCoachedAthletes] = useState<CoachedAthleteOption[]>([]);
  const [currentAthleteName, setCurrentAthleteName] = useState<string>(initialAthleteName || '');

  // Data fetching
  const [activities, setActivities] = useState<IntervalsActivity[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingActivityId, setLoadingActivityId] = useState<string | number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter state
  const [dateRange, setDateRange] = useState<'30d' | '90d' | '180d' | '365d'>('90d');
  const [sportFilter, setSportFilter] = useState<'all' | 'run' | 'ride' | 'hike'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [gpsOnly, setGpsOnly] = useState<boolean>(true);

  // Sync active trace when prop changes
  useEffect(() => {
    setActiveTrace(targetTrace);
  }, [targetTrace]);

  // Load credentials on mount / open
  useEffect(() => {
    if (!isOpen) return;

    const storedId = localStorage.getItem("intervalsAthleteId") || "";
    const storedKey = localStorage.getItem("intervalsApiKey") || "";

    const effId = initialAthleteId || athleteId || storedId;
    setAthleteId(effId);
    setApiKey(storedKey);

    if (initialAthleteName) {
      setCurrentAthleteName(initialAthleteName);
    }

    if (effId && storedKey) {
      loadActivities(effId, storedKey, dateRange);
      loadAthleteInfo(effId, storedKey);
    } else {
      setShowConfig(true);
    }
  }, [isOpen, initialAthleteId, initialAthleteName, dateRange]);

  const loadAthleteInfo = async (activeId: string, key: string) => {
    if (!key || !key.trim()) return;

    try {
      const storedCoachId = localStorage.getItem("intervalsAthleteId")?.trim() || "";
      const coachIdToQuery = storedCoachId || activeId;

      let coachName = "";
      if (coachIdToQuery) {
        try {
          const coachProfile = await fetchAthleteFullProfile(coachIdToQuery, key);
          if (coachProfile && !coachProfile.error && coachProfile.name) {
            coachName = coachProfile.name;
          }
        } catch (e) {
          // ignore
        }
      }

      // If active athlete is different from coach, load their profile name
      if (activeId && activeId !== coachIdToQuery) {
        try {
          const activeProfile = await fetchAthleteFullProfile(activeId, key);
          if (activeProfile && !activeProfile.error && activeProfile.name) {
            setCurrentAthleteName(activeProfile.name);
          }
        } catch (e) {
          // ignore
        }
      } else if (coachName) {
        setCurrentAthleteName(coachName);
      }

      // Fetch coached athletes from Intervals.icu
      let rawAthletes: any[] = [];
      try {
        rawAthletes = await fetchCoachedAthletes(coachIdToQuery, key);
      } catch (err: any) {
        if (activeId && activeId !== coachIdToQuery) {
          try {
            rawAthletes = await fetchCoachedAthletes(activeId, key);
          } catch (e2) {
            // ignore
          }
        }
      }

      // Also fetch athletes cached in Firebase if available
      let firebaseAthletes: any[] = [];
      if (currentUser?.uid) {
        try {
          firebaseAthletes = await getAthletesFromFirebase(currentUser.uid);
        } catch (e) {
          // ignore
        }
      }

      const athletesMap = new Map<string, CoachedAthleteOption>();

      // 1. Always add Coach ("Moi")
      if (coachIdToQuery) {
        athletesMap.set(coachIdToQuery, {
          id: coachIdToQuery,
          name: coachName ? `${coachName} (Moi)` : "Moi (Coach)",
          isCoach: true,
        });
      }

      // 2. Parse and normalize Intervals athletes
      if (Array.isArray(rawAthletes)) {
        rawAthletes.forEach((item: any, idx: number) => {
          if (!item) return;
          const rawId = item.athlete?.id || item.athlete_id || item.athleteId || (typeof item.id === 'string' && item.id.startsWith('i') ? item.id : undefined) || (item.id ? String(item.id) : undefined);
          
          if (!rawId) return;

          const rawName =
            item.athlete?.name ||
            item.athlete_name ||
            (item.athlete?.firstname ? `${item.athlete.firstname} ${item.athlete.lastname || ''}`.trim() : null) ||
            item.name ||
            (item.firstname ? `${item.firstname} ${item.lastname || ''}`.trim() : null) ||
            `Athlète ${idx + 1}`;

          if (rawId === coachIdToQuery) {
            athletesMap.set(coachIdToQuery, {
              id: coachIdToQuery,
              name: `${rawName} (Moi)`,
              isCoach: true,
            });
          } else {
            athletesMap.set(rawId, {
              id: rawId,
              name: rawName,
              isCoach: false,
            });
          }
        });
      }

      // 3. Merge Firebase athletes if missing
      if (Array.isArray(firebaseAthletes)) {
        firebaseAthletes.forEach((fbAthlete: any) => {
          if (fbAthlete?.id && !athletesMap.has(fbAthlete.id)) {
            athletesMap.set(fbAthlete.id, {
              id: fbAthlete.id,
              name: fbAthlete.name || fbAthlete.id,
              isCoach: fbAthlete.id === coachIdToQuery,
            });
          }
        });
      }

      const list = Array.from(athletesMap.values());
      setCoachedAthletes(list);

      // If current athlete name isn't set yet, pick it from list
      if (!currentAthleteName && activeId) {
        const found = list.find((a) => a.id === activeId);
        if (found) {
          const cleanName = found.name.replace(/\s*\(Moi.*?\)/, '').trim();
          setCurrentAthleteName(cleanName);
          if (onAthleteChange) {
            onAthleteChange(activeId, cleanName);
          }
        }
      }
    } catch (e) {
      console.error("Erreur lors de la récupération des athlètes coachés :", e);
    }
  };

  const loadActivities = async (id: string, key: string, range: '30d' | '90d' | '180d' | '365d') => {
    if (!id.trim() || !key.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);

    const now = new Date();
    let days = 90;
    if (range === '30d') days = 30;
    if (range === '180d') days = 180;
    if (range === '365d') days = 365;

    const oldest = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const newest = now.toISOString().split('T')[0];

    try {
      const data = await fetchIntervalsActivities(id.trim(), key.trim(), oldest, newest);
      setActivities(data);
    } catch (err: any) {
      setErrorMessage(err.message || "Erreur lors du chargement des activités depuis Intervals.icu");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCredentials = () => {
    if (!athleteId.trim() || !apiKey.trim()) {
      setErrorMessage("Veuillez renseigner un ID Athlète et une clé API.");
      return;
    }
    localStorage.setItem("intervalsAthleteId", athleteId.trim());
    localStorage.setItem("intervalsApiKey", apiKey.trim());
    setShowConfig(false);
    loadActivities(athleteId.trim(), apiKey.trim(), dateRange);
    loadAthleteInfo(athleteId.trim(), apiKey.trim());
  };

  const handleSwitchAthlete = (newId: string) => {
    setAthleteId(newId);
    const found = coachedAthletes.find((a) => a.id === newId);
    if (found) {
      const cleanName = found.name.replace(/\s*\(Moi.*?\)/, '').trim();
      setCurrentAthleteName(cleanName);
      if (onAthleteChange) {
        onAthleteChange(newId, cleanName);
      }
    }
    loadActivities(newId, apiKey, dateRange);
  };

  // Activity selection & stream download
  const handleSelectActivity = async (act: IntervalsActivity, chosenTrace?: 1 | 2) => {
    const target = chosenTrace || activeTrace;
    setLoadingActivityId(act.id);
    setErrorMessage(null);

    try {
      const streams = await fetchActivityStreams(act.id, apiKey.trim());
      const course = parseIntervalsActivityToCourse(act, streams);
      onSelectActivity(course, target);
      onClose();
    } catch (err: any) {
      setErrorMessage(`Impossible d'importer la séance "${act.name}" : ${err.message || err}`);
    } finally {
      setLoadingActivityId(null);
    }
  };

  // Filtered activities
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      // GPS filter
      if (gpsOnly && !act.has_gps) return false;

      // Sport filter
      if (sportFilter === 'run') {
        const isRun = ['Run', 'TrailRun'].includes(act.type);
        if (!isRun) return false;
      } else if (sportFilter === 'ride') {
        const isRide = ['Ride', 'Gravel', 'VirtualRide', 'MountainBike'].includes(act.type);
        if (!isRide) return false;
      } else if (sportFilter === 'hike') {
        const isHike = ['Hike', 'Walk'].includes(act.type);
        if (!isHike) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = act.name.toLowerCase().includes(q);
        const matchesType = act.type.toLowerCase().includes(q);
        const matchesDesc = act.description?.toLowerCase().includes(q);
        if (!matchesName && !matchesType && !matchesDesc) return false;
      }

      return true;
    });
  }, [activities, gpsOnly, sportFilter, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="p-5 md:px-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-600/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Activity size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base md:text-lg font-bold text-white">
                  Séances & Entraînements Intervals.icu
                </h2>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  Direct API
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Importez vos sorties enregistrées pour les comparer point par point avec le Virtual Partner
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition flex items-center justify-center"
            title="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Target Trace Selector Header Bar */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600">
              Destination de l'import :
            </span>
            <div className="inline-flex rounded-xl p-1 bg-slate-200/80 border border-slate-300/80">
              <button
                type="button"
                onClick={() => setActiveTrace(1)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                  activeTrace === 1
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${activeTrace === 1 ? 'bg-white' : 'bg-rose-500'}`}></span>
                Trace 1 (Norme / Référence)
              </button>
              <button
                type="button"
                onClick={() => setActiveTrace(2)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                  activeTrace === 2
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${activeTrace === 2 ? 'bg-white' : 'bg-sky-500'}`}></span>
                Trace 2 (Comparée / Réalisé)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Prominent Athlete Switcher if Coach has Athletes */}
            {coachedAthletes.length > 1 ? (
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-slate-300 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1 shrink-0">
                  <User size={13} className="text-orange-500" />
                  Athlète :
                </span>
                <select
                  value={athleteId}
                  onChange={(e) => handleSwitchAthlete(e.target.value)}
                  className="text-xs font-bold text-slate-900 bg-white outline-none cursor-pointer border-none py-0.5 focus:ring-0 max-w-[200px] truncate"
                  title="Changer d'athlète coaché"
                >
                  {coachedAthletes.map((a) => (
                    <option key={a.id} value={a.id} className="text-slate-900 bg-white font-medium py-1">
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : currentAthleteName ? (
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                <User size={13} className="text-orange-500" />
                {currentAthleteName}
              </span>
            ) : null}

            <button
              onClick={() => setShowConfig(!showConfig)}
              className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded-lg border border-orange-200 transition"
            >
              <Key size={13} />
              <span>{showConfig ? 'Masquer config' : 'Clé API / Athlète'}</span>
              {showConfig ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>

        {/* Credentials / Athlete Selection Drawer */}
        {showConfig && (
          <div className="p-4 md:p-5 bg-gradient-to-r from-orange-50/70 via-slate-50 to-white border-b border-orange-100 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <Key size={14} className="text-orange-600" />
                Accès API Intervals.icu
              </h3>
              <a
                href="https://intervals.icu/settings"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold text-orange-600 hover:underline flex items-center gap-1"
              >
                Ouvrir les paramètres Intervals.icu <ExternalLink size={11} />
              </a>
            </div>

            <div className={`grid grid-cols-1 gap-3 ${coachedAthletes.length > 0 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
              {/* Athlete selector if coach has athletes */}
              {coachedAthletes.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                    Athlète coaché ({coachedAthletes.length})
                  </label>
                  <select
                    value={athleteId}
                    onChange={(e) => handleSwitchAthlete(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-xl outline-none focus:border-orange-500 shadow-2xs cursor-pointer"
                  >
                    {coachedAthletes.map((a) => (
                      <option key={a.id} value={a.id} className="text-slate-900 bg-white font-medium py-1">
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  ID Athlète Intervals (ex: i12345 ou 0)
                </label>
                <input
                  type="text"
                  placeholder="ID Athlète (ex: i12345)"
                  value={athleteId}
                  onChange={(e) => setAthleteId(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-xl outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Clé API (Settings &gt; Developer)
                </label>
                <input
                  type="password"
                  placeholder="Clé API secrète"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-xl outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleSaveCredentials}
                  className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 size={14} />
                  <span>Sauvegarder & Charger</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filters Bar */}
        <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher une séance..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs font-medium bg-slate-100 border border-transparent focus:border-orange-400 focus:bg-white rounded-xl outline-none transition text-slate-900 placeholder:text-slate-400"
              />
            </div>

            {/* Sport Filter Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setSportFilter('all')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                  sportFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tous
              </button>
              <button
                onClick={() => setSportFilter('run')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                  sportFilter === 'run' ? 'bg-white text-rose-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🏃 Trail / Course
              </button>
              <button
                onClick={() => setSportFilter('ride')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                  sportFilter === 'ride' ? 'bg-white text-sky-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🚴 Vélo
              </button>
              <button
                onClick={() => setSportFilter('hike')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                  sportFilter === 'hike' ? 'bg-white text-emerald-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🥾 Marche
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Date range dropdown */}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Calendar size={14} className="text-slate-400" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as any)}
                className="text-xs font-bold bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl px-2.5 py-1.5 outline-none cursor-pointer text-slate-900"
              >
                <option value="30d">30 derniers jours</option>
                <option value="90d">3 derniers mois</option>
                <option value="180d">6 derniers mois</option>
                <option value="365d">Cette année (1 an)</option>
              </select>
            </div>

            {/* GPS only toggle */}
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={gpsOnly}
                onChange={(e) => setGpsOnly(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-orange-600 focus:ring-orange-500 cursor-pointer"
              />
              <span className="flex items-center gap-1">
                <Compass size={13} className="text-emerald-600" />
                Avec GPS
              </span>
            </label>

            {/* Refresh button */}
            <button
              onClick={() => loadActivities(athleteId, apiKey, dateRange)}
              disabled={isLoading}
              className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition disabled:opacity-50"
              title="Rafraîchir la liste"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin text-orange-600' : ''} />
            </button>
          </div>
        </div>

        {/* Error message banner */}
        {errorMessage && (
          <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-500 hover:text-red-700 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Activities List Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 bg-slate-50/50">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <Loader2 className="animate-spin text-orange-500" size={32} />
              <p className="text-sm font-semibold text-slate-600">
                Interrogation d'Intervals.icu...
              </p>
              <p className="text-xs text-slate-400">
                Récupération de vos séances d'entraînement
              </p>
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 gap-2">
              <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                <Activity size={24} />
              </div>
              <p className="text-sm font-bold text-slate-700">
                Aucun entraînement trouvé
              </p>
              <p className="text-xs text-slate-400 max-w-sm">
                {activities.length === 0
                  ? "Aucune activité trouvée sur cette période ou clé API invalide. Vérifiez vos identifiants ci-dessus."
                  : "Aucune activité ne correspond à vos filtres actuels. Essayez de désactiver le filtre GPS ou de changer la période."}
              </p>
              {activities.length === 0 && !showConfig && (
                <button
                  onClick={() => setShowConfig(true)}
                  className="mt-2 text-xs font-bold text-orange-600 hover:underline"
                >
                  Configurer la clé API &gt;
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredActivities.map((act) => {
                const isCurrentLoading = loadingActivityId === act.id;
                const distKm = Number((act.distance / 1000).toFixed(2));
                const paceStr = act.average_speed ? formatPace(act.average_speed) : null;
                const durStr = formatDuration(act.moving_time || act.elapsed_time);

                const dateObj = act.start_date_local ? new Date(act.start_date_local) : null;
                const formattedDate = dateObj
                  ? dateObj.toLocaleDateString('fr-FR', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '';

                const isRun = ['Run', 'TrailRun'].includes(act.type);
                const isRide = ['Ride', 'Gravel', 'VirtualRide', 'MountainBike'].includes(act.type);

                return (
                  <div
                    key={act.id}
                    className="p-4 bg-white rounded-2xl border border-slate-200 hover:border-orange-400 hover:shadow-md transition group flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    {/* Left details */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                            isRun
                              ? 'bg-rose-100 text-rose-700'
                              : isRide
                              ? 'bg-sky-100 text-sky-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {act.type}
                        </span>

                        <span className="text-xs text-slate-400 font-medium">
                          {formattedDate}
                        </span>

                        {act.has_gps ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Compass size={11} /> Trace GPS
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                            Sans GPS
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-bold text-slate-800 truncate group-hover:text-orange-600 transition">
                        {act.name}
                      </h4>

                      {/* Metrics Row */}
                      <div className="flex flex-wrap items-center gap-3 md:gap-4 text-xs font-semibold text-slate-600">
                        {distKm > 0 && (
                          <span className="flex items-center gap-1">
                            <strong className="text-slate-900">{distKm}</strong> km
                          </span>
                        )}

                        {act.total_elevation_gain > 0 && (
                          <span className="flex items-center gap-1 text-slate-700">
                            <Mountain size={13} className="text-orange-500" />
                            <strong>+{Math.round(act.total_elevation_gain)}</strong> m
                          </span>
                        )}

                        <span className="flex items-center gap-1">
                          <Timer size={13} className="text-slate-400" />
                          {durStr}
                        </span>

                        {paceStr && (
                          <span className="text-slate-500 font-mono text-[11px]">
                            {paceStr}
                          </span>
                        )}

                        {act.average_heartrate && (
                          <span className="flex items-center gap-1 text-rose-600">
                            <Heart size={13} />
                            {act.average_heartrate} bpm
                          </span>
                        )}

                        {act.icu_tss !== undefined && act.icu_tss > 0 && (
                          <span className="flex items-center gap-1 text-amber-600">
                            <Zap size={13} />
                            {Math.round(act.icu_tss)} TSS
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                      {isCurrentLoading ? (
                        <div className="px-5 py-2.5 rounded-xl bg-orange-50 text-orange-600 font-bold text-xs flex items-center gap-2 border border-orange-200">
                          <Loader2 size={16} className="animate-spin" />
                          <span>Importation du tracé GPS...</span>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSelectActivity(act, 1)}
                            disabled={!act.has_gps}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                              act.has_gps
                                ? 'bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-200'
                                : 'opacity-40 bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                            title={
                              act.has_gps
                                ? "Charger cette séance comme Trace 1 (Norme)"
                                : "Pas de coordonnées GPS pour cette séance"
                            }
                          >
                            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                            <span>Trace 1</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSelectActivity(act, 2)}
                            disabled={!act.has_gps}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                              act.has_gps
                                ? 'bg-sky-50 text-sky-700 hover:bg-sky-600 hover:text-white border border-sky-200'
                                : 'opacity-40 bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                            title={
                              act.has_gps
                                ? "Charger cette séance comme Trace 2 (Comparée)"
                                : "Pas de coordonnées GPS pour cette séance"
                            }
                          >
                            <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                            <span>Trace 2</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSelectActivity(act, activeTrace)}
                            disabled={!act.has_gps}
                            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition shadow-xs flex items-center gap-1.5 ${
                              act.has_gps
                                ? activeTrace === 1
                                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
                                  : 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-600/20'
                                : 'opacity-40 bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <span>Choisir</span>
                            <ArrowRight size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Compass size={14} className="text-orange-500" />
            <span>
              Séances synchronisées avec <strong>Intervals.icu</strong> • Les flux GPS incluent latitude, longitude, dénivelé corrigé et fréquence cardiaque.
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
