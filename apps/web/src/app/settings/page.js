"use client";

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '@/lib/firebase';
import { User, Upload, Loader2, Info, Activity, Mountain, TrendingUp, TrendingDown, Footprints, Droplets, Utensils, Coffee, HeartPulse } from 'lucide-react';
import styles from './settings.module.css';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { deriveConfigFromITRA } from '@/lib/roadbookCalculator';
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
  const [globalTechnicality, setGlobalTechnicality] = useState("");
  const [pacingStrategy, setPacingStrategy] = useState("regular");
  
  // Nutrition
  const [carbTarget, setCarbTarget] = useState("");
  const [sodiumTarget, setSodiumTarget] = useState("");
  const [waterTarget, setWaterTarget] = useState("");
  const [caffeineTarget, setCaffeineTarget] = useState("");

  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    async function loadUserData() {
      try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.itraIndex != null) setItraIndex(data.itraIndex);
          if (data.weight != null) setWeight(data.weight);
          if (data.fatiguePercent != null) setFatiguePercent(data.fatiguePercent);
          if (data.descentThreshold != null) setDescentThreshold(data.descentThreshold);
          if (data.walkThreshold != null) setWalkThreshold(data.walkThreshold);
          if (data.upCostDivider != null) setUpCostDivider(data.upCostDivider);
          if (data.downCostModifier != null) setDownCostModifier(data.downCostModifier);
          if (data.globalTechnicality != null) setGlobalTechnicality(data.globalTechnicality);
          if (data.pacingStrategy != null) setPacingStrategy(data.pacingStrategy);
          if (data.carbTarget != null) setCarbTarget(data.carbTarget);
          if (data.sodiumTarget != null) setSodiumTarget(data.sodiumTarget);
          if (data.waterTarget != null) setWaterTarget(data.waterTarget);
          if (data.caffeineTarget != null) setCaffeineTarget(data.caffeineTarget);
        }
      } catch (err) {
        console.error("Erreur de chargement profil:", err);
      } finally {
        setInitialLoading(false);
      }
    }
    loadUserData();
  }, [currentUser]);

  if (!currentUser) {
    if (typeof window !== 'undefined') router.push('/login');
    return null;
  }

  const handleSaveSettings = async () => {
    setLoading(true);
    setMessage(null);
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        itraIndex: parseFloat(itraIndex) || null,
        weight: parseFloat(weight) || null,
        fatiguePercent: parseFloat(fatiguePercent) || null,
        descentThreshold: parseFloat(descentThreshold) || null,
        walkThreshold: parseFloat(walkThreshold) || null,
        upCostDivider: parseFloat(upCostDivider) || null,
        downCostModifier: parseFloat(downCostModifier) || null,
        globalTechnicality: parseFloat(globalTechnicality) || null,
        pacingStrategy: pacingStrategy || null,
        carbTarget: parseInt(carbTarget) || null,
        sodiumTarget: parseInt(sodiumTarget) || null,
        waterTarget: parseInt(waterTarget) || null,
        caffeineTarget: parseInt(caffeineTarget) || null,
      });
      setMessage({ type: 'success', text: 'Paramètres mis à jour avec succès !' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Erreur lors de la sauvegarde.' });
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className={styles.settingsContainer}>
      <div style={{marginBottom: '24px'}}>
        <h2 style={{fontSize: '2rem', marginBottom: '8px', color: 'var(--text-primary)'}}>Configuration du coureur</h2>
        <p style={{color: 'var(--text-secondary)'}}>
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
        <motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}} transition={{delay: 0.1}}>
          
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
                    value={weight} onChange={e => setWeight(e.target.value)} 
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
                    value={fatiguePercent} onChange={e => setFatiguePercent(e.target.value)} 
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
                    value={walkThreshold} onChange={e => setWalkThreshold(e.target.value)} 
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
                    value={descentThreshold} onChange={e => setDescentThreshold(e.target.value)} 
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
                    value={upCostDivider} onChange={e => setUpCostDivider(e.target.value)} 
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

              {/* Technicité Globale */}
              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}><Mountain size={16} /> Technicité Globale (Défaut)</label>
                  <Tooltip text="Définit la difficulté globale du terrain pour réduire votre vitesse. 1 = Route, 2 = Trail classique, 3 = Technique, 4 = Très technique, 5 = Extrême." />
                </div>
                <div className={styles.fieldDesc}>Modificateur de vitesse global (1 à 5).</div>
                <div className={styles.inputWrapper}>
                  <select 
                    className={styles.inputField}
                    value={globalTechnicality} onChange={e => setGlobalTechnicality(e.target.value)} 
                    style={{ width: '100%', appearance: 'none' }}
                  >
                    <option value="">Sélectionner</option>
                    <option value="1">1 - Très Roulant</option>
                    <option value="2">2 - Trail Classique</option>
                    <option value="3">3 - Technique</option>
                    <option value="4">4 - Très Technique</option>
                    <option value="5">5 - Extrême</option>
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
                    value={carbTarget} onChange={e => setCarbTarget(e.target.value)} 
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
                    value={waterTarget} onChange={e => setWaterTarget(e.target.value)} 
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
                    value={sodiumTarget} onChange={e => setSodiumTarget(e.target.value)} 
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
                    value={caffeineTarget} onChange={e => setCaffeineTarget(e.target.value)} 
                  />
                  <span className={styles.inputUnit}>mg / h</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.saveButtonContainer} style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button 
              className={`btn btn-primary ${styles.saveBtn}`} 
              onClick={handleSaveSettings}
              disabled={loading}
            >
              {loading ? <Loader2 size={20} className="lucide-spin" style={{marginRight: '8px'}} /> : null}
              {loading ? 'Sauvegarde...' : 'Enregistrer mon profil'}
            </button>
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

