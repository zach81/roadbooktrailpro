"use client";

import { useState, useEffect } from "react";
import { 
  Key, User, CheckCircle2, AlertCircle, Loader2, Save, 
  ExternalLink, ShieldCheck, Eye, EyeOff, RefreshCw, Zap
} from "lucide-react";
import { fetchAthleteFullProfile } from "@/lib/intervalsApi";

export default function SettingsPage() {
  const [athleteId, setAthleteId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; athlete?: any } | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const storedId = localStorage.getItem("intervalsAthleteId") || "";
    const storedKey = localStorage.getItem("intervalsApiKey") || "";
    setAthleteId(storedId);
    setApiKey(storedKey);
  }, []);

  const handleTestConnection = async () => {
    if (!athleteId.trim() || !apiKey.trim()) {
      setTestResult({
        success: false,
        message: "Veuillez renseigner à la fois votre ID Athlète et votre clé API Intervals.icu."
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const profile = await fetchAthleteFullProfile(athleteId.trim(), apiKey.trim());
      if (profile && !profile.error && profile.name) {
        setTestResult({
          success: true,
          message: `Connexion réussie ! Athlète connecté : ${profile.name} (CTL: ${profile.ctl ?? '-'}, ATL: ${profile.atl ?? '-'})`,
          athlete: profile
        });
      } else {
        setTestResult({
          success: false,
          message: profile?.error || "Identifiants invalides ou athlète introuvable. Vérifiez votre ID et votre clé API."
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Erreur de connexion : ${err.message || 'Impossible de joindre Intervals.icu'}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    localStorage.setItem("intervalsAthleteId", athleteId.trim());
    localStorage.setItem("intervalsApiKey", apiKey.trim());
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="flex-1 bg-gradient-to-br from-slate-50 via-white to-orange-50/20 p-4 md:p-8 min-h-screen">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="bg-white p-6 rounded-2xl shadow-xs border border-gray-100 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              Paramètres
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              Configurez vos accès Intervals.icu et vos préférences d'entraînement.
            </p>
          </div>
          <div className="p-3 bg-orange-100 text-orange-600 rounded-xl">
            <Key size={24} />
          </div>
        </header>

        {/* Intervals.icu Configuration */}
        <section className="bg-white p-6 md:p-8 rounded-2xl shadow-xs border border-gray-100 space-y-6">
          <div className="flex items-start justify-between border-b border-gray-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                Connexion Intervals.icu
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Nécessaire pour interroger votre base d'entraînement, vos séances, votre forme (CTL/ATL) et synchroniser avec l'IA.
              </p>
            </div>
            <a 
              href="https://intervals.icu/settings" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-200 transition"
            >
              Obtenir ma clé <ExternalLink size={12} />
            </a>
          </div>

          <div className="space-y-4">
            {/* Athlete ID */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Identifiant Athlète (Athlete ID)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={athleteId}
                  onChange={(e) => setAthleteId(e.target.value)}
                  placeholder="Ex: i12345 ou votre ID Intervals.icu"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Visible dans l'URL de votre profil sur Intervals.icu (ex: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">intervals.icu/athlete/i12345</code>).
              </p>
            </div>

            {/* API Key */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Clé API Intervals.icu
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Collez votre clé API ici..."
                  className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 transition"
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Générez votre clé dans <a href="https://intervals.icu/settings" target="_blank" rel="noreferrer" className="text-orange-600 underline">Paramètres Intervals.icu</a> &gt; section <strong>Developer</strong>.
              </p>
            </div>
          </div>

          {/* Test connection alert */}
          {testResult && (
            <div className={`p-4 rounded-xl border text-sm flex items-start gap-3 ${
              testResult.success 
                ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                : "bg-red-50 border-red-200 text-red-800"
            }`}>
              {testResult.success ? (
                <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={18} />
              ) : (
                <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
              )}
              <div className="space-y-1">
                <p className="font-semibold">{testResult.message}</p>
                {testResult.athlete && (
                  <div className="flex gap-4 text-xs mt-2 text-emerald-700">
                    <span><strong>Poids :</strong> {testResult.athlete.weightKg ? `${testResult.athlete.weightKg} kg` : 'N/C'}</span>
                    <span><strong>FC Max :</strong> {testResult.athlete.maxHR ? `${testResult.athlete.maxHR} bpm` : 'N/C'}</span>
                    <span><strong>FTP :</strong> {testResult.athlete.ftp ? `${testResult.athlete.ftp} W` : 'N/C'}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              onClick={handleTestConnection}
              disabled={isTesting || !athleteId || !apiKey}
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition"
            >
              {isTesting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Tester la connexion
            </button>

            <button
              onClick={handleSave}
              disabled={!athleteId || !apiKey}
              className="w-full sm:w-auto px-6 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-sm"
            >
              <Save size={16} />
              Enregistrer mes identifiants
            </button>

            {isSaved && (
              <span className="text-emerald-600 text-xs font-semibold flex items-center gap-1 animate-fade-in">
                <CheckCircle2 size={16} /> Enregistré dans votre navigateur !
              </span>
            )}
          </div>
        </section>

        {/* AI & Coach status */}
        <section className="bg-white p-6 rounded-2xl shadow-xs border border-gray-100 space-y-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Zap size={18} className="text-yellow-500" />
            Statut du Coach IA & Outils d'interrogation
          </h2>
          <div className="p-4 bg-slate-50 rounded-xl space-y-2 text-xs text-slate-600">
            <div className="flex items-center justify-between">
              <span>Moteur d'Intelligence Artificielle :</span>
              <span className="font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Gemini Pro / Flash
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Interrogation en temps réel Intervals.icu :</span>
              <span className={`font-semibold px-2 py-0.5 rounded border ${
                athleteId && apiKey 
                  ? "text-emerald-700 bg-emerald-50 border-emerald-200" 
                  : "text-amber-700 bg-amber-50 border-amber-200"
              }`}>
                {athleteId && apiKey ? "Activée (Profil, Séances, Wellness, Événements)" : "En attente des clés ci-dessus"}
              </span>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
