"use client";

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '@/lib/firebase';
import { User, Upload, Loader2, Info, Activity, Mountain, TrendingUp, TrendingDown, Footprints, Droplets, Utensils, Coffee, HeartPulse, Save, Key, ShieldCheck, CheckCircle2, AlertCircle, ExternalLink, HelpCircle, Trophy, Zap } from 'lucide-react';
import styles from './settings.module.css';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { deriveConfigFromITRA } from '@/lib/roadbookCalculator';
import { normalizeIntervalsApiKey, normalizeIntervalsAthleteId, verifyIntervalsConnection, profileAthleteFromIntervalsRaces } from '@/lib/intervalsClient';
import {
  normalizeStravaToken,
  buildStravaOAuthUrl,
  exchangeStravaOAuthCode,
  verifyStravaConnection,
  profileAthleteFromStravaRaces,
} from '@/lib/stravaClient';
import { motion, AnimatePresence } from 'framer-motion';

const Tooltip = ({ text }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <Info size={16} className="text-gray-400 cursor-help hover:text-emerald-500 transition-colors" />
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute z-10 w-64 p-3 mt-8 bg-gray-800 text-white text-xs rounded-lg shadow-xl right-0 top-0 pointer-events-none"
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function SettingsPage() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const fileInputRef = useRef(null);
  const router = useRouter();

  const [itraIndex, setItraIndex] = useState("");
  const [weight, setWeight] = useState("");

  // Custom config
  const [fatiguePercent, setFatiguePercent] = useState("");
  const [descentThreshold, setDescentThreshold] = useState("");
  const [walkThreshold, setWalkThreshold] = useState("");
  const [upCostDivider, setUpCostDivider] = useState("");
  const [downCostModifier, setDownCostModifier] = useState("");
  const [pacingStrategy, setPacingStrategy] = useState("regular");
  const [paceProfile, setPaceProfile] = useState("coach");

  // Nutrition
  const [carbTarget, setCarbTarget] = useState("");
  const [sodiumTarget, setSodiumTarget] = useState("");
  const [waterTarget, setWaterTarget] = useState("");
  const [caffeineTarget, setCaffeineTarget] = useState("");

  // Connexion Strava Grand Public (propre à ce compte)
  const [stravaAthleteId, setStravaAthleteId] = useState("");
  const [stravaAthleteName, setStravaAthleteName] = useState("");
  const [stravaAvatarUrl, setStravaAvatarUrl] = useState("");
  const [stravaAccessToken, setStravaAccessToken] = useState("");
  const [stravaRefreshToken, setStravaRefreshToken] = useState("");
  const [stravaExpiresAt, setStravaExpiresAt] = useState(null);
  const [stravaClientId, setStravaClientId] = useState("");
  const [stravaClientSecret, setStravaClientSecret] = useState("");
  const [testingStrava, setTestingStrava] = useState(false);
  const [profilingStrava, setProfilingStrava] = useState(false);
  const [stravaStatus, setStravaStatus] = useState(null);
  const [showStravaAdvanced, setShowStravaAdvanced] = useState(false);

  // Connexion Intervals.icu personnelle (propre à ce compte)
  const [intervalsAthleteId, setIntervalsAthleteId] = useState("");
  const [intervalsApiKey, setIntervalsApiKey] = useState("");
  const [testingIntervals, setTestingIntervals] = useState(false);
  const [profilingIntervals, setProfilingIntervals] = useState(false);
  const [intervalsStatus, setIntervalsStatus] = useState(null);
  const [calibProfileResult, setCalibProfileResult] = useState(null);
  const [showIntervalsHelp, setShowIntervalsHelp] = useState(false);

  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    async function loadUserData() {
      try {
        const uid = currentUser.uid;
        if (typeof window !== 'undefined') {
          localStorage.removeItem('intervalsAthleteId');
          localStorage.removeItem('intervalsApiKey');
        }

        const userDoc = await getDoc(doc(db, "users", uid));
        let coachDoc = null;
        try {
          coachDoc = await getDoc(doc(db, "coaches", uid));
        } catch {
          // Ignoré si non-admin (coaches/{uid} est réservé aux administrateurs)
        }

        let foundIntervalsId = "";
        let foundIntervalsKey = "";
        let foundStravaAccess = "";
        let foundStravaRefresh = "";
        let foundStravaExpires = null;
        let foundStravaId = "";
        let foundStravaName = "";
        let foundStravaAvatar = "";
        let foundStravaClientId = "";
        let foundStravaClientSecret = "";

        if (coachDoc && coachDoc.exists()) {
          const cData = coachDoc.data();
          if (cData.intervalsAthleteId) foundIntervalsId = String(cData.intervalsAthleteId).trim();
          if (cData.intervalsApiKey) foundIntervalsKey = String(cData.intervalsApiKey).trim();
        }

        if (userDoc.exists()) {
          const data = userDoc.data();

          if (!foundIntervalsId && data.intervalsAthleteId) foundIntervalsId = String(data.intervalsAthleteId).trim();
          if (!foundIntervalsKey && data.intervalsApiKey) foundIntervalsKey = String(data.intervalsApiKey).trim();

          if (data.stravaAccessToken) foundStravaAccess = String(data.stravaAccessToken).trim();
          if (data.stravaRefreshToken) foundStravaRefresh = String(data.stravaRefreshToken).trim();
          if (data.stravaExpiresAt) foundStravaExpires = Number(data.stravaExpiresAt);
          if (data.stravaAthleteId) foundStravaId = String(data.stravaAthleteId).trim();
          if (data.stravaAthleteName) foundStravaName = String(data.stravaAthleteName).trim();
          if (data.stravaAvatarUrl) foundStravaAvatar = String(data.stravaAvatarUrl).trim();
          if (data.stravaClientId) foundStravaClientId = String(data.stravaClientId).trim();
          if (data.stravaClientSecret) foundStravaClientSecret = String(data.stravaClientSecret).trim();

          let defaultConfig = null;
          if (data.itraIndex) {
            defaultConfig = deriveConfigFromITRA(parseFloat(data.itraIndex));
          }

          if (data.itraIndex != null) setItraIndex(data.itraIndex);
          if (data.weight != null) setWeight(data.weight);

          setFatiguePercent(data.fatiguePercent != null ? data.fatiguePercent : (defaultConfig?.fatiguePercent || ""));
          setDescentThreshold(data.descentThreshold != null ? data.descentThreshold : (defaultConfig?.descentThreshold || ""));
          setWalkThreshold(data.walkThreshold != null ? data.walkThreshold : (defaultConfig?.walkThreshold || ""));
          setUpCostDivider(data.upCostDivider != null ? data.upCostDivider : (defaultConfig?.upCostDivider || ""));
          setDownCostModifier(data.downCostModifier != null ? data.downCostModifier : (defaultConfig?.downCostModifier || ""));
          setPacingStrategy(data.pacingStrategy != null ? data.pacingStrategy : (defaultConfig?.pacingStrategy || "regular"));
          setPaceProfile(data.paceProfile != null ? data.paceProfile : (defaultConfig?.paceProfile || "coach"));

          if (data.carbTarget != null) setCarbTarget(data.carbTarget);
          if (data.sodiumTarget != null) setSodiumTarget(data.sodiumTarget);
          if (data.waterTarget != null) setWaterTarget(data.waterTarget);
          if (data.caffeineTarget != null) setCaffeineTarget(data.caffeineTarget);
        }

        setIntervalsAthleteId(foundIntervalsId);
        setIntervalsApiKey(foundIntervalsKey);
        setStravaAccessToken(foundStravaAccess);
        setStravaRefreshToken(foundStravaRefresh);
        setStravaExpiresAt(foundStravaExpires);
        setStravaAthleteId(foundStravaId);
        setStravaAthleteName(foundStravaName);
        setStravaAvatarUrl(foundStravaAvatar);
        setStravaClientId(foundStravaClientId);
        setStravaClientSecret(foundStravaClientSecret);

        if (typeof window !== 'undefined') {
          if (foundIntervalsId && foundIntervalsKey) {
            localStorage.setItem(`mykairn_intervals_id_${uid}`, foundIntervalsId);
            localStorage.setItem(`mykairn_intervals_key_${uid}`, foundIntervalsKey);
          }
          if (foundStravaAccess) {
            localStorage.setItem(`mykairn_strava_token_${uid}`, foundStravaAccess);
          }
          if (foundStravaRefresh) {
            localStorage.setItem(`mykairn_strava_refresh_${uid}`, foundStravaRefresh);
          }

          // Gestion automatique du retour OAuth2 Strava (?code=...&scope=...)
          const urlParams = new URLSearchParams(window.location.search);
          const oauthCode = urlParams.get('code');
          const oauthScope = urlParams.get('scope') || '';
          const oauthError = urlParams.get('error');

          if (oauthError) {
            setStravaStatus({
              type: 'error',
              text: "Autorisation Strava annulée ou refusée.",
            });
            window.history.replaceState({}, document.title, window.location.pathname);
          } else if (oauthCode && (oauthScope.includes('activity') || urlParams.get('strava_oauth') === '1')) {
            window.history.replaceState({}, document.title, window.location.pathname);
            setTestingStrava(true);
            try {
              const savedClientId =
                foundStravaClientId ||
                localStorage.getItem(`mykairn_strava_client_id_${uid}`) ||
                '';
              const savedClientSecret =
                foundStravaClientSecret ||
                localStorage.getItem(`mykairn_strava_client_secret_${uid}`) ||
                '';

              const tokenData = await exchangeStravaOAuthCode({
                code: oauthCode,
                clientId: savedClientId,
                clientSecret: savedClientSecret,
              });

              const ath = tokenData.athlete || {};
              const athName =
                `${ath.firstname || ''} ${ath.lastname || ''}`.trim() ||
                ath.username ||
                `Athlète #${ath.id || ''}`;
              const athAvatar = ath.profile || ath.profile_medium || '';
              const athWeight =
                typeof ath.weight === 'number' && ath.weight > 30
                  ? Math.round(ath.weight * 10) / 10
                  : null;

              setStravaAccessToken(tokenData.accessToken);
              setStravaRefreshToken(tokenData.refreshToken || '');
              setStravaExpiresAt(tokenData.expiresAt || null);
              setStravaAthleteId(ath.id ? String(ath.id) : '');
              setStravaAthleteName(athName);
              setStravaAvatarUrl(athAvatar);
              if (athWeight) setWeight(athWeight);

              localStorage.setItem(`mykairn_strava_token_${uid}`, tokenData.accessToken);
              if (tokenData.refreshToken) {
                localStorage.setItem(`mykairn_strava_refresh_${uid}`, tokenData.refreshToken);
              }

              await setDoc(
                doc(db, 'users', uid),
                {
                  stravaAccessToken: tokenData.accessToken,
                  stravaRefreshToken: tokenData.refreshToken || null,
                  stravaExpiresAt: tokenData.expiresAt || null,
                  stravaAthleteId: ath.id ? String(ath.id) : null,
                  stravaAthleteName: athName,
                  stravaAvatarUrl: athAvatar || null,
                  ...(athWeight ? { weight: athWeight } : {}),
                },
                { merge: true }
              );

              setStravaStatus({
                type: 'success',
                text: `Compte Strava connecté avec succès : ${athName} ! Vous pouvez maintenant calibrer votre profil ou importer vos sorties Strava en Roadbooks.`,
              });
            } catch (oauthErr) {
              setStravaStatus({
                type: 'error',
                text: oauthErr.message || "Erreur lors de la validation OAuth Strava.",
              });
              setShowStravaAdvanced(true);
            } finally {
              setTestingStrava(false);
            }
          }
        }
      } catch (err) {
        console.error("Erreur de chargement profil:", err);
      } finally {
        setInitialLoading(false);
      }
    }
    loadUserData();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser && typeof window !== 'undefined') {
      router.push('/login');
    }
  }, [currentUser, router]);

  const handleSaveSettings = async (silent = false, overrideValues = null) => {
    if (!silent) setLoading(true);
    if (!silent) setMessage(null);
    try {
      const uid = currentUser.uid;
      const rawId = overrideValues?.intervalsAthleteId ?? intervalsAthleteId;
      const rawKey = overrideValues?.intervalsApiKey ?? intervalsApiKey;
      const cleanIntervalsId = rawId ? normalizeIntervalsAthleteId(rawId) : "";
      const cleanIntervalsKey = rawKey ? normalizeIntervalsApiKey(rawKey) : "";

      const cleanStravaAccess = normalizeStravaToken(overrideValues?.stravaAccessToken ?? stravaAccessToken);
      const cleanStravaRefresh = normalizeStravaToken(overrideValues?.stravaRefreshToken ?? stravaRefreshToken);
      const effStravaExpires = overrideValues?.stravaExpiresAt ?? stravaExpiresAt;
      const effStravaId = overrideValues?.stravaAthleteId ?? stravaAthleteId;
      const effStravaName = overrideValues?.stravaAthleteName ?? stravaAthleteName;
      const effStravaAvatar = overrideValues?.stravaAvatarUrl ?? stravaAvatarUrl;
      const cleanStravaClientId = String(overrideValues?.stravaClientId ?? stravaClientId ?? '').trim();
      const cleanStravaClientSecret = String(overrideValues?.stravaClientSecret ?? stravaClientSecret ?? '').trim();

      const effItra = overrideValues?.itraIndex ?? itraIndex;
      const effWeight = overrideValues?.weight ?? weight;
      const effFatigue = overrideValues?.fatiguePercent ?? fatiguePercent;
      const effDescent = overrideValues?.descentThreshold ?? descentThreshold;
      const effWalk = overrideValues?.walkThreshold ?? walkThreshold;
      const effUpCost = overrideValues?.upCostDivider ?? upCostDivider;
      const effDownCost = overrideValues?.downCostModifier ?? downCostModifier;
      const effPacing = overrideValues?.pacingStrategy ?? pacingStrategy;
      const effPaceProfile = overrideValues?.paceProfile ?? paceProfile;

      await updateDoc(doc(db, "users", uid), {
        itraIndex: parseFloat(effItra) || null,
        weight: parseFloat(effWeight) || null,
        fatiguePercent: parseFloat(effFatigue) || null,
        descentThreshold: parseFloat(effDescent) || null,
        walkThreshold: parseFloat(effWalk) || null,
        upCostDivider: parseFloat(effUpCost) || null,
        downCostModifier: parseFloat(effDownCost) || null,
        pacingStrategy: effPacing || null,
        paceProfile: effPaceProfile || null,
        carbTarget: parseInt(carbTarget) || null,
        sodiumTarget: parseInt(sodiumTarget) || null,
        waterTarget: parseInt(waterTarget) || null,
        caffeineTarget: parseInt(caffeineTarget) || null,
        intervalsAthleteId: cleanIntervalsId || null,
        intervalsApiKey: cleanIntervalsKey || null,
        stravaAccessToken: cleanStravaAccess || null,
        stravaRefreshToken: cleanStravaRefresh || null,
        stravaExpiresAt: effStravaExpires || null,
        stravaAthleteId: effStravaId || null,
        stravaAthleteName: effStravaName || null,
        stravaAvatarUrl: effStravaAvatar || null,
        stravaClientId: cleanStravaClientId || null,
        stravaClientSecret: cleanStravaClientSecret || null,
      });

      try {
        await setDoc(doc(db, "coaches", uid), {
          intervalsAthleteId: cleanIntervalsId,
          intervalsApiKey: cleanIntervalsKey,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch {
        // Ignoré si non-admin
      }

      if (typeof window !== 'undefined') {
        localStorage.removeItem('intervalsAthleteId');
        localStorage.removeItem('intervalsApiKey');
        if (cleanIntervalsKey) {
          localStorage.setItem(`mykairn_intervals_id_${uid}`, cleanIntervalsId || '0');
          localStorage.setItem(`mykairn_intervals_key_${uid}`, cleanIntervalsKey);
        } else {
          localStorage.removeItem(`mykairn_intervals_id_${uid}`);
          localStorage.removeItem(`mykairn_intervals_key_${uid}`);
        }
        if (cleanStravaAccess) {
          localStorage.setItem(`mykairn_strava_token_${uid}`, cleanStravaAccess);
        } else {
          localStorage.removeItem(`mykairn_strava_token_${uid}`);
        }
        if (cleanStravaRefresh) {
          localStorage.setItem(`mykairn_strava_refresh_${uid}`, cleanStravaRefresh);
        } else {
          localStorage.removeItem(`mykairn_strava_refresh_${uid}`);
        }
        if (cleanStravaClientId) {
          localStorage.setItem(`mykairn_strava_client_id_${uid}`, cleanStravaClientId);
        }
        if (cleanStravaClientSecret) {
          localStorage.setItem(`mykairn_strava_client_secret_${uid}`, cleanStravaClientSecret);
        }
      }

      if (!silent) {
        setMessage({ type: 'success', text: 'Paramètres mis à jour avec succès !' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      console.error(err);
      if (!silent) setMessage({ type: 'error', text: 'Erreur lors de la sauvegarde.' });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleTestIntervalsConnection = async () => {
    setTestingIntervals(true);
    setIntervalsStatus(null);
    try {
      const res = await verifyIntervalsConnection(intervalsAthleteId, intervalsApiKey);
      setIntervalsAthleteId(res.resolvedAthleteId);
      setIntervalsApiKey(res.cleanApiKey);
      const nextWeight = (!weight && res.weight) ? res.weight : weight;
      if (!weight && res.weight) {
        setWeight(res.weight);
      }
      await handleSaveSettings(true, {
        intervalsAthleteId: res.resolvedAthleteId,
        intervalsApiKey: res.cleanApiKey,
        weight: nextWeight,
      });
      setIntervalsStatus({
        type: 'success',
        text: `Connexion réussie ! Compte détecté : ${res.name} (ID : ${res.resolvedAthleteId}${res.ctl ? ` • CTL ${res.ctl}` : ''}).`,
      });
    } catch (err) {
      setIntervalsStatus({
        type: 'error',
        text: err.message || "Impossible de se connecter à Intervals.icu.",
      });
    } finally {
      setTestingIntervals(false);
    }
  };

  const handleProfileFromIntervalsRaces = async () => {
    setProfilingIntervals(true);
    setIntervalsStatus(null);
    try {
      const prof = await profileAthleteFromIntervalsRaces(intervalsAthleteId, intervalsApiKey);
      setIntervalsAthleteId(prof.resolvedAthleteId);
      setIntervalsApiKey(prof.cleanApiKey);
      setItraIndex(String(prof.calibratedItra));
      setFatiguePercent(prof.fatiguePercent);
      setWalkThreshold(prof.walkThreshold);
      setDescentThreshold(prof.descentThreshold);
      setUpCostDivider(prof.upCostDivider);
      setDownCostModifier(prof.downCostModifier);
      setPacingStrategy(prof.pacingStrategy);
      const nextWeight = (!weight && prof.weight) ? prof.weight : weight;
      if (!weight && prof.weight) {
        setWeight(prof.weight);
      }

      setCalibProfileResult(prof);
      await handleSaveSettings(true, {
        intervalsAthleteId: prof.resolvedAthleteId,
        intervalsApiKey: prof.cleanApiKey,
        itraIndex: prof.calibratedItra,
        weight: nextWeight,
        fatiguePercent: prof.fatiguePercent,
        walkThreshold: prof.walkThreshold,
        descentThreshold: prof.descentThreshold,
        upCostDivider: prof.upCostDivider,
        downCostModifier: prof.downCostModifier,
        pacingStrategy: prof.pacingStrategy,
      });

      setIntervalsStatus({
        type: 'success',
        text: `Profilage terminé sur ${prof.racesCount} sortie(s) (${prof.streamsAnalyzedCount} trace(s) GPS/Pente analysée(s)) ! Vos aptitudes ont été mises à jour.`,
      });
      setMessage({ type: 'success', text: `Profil calibré (${prof.runnerArchetype} • ITRA ${prof.calibratedItra}) !` });
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setIntervalsStatus({
        type: 'error',
        text: err.message || "Erreur lors du profilage depuis Intervals.icu.",
      });
    } finally {
      setProfilingIntervals(false);
    }
  };

  const handleStartStravaOAuth = () => {
    setStravaStatus(null);
    try {
      const uid = currentUser?.uid;
      if (typeof window !== 'undefined' && uid) {
        if (stravaClientId.trim()) {
          localStorage.setItem(`mykairn_strava_client_id_${uid}`, stravaClientId.trim());
        }
        if (stravaClientSecret.trim()) {
          localStorage.setItem(`mykairn_strava_client_secret_${uid}`, stravaClientSecret.trim());
        }
      }
      const redirectUri = `${window.location.origin}/settings?strava_oauth=1`;
      const authUrl = buildStravaOAuthUrl({
        clientId: stravaClientId,
        redirectUri,
      });
      window.location.href = authUrl;
    } catch (err) {
      setShowStravaAdvanced(true);
      setStravaStatus({
        type: 'error',
        text: err.message || "Veuillez renseigner votre Client ID Strava ou votre Access Token ci-dessous.",
      });
    }
  };

  const handleTestStravaConnection = async () => {
    setTestingStrava(true);
    setStravaStatus(null);
    try {
      const verified = await verifyStravaConnection({
        accessToken: stravaAccessToken,
        refreshToken: stravaRefreshToken,
        expiresAt: stravaExpiresAt,
        clientId: stravaClientId,
        clientSecret: stravaClientSecret,
      });
      setStravaAthleteId(verified.athleteId);
      setStravaAthleteName(verified.athleteName);
      setStravaAvatarUrl(verified.avatarUrl || "");
      setStravaAccessToken(verified.accessToken);
      if (verified.refreshToken) setStravaRefreshToken(verified.refreshToken);
      if (verified.expiresAt) setStravaExpiresAt(verified.expiresAt);

      const nextWeight = (!weight && verified.weight) ? verified.weight : weight;
      if (!weight && verified.weight) {
        setWeight(verified.weight);
      }

      await handleSaveSettings(true, {
        stravaAthleteId: verified.athleteId,
        stravaAthleteName: verified.athleteName,
        stravaAvatarUrl: verified.avatarUrl || "",
        stravaAccessToken: verified.accessToken,
        stravaRefreshToken: verified.refreshToken || stravaRefreshToken,
        stravaExpiresAt: verified.expiresAt || stravaExpiresAt,
        weight: nextWeight,
      });

      setStravaStatus({
        type: 'success',
        text: `Connexion Strava active ! Athlète : ${verified.athleteName} (ID #${verified.athleteId}${verified.city ? ` • ${verified.city}` : ''}).`,
      });
    } catch (err) {
      setStravaStatus({
        type: 'error',
        text: err.message || "Impossible de se connecter à Strava.",
      });
    } finally {
      setTestingStrava(false);
    }
  };

  const handleProfileFromStravaRaces = async () => {
    setProfilingStrava(true);
    setStravaStatus(null);
    try {
      const prof = await profileAthleteFromStravaRaces({
        accessToken: stravaAccessToken,
        refreshToken: stravaRefreshToken,
        expiresAt: stravaExpiresAt,
        clientId: stravaClientId,
        clientSecret: stravaClientSecret,
      });

      setStravaAthleteId(prof.stravaAthleteId);
      setStravaAthleteName(prof.athleteName);
      setStravaAvatarUrl(prof.avatarUrl || "");
      setStravaAccessToken(prof.accessToken);
      if (prof.refreshToken) setStravaRefreshToken(prof.refreshToken);
      if (prof.expiresAt) setStravaExpiresAt(prof.expiresAt);

      setItraIndex(String(prof.calibratedItra));
      setFatiguePercent(prof.fatiguePercent);
      setWalkThreshold(prof.walkThreshold);
      setDescentThreshold(prof.descentThreshold);
      setUpCostDivider(prof.upCostDivider);
      setDownCostModifier(prof.downCostModifier);
      setPacingStrategy(prof.pacingStrategy);
      const nextWeight = (!weight && prof.weight) ? prof.weight : weight;
      if (!weight && prof.weight) {
        setWeight(prof.weight);
      }

      setCalibProfileResult(prof);
      await handleSaveSettings(true, {
        stravaAthleteId: prof.stravaAthleteId,
        stravaAthleteName: prof.athleteName,
        stravaAvatarUrl: prof.avatarUrl || "",
        stravaAccessToken: prof.accessToken,
        stravaRefreshToken: prof.refreshToken || stravaRefreshToken,
        stravaExpiresAt: prof.expiresAt || stravaExpiresAt,
        itraIndex: prof.calibratedItra,
        weight: nextWeight,
        fatiguePercent: prof.fatiguePercent,
        walkThreshold: prof.walkThreshold,
        descentThreshold: prof.descentThreshold,
        upCostDivider: prof.upCostDivider,
        downCostModifier: prof.downCostModifier,
        pacingStrategy: prof.pacingStrategy,
      });

      setStravaStatus({
        type: 'success',
        text: `Profilage Strava réussi sur ${prof.racesCount} course(s) (${prof.streamsAnalyzedCount} trace(s) GPS/Pente analysée(s)) ! Vos aptitudes ont été mises à jour.`,
      });
      setMessage({ type: 'success', text: `Profil Strava calibré (${prof.runnerArchetype} • ITRA ${prof.calibratedItra}) !` });
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setStravaStatus({
        type: 'error',
        text: err.message || "Erreur lors du profilage depuis vos courses Strava.",
      });
    } finally {
      setProfilingStrava(false);
    }
  };

  const handleDisconnectStrava = async () => {
    setStravaAccessToken("");
    setStravaRefreshToken("");
    setStravaExpiresAt(null);
    setStravaAthleteId("");
    setStravaAthleteName("");
    setStravaAvatarUrl("");
    await handleSaveSettings(true, {
      stravaAccessToken: "",
      stravaRefreshToken: "",
      stravaExpiresAt: null,
      stravaAthleteId: "",
      stravaAthleteName: "",
      stravaAvatarUrl: "",
    });
    setStravaStatus({
      type: 'success',
      text: "Compte Strava dissocié de votre profil.",
    });
  };

  useEffect(() => {
    if (initialLoading) return;
    const timeoutId = setTimeout(() => {
      handleSaveSettings(true);
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [itraIndex, weight, fatiguePercent, descentThreshold, walkThreshold, upCostDivider, downCostModifier, pacingStrategy, paceProfile, carbTarget, sodiumTarget, waterTarget, caffeineTarget, intervalsAthleteId, intervalsApiKey, stravaAccessToken, stravaRefreshToken, stravaClientId, stravaClientSecret, initialLoading]);


  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Veuillez sélectionner une image.' });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);
      const storageRef = ref(storage, `users/${currentUser.uid}/profile_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const photoURL = await getDownloadURL(storageRef);
      await updateProfile(auth.currentUser, { photoURL });
      setMessage({ type: 'success', text: 'Photo de profil mise à jour !' });
      setTimeout(() => setMessage(null), 3000);
      router.refresh();
    } catch (error) {
      console.error("Erreur upload:", error);
      setMessage({ type: 'error', text: 'Erreur lors de la mise à jour de la photo.' });
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className={styles.settingsContainer}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '8px', color: 'var(--text-primary)' }}>Configuration du coureur</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Ajustez vos données physiologiques. Ces paramètres servent de base à l'algorithme pour calculer vos temps de passage de façon hyper-personnalisée.
        </p>
      </div>

      {/* Profil Photo */}
      <div className={styles.profileSection}>
        <div className={styles.sectionHeader}>
          <User size={24} className="text-emerald-500" />
          <h3>Profil Public</h3>
        </div>

        <div className={styles.avatarGroup}>
          {currentUser.photoURL ? (
            <img src={currentUser.photoURL} alt="Avatar" className={styles.avatarPreview} />
          ) : (
            <div className={styles.avatarPreview}>
              <User size={40} className={styles.avatarPlaceholder} />
            </div>
          )}

          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className={styles.fileInput}
              accept="image/*"
            />
            <button
              className="btn btn-secondary"
              onClick={() => fileInputRef.current.click()}
              disabled={loading}
            >
              {loading ? <Loader2 size={18} className="lucide-spin" /> : <Upload size={18} />}
              {loading ? 'Téléchargement...' : 'Changer ma photo'}
            </button>
          </div>
        </div>
      </div>

      {!initialLoading ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>

          {/* Base ITRA / Physique */}
          <div className={styles.profileSection}>
            <div className={styles.sectionHeader}>
              <Activity size={24} className="text-emerald-500" />
              <h3>Niveau & Gabarit</h3>
            </div>
            <p className={styles.sectionDescription}>
              La base du modèle prédictif. L'algorithme se base sur l'indice ITRA pour calibrer vos vitesses sur le plat, puis applique vos aptitudes en montée et descente.
            </p>

            <div className={styles.grid}>
              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}><TrendingUp size={16} /> Indice de Performance (ITRA / UTMB)</label>
                  <Tooltip text="Saisissez votre cote ITRA (ex: 550, 700, 900). En la modifiant, les paramètres ci-dessous (fatigue, agilité) seront pré-remplis avec des valeurs moyennes pour votre niveau. Vous pourrez toujours les affiner." />
                </div>
                <div className={styles.fieldDesc}>Calibre votre vitesse de base (VMA).</div>
                <div className={styles.inputWrapper}>
                  <input
                    type="number" className={styles.inputField} placeholder="Ex: 600"
                    value={itraIndex}
                    onFocus={e => e.target.select()}
                    onChange={e => {
                      const newItra = e.target.value;
                      setItraIndex(newItra);
                      if (newItra && newItra > 0) {
                        const config = deriveConfigFromITRA(parseFloat(newItra));
                        setFatiguePercent(config.fatiguePercent);
                        setDescentThreshold(config.descentThreshold);
                        setWalkThreshold(config.walkThreshold);
                        setUpCostDivider(config.upCostDivider);
                        setDownCostModifier(config.downCostModifier);
                        setPacingStrategy(config.pacingStrategy);
                      }
                    }}
                  />
                  <span className={styles.inputUnit}>pts</span>
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}><User size={16} /> Poids Corporel</label>
                  <Tooltip text="Utilisé pour le calcul de votre dépense énergétique et pour pondérer l'impact des montées sur la vitesse (rapport poids/puissance)." />
                </div>
                <div className={styles.fieldDesc}>Affecte la dépense énergétique.</div>
                <div className={styles.inputWrapper}>
                  <input
                    type="number" className={styles.inputField} placeholder="Ex: 70"
                    value={weight} 
                    onFocus={e => e.target.select()}
                    onChange={e => setWeight(e.target.value)}
                  />
                  <span className={styles.inputUnit}>kg</span>
                </div>
              </div>
            </div>
          </div>

          {/* Variables de Course Avancées */}
          <div className={styles.profileSection}>
            <div className={styles.sectionHeader}>
              <Mountain size={24} className="text-emerald-500" />
              <h3>Aptitudes Terrain (Profil)</h3>
            </div>
            <p className={styles.sectionDescription}>
              Ajustez ces curseurs pour coller parfaitement à votre style (grimpeur, descendeur, diesel...).
            </p>

            <div className={styles.grid}>

              {/* Fatigue */}
              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}><HeartPulse size={16} /> Coefficient de Fatigue</label>
                  <Tooltip text="Exprime la perte de vitesse sur l'ensemble de la course. Un élite perdra ~15%, un débutant ~45%. Si vos fins de course sont difficiles, augmentez cette valeur." />
                </div>
                <div className={styles.fieldDesc}>% de perte de vitesse en fin de course.</div>
                <div className={styles.inputWrapper}>
                  <input
                    type="number" className={styles.inputField}
                    value={fatiguePercent} 
                    onFocus={e => e.target.select()}
                    onChange={e => setFatiguePercent(e.target.value)}
                  />
                  <span className={styles.inputUnit}>%</span>
                </div>
              </div>

              {/* Seuil Marche Montée */}
              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}><Footprints size={16} /> Seuil de marche (Montée)</label>
                  <Tooltip text="Le % de pente à partir duquel vous arrêtez de courir pour marcher. Un pro court jusqu'à 15-20%, un amateur marche dès 8-10%." />
                </div>
                <div className={styles.fieldDesc}>% de pente déclenchant la marche.</div>
                <div className={styles.inputWrapper}>
                  <input
                    type="number" className={styles.inputField}
                    value={walkThreshold} 
                    onFocus={e => e.target.select()}
                    onChange={e => setWalkThreshold(e.target.value)}
                  />
                  <span className={styles.inputUnit}>%</span>
                </div>
              </div>

              {/* Seuil Descente Technique */}
              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}><TrendingDown size={16} /> Agilité Descente</label>
                  <Tooltip text="La déclivité maximale en descente où vous gagnez du temps. Au-delà, la pente devient trop raide et vous commencez à freiner." />
                </div>
                <div className={styles.fieldDesc}>% de pente max avant freinage.</div>
                <div className={styles.inputWrapper}>
                  <input
                    type="number" className={styles.inputField}
                    value={descentThreshold} 
                    onFocus={e => e.target.select()}
                    onChange={e => setDescentThreshold(e.target.value)}
                  />
                  <span className={styles.inputUnit}>%</span>
                </div>
              </div>

              {/* Efficacité Montée */}
              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}><TrendingUp size={16} /> Efficacité en Montée</label>
                  <Tooltip text="Convertit le dénivelé positif en distance à l'effort. 100m D+ = 1km effort (Standard ITRA, diviseur = 100). Baissez ce chiffre (ex: 80) si vous êtes mauvais grimpeur." />
                </div>
                <div className={styles.fieldDesc}>Diviseur D+ (100 = Standard).</div>
                <div className={styles.inputWrapper}>
                  <input
                    type="number" className={styles.inputField}
                    value={upCostDivider} 
                    onFocus={e => e.target.select()}
                    onChange={e => setUpCostDivider(e.target.value)}
                  />
                  <span className={styles.inputUnit}>d+</span>
                </div>
              </div>

              {/* Pacing Strategy */}
              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}><TrendingUp size={16} /> Stratégie d'effort</label>
                  <Tooltip text="Modifie la courbe de fatigue. Prudent: départ plus lent mais moins de fatigue en fin de course. Agressif: départ rapide mais fatigue accrue sur la fin." />
                </div>
                <div className={styles.fieldDesc}>Modulation de la courbe de fatigue.</div>
                <div className={styles.inputWrapper}>
                  <select
                    className={styles.inputField}
                    value={pacingStrategy} onChange={e => setPacingStrategy(e.target.value)}
                    style={{ width: '100%', appearance: 'none' }}
                  >
                    <option value="prudent">Prudent (départ lent)</option>
                    <option value="regular">Régulier (constant)</option>
                    <option value="aggressive">Agressif (départ rapide)</option>
                  </select>
                </div>
              </div>

              {/* Pace Profile */}
              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}><TrendingUp size={16} /> Profil d'allure</label>
                  <Tooltip text="Allure Coach : allures idéales prudentes recommandées par un coach. Allure Course : temps agressifs (environ 5% plus rapide)." />
                </div>
                <div className={styles.fieldDesc}>Base de l'estimation de temps.</div>
                <div className={styles.inputWrapper}>
                  <select
                    className={styles.inputField}
                    value={paceProfile} onChange={e => setPaceProfile(e.target.value)}
                    style={{ width: '100%', appearance: 'none' }}
                  >
                    <option value="coach">Allure Coach (Idéal)</option>
                    <option value="aggressive">Allure Course (Agressif)</option>
                  </select>
                </div>
              </div>

            </div>
          </div>

          {/* Nutrition */}
          <div className={styles.profileSection}>
            <div className={styles.sectionHeader}>
              <Utensils size={24} className="text-emerald-500" />
              <h3>Objectifs Nutritionnels</h3>
            </div>
            <p className={styles.sectionDescription}>
              Vos cibles horaires de ravitaillement. Ces données servent à générer la liste de courses ("caddie") de votre assistance.
            </p>

            <div className={styles.grid}>
              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}>Glucides</label>
                </div>
                <div className={styles.inputWrapper}>
                  <input
                    type="number" className={styles.inputField} placeholder="Ex: 60"
                    value={carbTarget} 
                    onFocus={e => e.target.select()}
                    onChange={e => setCarbTarget(e.target.value)}
                  />
                  <span className={styles.inputUnit}>g / h</span>
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}><Droplets size={16} /> Eau</label>
                </div>
                <div className={styles.inputWrapper}>
                  <input
                    type="number" className={styles.inputField} placeholder="Ex: 500"
                    value={waterTarget} 
                    onFocus={e => e.target.select()}
                    onChange={e => setWaterTarget(e.target.value)}
                  />
                  <span className={styles.inputUnit}>ml / h</span>
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}>Sodium</label>
                </div>
                <div className={styles.inputWrapper}>
                  <input
                    type="number" className={styles.inputField} placeholder="Ex: 400"
                    value={sodiumTarget} 
                    onFocus={e => e.target.select()}
                    onChange={e => setSodiumTarget(e.target.value)}
                  />
                  <span className={styles.inputUnit}>mg / h</span>
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}><Coffee size={16} /> Caféine</label>
                </div>
                <div className={styles.inputWrapper}>
                  <input
                    type="number" className={styles.inputField} placeholder="Ex: 50"
                    value={caffeineTarget} 
                    onFocus={e => e.target.select()}
                    onChange={e => setCaffeineTarget(e.target.value)}
                  />
                  <span className={styles.inputUnit}>mg / h</span>
                </div>
              </div>
            </div>
          </div>

          {/* Connexion Strava Grand Public (Recommandé) */}
          <div className={styles.profileSection} style={{ border: '1px solid rgba(252, 76, 2, 0.35)' }}>
            <div className={styles.sectionHeader} style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background: '#FC4C02',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: '0.95rem',
                }}>
                  S
                </div>
                <div>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    Connexion Strava & Calibrage Automatique
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      padding: '3px 8px',
                      borderRadius: '999px',
                      background: 'rgba(252, 76, 2, 0.14)',
                      color: '#FC4C02',
                      border: '1px solid rgba(252, 76, 2, 0.3)',
                    }}>
                      Recommandé • Grand Public
                    </span>
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowStravaAdvanced(!showStravaAdvanced)}
                className="btn btn-secondary"
                style={{ fontSize: '0.78rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Key size={15} />
                {showStravaAdvanced ? 'Masquer la clé API Strava' : 'Jeton / Clé API Strava manuelle'}
              </button>
            </div>

            <p className={styles.sectionDescription}>
              Connectez votre compte <strong>Strava</strong> pour calibrer automatiquement votre cote ITRA, votre seuil de marche, votre agilité en descente et votre résistance à la fatigue à partir de vos courses et sorties trail, et pour <strong>importer n&apos;importe quelle sortie Strava en Roadbook en 1 clic</strong> depuis votre Tableau de bord.
            </p>

            {stravaAthleteName && stravaAccessToken && (
              <div style={{
                marginBottom: '16px',
                padding: '12px 16px',
                borderRadius: '14px',
                background: 'rgba(252, 76, 2, 0.08)',
                border: '1px solid rgba(252, 76, 2, 0.28)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {stravaAvatarUrl ? (
                    <img
                      src={stravaAvatarUrl}
                      alt={stravaAthleteName}
                      style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #FC4C02' }}
                    />
                  ) : (
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#FC4C02', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                      S
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {stravaAthleteName}
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10B981', background: 'rgba(16, 185, 129, 0.12)', padding: '2px 8px', borderRadius: '999px' }}>
                        ✓ Connecté à Strava
                      </span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      ID Athlète Strava : <code>#{stravaAthleteId || 'auto'}</code> • Synchronisation des courses & traces GPS activée
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDisconnectStrava}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '5px 10px' }}
                >
                  Déconnecter
                </button>
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleStartStravaOAuth}
                disabled={testingStrava || profilingStrava}
                style={{
                  background: '#FC4C02',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(252, 76, 2, 0.28)',
                }}
              >
                <Zap size={16} />
                {stravaAccessToken ? 'Reconnecter avec Strava (OAuth 1-clic)' : 'Se connecter avec Strava (OAuth 1-clic)'}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleTestStravaConnection}
                disabled={testingStrava || profilingStrava || (!stravaAccessToken.trim() && !stravaRefreshToken.trim())}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
              >
                {testingStrava ? <Loader2 size={16} className="lucide-spin" /> : <CheckCircle2 size={16} />}
                {testingStrava ? 'Vérification Strava...' : 'Tester ma connexion Strava'}
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleProfileFromStravaRaces}
                disabled={profilingStrava || testingStrava || (!stravaAccessToken.trim() && !stravaRefreshToken.trim())}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
              >
                {profilingStrava ? <Loader2 size={16} className="lucide-spin" /> : <Trophy size={16} />}
                {profilingStrava ? 'Analyse de vos courses Strava...' : 'Profiler & Calibrer mes aptitudes depuis Strava'}
              </button>
            </div>

            {showStravaAdvanced && (
              <div style={{
                marginTop: '18px',
                padding: '16px',
                borderRadius: '14px',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-light)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                    🔑 Connexion rapide par Jeton / Application API Strava personnelle
                  </strong>
                  <a
                    href="https://www.strava.com/settings/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.8rem', fontWeight: 700, color: '#FC4C02', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'underline' }}
                  >
                    Ouvrir strava.com/settings/api <ExternalLink size={13} />
                  </a>
                </div>
                <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <li>
                    <strong>Mode instantané (Access Token) :</strong> Sur <code>strava.com/settings/api</code>, copiez votre <strong>Your Access Token</strong> et collez-le ci-dessous, puis cliquez sur <em>« Tester ma connexion Strava »</em>.
                  </li>
                  <li>
                    <strong>Mode OAuth 1-clic & renouvellement automatique :</strong> Renseignez également votre <strong>Client ID</strong>, <strong>Client Secret</strong> et <strong>Refresh Token</strong> (Domaine d&apos;autorisation : <code>localhost</code> en local ou votre nom de domaine) pour que le bouton orange <em>« Se connecter avec Strava »</em> accorde automatiquement les droits <code>activity:read_all</code> et renouvelle votre session en continu.
                  </li>
                </ol>

                <div className={styles.grid}>
                  <div className={styles.fieldGroup}>
                    <div className={styles.fieldHeader}>
                      <label className={styles.fieldLabel}><Key size={15} /> Access Token Strava</label>
                    </div>
                    <div className={styles.fieldDesc}>Jeton d&apos;accès direct (Your Access Token).</div>
                    <div className={styles.inputWrapper}>
                      <input
                        type="password"
                        className={styles.inputField}
                        placeholder="Collez votre Access Token Strava..."
                        value={stravaAccessToken}
                        onChange={e => setStravaAccessToken(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className={styles.fieldGroup}>
                    <div className={styles.fieldHeader}>
                      <label className={styles.fieldLabel}><ShieldCheck size={15} /> Refresh Token (Optionnel)</label>
                    </div>
                    <div className={styles.fieldDesc}>Permet le renouvellement automatique du jeton.</div>
                    <div className={styles.inputWrapper}>
                      <input
                        type="password"
                        className={styles.inputField}
                        placeholder="Collez votre Refresh Token..."
                        value={stravaRefreshToken}
                        onChange={e => setStravaRefreshToken(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className={styles.fieldGroup}>
                    <div className={styles.fieldHeader}>
                      <label className={styles.fieldLabel}>Client ID Strava (Optionnel)</label>
                    </div>
                    <div className={styles.fieldDesc}>Ex: 123456 (pour le bouton OAuth 1-clic).</div>
                    <div className={styles.inputWrapper}>
                      <input
                        type="text"
                        className={styles.inputField}
                        placeholder="Ex: 124578"
                        value={stravaClientId}
                        onChange={e => setStravaClientId(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className={styles.fieldGroup}>
                    <div className={styles.fieldHeader}>
                      <label className={styles.fieldLabel}>Client Secret Strava (Optionnel)</label>
                    </div>
                    <div className={styles.fieldDesc}>Clé secrète OAuth pour rafraîchir le jeton.</div>
                    <div className={styles.inputWrapper}>
                      <input
                        type="password"
                        className={styles.inputField}
                        placeholder="Votre Client Secret Strava..."
                        value={stravaClientSecret}
                        onChange={e => setStravaClientSecret(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {stravaStatus && (
              <div style={{
                marginTop: '14px',
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '0.84rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: stravaStatus.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                border: `1px solid ${stravaStatus.type === 'success' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                color: stravaStatus.type === 'success' ? '#10B981' : '#EF4444',
              }}>
                {stravaStatus.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <span>{stravaStatus.text}</span>
              </div>
            )}
          </div>

          {/* Connexion Intervals.icu personnelle */}
          <div className={styles.profileSection}>
            <div className={styles.sectionHeader} style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Key size={24} className="text-emerald-500" />
                <h3>Connexion Intervals.icu & Calibrage Course</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIntervalsHelp(!showIntervalsHelp)}
                className="btn btn-secondary"
                style={{ fontSize: '0.78rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <HelpCircle size={15} />
                {showIntervalsHelp ? 'Masquer le guide explicatif' : 'Comment lier Intervals.icu (sans erreur 401) ?'}
              </button>
            </div>
            <p className={styles.sectionDescription}>
              Vos identifiants API Intervals.icu sont strictement isolés et rattachés à votre compte utilisateur (<strong>{currentUser.email}</strong>). Ils permettent de profiler automatiquement vos aptitudes de coureur (ITRA, seuil de marche, agilité descente, résistance à la fatigue) depuis vos sorties intitulées <strong>« Course »</strong>.
            </p>

            {showIntervalsHelp && (
              <div style={{
                marginBottom: '20px',
                padding: '16px',
                borderRadius: '14px',
                background: 'rgba(16, 185, 129, 0.06)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📘 Guide rapide : Lier votre compte Intervals.icu en 3 étapes (et éviter l&apos;erreur 401)
                  </strong>
                  <a
                    href="https://intervals.icu/settings"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'underline' }}
                  >
                    Ouvrir intervals.icu/settings <ExternalLink size={13} />
                  </a>
                </div>
                <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li>
                    <strong>1. Récupérez votre Clé API (Developer Key) :</strong> Connectez-vous sur <code>intervals.icu/settings</code>, faites défiler tout en bas jusqu&apos;à la section <strong>« Developer Settings »</strong>, puis cliquez sur <strong>« View »</strong> (ou <em>Generate</em>) à côté de <strong>API Key</strong>. Copiez cette suite de caractères (⚠️ <em>ne mettez jamais votre mot de passe de connexion, sinon vous aurez une erreur 401</em>).
                  </li>
                  <li>
                    <strong>2. Votre ID Athlète (optionnel grâce à l&apos;auto-détection) :</strong> Il commence par la lettre <code>i</code> suivie de chiffres (ex: <code>i467323</code>), visible dans la même section ou dans l&apos;URL de votre profil. <strong>Astuce anti-401 :</strong> vous pouvez laisser <code>0</code> ou cliquer sur <strong>« Tester &amp; Auto-détecter mon ID »</strong> ci-dessous après avoir collé votre Clé API !
                  </li>
                  <li>
                    <strong>3. Nommez vos compétitions « Course » :</strong> Pour que le calibrage donne un poids prioritaire à vos compétitions, intitulez vos courses sur Intervals.icu/Strava avec le mot <strong>« Course »</strong> (ex: <em>Course Trail des Aiguilles</em>) ou cochez la case <em>Race / Compétition</em>.
                  </li>
                </ol>
              </div>
            )}

            <div className={styles.grid}>
              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}><ShieldCheck size={16} /> ID Athlète Intervals.icu</label>
                  <Tooltip text="Votre identifiant du type i123456. Si vous ne le connaissez pas, laissez vide ou tapez 0 puis cliquez sur 'Tester & Auto-détecter mon ID'." />
                </div>
                <div className={styles.fieldDesc}>Format <code>i123456</code> (ou laissez vide pour auto-détection).</div>
                <div className={styles.inputWrapper}>
                  <input
                    type="text"
                    className={styles.inputField}
                    placeholder="Ex: i467323 (ou 0 pour auto-détecter)"
                    value={intervalsAthleteId}
                    onChange={e => setIntervalsAthleteId(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}><Key size={16} /> Clé API (Developer Key)</label>
                  <Tooltip text="Générez votre clé personnelle dans Intervals.icu > Settings > Developer Settings > API Key." />
                </div>
                <div className={styles.fieldDesc}>Clé API Developer (pas votre mot de passe).</div>
                <div className={styles.inputWrapper}>
                  <input
                    type="password"
                    className={styles.inputField}
                    placeholder="Collez votre API Key Intervals.icu..."
                    value={intervalsApiKey}
                    onChange={e => setIntervalsApiKey(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleTestIntervalsConnection}
                disabled={testingIntervals || profilingIntervals || !intervalsApiKey.trim()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
              >
                {testingIntervals ? <Loader2 size={16} className="lucide-spin" /> : <CheckCircle2 size={16} />}
                {testingIntervals ? 'Vérification...' : 'Tester la connexion & Auto-détecter mon ID'}
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleProfileFromIntervalsRaces}
                disabled={profilingIntervals || testingIntervals || !intervalsApiKey.trim()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
              >
                {profilingIntervals ? <Loader2 size={16} className="lucide-spin" /> : <Trophy size={16} />}
                {profilingIntervals ? 'Analyse des courses & traces GPS...' : 'Profiler & Calibrer mes aptitudes depuis mes Courses'}
              </button>
            </div>

            {intervalsStatus && (
              <div style={{
                marginTop: '14px',
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '0.84rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: intervalsStatus.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                border: `1px solid ${intervalsStatus.type === 'success' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                color: intervalsStatus.type === 'success' ? '#10B981' : '#EF4444',
              }}>
                {intervalsStatus.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <span>{intervalsStatus.text}</span>
              </div>
            )}

            {calibProfileResult && (
              <div style={{
                marginTop: '16px',
                padding: '18px',
                borderRadius: '16px',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-light)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      padding: '4px 10px',
                      borderRadius: '999px',
                      background: 'var(--color-primary)',
                      color: '#fff',
                    }}>
                      🏆 {calibProfileResult.runnerArchetype}
                    </span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Basé sur {calibProfileResult.racesCount} course(s) ({calibProfileResult.streamsAnalyzedCount} flux GPS/Pente analysés)
                    </span>
                  </div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#10B981' }}>
                    ✅ Appliqué à votre profil coureur
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                  <div style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Cote ITRA Calibrée</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-primary)' }}>
                      {calibProfileResult.calibratedItra} pts <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>(pic {calibProfileResult.peakItra})</span>
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Score Grimpeur / D+</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {calibProfileResult.uphillEfficiencyScore}/100 <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>(Marche &gt;{calibProfileResult.walkThreshold}%)</span>
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Agilité Descente</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {calibProfileResult.downhillAgilityScore}/100 <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>(Freinage -{calibProfileResult.descentThreshold}%)</span>
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Indice Endurance</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10B981' }}>
                      {calibProfileResult.enduranceScore}/100 <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>(Fatigue {calibProfileResult.fatiguePercent}%)</span>
                    </div>
                  </div>
                </div>

                {calibProfileResult.referenceRaces?.length > 0 && (
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                    <strong>Sorties de référence utilisées :</strong>{' '}
                    {calibProfileResult.referenceRaces.map((r) => `${r.name} (${r.distanceKm}km / +${r.elevationGainM}m • ITRA ~${r.empiricalItra})`).join(' • ')}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={styles.saveButtonContainer} style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={14} /> Toutes les modifications sont enregistrées automatiquement.
            </span>
          </div>

          <AnimatePresence>
            {message && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`${styles.message} ${styles[message.type]}`}
                style={{ position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)', zIndex: 100, minWidth: '300px' }}
              >
                {message.text}
              </motion.div>
            )}
          </AnimatePresence>

        </motion.div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
          <Loader2 size={32} className="lucide-spin text-emerald-500" />
        </div>
      )}
    </div>
  );
}

