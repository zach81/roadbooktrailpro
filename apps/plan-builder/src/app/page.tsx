"use client";

import { useState, useEffect } from "react";
import { fetchCoachedAthletes, fetchAthleteLoad } from "@/lib/intervalsApi";
import { Activity, TrendingUp, TrendingDown, Heart, Flame, Watch, RefreshCw, AlertCircle, Settings } from "lucide-react";
import Link from "next/link";

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
    return "text-blue-500 bg-blue-50"; // Transition / Too fresh
  };

  const getFormLabel = (form: number) => {
    if (form < -30) return "Risque élevé";
    if (form < -10) return "Entraînement optimal";
    if (form <= 5) return "Frais";
    return "Transition / Récupération";
  };

  return (
    <div className="py-0 md:py-4">
      <div className="space-y-6">
        
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 pb-4 border-b border-[var(--border-subtle)]">
          <h1 className="text-[2rem] font-bold text-[var(--text-primary)] m-0">Tableau de bord Athlètes</h1>
          <button 
            onClick={loadData}
            disabled={isLoading}
            className="btn btn-secondary"
          >
            <RefreshCw size={18} className={isLoading ? "animate-spin text-[var(--text-secondary)]" : "text-[var(--text-secondary)]"} />
            <span className="font-medium">Actualiser</span>
          </button>
        </header>

        {apiKeyMissing ? (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-orange-200 text-center flex flex-col items-center">
            <AlertCircle className="text-orange-500 w-12 h-12 mb-4" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">Configuration requise</h2>
            <p className="text-gray-600 mb-6 max-w-md">
              Pour afficher vos données et celles de vos athlètes, vous devez configurer votre identifiant et votre clé API Intervals.icu.
            </p>
            <Link href="/" className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition">
              <Settings size={18} />
              Aller à l'accueil pour configurer
            </Link>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {athletesData.map((athlete) => (
                <div key={athlete.id} className={`card p-0 flex flex-col justify-between ${athlete.isMe ? 'ring-2 ring-blue-500/20 border-blue-200/50' : ''}`}>
                
                {/* Card Header */}
                <div className="p-5 flex items-start justify-between border-b border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm ${athlete.isMe ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                      {athlete.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                        {athlete.name}
                        {athlete.isMe && <span className="bg-blue-50 text-blue-600 border border-blue-200/50 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">Moi</span>}
                      </h3>
                      <p className="text-xs text-slate-400 font-medium">ID: {athlete.id}</p>
                    </div>
                  </div>
                </div>

                {/* Main Metrics (PMC) */}
                <div className="p-6 bg-slate-50/30">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="flex flex-col items-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Fitness</p>
                      <div className="flex items-end justify-center gap-1">
                        <span className="text-3xl font-black text-blue-600 leading-none">{athlete.ctl}</span>
                        <span className="text-xs text-slate-400 font-semibold mb-0.5">CTL</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-center relative before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-px before:bg-slate-200 after:content-[''] after:absolute after:right-0 after:top-2 after:bottom-2 after:w-px after:bg-slate-200">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Fatigue</p>
                      <div className="flex items-end justify-center gap-1">
                        <span className="text-3xl font-black text-indigo-500 leading-none">{athlete.atl}</span>
                        <span className="text-xs text-slate-400 font-semibold mb-0.5">ATL</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Form</p>
                      <div className="flex items-end justify-center gap-1">
                        <span className={`text-3xl font-black leading-none ${athlete.form < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{athlete.form > 0 ? '+' : ''}{athlete.form}</span>
                        <span className="text-xs text-slate-400 font-semibold mb-0.5">TSB</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Form Indicator Badge */}
                  <div className="mt-5 flex justify-center">
                    <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${getFormColor(athlete.form)}`}>
                      {getFormLabel(athlete.form)}
                    </span>
                  </div>
                </div>

                {/* Additional Scientific Metrics */}
                <div className="px-5 py-4 grid grid-cols-2 gap-3 bg-white border-t border-slate-100">
                  <div className="bg-slate-50/50 rounded-lg p-3 flex flex-col items-center justify-center border border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1.5"><Flame size={14} /><span className="text-[10px] uppercase font-bold tracking-wide">FTP / Seuil</span></div>
                    <span className="font-bold text-slate-800">{athlete.ftp ? `${athlete.ftp} W` : '-'}</span>
                  </div>
                  <div className="bg-slate-50/50 rounded-lg p-3 flex flex-col items-center justify-center border border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1.5"><Heart size={14} /><span className="text-[10px] uppercase font-bold tracking-wide">FC Repos</span></div>
                    <span className="font-bold text-slate-800">{athlete.restingHR ? `${athlete.restingHR} bpm` : '-'}</span>
                  </div>
                  <div className="bg-slate-50/50 rounded-lg p-3 flex flex-col items-center justify-center border border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1.5"><Watch size={14} /><span className="text-[10px] uppercase font-bold tracking-wide">Allure Seuil</span></div>
                    <span className="font-bold text-slate-800">{athlete.thresholdPace ? `${(athlete.thresholdPace/60).toFixed(2).replace('.',':')} /km` : '-'}</span>
                  </div>
                  <div className="bg-slate-50/50 rounded-lg p-3 flex flex-col items-center justify-center border border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1.5"><Activity size={14} /><span className="text-[10px] uppercase font-bold tracking-wide">Poids</span></div>
                    <span className="font-bold text-slate-800">{athlete.weight ? `${athlete.weight} kg` : '-'}</span>
                  </div>
                </div>
                
                {/* Actions */}
                <div className="p-5 bg-slate-50/30 border-t border-slate-100 flex justify-end mt-auto">
                  <Link href={`/athletes/${athlete.id}`} className="btn btn-primary !text-white !no-underline shadow-sm w-full sm:w-auto">
                    Gérer / Planifier
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
