"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import dynamic from 'next/dynamic';
import { Save, ArrowLeft, Loader2, Trash2, Timer, Droplets, Utensils, Activity, Clock, Navigation, Edit2, Coffee } from "lucide-react";
import Link from "next/link";
import styles from "./editor.module.css";
import { enrichWaypointsWithStartEnd, generateSegments, findPointByDistance, getNightIntensity, calculateTraceStats, findOptimalElevationThreshold, estimateTimeFromITRA, calculateKmEffort, formatDecimalHoursToHHMM } from "@/lib/roadbookCalculator";

import DisplaySettings, { useDisplaySettings } from "@/components/DisplaySettings";
import { useNavbarActions } from "@/context/NavbarActionsContext";

// Dynamic import for Leaflet Map to avoid SSR issues
const MapComponent = dynamic(() => import('@/components/MapComponent'), { 
  ssr: false,
  loading: () => <div className={styles.mapLoading}><Loader2 className="lucide-spin" size={32} /> Chargement de la carte...</div>
});

const ElevationProfile = dynamic(() => import('@/components/ElevationProfile'), { 
  ssr: false,
  loading: () => <div className={styles.mapLoading}><Loader2 className="lucide-spin" size={32} /> Chargement du profil...</div>
});

const SegmentElevationProfile = dynamic(() => import('@/components/SegmentElevationProfile'), { 
  ssr: false,
  loading: () => <div className={styles.mapLoading}><Loader2 className="lucide-spin" size={32} /> Chargement du profil...</div>
});

