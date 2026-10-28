"use client";

import React, { useState, useEffect } from "react";
import { fetchAthleteActivities } from "@/lib/intervalsApi";
import { getAthletesFromFirebase, getUserIntervalsCredentials } from "@/lib/firebaseUtils";
import { useAuth } from "@/context/AuthContext";
import { Sparkles, RefreshCw, Activity, Calendar, AlertCircle, CheckCircle2, Flame, Heart, Watch, ArrowRight, GitCompare } from "lucide-react";
import Link from "next/link";
import { getApiUrl } from "@/lib/apiHelper";

export default function CoachIAPage() {
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("");
  const [isLoadingAthletes, setIsLoadingAthletes] = useState(true);

  const [intervalsAthleteId, setIntervalsAthleteId] = useState("");
  const [intervalsApiKey, setIntervalsApiKey] = useState("");

  const [activities, setActivities] = useState<any[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);

  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    setAthletes([]);
    setSelectedAthleteId("");
    setIntervalsAthleteId("");
    setIntervalsApiKey("");
    setActivities([]);
    setAnalysis(null);

    if (!currentUser?.uid || !isAdmin) {
      setIsLoadingAthletes(false);
      return;
    }

    let cancelled = false;
    const init = async () => {
      setIsLoadingAthletes(true);
      const [creds, cached] = await Promise.all([
        getUserIntervalsCredentials(currentUser.uid),
        getAthletesFromFirebase(currentUser.uid),
      ]);
      if (cancelled) return;

      setIntervalsAthleteId(creds.athleteId);
      setIntervalsApiKey(creds.apiKey);

      if (cached && cached.length > 0) {
        setAthletes(cached);
        setSelectedAthleteId(cached[0].id);
      } else if (creds.athleteId) {
        const selfAthlete = { id: creds.athleteId, name: "Moi", ctl: 0, atl: 0, form: 0 };
        setAthletes([selfAthlete]);
        setSelectedAthleteId(creds.athleteId);
      }
      setIsLoadingAthletes(false);
    };
    init();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid, isAdmin, authLoading]);

  if (!authLoading && currentUser && !isAdmin) {
    return null;
  }

  useEffect(() => {
    if (selectedAthleteId && intervalsApiKey) {
      loadAthleteData(selectedAthleteId, intervalsApiKey);
    }
  }, [selectedAthleteId, intervalsApiKey]);

  const loadAthleteData = async (athleteId: string, apiKey: string) => {
    setIsLoadingActivities(true);
    setError(null);
    setAnalysis(null);
    try {
      const acts = await fetchAthleteActivities(athleteId, apiKey, 14);
      setActivities(acts);
    } catch (e: any) {
      console.error(e);
      setError("Impossible de charger les activités récentes depuis Intervals.icu.");
    } finally {
      setIsLoadingActivities(false);
    }
  };

  const handleAnalyze = async () => {
    const selectedAthlete = athletes.find(a => a.id === selectedAthleteId);
    if (!selectedAthlete) return;

    setIsAnalyzing(true);
    setError(null);
    try {
      const response = await fetch(getApiUrl('/api/coach-ia'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athlete: selectedAthlete,
          activities: activities
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de l'analyse");
      }

      setAnalysis(data.analysis);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const selectedAthlete = athletes.find(a => a.id === selectedAthleteId);

  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, index) => {
      if (line.startsWith('### ')) {
        return <h3 key={index} className="text-lg font-bold text-[var(--text-primary)] mt-6 mb-2 flex items-center gap-2">{line.replace('### ', '')}</h3>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={index} className="text-xl font-extrabold text-[var(--color-primary)] mt-8 mb-3 pb-2 border-b border-[var(--border-subtle)]">{line.replace('## ', '')}</h2>;
      }
      if (line.startsWith('# ')) {
        return <h1 key={index} className="text-2xl font-black text-[var(--text-primary)] mt-6 mb-4">{line.replace('# ', '')}</h1>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const content = line.substring(2);
        const formattedContent = content.split(/(\*\*.*?\*\*)/g).map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="text-[var(--text-primary)] font-bold">{part.slice(2, -2)}</strong>;
          }
          return part;
        });
        return <li key={index} className="ml-6 list-disc text-[var(--text-secondary)] mb-1.5 leading-relaxed">{formattedContent}</li>;
      }
      if (line.trim() === '') {
        return <div key={index} className="h-2"></div>;
      }

      const formattedLine = line.split(/(\*\*.*?\*\*)/g).map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="text-[var(--text-primary)] font-bold">{part.slice(2, -2)}</strong>;
        }
        return part;
      });

      return <p key={index} className="text-[var(--text-secondary)] mb-3 leading-relaxed">{formattedLine}</p>;
    });
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-7 space-y-6">
      {/* Unified Hero Header Card */}
      <header className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 text-[var(--color-primary)] flex items-center justify-center shrink-0">
            <Sparkles size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-extrabold text-[var(--text-primary)] m-0 tracking-tight">
                Coach IA — Diagnostic & Bilan
              </h1>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                GEMINI PRO
              </span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5 m-0">
              Analyse physiologique des 14 derniers jours, détection de dérive cardiaque et recommandations de séances.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {athletes.length > 0 && (
            <select
              value={selectedAthleteId}
              onChange={(e) => setSelectedAthleteId(e.target.value)}
              className="input-field font-bold text-sm !py-2.5 !px-4 !rounded-full min-w-[230px]"
            >
              {athletes.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
          {selectedAthlete && (
            <Link
              href={`/comparator?athlete=${encodeURIComponent(selectedAthlete.name || "")}&athleteId=${encodeURIComponent(selectedAthlete.id || "")}`}
              className="btn btn-secondary"
              title="Ouvrir le comparateur pour cet athlète"
            >
              <GitCompare size={16} className="text-[var(--color-primary)]" />
              <span className="hidden sm:inline">Comparateur</span>
            </Link>
          )}
        </div>
      </header>

      {isLoadingAthletes ? (
        <div className="card p-8 text-center text-sm text-[var(--text-muted)]">
          Chargement de vos données personnelles...
        </div>
      ) : !intervalsApiKey ? (
        <div className="card p-8 text-center">
          <AlertCircle size={44} className="mx-auto text-amber-500 mb-4" />
          <h3 className="text-xl font-bold mb-2">Configuration Intervals.icu requise</h3>
          <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
            Veuillez configurer votre clé API personnelle Intervals.icu dans l&apos;onglet Paramètres pour utiliser le Coach IA sur votre compte.
          </p>
          <Link href="/settings" className="btn btn-primary">
            Configurer mes accès API
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Colonne de gauche : Résumé de l'athlète et activités récentes */}
          <div className="lg:col-span-1 space-y-6">
            {selectedAthlete && (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-subtle)]">
                  <h3 className="text-base font-extrabold text-[var(--text-primary)] flex items-center gap-2 m-0">
                    <Activity size={18} className="text-[var(--color-primary)]" />
                    État de Forme Actuel
                  </h3>
                  <Link href={`/athletes/${selectedAthlete.id}`} className="text-xs font-bold text-[var(--color-primary)] hover:underline flex items-center gap-1">
                    Voir profil <ArrowRight size={12} />
                  </Link>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center mb-5 bg-[var(--bg-surface-elevated)] p-3.5 rounded-xl border border-[var(--border-subtle)]">
                  <div>
                    <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">CTL</div>
                    <div className="text-xl font-black text-[var(--color-primary)]">{selectedAthlete.ctl || 0}</div>
                  </div>
                  <div className="border-x border-[var(--border-subtle)]">
                    <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">ATL</div>
                    <div className="text-xl font-black text-slate-600">{selectedAthlete.atl || 0}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">TSB</div>
                    <div className={`text-xl font-black ${(selectedAthlete.form || 0) < -10 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {(selectedAthlete.form || 0) > 0 ? `+${selectedAthlete.form}` : (selectedAthlete.form || 0)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-sm">
                  <div className="flex items-center gap-2 bg-[var(--bg-base)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
                    <Flame size={15} className="text-[var(--color-primary)]" />
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">FTP</div>
                      <div className="font-bold text-[var(--text-primary)]">{selectedAthlete.ftp ? `${selectedAthlete.ftp} W` : '-'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-[var(--bg-base)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
                    <Heart size={15} className="text-rose-500" />
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">FC Repos</div>
                      <div className="font-bold text-[var(--text-primary)]">{selectedAthlete.restingHR ? `${selectedAthlete.restingHR} bpm` : '-'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-[var(--bg-base)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
                    <Watch size={15} className="text-emerald-500" />
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Seuil</div>
                      <div className="font-bold text-[var(--text-primary)]">
                        {selectedAthlete.thresholdPace ? `${Math.floor(selectedAthlete.thresholdPace / 60)}:${Math.round(selectedAthlete.thresholdPace % 60).toString().padStart(2, '0')} /km` : '-'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-[var(--bg-base)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
                    <Activity size={15} className="text-slate-500" />
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Poids</div>
                      <div className="font-bold text-[var(--text-primary)]">{selectedAthlete.weight ? `${selectedAthlete.weight} kg` : '-'}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="card p-5">
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-[var(--border-subtle)]">
                <h3 className="text-base font-extrabold text-[var(--text-primary)] flex items-center gap-2 m-0">
                  <Calendar size={18} className="text-[var(--color-primary)]" />
                  14 Derniers Jours ({activities.length})
                </h3>
                <button
                  onClick={() => loadAthleteData(selectedAthleteId, intervalsApiKey)}
                  className="text-[var(--text-secondary)] hover:text-[var(--color-primary)] transition p-1"
                  title="Rafraîchir les activités"
                >
                  <RefreshCw size={15} className={isLoadingActivities ? "lucide-spin" : ""} />
                </button>
              </div>

              {isLoadingActivities ? (
                <div className="py-8 text-center text-[var(--text-muted)] text-sm">
                  Chargement des séances...
                </div>
              ) : activities.length === 0 ? (
                <div className="py-8 text-center text-[var(--text-muted)] text-sm">
                  Aucune activité enregistrée sur les 14 derniers jours.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                  {activities.map((act, idx) => (
                    <div key={act.id || idx} className="p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] hover:border-orange-500/30 transition text-sm">
                      <div className="flex justify-between items-start mb-1 gap-2">
                        <span className="font-bold text-[var(--text-primary)] truncate">{act.name}</span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-[var(--color-primary)] shrink-0">
                          {act.icu_training_load || 0} TSS
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] flex flex-wrap gap-x-3 gap-y-1">
                        <span>📅 {new Date(act.start_date_local).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                        <span>⏱️ {Math.round((act.moving_time || 0) / 60)}m</span>
                        {act.distance ? <span>📏 {(act.distance / 1000).toFixed(1)}km</span> : null}
                        {act.total_elevation_gain ? <span>⛰️ {Math.round(act.total_elevation_gain)}m D+</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Colonne de droite : Analyse IA */}
          <div className="lg:col-span-2">
            <div className="card p-6 md:p-8 min-h-[540px] flex flex-col">
              {!analysis && !isAnalyzing && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                  <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-5 text-[var(--color-primary)]">
                    <Sparkles size={32} />
                  </div>
                  <h2 className="text-2xl font-extrabold text-[var(--text-primary)] mb-2">
                    Prêt à analyser la dynamique de {selectedAthlete?.name}
                  </h2>
                  <p className="text-[var(--text-secondary)] max-w-md mb-8 text-sm">
                    Le Coach IA va croiser les métriques de charge (CTL, ATL, TSB) avec le détail des {activities.length} dernières sorties pour dresser un bilan complet et proposer des ajustements.
                  </p>
                  <button
                    onClick={handleAnalyze}
                    disabled={isLoadingActivities}
                    className="btn btn-primary text-base px-8 py-3.5 shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                  >
                    <Sparkles size={18} />
                    Lancer le diagnostic IA
                  </button>
                  {error && (
                    <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 text-sm max-w-md">
                      {error}
                    </div>
                  )}
                </div>
              )}

              {isAnalyzing && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                  <div className="relative w-16 h-16 mb-6">
                    <div className="absolute inset-0 border-4 border-orange-100 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-[var(--color-primary)] rounded-full border-t-transparent animate-spin"></div>
                    <Sparkles className="absolute inset-0 m-auto text-[var(--color-primary)] animate-pulse" size={22} />
                  </div>
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                    Analyse physiologique en cours...
                  </h3>
                  <p className="text-[var(--text-secondary)] text-sm max-w-sm">
                    Évaluation de la fatigue neuromusculaire, de la dérive cardiaque et de la charge D+ hebdomadaire...
                  </p>
                </div>
              )}

              {analysis && !isAnalyzing && (
                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between items-center pb-4 mb-6 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-3">
                      <div className="bg-emerald-500/10 text-emerald-600 p-2 rounded-xl border border-emerald-500/20">
                        <CheckCircle2 size={22} />
                      </div>
                      <div>
                        <h3 className="text-lg font-extrabold text-[var(--text-primary)] m-0">Rapport du Coach IA</h3>
                        <p className="text-xs text-[var(--text-muted)] m-0">Généré à l&apos;instant pour {selectedAthlete?.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleAnalyze}
                      className="btn btn-secondary !py-1.5 !px-3.5 !text-xs flex items-center gap-1.5"
                    >
                      <RefreshCw size={14} /> Actualiser
                    </button>
                  </div>

                  <div className="prose max-w-none flex-1">
                    {renderMarkdown(analysis)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
