"use client";

import React, { useState, useEffect } from "react";
import { Settings as SettingsIcon, Key, CheckCircle2, ExternalLink, ShieldCheck, Lock, AlertCircle, Loader2, HelpCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getUserIntervalsCredentials, saveUserIntervalsCredentials } from "@/lib/firebaseUtils";
import { verifyAndResolveIntervalsConnection, normalizeIntervalsAthleteId, normalizeIntervalsApiKey } from "@/lib/intervalsApi";

export default function SettingsPage() {
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const [intervalsAthleteId, setIntervalsAthleteId] = useState("");
  const [intervalsApiKey, setIntervalsApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showGuide, setShowGuide] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    setIntervalsAthleteId("");
    setIntervalsApiKey("");

    if (!currentUser?.uid || !isAdmin) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    getUserIntervalsCredentials(currentUser.uid)
      .then((creds) => {
        if (cancelled) return;
        setIntervalsAthleteId(creds.athleteId);
        setIntervalsApiKey(creds.apiKey);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid, isAdmin, authLoading]);

  if (!authLoading && currentUser && !isAdmin) {
    return null;
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.uid) return;
    setIsSaving(true);
    setTestResult(null);
    try {
      const cleanId = normalizeIntervalsAthleteId(intervalsAthleteId);
      const cleanKey = normalizeIntervalsApiKey(intervalsApiKey);
      setIntervalsAthleteId(cleanId);
      setIntervalsApiKey(cleanKey);
      await saveUserIntervalsCredentials(currentUser.uid, cleanId, cleanKey);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err) {
      alert("Erreur lors de la sauvegarde de vos paramètres Intervals.icu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAndAutoDetect = async () => {
    if (!currentUser?.uid) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const cleanKey = normalizeIntervalsApiKey(intervalsApiKey);
      const verified = await verifyAndResolveIntervalsConnection(intervalsAthleteId || "0", cleanKey);
      if (!verified.ok) {
        setTestResult({
          type: "error",
          text: verified.error || "Impossible de vérifier vos identifiants Intervals.icu.",
        });
        return;
      }
      setIntervalsAthleteId(verified.resolvedAthleteId);
      setIntervalsApiKey(cleanKey);
      await saveUserIntervalsCredentials(currentUser.uid, verified.resolvedAthleteId, cleanKey);
      setTestResult({
        type: "success",
        text: `Connexion validée ! Compte : ${verified.athleteName} (ID résolu : ${verified.resolvedAthleteId}${verified.ctl ? ` • CTL ${verified.ctl}` : ""})`,
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err: any) {
      setTestResult({
        type: "error",
        text: err.message || "Impossible de vérifier vos identifiants Intervals.icu.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-7 space-y-6">
      <header className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 sm:p-6 shadow-sm flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 text-[var(--color-primary)] flex items-center justify-center shrink-0">
          <SettingsIcon size={22} />
        </div>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-extrabold text-[var(--text-primary)] m-0 tracking-tight">
              Paramètres Coaching & API
            </h1>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              ISOLATION PAR COMPTE
            </span>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5 m-0">
            Identifiants privés associés uniquement au compte <strong>{currentUser?.email || "connecté"}</strong>.
          </p>
        </div>
      </header>

      <div className="card p-6 md:p-8">
        <div className="flex items-start justify-between gap-4 mb-6 pb-5 border-b border-[var(--border-subtle)] flex-wrap">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-orange-50 text-[var(--color-primary)]">
              <Key size={22} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-[var(--text-primary)] m-0">Intégration Personnelle Intervals.icu</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1 mb-0">
                Synchronisez votre propre profil d&apos;athlète (ou vos athlètes suivis), votre charge (CTL, ATL, TSB) et vos sorties intitulées « Course » en toute confidentialité.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className="btn btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <HelpCircle size={14} />
            {showGuide ? "Masquer le guide" : "Comment lier Intervals.icu ?"}
          </button>
        </div>

        {showGuide && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/25 space-y-2.5 text-xs text-[var(--text-secondary)]">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <strong className="text-sm font-extrabold text-[var(--text-primary)]">
                📘 Comment lier Intervals.icu sans erreur 401 :
              </strong>
              <a
                href="https://intervals.icu/settings"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-primary)] font-bold hover:underline inline-flex items-center gap-1"
              >
                Ouvrir intervals.icu/settings <ExternalLink size={12} />
              </a>
            </div>
            <ol className="list-decimal pl-5 space-y-1.5 leading-relaxed m-0">
              <li>
                <strong>Clé API (Developer Key) :</strong> Sur <code>intervals.icu/settings</code>, descendez jusqu&apos;à la rubrique <strong>Developer Settings</strong> et cliquez sur <strong>View / Generate API Key</strong>. Copiez la clé (⚠️ <em>ne saisissez pas votre mot de passe de connexion</em>).
              </li>
              <li>
                <strong>ID Athlète :</strong> Commence par <code>i</code> suivi de chiffres (ex: <code>i467323</code>). Si vous ne le connaissez pas, laissez <code>0</code> ou cliquez sur <strong>« Tester &amp; Auto-détecter mon ID »</strong>.
              </li>
              <li>
                <strong>Calibrage par les Courses :</strong> Intitulez vos compétitions avec le mot <strong>« Course »</strong> sur Intervals.icu pour profiler automatiquement l&apos;ITRA, le seuil de marche, l&apos;agilité en descente et la fatigue.
              </li>
            </ol>
          </div>
        )}

        {isLoading ? (
          <div className="py-8 text-center text-sm text-[var(--text-muted)]">Chargement de votre configuration sécurisée...</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            <div className="input-group">
              <label className="input-label">Votre ID Athlète / Coach (Athlete ID)</label>
              <input
                type="text"
                value={intervalsAthleteId}
                onChange={(e) => setIntervalsAthleteId(e.target.value)}
                placeholder="ex: i467323 (ou 0 pour auto-détecter)"
              />
              <span className="text-xs text-[var(--text-muted)] mt-1">
                Visible dans l&apos;URL de votre profil Intervals.icu ou auto-détecté via le bouton de test ci-dessous.
              </span>
            </div>

            <div className="input-group">
              <label className="input-label">Votre Clé API Personnelle (API Key)</label>
              <input
                type="password"
                value={intervalsApiKey}
                onChange={(e) => setIntervalsApiKey(e.target.value)}
                placeholder="Votre clé API Developer Settings..."
                required
              />
              <span className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-1">
                Générez votre clé personnelle sur{" "}
                <a
                  href="https://intervals.icu/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-primary)] font-semibold hover:underline inline-flex items-center gap-1"
                >
                  intervals.icu/settings <ExternalLink size={12} />
                </a>{" "}
                (section Developer Settings &gt; API Key).
              </span>
            </div>

            {testResult && (
              <div
                className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs font-bold ${
                  testResult.type === "success"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                    : "bg-red-500/10 border-red-500/30 text-red-600"
                }`}
              >
                {testResult.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{testResult.text}</span>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center gap-3 text-xs text-[var(--text-secondary)]">
              <Lock size={18} className="text-emerald-500 shrink-0" />
              <span>
                <strong>Sécurité & Isolation :</strong> vos identifiants et vos données Intervals.icu sont stockés dans votre espace privé Firestore (<code>users/{currentUser?.uid}</code> et <code>coaches/{currentUser?.uid}</code>) protégé par les règles Firebase.
              </span>
            </div>

            <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
              <div>
                {isSaved && (
                  <span className="text-emerald-600 font-bold text-sm flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full">
                    <CheckCircle2 size={16} /> Paramètres sauvegardés sur votre compte !
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleTestAndAutoDetect}
                  disabled={isTesting || isSaving || !intervalsApiKey.trim()}
                  className="btn btn-secondary flex items-center gap-1.5"
                >
                  {isTesting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  <span>{isTesting ? "Test en cours..." : "Tester & Auto-détecter mon ID"}</span>
                </button>
                <button type="submit" disabled={isSaving || isTesting} className="btn btn-primary">
                  {isSaving ? "Enregistrement..." : "Enregistrer sur mon compte"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
