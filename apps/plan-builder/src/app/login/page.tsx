"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { buildStravaOAuthUrl } from "@/lib/stravaApi";

function StravaLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Strava Auth State
  const [showStravaConfig, setShowStravaConfig] = useState(false);
  const [stravaMode, setStravaMode] = useState<"oauth" | "token">("oauth");
  const [stravaClientId, setStravaClientId] = useState("");
  const [stravaClientSecret, setStravaClientSecret] = useState("");
  const [stravaAccessToken, setStravaAccessToken] = useState("");
  const [stravaRefreshToken, setStravaRefreshToken] = useState("");
  const [pendingOAuthCode, setPendingOAuthCode] = useState("");

  const { login, loginWithGoogle, loginWithStrava } = useAuth();
  const router = useRouter();
  const oauthHandledRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedClientId = localStorage.getItem("mykairn_strava_client_id") || "";
    const savedClientSecret = localStorage.getItem("mykairn_strava_client_secret") || "";
    if (savedClientId) setStravaClientId(savedClientId);
    if (savedClientSecret) setStravaClientSecret(savedClientSecret);

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const oauthErr = params.get("error");

    if (oauthErr) {
      setError("Autorisation Strava annulée ou refusée.");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (code && !oauthHandledRef.current) {
      oauthHandledRef.current = true;
      window.history.replaceState({}, "", window.location.pathname);
      handleStravaOAuthCodeExchange(code, savedClientId, savedClientSecret);
    }
  }, []);

  async function handleStravaOAuthCodeExchange(
    code: string,
    clientIdOverride?: string,
    clientSecretOverride?: string
  ) {
    try {
      setError("");
      setStatusMessage("Connexion à votre compte Strava en cours...");
      setLoading(true);
      await loginWithStrava({
        code,
        clientId: clientIdOverride ?? stravaClientId,
        clientSecret: clientSecretOverride ?? stravaClientSecret,
      });
      router.push("/");
    } catch (err: any) {
      console.error("Strava OAuth login error:", err);
      setStatusMessage("");
      if (err?.missingAppCredentials) {
        setPendingOAuthCode(code);
        setShowStravaConfig(true);
        setStravaMode("oauth");
      }
      setError(err?.message || "Échec de la connexion avec Strava.");
    } finally {
      setLoading(false);
    }
  }

  async function handleStravaButtonClick() {
    setError("");

    if (pendingOAuthCode && stravaClientId.trim() && stravaClientSecret.trim()) {
      localStorage.setItem("mykairn_strava_client_id", stravaClientId.trim());
      localStorage.setItem("mykairn_strava_client_secret", stravaClientSecret.trim());
      await handleStravaOAuthCodeExchange(
        pendingOAuthCode,
        stravaClientId.trim(),
        stravaClientSecret.trim()
      );
      return;
    }

    const effectiveClientId = (
      stravaClientId ||
      process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID ||
      ""
    ).trim();

    if (!effectiveClientId) {
      setShowStravaConfig(true);
      return;
    }

    try {
      if (stravaClientId.trim()) {
        localStorage.setItem("mykairn_strava_client_id", stravaClientId.trim());
      }
      if (stravaClientSecret.trim()) {
        localStorage.setItem("mykairn_strava_client_secret", stravaClientSecret.trim());
      }

      const redirectUri = `${window.location.origin}${window.location.pathname}`;
      const oauthUrl = buildStravaOAuthUrl({
        clientId: effectiveClientId,
        redirectUri,
      });
      window.location.href = oauthUrl;
    } catch (err: any) {
      setShowStravaConfig(true);
      setError(err?.message || "Erreur de configuration Strava.");
    }
  }

  async function handleStravaTokenLogin() {
    if (!stravaAccessToken.trim() && !stravaRefreshToken.trim()) {
      setError("Veuillez coller votre Access Token Strava.");
      return;
    }

    try {
      setError("");
      setStatusMessage("Vérification de votre profil Strava...");
      setLoading(true);

      if (stravaClientId.trim()) {
        localStorage.setItem("mykairn_strava_client_id", stravaClientId.trim());
      }
      if (stravaClientSecret.trim()) {
        localStorage.setItem("mykairn_strava_client_secret", stravaClientSecret.trim());
      }

      await loginWithStrava({
        accessToken: stravaAccessToken.trim(),
        refreshToken: stravaRefreshToken.trim(),
        clientId: stravaClientId.trim(),
        clientSecret: stravaClientSecret.trim(),
      });
      router.push("/");
    } catch (err: any) {
      console.error("Strava direct token login error:", err);
      setStatusMessage("");
      setError(err?.message || "Échec de la connexion avec le jeton Strava.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError("");
      setLoading(true);
      await login(email, password);
      router.push("/");
    } catch (err: any) {
      setError("Échec de la connexion. Vérifiez vos identifiants.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    try {
      setError("");
      setLoading(true);
      await loginWithGoogle();
      router.push("/");
    } catch (err: any) {
      setError("Échec de la connexion avec Google.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-2xl shadow-lg border border-slate-200/80">
        <div className="flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-[#FF5A36] text-[11px] font-extrabold uppercase tracking-wider mb-3">
            Espace Personnel Sécurisé
          </div>
          <h2 className="text-center text-3xl font-extrabold text-slate-900 tracking-tight">
            my<span className="text-[#FF5A36]">kairn</span>{" "}
            <span className="text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-orange-50 text-[#FF5A36] border border-orange-200 align-middle">
              Coach & Comparateur
            </span>
          </h2>
          <p className="mt-2 text-center text-sm text-slate-600">
            Connectez-vous avec Strava, Google ou votre email pour accéder à vos analyses et vos données personnelles.
          </p>
        </div>

        {statusMessage && (
          <div className="bg-orange-50 text-[#C2410C] p-3 rounded-xl text-sm text-center font-semibold border border-orange-200">
            {statusMessage}
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm text-center font-semibold border border-red-200">
            {error}
          </div>
        )}

        {/* Connexion rapide Strava & Google */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleStravaButtonClick}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl shadow-md bg-[#FC4C02] hover:bg-[#E34402] text-sm font-bold text-white transition-all disabled:opacity-50 cursor-pointer"
          >
            <StravaLogo />
            <span>Continuer avec Strava</span>
          </button>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setShowStravaConfig(!showStravaConfig)}
              className="text-xs font-semibold text-[#FC4C02] hover:underline cursor-pointer"
            >
              {showStravaConfig
                ? "Masquer les options API Strava"
                : "Configurer Client ID ou se connecter par Access Token Strava"}
            </button>
          </div>

          {showStravaConfig && (
            <div className="p-3.5 rounded-xl bg-orange-50/70 border border-orange-200 text-xs space-y-2.5">
              <div className="flex items-center justify-between font-bold text-[#C2410C]">
                <span>⚡ Connexion Strava (API v3)</span>
                <a
                  href="https://www.strava.com/settings/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#FC4C02] underline"
                >
                  strava.com/settings/api ↗
                </a>
              </div>

              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setStravaMode("oauth")}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-bold border cursor-pointer ${
                    stravaMode === "oauth"
                      ? "bg-[#FC4C02] text-white border-[#FC4C02]"
                      : "bg-white text-slate-600 border-orange-200"
                  }`}
                >
                  OAuth 1-Clic (Client ID)
                </button>
                <button
                  type="button"
                  onClick={() => setStravaMode("token")}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-bold border cursor-pointer ${
                    stravaMode === "token"
                      ? "bg-[#FC4C02] text-white border-[#FC4C02]"
                      : "bg-white text-slate-600 border-orange-200"
                  }`}
                >
                  Access Token direct
                </button>
              </div>

              {stravaMode === "oauth" ? (
                <div className="space-y-2">
                  <p className="text-slate-600 leading-relaxed">
                    Sur{" "}
                    <a
                      href="https://www.strava.com/settings/api"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#FC4C02] font-bold underline"
                    >
                      strava.com/settings/api
                    </a>
                    , mettez{" "}
                    <code className="bg-white px-1 py-0.5 rounded border border-orange-200">
                      {typeof window !== "undefined" ? window.location.hostname : "localhost"}
                    </code>{" "}
                    comme <em>Authorization Callback Domain</em> :
                  </p>
                  <input
                    type="text"
                    placeholder="Client ID Strava (ex: 123456)"
                    value={stravaClientId}
                    onChange={(e) => setStravaClientId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 text-xs"
                  />
                  <input
                    type="password"
                    placeholder="Client Secret Strava"
                    value={stravaClientSecret}
                    onChange={(e) => setStravaClientSecret(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleStravaButtonClick}
                    disabled={loading || !stravaClientId.trim()}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#FC4C02] text-white font-bold text-xs disabled:opacity-50 cursor-pointer"
                  >
                    <StravaLogo />
                    <span>
                      {pendingOAuthCode
                        ? "Finaliser la connexion Strava"
                        : "Autoriser sur Strava.com"}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-slate-600 leading-relaxed">
                    Collez directement votre <strong>Access Token</strong> depuis{" "}
                    <a
                      href="https://www.strava.com/settings/api"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#FC4C02] font-bold underline"
                    >
                      strava.com/settings/api
                    </a>{" "}
                    :
                  </p>
                  <input
                    type="password"
                    placeholder="Access Token Strava..."
                    value={stravaAccessToken}
                    onChange={(e) => setStravaAccessToken(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 text-xs"
                  />
                  <input
                    type="password"
                    placeholder="Optionnel : Refresh Token..."
                    value={stravaRefreshToken}
                    onChange={(e) => setStravaRefreshToken(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleStravaTokenLogin}
                    disabled={loading || !stravaAccessToken.trim()}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#FC4C02] text-white font-bold text-xs disabled:opacity-50 cursor-pointer"
                  >
                    <StravaLogo />
                    <span>Se connecter avec ce jeton Strava</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex justify-center py-2.5 px-4 border border-slate-300 rounded-xl shadow-xs bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 cursor-pointer"
          >
            Continuer avec Google
          </button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase font-bold">
            <span className="px-2 bg-white text-slate-400">Ou par email</span>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Adresse Email
              </label>
              <input
                type="email"
                required
                className="appearance-none relative block w-full px-3.5 py-2.5 border border-slate-300 placeholder-slate-400 text-slate-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF5A36] focus:border-[#FF5A36] sm:text-sm"
                placeholder="athlete@mykairn.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Mot de passe
              </label>
              <input
                type="password"
                required
                className="appearance-none relative block w-full px-3.5 py-2.5 border border-slate-300 placeholder-slate-400 text-slate-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF5A36] focus:border-[#FF5A36] sm:text-sm"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-gradient-to-r from-[#FF5A36] to-[#FF7A59] hover:opacity-95 shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Connexion..." : "Se connecter à mon espace"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