export default function RoadbookEditor() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const params = useParams();
  const { id } = params;
  const { config: displayConfig, updateConfig, isLoaded: displayLoaded } = useDisplaySettings("roadbookViewConfig");
  const { setActions } = useNavbarActions();

  const [roadbook, setRoadbook] = useState(null);
  const [points, setPoints] = useState([]);
  const [waypoints, setWaypoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState("");
  
  const [targetFast, setTargetFast] = useState(28);
  const targetSlow = targetFast * 1.2; // Computed slow target for internal usage
  const [fatiguePercent, setFatiguePercent] = useState(15);
  const [startTime, setStartTime] = useState("");
  const [officialDistance, setOfficialDistance] = useState("");
  const [officialElevation, setOfficialElevation] = useState("");
  const [itraIndex, setItraIndex] = useState("");
  const [descentThreshold, setDescentThreshold] = useState(15);
  const [carbTarget, setCarbTarget] = useState("60");
  const [sodiumTarget, setSodiumTarget] = useState("400");
  const [waterTarget, setWaterTarget] = useState("500");
  const [caffeineTarget, setCaffeineTarget] = useState("50");
  const [weight, setWeight] = useState("");
  const [weather, setWeather] = useState("modere");
  const [segments, setSegments] = useState([]);
  const [inventory, setInventory] = useState([
    { id: 1, name: 'Gel Classique', carbs: 25, sodium: 50, caffeine: 0 },
    { id: 2, name: 'Gel Caféine', carbs: 25, sodium: 50, caffeine: 50 },
    { id: 3, name: 'Flasque Iso 500ml', carbs: 30, sodium: 300, caffeine: 0 }
  ]);
  const [nextProdId, setNextProdId] = useState(4);
  const [newWpKm, setNewWpKm] = useState("");
  const [newWpName, setNewWpName] = useState("");
  const [newWpType, setNewWpType] = useState("point");
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  useEffect(() => {
    if (points.length > 0) {
      const enrichedWp = enrichWaypointsWithStartEnd(waypoints, points);
      
      const rawStats = calculateTraceStats(points, 7, 1);
      const distFactor = (officialDistance && parseFloat(officialDistance) > 0 && rawStats.distance > 0) ? (parseFloat(officialDistance) / rawStats.distance) : 1;
      const optThreshold = (officialElevation && parseFloat(officialElevation) > 0) ? findOptimalElevationThreshold(points, parseFloat(officialElevation)) : 5;
      
      const newSegments = generateSegments(
        points, enrichedWp, targetFast, targetSlow, fatiguePercent,
        startTime, optThreshold, distFactor,
        weather, parseFloat(descentThreshold) || 15
      );
      setSegments(newSegments);
    }
  }, [points, waypoints, targetFast, fatiguePercent, startTime, officialDistance, officialElevation, weather, descentThreshold]);

  const formatTime = (isoString) => {
    if (!isoString) return "--h--";
    const date = new Date(isoString);
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}h${m}`;
  };

  const round10 = (val) => Math.round(val / 10) * 10;

  const formatDuration = (ms) => {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes}min`;
    return `${hours}h${minutes.toString().padStart(2, '0')}`;
  };

  const calculatePace = (durationMs, distanceKm) => {
    if (distanceKm === 0) return "0:00";
    const minutes = durationMs / 60000;
    const paceMinutes = minutes / distanceKm;
    const mins = Math.floor(paceMinutes);
    const secs = Math.round((paceMinutes - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!currentUser) return;

    async function fetchData() {
      try {
        const docRef = doc(db, "roadbooks", id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists() && docSnap.data().userId === currentUser.uid) {
          const data = docSnap.data();
          setRoadbook(data);
          setEditName(data.name || "");
          setPoints(JSON.parse(data.points || "[]"));
          
          if (data.targetFast) setTargetFast(data.targetFast);
          if (data.fatiguePercent !== undefined) setFatiguePercent(data.fatiguePercent);
          if (data.startTime) setStartTime(data.startTime);
          if (data.officialDistance !== undefined) setOfficialDistance(data.officialDistance.toString());
          if (data.officialElevation !== undefined) setOfficialElevation(data.officialElevation.toString());
          if (data.carbTarget !== undefined) setCarbTarget(data.carbTarget.toString());
          if (data.sodiumTarget !== undefined) setSodiumTarget(data.sodiumTarget.toString());
          if (data.waterTarget !== undefined) setWaterTarget(data.waterTarget.toString());
          if (data.caffeineTarget !== undefined) setCaffeineTarget(data.caffeineTarget.toString());
          if (data.weight !== undefined) setWeight(data.weight.toString());
          if (data.weather) setWeather(data.weather);
          if (data.itraIndex) setItraIndex(data.itraIndex);
          
          // Récupération des valeurs par défaut du profil utilisateur si manquantes
          if (!data.itraIndex || data.weight === undefined) {
            try {
              const userDoc = await getDoc(doc(db, "users", currentUser.uid));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                if (!data.itraIndex && userData.itraIndex) setItraIndex(userData.itraIndex.toString());
                if (data.weight === undefined && userData.weight) setWeight(userData.weight.toString());
              }
            } catch (err) {
              console.error("Impossible de charger les paramètres par défaut du profil:", err);
            }
          }
          if (data.descentThreshold !== undefined) setDescentThreshold(data.descentThreshold);
          if (data.inventory) {
            const inv = JSON.parse(data.inventory);
            setInventory(inv);
            if (inv.length > 0) setNextProdId(Math.max(...inv.map(p => p.id)) + 1);
          }
          
          // Generate IDs for waypoints if they don't have one
          const parsedWp = JSON.parse(data.waypoints || "[]").map((wp, i) => ({
            ...wp,
            id: wp.id || `wp-${i}-${Date.now()}`
          }));
          setWaypoints(parsedWp);
        } else {
          router.push("/dashboard");
        }
      } catch (err) {
        console.error("Erreur de chargement", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [id, currentUser, router]);

  const autoSaveWaypoints = async (newWaypoints) => {
    try {
      setSaving(true);
      const docRef = doc(db, "roadbooks", id);
      await updateDoc(docRef, {
        waypoints: JSON.stringify(newWaypoints),
      });
    } catch (err) {
      console.error("Erreur auto-save", err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddWaypoint = (newWp) => {
    const updated = [...waypoints, newWp];
    setWaypoints(updated);
    autoSaveWaypoints(updated);
  };

  const handleUpdateWaypoint = (idToUpdate, updates) => {
    const updated = waypoints.map(w => w.id === idToUpdate ? { ...w, ...updates } : w);
    setWaypoints(updated);
    autoSaveWaypoints(updated);
  };

  const handleRemoveWaypoint = (idToRemove) => {
    const updated = waypoints.filter((w) => w.id !== idToRemove);
    setWaypoints(updated);
    autoSaveWaypoints(updated);
  };

  const handleAddWaypointByKm = () => {
    const dist = parseFloat(newWpKm);
    if (isNaN(dist) || dist < 0) return alert("Distance invalide");
    
    addWaypointAtDistance(dist, newWpName.trim(), newWpType);
    setNewWpKm("");
    setNewWpName("");
    setNewWpType("point");
  };

  const addWaypointAtDistance = (dist, customName = "", customType = "point") => {
    const finalName = customName || `R${waypoints.length + 1}`;
    
    const point = findPointByDistance(dist, points);
    if (point) {
      handleAddWaypoint({
        id: `wp-manual-${Date.now()}`,
        name: finalName,
        lat: point.lat,
        lon: point.lon,
        ele: point.ele,
        type: customType,
      });
    }
  };

  const handleHoverDistance = (dist) => {
    if (dist === null) {
      setHoveredPoint(null);
    } else {
      const p = findPointByDistance(dist, points);
      if (p) setHoveredPoint(p);
    }
  };

  const saveRoadbook = async () => {
    try {
      setSaving(true);
      const docRef = doc(db, "roadbooks", id);
      await updateDoc(docRef, {
        name: editName,
        waypoints: JSON.stringify(waypoints),
        targetFast: targetFast,
        targetSlow: targetSlow,
        fatiguePercent: fatiguePercent,
        startTime: startTime,
        officialDistance: parseFloat(officialDistance) || 0,
        officialElevation: parseFloat(officialElevation) || 0,
        carbTarget: parseInt(carbTarget) || 0,
        sodiumTarget: parseInt(sodiumTarget) || 0,
        waterTarget: parseInt(waterTarget) || 0,
        caffeineTarget: parseInt(caffeineTarget) || 0,
        weight: parseFloat(weight) || 0,
        weather: weather,
        itraIndex: itraIndex,
        descentThreshold: parseFloat(descentThreshold) || 15,
        inventory: JSON.stringify(inventory),
      });
      alert("Sauvegardé avec succès !");
    } catch (err) {
      console.error("Erreur de sauvegarde", err);
      alert("Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  // Inject navbar actions (sticky bar)
  useEffect(() => {
    setActions(
      <>
        {displayLoaded && <DisplaySettings config={displayConfig} updateConfig={updateConfig} />}
        <Link href={`/roadbook/${id}`} className="btn btn-secondary" style={{fontSize:'0.85rem', padding:'6px 14px'}}>
          Tableau de marche
        </Link>
        <button onClick={saveRoadbook} disabled={saving} className="btn btn-primary" style={{fontSize:'0.85rem', padding:'6px 14px'}}>
          {saving ? <Loader2 className="lucide-spin" size={16} /> : <Save size={16} />}
          {saving ? "Sauvegarde..." : "Sauvegarder"}
        </button>
      </>
    );
    return () => setActions(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayLoaded, displayConfig, saving, id]);

  // Guide ITRA (suggestion uniquement)
  const itraGuide = useMemo(() => {
    if (!roadbook || !itraIndex) return null;
    const totalDist = roadbook.stats?.distance || 0;
    const totalEle = roadbook.stats?.elevation?.pos || 0;
    const totalEleNeg = roadbook.stats?.elevation?.neg || 0;
    const kmEffort = calculateKmEffort(totalDist, totalEle, totalEleNeg, parseFloat(descentThreshold) || 15, 10);
    
    if (itraIndex && !isNaN(parseInt(itraIndex))) {
      return estimateTimeFromITRA(parseInt(itraIndex), kmEffort, fatiguePercent || 15);
    }
    return null;
  }, [itraIndex, roadbook, descentThreshold, fatiguePercent]);

  const addProduct = () => {
    setInventory([...inventory, { id: nextProdId, name: 'Nouveau Produit', carbs: 0, sodium: 0, caffeine: 0 }]);
    setNextProdId(nextProdId + 1);
  };
  const removeProduct = (idToRemove) => {
    setInventory(inventory.filter(p => p.id !== idToRemove));
  };
  const updateProduct = (idToUpdate, field, value) => {
    setInventory(inventory.map(p => p.id === idToUpdate ? { ...p, [field]: value } : p));
  };
  
  const handleWaypointNutritionChange = (wpId, prodId, delta) => {
    const wp = waypoints.find(w => w.id === wpId);
    if (!wp) return;
    const currentNutri = wp.planned_nutrition || {};
    let newQty = (currentNutri[prodId] || 0) + delta;
    if (newQty < 0) newQty = 0;
    
    handleUpdateWaypoint(wpId, { 
      planned_nutrition: { ...currentNutri, [prodId]: newQty } 
    });
  };

  if (loading) return <div className="container" style={{paddingTop: '2rem'}}>Chargement de l'éditeur...</div>;
  if (!roadbook) return null;

  const baseLat = points && points.length > 0 ? points[0].lat : 45.9;
  const baseLon = points && points.length > 0 ? points[0].lon : 6.8;

  const rawStats = points.length > 0 ? calculateTraceStats(points, 7, 1) : { distance: 1 };
  const currentDistFactor = (officialDistance && parseFloat(officialDistance) > 0 && rawStats.distance > 0) ? (parseFloat(officialDistance) / rawStats.distance) : 1;

  // Calcul dynamique des stats totales pour correspondre exactement aux segments (et corriger d'anciens roadbooks)
  const displayDistance = segments.length > 0 ? segments[segments.length - 1].cumulDistance : roadbook.stats.distance;
  const displayElePos = segments.length > 0 ? segments[segments.length - 1].cumulElevation : roadbook.stats.elevation.pos;
  
  // D- lissé non cumulé explicitement dans le seg object final, on l'additionne
  const displayEleNeg = segments.length > 0 ? segments.reduce((acc, seg) => acc + seg.elevationNeg, 0) : roadbook.stats.elevation.neg;

  // Temps total estimé depuis les segments
  const totalFastMs = segments.length > 0 ? segments.reduce((acc, s) => acc + s.durationFastMs, 0) : 0;
  const totalSlowMs = segments.length > 0 ? segments.reduce((acc, s) => acc + s.durationSlowMs, 0) : 0;
  const fmtTotalFast = totalFastMs > 0 ? formatDuration(totalFastMs) : `${targetFast}h`;
  const fmtTotalSlow = totalSlowMs > 0 ? formatDuration(totalSlowMs) : `${targetSlow}h`;

  return (
    <div className={styles.editorContainer}>
      <header className={styles.editorHeader}>
        <div className={styles.titleSection}>
          <Link href="/dashboard" className="btn btn-secondary" style={{ padding: '8px', borderRadius: '50%' }}>
            <ArrowLeft size={20} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input 
              type="text" 
              value={editName} 
              onChange={e => setEditName(e.target.value)} 
              style={{ fontSize: '1.5rem', fontWeight: 'bold', border: 'none', background: 'transparent', color: 'var(--text-primary)', borderBottom: '1px dashed var(--border-light)', outline: 'none', width: 'auto', minWidth: '200px' }} 
            />
            <Edit2 size={16} style={{ color: 'var(--text-secondary)' }} />
          </div>
        </div>
        
      </header>

      <div className={styles.statsBar}>
        <div className={styles.statBox}>
          <span>Distance</span>
          <strong>{displayDistance.toFixed(1)}<small>km</small></strong>
        </div>
        <div className={styles.statBox}>
          <span>D+</span>
          <strong style={{ color: 'var(--color-accent)' }}>+{displayElePos.toFixed(0)}<small>m</small></strong>
        </div>
        <div className={styles.statBox}>
          <span>D−</span>
          <strong style={{ color: '#EF4444' }}>−{displayEleNeg.toFixed(0)}<small>m</small></strong>
        </div>
        <div className={styles.statBox}>
          <span>Points de contrôle</span>
          <strong>{waypoints.length}</strong>
        </div>
        <div className={`${styles.statBox} ${styles.statBoxTime}`}>
          <span>⚡ Objectif de course</span>
          <strong>
            <span style={{ color: '#10B981' }}>{fmtTotalFast}</span>
          </strong>
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '24px', padding: '24px' }}>
        {/* Profil Coureur */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 className={styles.sectionTitle}>🏃 Profil & Objectifs</h3>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '0' }}>
              <label className={styles.paramLabel}>Index ITRA</label>
              <input type="number" className="input-field" placeholder="Ex: 500" value={itraIndex} onChange={e => setItraIndex(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '0' }}>
              <label className={styles.paramLabel}>Objectif Course</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="number" min="0" className="input-field" placeholder="H" value={targetFast === '' || isNaN(targetFast) ? "" : Math.floor(targetFast)} onChange={e => {
                  const h = parseInt(e.target.value);
                  const m = targetFast === '' || isNaN(targetFast) ? 0 : Math.round((targetFast % 1) * 60);
                  setTargetFast(isNaN(h) ? (m ? m/60 : '') : h + m / 60);
                }} style={{ width: '100%' }} />
                <span>h</span>
                <input type="number" min="0" max="59" className="input-field" placeholder="M" value={targetFast === '' || isNaN(targetFast) ? "" : Math.round((targetFast % 1) * 60)} onChange={e => {
                  const h = targetFast === '' || isNaN(targetFast) ? 0 : Math.floor(targetFast);
                  const m = parseInt(e.target.value);
                  setTargetFast(isNaN(m) ? (h ? h : '') : h + m / 60);
                }} style={{ width: '100%' }} />
                <span>m</span>
              </div>
            </div>
          </div>
          
          {itraGuide && (
            <div style={{ fontSize: '0.85rem', color: '#6B7280', marginTop: '-8px', marginBottom: '8px' }}>
              💡 <span style={{ fontStyle: 'italic' }}>Guide selon ITRA : {formatDecimalHoursToHHMM(itraGuide.fastH)}</span>
            </div>
          )}

          <div className={styles.paramGroup}>
            <label className={styles.paramLabel}>Poids du coureur (kg)</label>
            <input type="number" step="1" className="input-field" placeholder="Ex: 70" value={weight} onChange={e => setWeight(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>

        {/* Course & Départ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 className={styles.sectionTitle}>⏱️ Course & Forme</h3>
          
          <div className={styles.paramGroup}>
            <label className={styles.paramLabel}>Date & Heure de départ</label>
            <input type="datetime-local" className="input-field" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ width: '100%' }} />
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '0' }}>
              <label className={styles.paramLabel}>Fatigue Estimée (%)</label>
              <input type="number" step="5" className="input-field" value={Number.isNaN(fatiguePercent) ? "" : fatiguePercent} onChange={e => setFatiguePercent(e.target.value === '' ? '' : parseFloat(e.target.value))} style={{ width: '100%' }} />
            </div>
            
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '0' }}>
              <label className={styles.paramLabel}>Météo Prévue</label>
              <select className="input-field" value={weather} onChange={e => setWeather(e.target.value)} style={{ width: '100%' }}>
                <option value="froid">Froid (&lt; 10°C)</option>
                <option value="modere">Modéré (10-20°C)</option>
                <option value="chaud">Chaud (20-28°C)</option>
                <option value="tres_chaud">Canicule (&gt; 28°C)</option>
              </select>
            </div>
          </div>

          <div className={styles.paramGroup}>
            <label className={styles.paramLabel} title="Seuil de pente à partir duquel vous marchez plutôt que de courir. Défaut: 15% (traileur moyen). Diminuez si vous êtes bon descendeur, augmentez si vous marchez plus.">Seuil Marche / Course (%)</label>
            <input
              type="number" step="1" min="5" max="30"
              className="input-field"
              value={Number.isNaN(descentThreshold) ? "" : descentThreshold}
              onChange={e => setDescentThreshold(e.target.value === '' ? '' : parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px'}}>
              Seuil pente descente douce/raide (modèle Minetti). Défaut: 15%
            </div>
          </div>
        </div>

        {/* Ajustements Organisateur */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 className={styles.sectionTitle}>📏 Données Organisateur</h3>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '0' }}>
              <label className={styles.paramLabel}>Distance Off. (km)</label>
              <input type="number" step="0.1" className="input-field" placeholder="Ex: 42.5" value={officialDistance} onChange={e => setOfficialDistance(e.target.value)} style={{ width: '100%' }} />
            </div>

            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '0' }}>
              <label className={styles.paramLabel}>Dénivelé Pos. (m)</label>
              <input type="number" step="10" className="input-field" placeholder="Ex: 2500" value={officialElevation} onChange={e => setOfficialElevation(e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>
        </div>

        {/* Objectifs Nutritionnels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 className={styles.sectionTitle}>🍎 Objectifs Nutritionnels</h3>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '0' }}>
              <label className={styles.paramLabel}>Glucides (g/h)</label>
              <input type="number" step="5" className="input-field" value={carbTarget} onChange={e => setCarbTarget(e.target.value)} style={{ width: '100%' }} />
              <div style={{fontSize: '0.7rem', color: '#10B981', marginTop: '4px'}}>
                Conseil : 60-90 g/h
              </div>
            </div>

            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '0' }}>
              <label className={styles.paramLabel}>Eau (ml/h)</label>
              <input type="number" step="50" className="input-field" value={waterTarget} onChange={e => setWaterTarget(e.target.value)} style={{ width: '100%' }} />
              <div style={{fontSize: '0.7rem', color: '#3B82F6', marginTop: '4px'}}>
                Conseil : {weather === 'froid' ? '400-500' : weather === 'modere' ? '500-600' : weather === 'chaud' ? '600-800' : '800-1000'} ml/h
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '0' }}>
              <label className={styles.paramLabel}>Sodium (mg/h)</label>
              <input type="number" step="50" className="input-field" value={sodiumTarget} onChange={e => setSodiumTarget(e.target.value)} style={{ width: '100%' }} />
              <div style={{fontSize: '0.7rem', color: '#F59E0B', marginTop: '4px'}}>
                Conseil : {weather === 'froid' ? '300-400' : weather === 'modere' ? '400-500' : weather === 'chaud' ? '500-600' : '600-800'} mg/h
              </div>
            </div>

            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '0' }}>
              <label className={styles.paramLabel}>Caféine (ponctuel)</label>
              <input type="number" step="10" className="input-field" value={caffeineTarget} title="Dose cible par prise (en mg)" onChange={e => setCaffeineTarget(e.target.value)} style={{ width: '100%' }} />
              <div style={{fontSize: '0.7rem', color: '#8B5CF6', marginTop: '4px'}}>
                Conseil : {weight ? `~${Math.round(weight * 3)}-${Math.round(weight * 6)}mg max/course` : 'Prise de ~50mg en cas de coup de fatigue'}
              </div>
            </div>
          </div>
        </div>
        {/* Inventaire Nutritionnel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' }}>
          <h3 className={styles.sectionTitle}>🎒 Inventaire Nutritionnel</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Définissez ici vos produits énergétiques pour les répartir sur les ravitaillements.
          </p>
          
          <div className={styles.invTable} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '12px', fontWeight: 'bold', fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '0 8px' }}>
              <div>Nom du produit</div>
              <div>Glucides (g)</div>
              <div>Sodium (mg)</div>
              <div>Caféine (mg)</div>
              <div></div>
            </div>
            
            {inventory.map(prod => (
              <div key={prod.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '12px', alignItems: 'center' }}>
                <input 
                  type="text" 
                  value={prod.name} 
                  onChange={e => updateProduct(prod.id, 'name', e.target.value)}
                  className="input-field" 
                  style={{ width: '100%' }}
                />
                <input 
                  type="number" 
                  value={prod.carbs} 
                  onChange={e => updateProduct(prod.id, 'carbs', parseFloat(e.target.value) || 0)}
                  className="input-field" 
                  style={{ width: '100%' }}
                />
                <input 
                  type="number" 
                  value={prod.sodium} 
                  onChange={e => updateProduct(prod.id, 'sodium', parseFloat(e.target.value) || 0)}
                  className="input-field" 
                  style={{ width: '100%' }}
                />
                <input 
                  type="number" 
                  value={prod.caffeine} 
                  onChange={e => updateProduct(prod.id, 'caffeine', parseFloat(e.target.value) || 0)}
                  className="input-field" 
                  style={{ width: '100%' }}
                />
                <button 
                  onClick={() => removeProduct(prod.id)}
                  style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Supprimer"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          
          <button 
            onClick={addProduct} 
            className="btn btn-secondary" 
            style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem' }}
          >
            <span>➕</span> Ajouter un produit
          </button>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <div className="card" style={{ marginBottom: '24px', padding: '16px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '1.25rem' }}>Carte & Ravitaillements</h2>
            <p style={{ marginBottom: '16px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Cliquez sur la trace (ligne orange) pour ajouter un nouveau point de contrôle ou ravitaillement manuellement.
            </p>
            <MapComponent 
              points={points} 
              segments={segments} 
              onAddWaypoint={handleAddWaypoint}
              onRemoveWaypoint={handleRemoveWaypoint}
              onUpdateWaypoint={handleUpdateWaypoint}
              hoveredPoint={hoveredPoint}
              waypointCount={waypoints.length}
            />
          </div>

          <div className="card" style={{ marginBottom: '24px', padding: '16px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '1.25rem' }}>Profil Altimétrique</h2>
            <p style={{ marginBottom: '16px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Cliquez n'importe où sur le graphique pour ajouter un point de contrôle à cette distance exacte.
            </p>
            <ElevationProfile 
              points={points} 
              segments={segments} 
              startTime={startTime} 
              distanceFactor={currentDistFactor}
              onAddWaypointByDistance={(dist) => addWaypointAtDistance(dist)} 
              onHoverDistance={handleHoverDistance}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '1.25rem' }}>Roadbook</h2>
            
            {!showManualAdd ? (
              <button 
                onClick={() => setShowManualAdd(true)} 
                className="btn btn-secondary" 
                style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <span>➕</span> Ajouter un point manuellement
              </button>
            ) : (
              <div style={{ marginBottom: '24px', background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)', position: 'relative' }}>
                <button 
                  onClick={() => setShowManualAdd(false)}
                  style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-secondary)' }}
                  title="Fermer"
                >
                  ✖
                </button>
                <h3 style={{ fontSize: '1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.2rem' }}>📍</span> Ajouter un point de passage manuellement
                </h3>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: '0 0 140px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '6px' }}>Distance (km)</label>
                    <input type="number" step="0.1" placeholder="ex: 15.5" value={newWpKm} onChange={e => setNewWpKm(e.target.value)} className="input-field" style={{ width: '100%' }} />
                  </div>
                  <div style={{ flex: '1 1 200px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '6px' }}>Nom du lieu (Ravitaillement, Col...)</label>
                    <input type="text" placeholder="ex: Ravito des crêtes" value={newWpName} onChange={e => setNewWpName(e.target.value)} className="input-field" style={{ width: '100%' }} />
                  </div>
                  <div style={{ flex: '0 0 140px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '6px' }}>Type</label>
                    <select value={newWpType} onChange={e => setNewWpType(e.target.value)} className="input-field" style={{ width: '100%' }}>
                      <option value="point">Point de passage</option>
                      <option value="water">Point d'eau</option>
                      <option value="full">Ravito complet</option>
                      <option value="base">Base vie</option>
                    </select>
                  </div>
                  <button onClick={() => {
                    handleAddWaypointByKm();
                    setShowManualAdd(false);
                  }} className="btn btn-primary" style={{ height: '38px', padding: '0 20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>➕</span> Ajouter ce point
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {segments.map((seg, index) => {
                const totalDurationFastMs = segments.slice(0, index + 1).reduce((acc, s) => acc + s.durationFastMs, 0);
                const totalDurationSlowMs = segments.slice(0, index + 1).reduce((acc, s) => acc + s.durationSlowMs, 0);
                
                // Calcul des besoins nutritionnels pour CE segment
                const segmentDurationSlowHours = seg.durationSlowMs / 3600000;
                
                const carbsNeeded = Math.round(segmentDurationSlowHours * (parseInt(carbTarget) || 0));
                const sodiumNeeded = Math.round(segmentDurationSlowHours * (parseInt(sodiumTarget) || 0));
                const waterNeeded = Math.round(segmentDurationSlowHours * (parseInt(waterTarget) || 0));
                const caffeineNeeded = parseInt(caffeineTarget) || 0; // Usage ponctuel, pas par heure
                
                const segmentCarbsNeeded = carbsNeeded;
                const segmentSodiumNeeded = sodiumNeeded;
                const segmentWaterNeeded = waterNeeded;
                const segmentCaffeineNeeded = caffeineNeeded;
                
                let plannedCarbs = 0;
                let plannedSodium = 0;
                let plannedWater = 0;
                let plannedCaffeine = 0;
                
                if (seg.to.planned_nutrition) {
                  Object.keys(seg.to.planned_nutrition).forEach(prodId => {
                     const qty = seg.to.planned_nutrition[prodId];
                     const prod = inventory.find(p => p.id.toString() === prodId.toString());
                     if (prod) {
                        plannedCarbs += (prod.carbs || 0) * qty;
                        plannedSodium += (prod.sodium || 0) * qty;
                        plannedCaffeine += (prod.caffeine || 0) * qty;
                        
                        // Si le nom du produit contient "ml", on essaie d'extraire la quantité d'eau pour la jauge.
                        const mlMatch = prod.name.match(/(\d+)\s*ml/i);
                        if (mlMatch) {
                          plannedWater += parseInt(mlMatch[1]) * qty;
                        }
                     }
                  });
                }
                
                const timeOnClimbsHours = ((seg.durationSlowMs / 3600000) * (seg.climbKmEffort / (seg.kmEffort || 1))) || 0;
                const vamEst = timeOnClimbsHours > 0 ? Math.round(seg.climbElePos / timeOnClimbsHours) : 0;
                
                const departureTimeFast = index === 0 
                  ? (startTime ? new Date(startTime).toISOString() : null)
                  : segments[index - 1].arr_fast;
                  
                const departureTimeSlow = index === 0 
                  ? (startTime ? new Date(startTime).toISOString() : null)
                  : segments[index - 1].arr_slow;

                const isNight = getNightIntensity(new Date(seg.arr_slow), baseLat, baseLon) > 0;

                return (
                  <div key={seg.id} className={styles.segmentCard}>
                    <div className={styles.segmentHeader}>
                      <div className={styles.segmentTitle}>
                        <h3>
                          <span style={{color: 'var(--text-secondary)', marginRight: '8px'}}>#{index+1}</span>
                          {seg.from.name} ➔ {seg.to.id.startsWith("wp-end") ? seg.to.name : (
                            <input 
                              type="text" 
                              value={seg.to.name || ""} 
                              onChange={(e) => handleUpdateWaypoint(seg.to.id, { name: e.target.value })}
                              className="input-field"
                              style={{ padding: '4px 8px', fontSize: '1.25rem', width: 'auto', minWidth: '150px', fontWeight: 'bold' }}
                            />
                          )}
                        </h3>
                        <div className={styles.cumulBlock}>
                          {(!displayLoaded || displayConfig.dist) && <span>🏃 {seg.cumulDistance.toFixed(1)} km</span>}
                          {(!displayLoaded || displayConfig.elePos) && <span style={{ color: '#F59E0B' }}>⛰️ +{seg.cumulElevation.toFixed(0)}m</span>}
                        </div>
                      </div>
                      
                      <div style={{display: 'flex', gap: '16px', fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '8px', flexWrap: 'wrap'}}>
                        {(!displayLoaded || displayConfig.dist) && <span>Dist: {seg.distance.toFixed(1)} km</span>}
                        {(!displayLoaded || displayConfig.elePos) && <span>D+: +{seg.elevationPos.toFixed(0)}m</span>}
                        {(!displayLoaded || displayConfig.eleNeg) && <span style={{color: '#EF4444'}}>D-: -{Math.abs(seg.elevationNeg || 0).toFixed(0)}m</span>}
                        {(!displayLoaded || displayConfig.cutoff) && !seg.to.id.startsWith("wp-end") && (
                          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                            <Timer size={14}/> Barrière:
                            <input 
                              type="time" 
                              className="input-field" 
                              style={{ padding: '2px 6px', fontSize: '12px' }}
                              value={seg.to.cutoffTime || ""}
                              onChange={(e) => handleUpdateWaypoint(seg.to.id, { cutoffTime: e.target.value })}
                            />
                          </div>
                        )}
                        {!seg.to.id.startsWith("wp-end") && (
                          <button 
                            onClick={() => handleRemoveWaypoint(seg.to.id)}
                            style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '0 8px', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}
                            title="Supprimer ce point"
                          >
                            <Trash2 size={14} /> Supprimer étape
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className={styles.interactiveForm}>
                      <div className={styles.formGroup}>
                        <label>Type</label>
                        <select 
                          value={seg.to.type || "point"} 
                          onChange={e => handleUpdateWaypoint(seg.to.id, { type: e.target.value })}
                        >
                          <option value="point">Point de passage</option>
                          <option value="water">Point d'eau</option>
                          <option value="full">Ravito complet</option>
                          <option value="base">Base vie</option>
                        </select>
                      </div>
                      
                      <div className={styles.formGroup}>
                        <label>Vitesse (%)</label>
                        <input 
                          type="number" 
                          value={Number.isNaN(seg.to.time_modifier) ? "" : (seg.to.time_modifier || 100)} 
                          min="50" 
                          max="200" 
                          onChange={e => handleUpdateWaypoint(seg.to.id, { time_modifier: e.target.value === '' ? '' : (parseFloat(e.target.value) || 100) })} 
                        />
                      </div>
                      
                      <div className={styles.formGroup}>
                        <label>Pause (min)</label>
                        <input 
                          type="number" 
                          value={Number.isNaN(seg.to.pause) ? "" : (seg.to.pause || 0)} 
                          min="0" 
                          onChange={e => handleUpdateWaypoint(seg.to.id, { pause: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0) })} 
                        />
                      </div>
                      
                      <div className={styles.checkboxesContainer}>
                        <label className={styles.checkboxGroup}>
                          <input 
                            type="checkbox" 
                            checked={seg.to.assistance_allowed || false} 
                            onChange={e => handleUpdateWaypoint(seg.to.id, { assistance_allowed: e.target.checked })} 
                          />
                          <span>Assistance</span>
                        </label>
                        <label className={styles.checkboxGroup}>
                          <input 
                            type="checkbox" 
                            checked={seg.to.has_dropbag || false} 
                            onChange={e => handleUpdateWaypoint(seg.to.id, { has_dropbag: e.target.checked })} 
                          />
                          <span>Dropbag</span>
                        </label>
                      </div>
                    </div>
                    
                    <div style={{ padding: '16px', background: 'var(--background)', borderBottom: '1px solid var(--border-light)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                      {( (!displayLoaded) || displayConfig.timeInter || displayConfig.timeTotal || displayConfig.pace ) && (
                        <div style={{display: 'flex', flexDirection: 'column'}}>
                          <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase'}}><Clock size={12} style={{display: 'inline', marginRight: '4px', verticalAlign: 'middle'}}/>Temps (Rapide / Lent)</span>
                          <div style={{fontSize: '0.875rem', marginTop: '4px'}}>
                            {(!displayLoaded || displayConfig.timeInter) && (
                              <div>
                                <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>Segment: </span>
                                <span style={{fontWeight: 'bold', color: '#10B981'}}>{formatDuration(seg.durationFastMs)}</span> / <span style={{fontWeight: 'bold', color: '#F59E0B'}}>{formatDuration(seg.durationSlowMs)}</span>
                              </div>
                            )}
                            {(!displayLoaded || displayConfig.timeTotal) && (
                              <div style={{marginTop: '4px'}}>
                                <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>Cumul: </span>
                                <span style={{fontWeight: 'bold', color: '#10B981'}}>{formatDuration(totalDurationFastMs)}</span> / <span style={{fontWeight: 'bold', color: '#F59E0B'}}>{formatDuration(totalDurationSlowMs)}</span>
                              </div>
                            )}
                            {(!displayLoaded || displayConfig.pace) && (
                              <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px'}}>Allure Lent: {calculatePace(seg.durationSlowMs, seg.distance)} /km</div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {( (!displayLoaded) || displayConfig.etaFast || displayConfig.etaSlow ) && (
                        <div style={{display: 'flex', flexDirection: 'column'}}>
                          <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase'}}><Timer size={12} style={{display: 'inline', marginRight: '4px', verticalAlign: 'middle'}}/>Heure de passage</span>
                          <div style={{fontSize: '0.875rem', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px'}}>
                            {(!displayLoaded || displayConfig.etaFast) && <span style={{color: '#10B981'}}>Rapide: {formatTime(departureTimeFast)} ➔ <strong>{formatTime(seg.arr_fast)}</strong></span>}
                            {(!displayLoaded || displayConfig.etaSlow) && <span style={{color: '#F59E0B'}}>Lent: {formatTime(departureTimeSlow)} ➔ <strong>{formatTime(seg.arr_slow)}</strong></span>}
                          </div>
                        </div>
                      )}
                      {(!displayLoaded || displayConfig.nutrition) && (
                        <div style={{display: 'flex', flexDirection: 'column'}}>
                          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '8px' }}>
                            <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase'}}>
                              <Activity size={12} style={{display: 'inline', marginRight: '4px', verticalAlign: 'middle'}}/>Besoins du segment
                            </span>
                          </div>
                        
                        {/* Nutrition Gauges */}
                        <div className={styles.nutriNeeded}>
                          
                          {/* Glucides */}
                          <div className={styles.gaugeContainer}>
                            <span className={styles.gaugeLabel} title="Glucides"><Utensils size={12} style={{display: 'inline', color: '#10B981', marginRight: '4px', verticalAlign: 'middle'}}/> Gluc.</span>
                            <div className={styles.gaugeTrack}>
                              <div 
                                className={styles.gaugeFill} 
                                style={{
                                  width: `${Math.min((plannedCarbs / (carbsNeeded || 1)) * 100, 100)}%`, 
                                  backgroundColor: plannedCarbs >= carbsNeeded ? '#10B981' : '#F59E0B'
                                }} 
                              />
                            </div>
                            <span className={styles.gaugeValue}>{round10(plannedCarbs)}/{round10(carbsNeeded)}g</span>
                          </div>

                          {/* Sodium */}
                          <div className={styles.gaugeContainer}>
                            <span className={styles.gaugeLabel} title="Sodium"><Activity size={12} style={{display: 'inline', color: '#F59E0B', marginRight: '4px', verticalAlign: 'middle'}}/> Sod.</span>
                            <div className={styles.gaugeTrack}>
                              <div 
                                className={styles.gaugeFill} 
                                style={{
                                  width: `${Math.min((plannedSodium / (sodiumNeeded || 1)) * 100, 100)}%`, 
                                  backgroundColor: plannedSodium >= sodiumNeeded ? '#10B981' : '#F59E0B'
                                }} 
                              />
                            </div>
                            <span className={styles.gaugeValue}>{round10(plannedSodium)}/{round10(sodiumNeeded)}mg</span>
                          </div>

                          {/* Eau */}
                          <div className={styles.gaugeContainer}>
                            <span className={styles.gaugeLabel} title="Eau"><Droplets size={12} style={{display: 'inline', color: '#3B82F6', marginRight: '4px', verticalAlign: 'middle'}}/> Eau</span>
                            <div className={styles.gaugeTrack}>
                              <div 
                                className={styles.gaugeFill} 
                                style={{
                                  width: `${Math.min((plannedWater / (waterNeeded || 1)) * 100, 100)}%`, 
                                  backgroundColor: plannedWater >= waterNeeded ? '#3B82F6' : '#9CA3AF'
                                }} 
                              />
                            </div>
                            <span className={styles.gaugeValue}>{round10(plannedWater)}/{round10(waterNeeded)}ml</span>
                          </div>

                          {/* Caféine (Affichée seulement si planifiée) */}
                          {plannedCaffeine > 0 && (
                            <div className={styles.gaugeContainer}>
                              <span className={styles.gaugeLabel} title="Caféine"><Coffee size={12} style={{display: 'inline', color: '#8B5CF6', marginRight: '4px', verticalAlign: 'middle'}}/> Caf.</span>
                              <div className={styles.gaugeTrack}>
                                <div 
                                  className={styles.gaugeFill} 
                                  style={{
                                    width: `${Math.min((plannedCaffeine / (caffeineNeeded || 1)) * 100, 100)}%`, 
                                    backgroundColor: plannedCaffeine >= caffeineNeeded ? '#8B5CF6' : '#9CA3AF'
                                  }} 
                                />
                              </div>
                              <span className={styles.gaugeValue}>{round10(plannedCaffeine)}/{round10(caffeineNeeded)}mg</span>
                            </div>
                          )}

                        </div>
                      </div>
                      )}
                    </div>
                    
                    {(!displayLoaded || displayConfig.nutrition) && (
                      <div className={styles.nutritionBlock} style={{ borderBottom: '1px solid var(--border-light)', margin: 0, padding: '16px' }}>
                        <h4>🍎 Nutrition à emporter depuis {seg.from.name}</h4>
                        <p style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: '12px'}}>
                          Vers {seg.to.name} ({formatDuration(seg.durationSlowMs)} estimées)
                        </p>
                        <div className={styles.nutriGrid}>
                          {inventory.map(prod => (
                            <div key={prod.id} className={styles.nutriItem}>
                              <label>{prod.name}</label>
                              <div className={styles.qtyControl}>
                                <button onClick={() => handleWaypointNutritionChange(seg.to.id, prod.id, -1)} className={styles.qtyBtn}>-</button>
                                <span className={styles.qtyInput}>{(seg.to.planned_nutrition && seg.to.planned_nutrition[prod.id]) || 0}</span>
                                <button onClick={() => handleWaypointNutritionChange(seg.to.id, prod.id, 1)} className={styles.qtyBtn}>+</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {seg.to.assistance_allowed && (
                      <div className={styles.assistanceBox}>
                        <h4 style={{margin: '0 0 8px 0', fontSize: '0.875rem', color: '#27ae60'}}>🤝 Consignes Assistance ({seg.to.name})</h4>
                        <textarea 
                          value={seg.to.assistance_notes || ""} 
                          onChange={e => handleUpdateWaypoint(seg.to.id, { assistance_notes: e.target.value })} 
                          placeholder="Ex: Préparez les bâtons, changer de chaussettes..."
                          className="input-field"
                          style={{width: '100%', minHeight: '60px', padding: '8px'}}
                        />
                      </div>
                    )}
                    
                    {seg.to.has_dropbag && (
                      <div className={styles.dropbagBox}>
                        <h4 style={{margin: '0 0 8px 0', fontSize: '0.875rem', color: '#8e44ad'}}>🎒 Contenu Sac d'Allègement</h4>
                        <input 
                          type="text" 
                          value={seg.to.dropbag_items || ""} 
                          onChange={e => handleUpdateWaypoint(seg.to.id, { dropbag_items: e.target.value })} 
                          placeholder="Matériel de rechange, chaussures..."
                          className="input-field"
                          style={{width: '100%', padding: '8px'}}
                        />
                      </div>
                    )}

                    <div style={{ padding: '16px', background: 'var(--surface-color)', borderBottom: '1px solid var(--border-light)' }}>
                      <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                        <div style={{fontSize: '0.875rem', fontWeight: 'bold'}}>Répartition du terrain</div>
                        <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>
                          (Marche {'>'} {seg.terrain?.walkThresholdPercent?.toFixed(1)}%)
                        </div>
                      </div>
                      
                      <div style={{display: 'flex', height: '12px', borderRadius: '6px', overflow: 'hidden', width: '100%', marginBottom: '12px'}}>
                        {seg.terrain?.downFlatDist > 0 && (
                          <div 
                            style={{width: `${(seg.terrain.downFlatDist / seg.distance) * 100}%`, background: '#10B981'}} 
                            title={`Descente & Plat: ${seg.terrain.downFlatDist.toFixed(1)} km`}
                          />
                        )}
                        {seg.terrain?.runUphillDist > 0 && (
                          <div 
                            style={{width: `${(seg.terrain.runUphillDist / seg.distance) * 100}%`, background: '#F59E0B'}}
                            title={`Montée Courable: ${seg.terrain.runUphillDist.toFixed(1)} km`}
                          />
                        )}
                        {seg.terrain?.walkDist > 0 && (
                          <div 
                            style={{width: `${(seg.terrain.walkDist / seg.distance) * 100}%`, background: '#8B5CF6'}}
                            title={`Marche: ${seg.terrain.walkDist.toFixed(1)} km`}
                          />
                        )}
                      </div>
                      
                      <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', flexWrap: 'wrap', gap: '8px'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                          <div style={{width: '8px', height: '8px', borderRadius: '50%', background: '#10B981'}}></div>
                          <span>Descente/Plat ({seg.terrain?.downFlatDist?.toFixed(1)} km)</span>
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                          <div style={{width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B'}}></div>
                          <span>Course côte ({seg.terrain?.runUphillDist?.toFixed(1)} km)</span>
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                          <div style={{width: '8px', height: '8px', borderRadius: '50%', background: '#8B5CF6'}}></div>
                          <span>Marche ({seg.terrain?.walkDist?.toFixed(1)} km)</span>
                        </div>
                        
                        {(seg.elevationPos / Math.max(1, seg.distance) > 80) && (
                          <span style={{background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold'}}>🦯 Sortir les bâtons</span>
                        )}
                        {seg.nightIntensity > 0.2 && (
                          <span style={{background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold'}}>🌙 Nuit{seg.nightIntensity > 0.7 ? ' totale' : ' partielle'} (−{Math.round(seg.nightIntensity * 10)}%)</span>
                        )}
                        {seg.weatherCoeff < 1 && (
                          <span style={{background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold'}}>
                            {weather === 'tres_chaud' ? '🥵' : weather === 'chaud' ? '☀️' : '🥶'} Météo (−{Math.round((1 - seg.weatherCoeff) * 100)}%)
                          </span>
                        )}
                        {(!displayLoaded || displayConfig.vam) && seg.vamEstimate > 0 && (
                          <span style={{background: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold'}}>⛰️ VAM: {seg.vamEstimate} m/h</span>
                        )}
                      </div>
                    </div>

                    {/* Ajout du profil altimétrique spécifique à ce segment */}
                    <div style={{ padding: '16px', background: 'var(--background)', borderBottom: '1px solid var(--border-light)' }}>
                      <div style={{fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '8px'}}>Profil du segment</div>
                      <SegmentElevationProfile points={seg.points} baseCumulDist={seg.cumulDistance - seg.distance} distanceFactor={currentDistFactor} />
                    </div>

                  </div>
                );
              })}
              {segments.length === 0 && <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)' }}>Aucun segment calculé</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
