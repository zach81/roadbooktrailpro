"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { fetchCoachedAthletes } from "@/lib/intervalsApi";
import {
  getAthletesFromFirebase,
  saveAthletesToFirebase,
  getUserIntervalsCredentials,
  saveUserIntervalsCredentials,
} from "@/lib/firebaseUtils";
import {
  Activity,
  ArrowRight,
  RefreshCw,
  Flame,
  Heart,
  Watch,
  GitCompare,
  Sparkles,
  BookOpen,
  Search,
  Users,
  TrendingUp,
  CheckCircle2,
  SlidersHorizontal,
  Calendar,
  ShieldCheck,
  Key,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import styles from "./page.module.css";

export default function AthletesListPage() {
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const [athletes, setAthletes] = useState<any[]>([]);
  const [isFetchingAthletes, setIsFetchingAthletes] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [intervalsAthleteId, setIntervalsAthleteId] = useState("");
  const [intervalsApiKey, setIntervalsApiKey] = useState("");
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PEAK" | "LOAD" | "FATIGUE">("ALL");

  const syncWithIntervals = async (idToUse: string, keyToUse: string, uid: string) => {
    if (!idToUse || !keyToUse || !uid) return;
    setIsFetchingAthletes(true);
    try {
      const data = await fetchCoachedAthletes(idToUse, keyToUse);
      if (Array.isArray(data) && data.length > 0) {
        const mappedAthletes = data.map((a: any, index: number) => {
          const rawId = a.athlete_id || a.athlete?.id || a.id || `unknown-${index}`;
          const id = String(rawId);
          const name = a.athlete_name || a.name || a.athlete?.name || (a.firstname ? `${a.firstname} ${a.lastname || ""}`.trim() : `Athlète ${index + 1}`);
          const ctl = Math.round(a.fitness ?? a.ctl ?? a.icu?.ctl ?? 0);
          const atl = Math.round(a.fatigue ?? a.atl ?? a.icu?.atl ?? 0);
          const form = Math.round(a.form ?? a.icu?.form ?? (ctl - atl));

          const sportSettings = a.sportSettings || a.icu?.sportSettings || [];
          const runSettings = sportSettings.find((s: any) => s.types?.includes("Run")) || sportSettings[0] || {};
          const ftp = a.ftp || a.icu_ftp || runSettings.ftp;
          const restingHR = a.restingHR || a.icu_resting_hr;
          const thresholdPace = runSettings.lthr_pace || runSettings.threshold_pace;
          const weight = a.weight || a.icu_weight;

          return { id, name, ctl, atl, form, ftp, restingHR, thresholdPace, weight };
        });

        // Deduplicate by athlete ID
        const uniqueMap = new Map<string, any>();
        for (const ath of mappedAthletes) {
          const existing = uniqueMap.get(ath.id);
          if (!existing || ath.ctl > existing.ctl) {
            uniqueMap.set(ath.id, ath);
          }
        }
        const fetchedAthletes = Array.from(uniqueMap.values());

        if (!fetchedAthletes.find((a: any) => a.id === idToUse)) {
          fetchedAthletes.unshift({
            id: idToUse,
            name: "Moi",
            ctl: 0,
            atl: 0,
            form: 0,
            ftp: null,
            restingHR: null,
            thresholdPace: null,
            weight: null,
          });
        }

        setAthletes(fetchedAthletes);
        await saveAthletesToFirebase(uid, fetchedAthletes);
      }
    } catch (e: any) {
      console.error("Erreur lors de la synchronisation Intervals.icu:", e);
    } finally {
      setIsFetchingAthletes(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;

    // Reset state immediately when account changes or logs out
    setAthletes([]);
    setIntervalsAthleteId("");
    setIntervalsApiKey("");

    if (!currentUser?.uid || !isAdmin) {
      setIsInitialLoading(false);
      return;
    }

    const uid = currentUser.uid;
    let isCancelled = false;

    const initAccountCoachingData = async () => {
      setIsInitialLoading(true);
      try {
        const [creds, cachedAthletes] = await Promise.all([
          getUserIntervalsCredentials(uid),
          getAthletesFromFirebase(uid),
        ]);

        if (isCancelled) return;

        setIntervalsAthleteId(creds.athleteId);
        setIntervalsApiKey(creds.apiKey);

        if (cachedAthletes && cachedAthletes.length > 0) {
          setAthletes(cachedAthletes);
        } else {
          setAthletes([]);
        }
        setIsInitialLoading(false);

        if (creds.athleteId && creds.apiKey) {
          await syncWithIntervals(creds.athleteId, creds.apiKey, uid);
        }
      } catch (err) {
        console.error("Erreur d'initialisation du compte coaching :", err);
        if (!isCancelled) setIsInitialLoading(false);
      }
    };

    initAccountCoachingData();

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.uid, isAdmin, authLoading]);

  if (!authLoading && currentUser && !isAdmin) {
    return (
      <div className="max-w-xl mx-auto my-16 p-8 bg-white rounded-2xl border border-slate-200 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center">
          <ShieldCheck size={24} />
        </div>
        <h2 className="text-xl font-extrabold text-slate-900">Accès réservé aux Administrateurs</h2>
        <p className="text-sm text-slate-600">
          L&apos;espace Coaching, Planification d&apos;Athlètes et Coach IA est strictement réservé aux comptes Administrateurs.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link href="/comparator" className="px-4 py-2 rounded-xl bg-[#FF5A36] text-white text-xs font-bold">
            Ouvrir le Comparateur GPX / FIT
          </Link>
          <a href="/dashboard" className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold">
            Retour aux Roadbooks
          </a>
        </div>
      </div>
    );
  }

  const saveConfigAndFetch = async () => {
    if (!currentUser?.uid) return;
    const cleanId = intervalsAthleteId.trim();
    const cleanKey = intervalsApiKey.trim();
    if (!cleanId || !cleanKey) return;

    await saveUserIntervalsCredentials(currentUser.uid, cleanId, cleanKey);
    setShowConfigModal(false);
    await syncWithIntervals(cleanId, cleanKey, currentUser.uid);
  };

  const handleFetchAthletes = async () => {
    if (!currentUser?.uid) return;
    if (!intervalsAthleteId || !intervalsApiKey) {
      setShowConfigModal(true);
      return;
    }
    await syncWithIntervals(intervalsAthleteId, intervalsApiKey, currentUser.uid);
  };

  const getFormState = (form: number) => {
    if (form >= 5 && form <= 25) {
      return { label: "Pic de forme", key: "PEAK", badgeClass: styles.badgeOptimal };
    }
    if (form > 25) {
      return { label: "Fraîcheur / Désentraînement", key: "PEAK", badgeClass: styles.badgeFresh };
    }
    if (form >= -10 && form < 5) {
      return { label: "Maintien", key: "LOAD", badgeClass: styles.badgeNeutral };
    }
    if (form >= -25 && form < -10) {
      return { label: "Charge productive", key: "LOAD", badgeClass: styles.badgeLoad };
    }
    return { label: "Surcharge / Fatigue", key: "FATIGUE", badgeClass: styles.badgeFatigue };
  };

  const filteredAthletes = useMemo(() => {
    return athletes.filter((a) => {
      const matchesName = (a.name || "").toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesName) return false;
      if (statusFilter === "ALL") return true;
      const state = getFormState(a.form || 0);
      return state.key === statusFilter;
    });
  }, [athletes, searchQuery, statusFilter]);

  const kpiStats = useMemo(() => {
    const count = athletes.length;
    const avgCtl = count > 0 ? Math.round(athletes.reduce((sum, a) => sum + (a.ctl || 0), 0) / count) : 0;
    const optimalCount = athletes.filter((a) => (a.form || 0) >= -10 && (a.form || 0) <= 25).length;
    const overloadCount = athletes.filter((a) => (a.form || 0) < -20).length;
    return { count, avgCtl, optimalCount, overloadCount };
  }, [athletes]);

  const formatPace = (secondsPerKm?: number) => {
    if (!secondsPerKm) return "-";
    const mins = Math.floor(secondsPerKm / 60);
    const secs = Math.round(secondsPerKm % 60);
    return `${mins}:${secs.toString().padStart(2, "0")} /km`;
  };

  const getInitials = (name: string) => {
    const clean = (name || "A").replace(/\(.*\)/, "").trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return clean.slice(0, 2).toUpperCase();
  };

  const isIntervalsConnected = Boolean(intervalsAthleteId && intervalsApiKey);

  return (
    <div className={styles.dashboardContainer}>
      {/* Unified Hero Header Card */}
      <header className={styles.heroHeader}>
        <div className={styles.heroTitleGroup}>
          <div className={styles.heroIconWrap}>
            <Users size={22} />
          </div>
          <div>
            <div className={styles.heroTitleRow}>
              <h1 className={styles.headerTitle}>Espace Coaching & Planification</h1>
              {isIntervalsConnected ? (
                <span className={styles.heroPill} title={`Connecté à l'ID Intervals.icu : ${intervalsAthleteId}`}>
                  <ShieldCheck size={12} style={{ display: "inline", marginRight: 4, verticalAlign: "text-bottom" }} />
                  COMPTE LIÉ ({intervalsAthleteId})
                </span>
              ) : (
                <span className={styles.heroPill} style={{ background: "rgba(245, 158, 11, 0.12)", color: "#D97706", borderColor: "rgba(245, 158, 11, 0.25)" }}>
                  INTERVALS.ICU NON CONFIGURÉ
                </span>
              )}
            </div>
            <p className={styles.headerSubtitle}>
              Données strictement isolées pour votre compte <strong>{currentUser?.email}</strong> — Charge (CTL / ATL / TSB), macrocycles IA et calibrage course.
            </p>
          </div>
        </div>

        <div className={styles.heroActions}>
          <button
            type="button"
            onClick={() => setShowConfigModal(true)}
            className="btn btn-secondary"
            title="Configurer votre clé API personnelle Intervals.icu"
          >
            <SlidersHorizontal size={16} />
            <span>{isIntervalsConnected ? "Mon API Intervals" : "Connecter Intervals.icu"}</span>
          </button>
          <button
            type="button"
            onClick={handleFetchAthletes}
            disabled={isFetchingAthletes}
            className="btn btn-primary"
          >
            <RefreshCw size={16} className={isFetchingAthletes ? "lucide-spin" : ""} />
            <span>{isFetchingAthletes ? "Synchronisation..." : "Synchroniser mes données"}</span>
          </button>
        </div>
      </header>

      {/* Global KPI Summary & Quick Tools Bar */}
      <section className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIconCoral}>
            <Users size={18} />
          </div>
          <div>
            <span className={styles.kpiLabel}>Profils suivis</span>
            <div className={styles.kpiValue}>{kpiStats.count}</div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIconAmber}>
            <TrendingUp size={18} />
          </div>
          <div>
            <span className={styles.kpiLabel}>Fitness Moyen (CTL)</span>
            <div className={styles.kpiValue}>{kpiStats.avgCtl} <small>pts</small></div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIconMint}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <span className={styles.kpiLabel}>Zone Optimale / Prêts</span>
            <div className={styles.kpiValue}>
              {kpiStats.optimalCount} <small>/ {kpiStats.count}</small>
            </div>
          </div>
        </div>

        <div className={styles.quickToolsCard}>
          <span className={styles.quickToolsLabel}>Accès Rapide Studio</span>
          <div className={styles.quickToolsLinks}>
            <Link href="/coach-ia" className={styles.quickToolChip}>
              <Sparkles size={14} className={styles.chipIconCoral} />
              <span>Coach IA</span>
            </Link>
            <Link href="/workouts" className={styles.quickToolChip}>
              <BookOpen size={14} className={styles.chipIconMint} />
              <span>Séances</span>
            </Link>
            <Link href="/comparator" className={styles.quickToolChip}>
              <GitCompare size={14} className={styles.chipIconCoral} />
              <span>Comparateur</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Filter & Search Toolbar */}
      {athletes.length > 0 && (
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un profil ou un objectif..."
              className={styles.searchInput}
            />
          </div>

          <div className={styles.filterPills}>
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`${styles.filterPill} ${statusFilter === "ALL" ? styles.filterPillActive : ""}`}
            >
              Tous ({athletes.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("PEAK")}
              className={`${styles.filterPill} ${statusFilter === "PEAK" ? styles.filterPillActive : ""}`}
            >
              Pic / Fraîcheur
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("LOAD")}
              className={`${styles.filterPill} ${statusFilter === "LOAD" ? styles.filterPillActive : ""}`}
            >
              En charge
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("FATIGUE")}
              className={`${styles.filterPill} ${statusFilter === "FATIGUE" ? styles.filterPillActive : ""}`}
            >
              Fatigue élevée
            </button>
          </div>
        </div>
      )}

      {/* Athletes Cards Grid */}
      {isInitialLoading || authLoading ? (
        <div className={styles.athletesGrid}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={styles.skeletonHeader} />
              <div className={styles.skeletonMetrics} />
              <div className={styles.skeletonFooter} />
            </div>
          ))}
        </div>
      ) : !isIntervalsConnected && athletes.length === 0 ? (
        <div className={styles.emptyState}>
          <Key size={38} className={styles.emptyIcon} />
          <h3>Connectez votre compte personnel Intervals.icu</h3>
          <p style={{ maxWidth: 520 }}>
            Chaque compte <strong>mykairn</strong> dispose d&apos;un espace Coaching et d&apos;identifiants Intervals.icu 100% privés et isolés. Renseignez votre Athlete ID et votre clé API personnelle pour charger votre profil ou vos athlètes suivis.
          </p>
          <button
            type="button"
            onClick={() => setShowConfigModal(true)}
            className="btn btn-primary"
          >
            <Key size={16} />
            Configurer mes identifiants Intervals.icu
          </button>
        </div>
      ) : filteredAthletes.length === 0 ? (
        <div className={styles.emptyState}>
          <Users size={36} className={styles.emptyIcon} />
          <h3>Aucun profil ne correspond à votre filtre</h3>
          <p>Modifiez votre recherche ou relancez une synchronisation avec votre compte Intervals.icu.</p>
          <button
            type="button"
            onClick={() => { setSearchQuery(""); setStatusFilter("ALL"); }}
            className="btn btn-secondary"
          >
            Réinitialiser les filtres
          </button>
        </div>
      ) : (
        <div className={styles.athletesGrid}>
          {filteredAthletes.map((athlete) => {
            const formVal = athlete.form || 0;
            const formState = getFormState(formVal);
            const ctlVal = athlete.ctl || 0;
            const atlVal = athlete.atl || 0;
            const ctlProgress = Math.min(100, Math.round((ctlVal / 120) * 100));

            return (
              <article key={athlete.id} className={styles.athleteCard}>
                {/* Card Top: Avatar + Name + Form Status Badge */}
                <div className={styles.cardHeader}>
                  <Link href={`/athletes/${athlete.id}`} className={styles.athleteIdentity}>
                    <div className={styles.avatarCircle}>
                      {getInitials(athlete.name)}
                    </div>
                    <div className={styles.athleteNameWrap}>
                      <h2 className={styles.athleteName}>{athlete.name}</h2>
                      <span className={styles.athleteIdTag}>ID: {athlete.id}</span>
                    </div>
                  </Link>
                  <span className={`${styles.statusBadge} ${formState.badgeClass}`}>
                    {formState.label}
                  </span>
                </div>

                {/* PMC Load Triad (CTL / ATL / TSB) */}
                <div className={styles.pmcBox}>
                  <div className={styles.pmcColumns}>
                    <div className={styles.pmcCol}>
                      <span className={styles.pmcLabel}>Fitness (CTL)</span>
                      <span className={`${styles.pmcValue} ${styles.valCtl}`}>{ctlVal}</span>
                    </div>
                    <div className={styles.pmcDivider} />
                    <div className={styles.pmcCol}>
                      <span className={styles.pmcLabel}>Fatigue (ATL)</span>
                      <span className={`${styles.pmcValue} ${styles.valAtl}`}>{atlVal}</span>
                    </div>
                    <div className={styles.pmcDivider} />
                    <div className={styles.pmcCol}>
                      <span className={styles.pmcLabel}>Forme (TSB)</span>
                      <span className={`${styles.pmcValue} ${formVal < -10 ? styles.valTsbNeg : formVal > 0 ? styles.valTsbPos : styles.valTsbNeutral}`}>
                        {formVal > 0 ? `+${formVal}` : formVal}
                      </span>
                    </div>
                  </div>
                  <div className={styles.pmcBarTrack} title={`Niveau d'endurance CTL : ${ctlVal}/120`}>
                    <div className={styles.pmcBarFill} style={{ width: `${ctlProgress}%` }} />
                  </div>
                </div>

                {/* 2x2 Physiological Specs Grid */}
                <div className={styles.physioGrid}>
                  <div className={styles.physioItem}>
                    <Flame size={14} className={styles.physioIconCoral} />
                    <div>
                      <span className={styles.physioLabel}>FTP / Puissance</span>
                      <strong className={styles.physioVal}>{athlete.ftp ? `${athlete.ftp} W` : "-"}</strong>
                    </div>
                  </div>
                  <div className={styles.physioItem}>
                    <Watch size={14} className={styles.physioIconMint} />
                    <div>
                      <span className={styles.physioLabel}>Allure Seuil</span>
                      <strong className={styles.physioVal}>{formatPace(athlete.thresholdPace)}</strong>
                    </div>
                  </div>
                  <div className={styles.physioItem}>
                    <Heart size={14} className={styles.physioIconRose} />
                    <div>
                      <span className={styles.physioLabel}>FC Repos</span>
                      <strong className={styles.physioVal}>{athlete.restingHR ? `${athlete.restingHR} bpm` : "-"}</strong>
                    </div>
                  </div>
                  <div className={styles.physioItem}>
                    <Activity size={14} className={styles.physioIconSlate} />
                    <div>
                      <span className={styles.physioLabel}>Poids</span>
                      <strong className={styles.physioVal}>{athlete.weight ? `${athlete.weight} kg` : "-"}</strong>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className={styles.cardFooter}>
                  <div className={styles.secondaryActions}>
                    <Link
                      href={`/comparator?athlete=${encodeURIComponent(athlete.name || "")}&athleteId=${encodeURIComponent(athlete.id || "")}`}
                      className={styles.actionChip}
                      title="Comparer une course ou calibrer un roadbook pour cet athlète"
                    >
                      <GitCompare size={14} />
                      <span>Comparateur</span>
                    </Link>
                    <Link
                      href={`/athletes/${athlete.id}/coach`}
                      className={styles.actionChip}
                      title="Générer un nouveau macrocycle IA sur-mesure"
                    >
                      <Calendar size={14} />
                      <span>Créer Plan IA</span>
                    </Link>
                  </div>

                  <Link href={`/athletes/${athlete.id}`} className={styles.primaryActionBtn}>
                    <span>Profil & Saison</span>
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Intervals.icu Configuration Modal */}
      {showConfigModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div className={styles.heroIconWrap}>
                <SlidersHorizontal size={18} />
              </div>
              <div>
                <h3 className={styles.modalTitle}>Connexion Privée Intervals.icu</h3>
                <p className={styles.modalSubtitle}>
                  Ces identifiants sont rattachés exclusivement à votre compte <strong>{currentUser?.email}</strong>.
                </p>
              </div>
            </div>

            <div className={styles.modalForm}>
              <div className="input-group">
                <label className="input-label">Votre ID Athlète ou Coach (Athlete ID)</label>
                <input
                  type="text"
                  value={intervalsAthleteId}
                  onChange={(e) => setIntervalsAthleteId(e.target.value)}
                  placeholder="ex: i12345"
                />
              </div>
              <div className="input-group">
                <label className="input-label">Votre Clé API Personnelle (API Key)</label>
                <input
                  type="password"
                  value={intervalsApiKey}
                  onChange={(e) => setIntervalsApiKey(e.target.value)}
                  placeholder="ex: 489a8b12c..."
                />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="btn btn-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveConfigAndFetch}
                className="btn btn-primary"
              >
                Sauvegarder sur mon compte & Synchroniser
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
