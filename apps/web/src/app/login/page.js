"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buildStravaOAuthUrl } from "@/lib/stravaClient";
import styles from "./auth.module.css";

function StravaLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Strava Auth State
  const [showStravaConfig, setShowStravaConfig] = useState(false);
  const [stravaMode, setStravaMode] = useState("oauth"); // 'oauth' | 'token'
  const [stravaClientId, setStravaClientId] = useState("");
  const [stravaClientSecret, setStravaClientSecret] = useState("");
  const [stravaAccessToken, setStravaAccessToken] = useState("");
  const [stravaRefreshToken, setStravaRefreshToken] = useState("");
  const [pendingOAuthCode, setPendingOAuthCode] = useState("");

  const { login, loginWithGoogle, loginWithStrava } = useAuth();
  const router = useRouter();
  const oauthHandledRef = useRef(false);

  // Load saved Strava app credentials & handle OAuth2 redirect (?code=...)
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

  async function handleStravaOAuthCodeExchange(code, clientIdOverride, clientSecretOverride) {
    try {
      setError("");
      setStatusMessage("Connexion à votre compte Strava en cours...");
      setLoading(true);
      await loginWithStrava({
        code,
        clientId: clientIdOverride ?? stravaClientId,
        clientSecret: clientSecretOverride ?? stravaClientSecret,
      });
      router.push("/dashboard");
    } catch (err) {
      console.error("Strava OAuth login error:", err);
      setStatusMessage("");
      if (err.missingAppCredentials) {
        setPendingOAuthCode(code);
        setShowStravaConfig(true);
        setStravaMode("oauth");
      }
      setError(err.message || "Échec de la connexion avec Strava.");
    } finally {
      setLoading(false);
    }
  }

  async function handleStravaButtonClick() {
    setError("");

    // Si on a déjà reçu un code OAuth en attente de Client ID/Secret
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
    } catch (err) {
      setShowStravaConfig(true);
      setError(err.message);
    }
  }

  async function handleStravaTokenLogin(e) {
    e.preventDefault();
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
      router.push("/dashboard");
    } catch (err) {
      console.error("Strava direct token login error:", err);
      setStatusMessage("");
      setError(err.message || "Échec de la connexion avec le jeton Strava.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setError("");
      setLoading(true);
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      console.error("Email login error:", err);
      setError("Échec de la connexion. Vérifiez vos identifiants: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    try {
      setError("");
      setLoading(true);
      await loginWithGoogle();
      router.push("/dashboard");
    } catch (err) {
      console.error("Google sign-in error:", err);
      setError("Échec de la connexion avec Google: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.authContainer}>
      <div className={`card ${styles.authCard}`}>
        <h2 className={styles.title}>Connexion</h2>
        <p className={styles.subtitle}>
          Accédez à vos Roadbooks, votre profil physiologique et vos traces Strava.
        </p>

        {statusMessage && <div className={styles.infoAlert}>{statusMessage}</div>}
        {error && <div className={styles.errorAlert}>{error}</div>}

        {/* Bouton principal : Connexion Strava */}
        <button
          type="button"
          onClick={handleStravaButtonClick}
          disabled={loading}
          className={styles.stravaBtn}
        >
          <StravaLogo />
          <span>Continuer avec Strava</span>
        </button>

        <div className={styles.stravaHelperRow}>
          <button
            type="button"
            onClick={() => setShowStravaConfig(!showStravaConfig)}
            className={styles.stravaConfigToggle}
          >
            {showStravaConfig
              ? "Masquer les options API Strava"
              : "Configurer Client ID ou se connecter par Access Token Strava"}
          </button>
        </div>

        {showStravaConfig && (
          <div className={styles.stravaPanel}>
            <div className={styles.stravaPanelTitle}>
              <span>⚡ Connexion Strava (API v3)</span>
              <a
                href="https://www.strava.com/settings/api"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#FC4C02", textDecoration: "underline", fontSize: "0.75rem" }}
              >
                strava.com/settings/api ↗
              </a>
            </div>

            <div className={styles.stravaTabs}>
              <button
                type="button"
                onClick={() => setStravaMode("oauth")}
                className={`${styles.stravaTabBtn} ${
                  stravaMode === "oauth" ? styles.stravaTabBtnActive : ""
                }`}
              >
                OAuth 1-Clic (Client ID)
              </button>
              <button
                type="button"
                onClick={() => setStravaMode("token")}
                className={`${styles.stravaTabBtn} ${
                  stravaMode === "token" ? styles.stravaTabBtnActive : ""
                }`}
              >
                Access Token direct
              </button>
            </div>

            {stravaMode === "oauth" ? (
              <div>
                <p style={{ margin: "0 0 8px 0", color: "#64748B", lineHeight: 1.4 }}>
                  Sur{" "}
                  <a
                    href="https://www.strava.com/settings/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#FC4C02", fontWeight: 600 }}
                  >
                    strava.com/settings/api
                  </a>
                  , mettez{" "}
                  <code style={{ background: "#FFF", padding: "1px 4px", borderRadius: 4 }}>
                    {typeof window !== "undefined" ? window.location.hostname : "localhost"}
                  </code>{" "}
                  comme <em>Authorization Callback Domain</em>, puis renseignez :
                </p>
                <div className="input-group" style={{ marginBottom: 8 }}>
                  <label className="input-label" style={{ fontSize: "0.75rem" }}>
                    Client ID Strava
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ex: 123456"
                    value={stravaClientId}
                    onChange={(e) => setStravaClientId(e.target.value)}
                  />
                </div>
                <div className="input-group" style={{ marginBottom: 10 }}>
                  <label className="input-label" style={{ fontSize: "0.75rem" }}>
                    Client Secret Strava
                  </label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="Ex: a1b2c3d4e5f6..."
                    value={stravaClientSecret}
                    onChange={(e) => setStravaClientSecret(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleStravaButtonClick}
                  disabled={loading || !stravaClientId.trim()}
                  className={styles.stravaBtn}
                  style={{ padding: "9px 14px", fontSize: "0.85rem" }}
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
              <div>
                <p style={{ margin: "0 0 8px 0", color: "#64748B", lineHeight: 1.4 }}>
                  Collez directement votre <strong>Access Token</strong> visible sur{" "}
                  <a
                    href="https://www.strava.com/settings/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#FC4C02", fontWeight: 600 }}
                  >
                    strava.com/settings/api
                  </a>{" "}
                  pour vous connecter instantanément :
                </p>
                <div className="input-group" style={{ marginBottom: 8 }}>
                  <label className="input-label" style={{ fontSize: "0.75rem" }}>
                    Access Token Strava
                  </label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="Collez votre Access Token..."
                    value={stravaAccessToken}
                    onChange={(e) => setStravaAccessToken(e.target.value)}
                  />
                </div>
                <div className="input-group" style={{ marginBottom: 10 }}>
                  <label className="input-label" style={{ fontSize: "0.75rem" }}>
                    Refresh Token (optionnel, pour renouvellement auto)
                  </label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="Optionnel : Refresh Token..."
                    value={stravaRefreshToken}
                    onChange={(e) => setStravaRefreshToken(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleStravaTokenLogin}
                  disabled={loading || !stravaAccessToken.trim()}
                  className={styles.stravaBtn}
                  style={{ padding: "9px 14px", fontSize: "0.85rem" }}
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
          onClick={handleGoogleSignIn}
          disabled={loading}
          className={`btn btn-secondary ${styles.fullWidthBtn}`}
        >
          Continuer avec Google
        </button>

        <div className={styles.divider}>ou par email</div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Email</label>
            <input
              type="email"
              className="input-field"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Mot de passe</label>
            <input
              type="password"
              className="input-field"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            disabled={loading}
            type="submit"
            className={`btn btn-primary ${styles.fullWidthBtn}`}
          >
            Se connecter
          </button>
        </form>

        <div className={styles.authLinks}>
          Pas encore de compte ? <Link href="/register">S&apos;inscrire</Link>
        </div>
      </div>
    </div>
  );
}
