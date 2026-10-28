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

  // Connexion Intervals.icu personnelle (propre à ce compte)
  const [intervalsAthleteId, setIntervalsAthleteId] = useState("");
  const [intervalsApiKey, setIntervalsApiKey] = useState("");
  const [testingIntervals, setTestingIntervals] = useState(false);
  const [profilingIntervals, setProfilingIntervals] = useState(false);
  const [intervalsStatus, setIntervalsStatus] = useState(null);
  const [calibProfileResult, setCalibProfileResult] = useState(null);
  const [showIntervalsHelp, setShowIntervalsHelp] = useState(true);

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

        if (coachDoc && coachDoc.exists()) {
          const cData = coachDoc.data();
          if (cData.intervalsAthleteId) foundIntervalsId = String(cData.intervalsAthleteId).trim();
          if (cData.intervalsApiKey) foundIntervalsKey = String(cData.intervalsApiKey).trim();
        }

        if (userDoc.exists()) {
          const data = userDoc.data();

          if (!foundIntervalsId && data.intervalsAthleteId) foundIntervalsId = String(data.intervalsAthleteId).trim();
          if (!foundIntervalsKey && data.intervalsApiKey) foundIntervalsKey = String(data.intervalsApiKey).trim();

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
        if (typeof window !== 'undefined' && foundIntervalsId && foundIntervalsKey) {
          localStorage.setItem(`mykairn_intervals_id_${uid}`, foundIntervalsId);
          localStorage.setItem(`mykairn_intervals_key_${uid}`, foundIntervalsKey);
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

  useEffect(() => {
    if (initialLoading) return;
    const timeoutId = setTimeout(() => {
      handleSaveSettings(true);
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [itraIndex, weight, fatiguePercent, descentThreshold, walkThreshold, upCostDivider, downCostModifier, pacingStrategy, paceProfile, carbTarget, sodiumTarget, waterTarget, caffeineTarget, intervalsAthleteId, intervalsApiKey, initialLoading]);


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

