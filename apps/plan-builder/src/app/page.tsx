"use client";

import { useState, useEffect } from "react";
import { fetchCoachedAthletes, fetchAthleteLoad } from "@/lib/intervalsApi";
import { Activity, TrendingUp, TrendingDown, Heart, Flame, Watch, RefreshCw, AlertCircle, Settings, User, Sparkles, Key, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import styles from "./page.module.css";

interface AthleteData {
  id: string;
  name: string;
  ctl: number;
  atl: number;
  form: number;
  ftp: number | null;
  weight: number | null;
  restingHR: number | null;
  thresholdPace: number | null;
  isMe?: boolean;
}

export default function AthletesPage() {
  const [athletesData, setAthletesData] = useState<AthleteData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [quickId, setQuickId] = useState("");
  const [quickKey, setQuickKey] = useState("");

  const loadData = async () => {
    setIsLoading(true);
    setError("");
    setWarning("");
    
    const storedId = localStorage.getItem("intervalsAthleteId");
    const storedKey = localStorage.getItem("intervalsApiKey");
    
    if (!storedId || !storedKey) {
      setApiKeyMissing(true);
      setIsLoading(false);
      return;
    }

    try {
      let athletesList: any[] = [];
      let coachPermissionError = false;

      try {
        athletesList = await fetchCoachedAthletes(storedId, storedKey);
      } catch (err: any) {
        if (err.message === "403_FORBIDDEN") {
          coachPermissionError = true;
          // Fallback to fetching just the user's profile
          const fallbackUrl = `https://intervals.icu/api/v1/athlete/${storedId}`;
          const headers = new Headers();
          headers.append('Authorization', 'Basic ' + btoa(`API_KEY:${storedKey}`));
          headers.append('Content-Type', 'application/json');
          
          const fallbackResponse = await fetch(fallbackUrl, { headers });
          if (fallbackResponse.ok) {
            const data = await fallbackResponse.json();
            athletesList = [data];
          } else {
             throw new Error("Failed to fetch coach profile.");
          }
        } else {
          throw err;
        }
      }
      
      // Assure "Me" is in the list
      const allAthletes = [...(Array.isArray(athletesList) ? athletesList : [])];
      if (!allAthletes.find(a => (a.id || a.athlete?.id || a.athlete_id) === storedId)) {
        allAthletes.unshift({ id: storedId, firstname: "Moi", lastname: "(Coach)" });
      }

      // 2. Fetch load for each
      const detailedData = await Promise.all(allAthletes.map(async (a: any, index: number) => {
        const athleteId = a.id || a.athlete?.id || a.athlete_id || `unknown-${index}`;
        
        let load = null;
        // Seulement charger le profil individuel si c'est le coach lui-même
        // ou si on n'a aucune donnée de fitness (ce qui signifie que ce n'est pas un résumé de coaching)
        if (athleteId === storedId || (a.fitness === undefined && a.fatigue === undefined)) {
          load = await fetchAthleteLoad(athleteId, storedKey);
        }
        
        let name = a.athlete_name || load?.name || a.name || a.athlete?.name || (a.firstname ? `${a.firstname} ${a.lastname || ''}`.trim() : null);
        if (!name || name.trim() === "" || name.startsWith("Unknown")) name = athleteId === storedId ? "Moi" : "Inconnu";

        const ctl = load?.ctl ?? a.ctl ?? a.icu?.ctl ?? a.fitness ?? 0;
        const atl = load?.atl ?? a.atl ?? a.icu?.atl ?? a.fatigue ?? 0;
        const form = load?.form ?? a.form ?? a.icu?.form ?? (ctl - atl);

        return {
          id: athleteId,
          name,
          ctl: Math.round(ctl),
          atl: Math.round(atl),
          form: Math.round(form),
          ftp: load?.ftp ?? a.ftp ?? a.icu?.ftp ?? a.eftp ?? a.run_eftp ?? null,
          weight: load?.weight ?? a.weight ?? a.icu?.weight ?? null,
          restingHR: load?.restingHR ?? a.restingHR ?? a.resting_hr ?? a.icu?.resting_hr ?? null,
          thresholdPace: load?.thresholdPace ?? a.thresholdPace ?? a.threshold_pace ?? a.run_threshold_pace ?? null,
          isMe: athleteId === storedId
        };
      }));

      // Sort: Me first, then by CTL descending
      detailedData.sort((a, b) => {
        if (a.isMe) return -1;
        if (b.isMe) return 1;
        return b.ctl - a.ctl;
      });

      // Ensure unique athletes by ID before setting state
      const uniqueAthletes = detailedData.filter((athlete, index, self) => 
        index === self.findIndex((a) => a.id === athlete.id)
      );

      setAthletesData(uniqueAthletes);
      if (coachPermissionError) {
        setWarning("L'API d'Intervals.icu a refusé l'accès à la liste de vos athlètes (Erreur 403). Assurez-vous que votre clé API dispose des permissions 'Coach'. Seul votre profil est affiché.");
      }
    } catch (err: any) {
      setError(err.message || "Erreur lors de la récupération des données.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getFormColor = (form: number) => {
    if (form < -30) return "text-red-500 bg-red-50"; // High Risk
    if (form < -10) return "text-orange-500 bg-orange-50"; // Optimal Training
    if (form <= 5) return "text-green-500 bg-green-50"; // Fresh
    return "text-slate-500 bg-slate-100"; // Transition / Too fresh
  };

  const getFormLabel = (form: number) => {
    if (form < -30) return "Risque élevé";
    if (form < -10) return "Entraînement optimal";
    if (form <= 5) return "Frais";
    return "Transition / Récupération";
  };

  return (
    <div className={styles.dashboardContainer}>
      <div className="space-y-6">
        
        <header className={styles.header}>
          <div>
            <h1>Mes Athlètes</h1>
            <p className="text-xs text-gray-500 mt-1">Gérez vos athlètes et synchronisez avec Intervals.icu</p>
          </div>
          <div className="flex items-center gap-2.5">
            <Link 
              href="/coach-ia" 
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-emerald-600 hover:from-orange-600 hover:to-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
            >
              <Sparkles size={16} />
              <span>Coach IA</span>
            </Link>
            <button 
              onClick={loadData}
              disabled={isLoading}
              className="btn btn-secondary text-xs"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin text-[var(--text-secondary)]" : "text-[var(--text-secondary)]"} />
              <span className="font-medium">Actualiser</span>
            </button>
          </div>
        </header>

        {apiKeyMissing ? (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-orange-200 max-w-lg mx-auto text-left">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-orange-100 text-orange-600 rounded-xl">
                <Key size={24} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Connexion Intervals.icu</h2>
                <p className="text-xs text-gray-500">Renseignez vos identifiants pour charger vos données et activer l'IA.</p>
              </div>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (!quickId.trim() || !quickKey.trim()) return;
              localStorage.setItem("intervalsAthleteId", quickId.trim());
              localStorage.setItem("intervalsApiKey", quickKey.trim());
              setApiKeyMissing(false);
              loadData();
            }} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  ID Athlète (ex: i12345)
                </label>
                <input
                  type="text"
                  value={quickId}
                  onChange={(e) => setQuickId(e.target.value)}
                  placeholder="Ex: i12345"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Clé API Intervals.icu
                </label>
                <input
                  type="password"
                  value={quickKey}
                  onChange={(e) => setQuickKey(e.target.value)}
                  placeholder="Collez votre clé API Intervals.icu"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition font-mono text-xs"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Disponible dans <a href="https://intervals.icu/settings" target="_blank" rel="noreferrer" className="text-orange-600 underline">Paramètres Intervals.icu &gt; Developer</a>.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={!quickId.trim() || !quickKey.trim()}
                  className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={16} />
                  Enregistrer et charger mes données
                </button>
                <Link
                  href="/settings"
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
                >
                  Plus d'options
                </Link>
              </div>
            </form>
          </div>
        ) : isLoading ? (
          <div className={styles.grid}>
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-pulse h-64">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-32"></div>
                </div>
                <div className="space-y-4">
                  <div className="h-8 bg-gray-200 rounded w-full"></div>
                  <div className="h-8 bg-gray-200 rounded w-full"></div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex gap-3">
            <AlertCircle className="shrink-0" />
            <p>{error}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {warning && (
              <div className="bg-orange-50 text-orange-700 p-4 rounded-xl border border-orange-100 flex gap-3">
                <AlertCircle className="shrink-0" />
                <p>{warning}</p>
              </div>
            )}
            <div className={styles.grid}>
              {athletesData.map((athlete) => (
                <div 
                  key={athlete.id} 
                  className={styles.roadbookCard}
                  style={athlete.isMe ? { border: '2px solid var(--color-primary)' } : {}}
                >
                
                  {/* Card Header */}
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardHeaderTitle}>
                      <User size={20} className={styles.iconPrimary} /> 
                      {athlete.name}
                      {athlete.isMe && (
                        <span className="bg-orange-50 text-orange-600 border border-orange-200/50 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ml-2">Moi</span>
                      )}
                    </h3>
                  </div>

                  {/* Main Metrics (PMC) */}
                  <div className={styles.cardBody}>
                    <div className={styles.stat} style={{ flex: '1 1 30%' }}>
                      <span className={styles.statLabel}>Fitness (CTL)</span>
                      <span className={styles.statValue} style={{ color: 'var(--color-primary)' }}>{athlete.ctl}</span>
                    </div>
                    <div className={styles.stat} style={{ flex: '1 1 30%' }}>
                      <span className={styles.statLabel}>Fatigue (ATL)</span>
                      <span className={styles.statValue} style={{ color: '#a855f7' }}>{athlete.atl}</span>
                    </div>
                    <div className={styles.stat} style={{ flex: '1 1 30%' }}>
                      <span className={styles.statLabel}>Form (TSB)</span>
                      <span className={styles.statValue} style={{ color: athlete.form < 0 ? '#f43f5e' : '#10b981' }}>
                        {athlete.form > 0 ? '+' : ''}{athlete.form}
                      </span>
                    </div>
                    
                    <div className={styles.stat} style={{ gridColumn: 'span 3', width: '100%' }}>
                      <span className={`text-xs font-bold px-3 py-1.5 rounded-full text-center mt-2 ${getFormColor(athlete.form)}`}>
                        {getFormLabel(athlete.form)}
                      </span>
                    </div>
                  </div>

                  {/* Additional Scientific Metrics */}
                  <div className={styles.cardBody} style={{ gap: '16px', background: 'transparent', padding: '0' }}>
                    <div className={styles.stat} style={{ flex: '1 1 40%', background: 'var(--bg-surface-elevated)', padding: '12px', borderRadius: '8px' }}>
                      <span className={styles.statLabel}><Flame size={12} /> FTP</span>
                      <span className={styles.statValue} style={{ fontSize: '1.1rem' }}>{athlete.ftp ? `${athlete.ftp} W` : '-'}</span>
                    </div>
                    <div className={styles.stat} style={{ flex: '1 1 40%', background: 'var(--bg-surface-elevated)', padding: '12px', borderRadius: '8px' }}>
                      <span className={styles.statLabel}><Heart size={12} /> FC Repos</span>
                      <span className={styles.statValue} style={{ fontSize: '1.1rem' }}>{athlete.restingHR ? `${athlete.restingHR} bpm` : '-'}</span>
                    </div>
                    <div className={styles.stat} style={{ flex: '1 1 40%', background: 'var(--bg-surface-elevated)', padding: '12px', borderRadius: '8px' }}>
                      <span className={styles.statLabel}><Watch size={12} /> Allure Seuil</span>
                      <span className={styles.statValue} style={{ fontSize: '1.1rem' }}>{athlete.thresholdPace ? `${(athlete.thresholdPace/60).toFixed(2).replace('.',':')} /km` : '-'}</span>
                    </div>
                    <div className={styles.stat} style={{ flex: '1 1 40%', background: 'var(--bg-surface-elevated)', padding: '12px', borderRadius: '8px' }}>
                      <span className={styles.statLabel}><Activity size={12} /> Poids</span>
                      <span className={styles.statValue} style={{ fontSize: '1.1rem' }}>{athlete.weight ? `${athlete.weight} kg` : '-'}</span>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className={styles.cardFooter}>
                    <Link href={`/athletes/${athlete.id}`} className="btn btn-secondary" style={{ width: '100%' }}>
                      <Settings size={16} /> Gérer / Planifier
                    </Link>
                  </div>
                  
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
