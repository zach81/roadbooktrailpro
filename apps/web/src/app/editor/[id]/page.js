"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, collection, query, where, getDocs, or } from "firebase/firestore";
import dynamic from 'next/dynamic';
import { Save, ArrowLeft, Loader2, Trash2, Timer, Droplets, Utensils, Activity, Clock, Navigation, Edit2, Coffee, Plus } from "lucide-react";
import Link from "next/link";
import styles from "./editor.module.css";
import { enrichWaypointsWithStartEnd, generateSegments, findPointByDistance, getNightIntensity, calculateTraceStats, findOptimalElevationThreshold, calculateKmEffort, formatDecimalHoursToHHMM, deriveConfigFromITRA } from "@/lib/roadbookCalculator";

import DisplaySettings, { defaultDisplayConfig } from "@/components/DisplaySettings";
import { useNavbarActions } from "@/context/NavbarActionsContext";

import { nutritionDatabase } from "@/lib/nutritionData";

const DEFAULT_NUTRITION_PRODUCTS = [
  ...nutritionDatabase,
  { id: "gen-1", name: "Gel Énergétique", brand: "Générique", carbs: 22, sodium: 50, water: 0, caffeine: 0 },
  { id: "gen-2", name: "Gel Énergétique (+ Caféine)", brand: "Générique", carbs: 22, sodium: 50, water: 0, caffeine: 50 },
  { id: "gen-3", name: "Barre Énergétique", brand: "Générique", carbs: 30, sodium: 100, water: 0, caffeine: 0 },
  { id: "gen-4", name: "Compote", brand: "Générique", carbs: 15, sodium: 10, water: 0, caffeine: 0 },
  { id: "gen-5", name: "Boisson Iso (500ml)", brand: "Générique", carbs: 30, sodium: 300, water: 500, caffeine: 0 },
  { id: "gen-6", name: "Eau Pure (500ml)", brand: "Générique", carbs: 0, sodium: 0, water: 500, caffeine: 0 },
  { id: "gen-7", name: "Eau Gazeuse/St-Yorre (500ml)", brand: "Générique", carbs: 0, sodium: 350, water: 500, caffeine: 0 },
  { id: "gen-8", name: "Coca Cola (150ml)", brand: "Générique", carbs: 16, sodium: 15, water: 150, caffeine: 15 },
  { id: "gen-9", name: "Bouillon Salé (200ml)", brand: "Générique", carbs: 2, sodium: 400, water: 200, caffeine: 0 },
  { id: "gen-10", name: "Purée Salée", brand: "Générique", carbs: 20, sodium: 250, water: 0, caffeine: 0 },
  { id: "gen-11", name: "Quartier (Banane/Orange)", brand: "Générique", carbs: 15, sodium: 0, water: 0, caffeine: 0 }
];

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
  const { currentUser, isAdmin } = useAuth();
  const router = useRouter();
  const params = useParams();
  const { id } = params;
  
  const [displayConfig, setDisplayConfig] = useState(defaultDisplayConfig);
  const [displayLoaded, setDisplayLoaded] = useState(false);
  const { setActions } = useNavbarActions();

  const [roadbook, setRoadbook] = useState(null);
  const [points, setPoints] = useState([]);
  const [waypoints, setWaypoints] = useState([]);
  const [dbProducts, setDbProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState("");
  
  const [targetTime, setTargetTime] = useState("");
  const [targetHours, setTargetHours] = useState("");
  const [targetMins, setTargetMins] = useState("");
  const [fatiguePercent, setFatiguePercent] = useState(15);
  const [startTime, setStartTime] = useState("");
  const [officialDistance, setOfficialDistance] = useState("");
  const [officialElevation, setOfficialElevation] = useState("");
  const [itraIndex, setItraIndex] = useState("");
  const [descentThreshold, setDescentThreshold] = useState(15);
  const [walkThreshold, setWalkThreshold] = useState(12);
  const [upCostDivider, setUpCostDivider] = useState(80);
  const [downCostModifier, setDownCostModifier] = useState(1.0);
  const [pacingStrategy, setPacingStrategy] = useState("regular");
  const [paceProfile, setPaceProfile] = useState("coach");
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
  const [showNutritionModal, setShowNutritionModal] = useState(false);

  useEffect(() => {
    if (points.length > 0) {
      const enrichedWp = enrichWaypointsWithStartEnd(waypoints, points);
      
      const rawStats = calculateTraceStats(points, 7, 1);
      const distFactor = (officialDistance && parseFloat(officialDistance) > 0 && rawStats.distance > 0) ? (parseFloat(officialDistance) / rawStats.distance) : 1;
      const optThreshold = (officialElevation && parseFloat(officialElevation) > 0) ? findOptimalElevationThreshold(points, parseFloat(officialElevation)) : 5;
      
      const newSegments = generateSegments(
        points, enrichedWp, parseFloat(itraIndex) || 600, fatiguePercent,
        startTime, optThreshold, distFactor,
        weather, parseFloat(descentThreshold) || 15, parseFloat(walkThreshold) || 12,
        targetTime ? parseFloat(targetTime) : null,
        parseFloat(upCostDivider) || 80, parseFloat(downCostModifier) || 1.0,
        pacingStrategy, paceProfile
      );
      setSegments(newSegments);
    }
  }, [points, waypoints, itraIndex, fatiguePercent, startTime, officialDistance, officialElevation, weather, descentThreshold, walkThreshold, targetTime, upCostDivider, downCostModifier, pacingStrategy, paceProfile]);

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
        
        if (docSnap.exists() && (docSnap.data().userId === currentUser.uid || isAdmin)) {
          const data = docSnap.data();
          setRoadbook(data);
          setEditName(data.name || "");
          setPoints(JSON.parse(data.points || "[]"));
          
          const initialTarget = data.targetTime || data.targetFast;
          if (initialTarget) {
            setTargetTime(initialTarget);
            const numTarget = parseFloat(initialTarget);
            if (!isNaN(numTarget)) {
              setTargetHours(Math.floor(numTarget).toString());
              const m = Math.round((numTarget % 1) * 60);
              setTargetMins(m > 0 ? (m < 10 ? `0${m}` : m.toString()) : "00");
            }
          }
          if (data.startTime) setStartTime(data.startTime);
          if (data.officialDistance !== undefined) setOfficialDistance(data.officialDistance.toString());
          if (data.officialElevation !== undefined) setOfficialElevation(data.officialElevation.toString());
          if (data.weather) setWeather(data.weather);
          
          if (data.displayConfig) {
            try {
              setDisplayConfig({ ...defaultDisplayConfig, ...JSON.parse(data.displayConfig) });
            } catch (e) {
              console.error("Error parsing displayConfig", e);
            }
          }
          setDisplayLoaded(true);
          
          // Récupération des valeurs globales depuis le profil si non définies dans le roadbook
          try {
            const userDoc = await getDoc(doc(db, "users", currentUser.uid));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              if (userData.itraIndex != null) setItraIndex(userData.itraIndex.toString());
              else if (data.itraIndex != null) setItraIndex(data.itraIndex.toString());

              if (userData.weight != null) setWeight(userData.weight.toString());
              else if (data.weight != null) setWeight(data.weight.toString());

              if (userData.carbTarget != null) setCarbTarget(userData.carbTarget.toString());
              else if (data.carbTarget != null) setCarbTarget(data.carbTarget.toString());

              if (userData.sodiumTarget != null) setSodiumTarget(userData.sodiumTarget.toString());
              else if (data.sodiumTarget != null) setSodiumTarget(data.sodiumTarget.toString());

              if (userData.waterTarget != null) setWaterTarget(userData.waterTarget.toString());
              else if (data.waterTarget != null) setWaterTarget(data.waterTarget.toString());

              if (userData.caffeineTarget != null) setCaffeineTarget(userData.caffeineTarget.toString());
              else if (data.caffeineTarget != null) setCaffeineTarget(data.caffeineTarget.toString());

              if (userData.fatiguePercent != null) setFatiguePercent(userData.fatiguePercent);
              else if (data.fatiguePercent != null) setFatiguePercent(data.fatiguePercent);

              if (userData.pacingStrategy != null) setPacingStrategy(userData.pacingStrategy);
              else if (data.pacingStrategy != null) setPacingStrategy(data.pacingStrategy);

              if (userData.paceProfile != null) setPaceProfile(userData.paceProfile);
              else if (data.paceProfile != null) setPaceProfile(data.paceProfile);

              if (userData.descentThreshold != null) setDescentThreshold(userData.descentThreshold);
              else if (data.descentThreshold != null) setDescentThreshold(data.descentThreshold);

              if (userData.walkThreshold != null) setWalkThreshold(userData.walkThreshold);
              else if (data.walkThreshold != null) setWalkThreshold(data.walkThreshold);

              if (userData.upCostDivider != null) setUpCostDivider(userData.upCostDivider);
              else if (data.upCostDivider != null) setUpCostDivider(data.upCostDivider);

              if (userData.downCostModifier != null) setDownCostModifier(userData.downCostModifier);
              else if (data.downCostModifier != null) setDownCostModifier(data.downCostModifier);
            }
          } catch (err) {
            console.error("Impossible de charger les paramètres par défaut du profil:", err);
          }
          if (data.descentThreshold != null) setDescentThreshold(data.descentThreshold);
          if (data.walkThreshold != null) setWalkThreshold(data.walkThreshold);
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

          // Fetch nutrition products
          try {
            const qProducts = query(
              collection(db, "nutrition_products"),
              or(
                where("isOfficial", "==", true),
                where("userId", "==", currentUser.uid)
              )
            );
            const productsSnap = await getDocs(qProducts);
            setDbProducts(productsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          } catch (err) {
            console.error("Erreur de chargement des produits nutrition:", err);
          }
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
      const sanitized = newWaypoints.map(w => ({
        ...w,
        pause: w.pause === '' || isNaN(parseFloat(w.pause)) ? 0 : parseFloat(w.pause),
        time_modifier: w.time_modifier === '' || isNaN(parseFloat(w.time_modifier)) ? 100 : parseFloat(w.time_modifier)
      }));
      await updateDoc(docRef, {
        waypoints: JSON.stringify(sanitized),
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

  const saveRoadbook = useCallback(async (silent = false) => {
    try {
      if (!silent) setSaving(true);
      const docRef = doc(db, "roadbooks", id);
      const sanitizedWaypoints = waypoints.map(w => ({
        ...w,
        pause: w.pause === '' || isNaN(parseFloat(w.pause)) ? 0 : parseFloat(w.pause),
        time_modifier: w.time_modifier === '' || isNaN(parseFloat(w.time_modifier)) ? 100 : parseFloat(w.time_modifier)
      }));
      await updateDoc(docRef, {
        name: editName,
        waypoints: JSON.stringify(sanitizedWaypoints),
        targetTime: targetTime,
        fatiguePercent: fatiguePercent,
        pacingStrategy: pacingStrategy,
        paceProfile: paceProfile,
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
        walkThreshold: parseFloat(walkThreshold) || 12,
        upCostDivider: parseFloat(upCostDivider) || 80,
        downCostModifier: parseFloat(downCostModifier) || 1.0,
        inventory: JSON.stringify(inventory),
        displayConfig: JSON.stringify(displayConfig),
      });
      if (!silent) alert("Sauvegardé avec succès !");
    } catch (err) {
      console.error("Erreur de sauvegarde", err);
      if (!silent) alert("Erreur lors de la sauvegarde.");
    } finally {
      if (!silent) setSaving(false);
    }
  }, [id, editName, waypoints, targetTime, fatiguePercent, pacingStrategy, paceProfile, startTime, officialDistance, officialElevation, carbTarget, sodiumTarget, waterTarget, caffeineTarget, weight, weather, itraIndex, descentThreshold, walkThreshold, upCostDivider, downCostModifier, inventory, displayConfig]);

  // Auto-save effect
  useEffect(() => {
    if (!displayLoaded) return;
    const timeoutId = setTimeout(() => {
      saveRoadbook(true);
    }, 1500);
    return () => clearTimeout(timeoutId);
  }, [editName, waypoints, targetTime, fatiguePercent, pacingStrategy, paceProfile, startTime, officialDistance, officialElevation, carbTarget, sodiumTarget, waterTarget, caffeineTarget, weight, weather, itraIndex, descentThreshold, walkThreshold, upCostDivider, downCostModifier, inventory, displayConfig, displayLoaded, saveRoadbook]);

  // Inject navbar actions (sticky bar)
  useEffect(() => {
    const updateConfig = async (key, value) => {
      const newConfig = { ...displayConfig, [key]: value };
      setDisplayConfig(newConfig);
      try {
        const docRef = doc(db, "roadbooks", id);
        await updateDoc(docRef, { displayConfig: JSON.stringify(newConfig) });
      } catch (e) {
        console.error("Error saving display settings", e);
      }
    };

    setActions(
      <>
        {displayLoaded && <DisplaySettings config={displayConfig} updateConfig={updateConfig} />}

        <button onClick={saveRoadbook} disabled={saving} className="btn btn-primary" style={{fontSize:'0.85rem', padding:'6px 14px'}}>
          {saving ? <Loader2 className="lucide-spin" size={16} /> : <Save size={16} />}
          {saving ? "Sauvegarde..." : "Sauvegarder"}
        </button>
      </>
    );
    return () => setActions(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayLoaded, displayConfig, saving, id, saveRoadbook]);

  // Guide ITRA a été supprimé temporairement selon la demande


  const addProduct = () => {
    setInventory([...inventory, { id: nextProdId, name: '', carbs: 0, sodium: 0, caffeine: 0, water: 0 }]);
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

  // Temps total estimé depuis les segments (incluant les pauses pour correspondre exactement à l'objectif)
  const totalFastMs = segments.length > 0 ? segments.reduce((acc, s) => acc + s.durationFastMs + ((s.to.pause || 0) * 60000), 0) : 0;
  const totalSlowMs = segments.length > 0 ? segments.reduce((acc, s) => acc + s.durationSlowMs + ((s.to.pause || 0) * 60000), 0) : 0;
  const totalFastHours = totalFastMs > 0 ? Math.floor(totalFastMs / 3600000) : (targetTime ? Math.floor(targetTime) : 0);
  const totalFastMins = totalFastMs > 0 ? Math.floor((totalFastMs % 3600000) / 60000) : (targetTime ? Math.round((targetTime % 1) * 60) : 0);
  const fmtTotalFast = totalFastMs > 0 ? formatDuration(totalFastMs) : (targetTime ? `${targetTime}h` : '--');
  const fmtTotalSlow = totalSlowMs > 0 ? formatDuration(totalSlowMs) : (targetTime ? `${(targetTime * 1.2).toFixed(1)}h` : '--');

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
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={async () => {
              await saveRoadbook();
              router.push(`/export/${id}`);
            }}
            disabled={saving}
            className="btn btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {saving ? <Loader2 className="lucide-spin" size={16} /> : <Navigation size={16} />}
            Exporter
          </button>
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
          <strong style={{ color: targetTime ? '#10B981' : 'var(--text-secondary)' }}>
            {targetTime ? (
              <>
                {totalFastHours}<small>h</small>{totalFastMins.toString().padStart(2, '0')}
              </>
            ) : (
              "Non défini"
            )}
          </strong>
        </div>
      </div>

      {!targetTime && (
        <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B', borderRadius: 'var(--radius-md)', border: '1px solid #F59E0B' }}>
          <strong>⚠️ Action requise :</strong> Veuillez renseigner un <strong>Objectif Course</strong> dans les paramètres ci-dessous pour calculer les temps de passage sur chaque segment. L'Index UTMB ne sert désormais qu'à ajuster l'effort (montée, descente, fatigue).
        </div>
      )}

      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '24px', padding: '24px' }}>
        {/* Profil Coureur */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 className={styles.sectionTitle}>⏱️ Course & Objectifs</h3>
          
          <div className={styles.paramGroup}>
            <label className={styles.paramLabel}>Date & Heure de départ</label>
            <input type="datetime-local" className="input-field" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ width: '100%' }} />
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '220px' }}>
              <label className={styles.paramLabel}>Objectif Course</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input 
                  type="number" 
                  min="0" 
                  className="input-field" 
                  placeholder="H" 
                  value={targetHours} 
                  onFocus={e => e.target.select()}
                  onChange={e => {
                    const hVal = e.target.value;
                    setTargetHours(hVal);
                    if (hVal === '' && (targetMins === '' || targetMins === '00' || targetMins === '0')) {
                      setTargetTime('');
                    } else {
                      const h = parseInt(hVal) || 0;
                      const m = parseInt(targetMins) || 0;
                      setTargetTime(h + m / 60);
                    }
                  }} 
                  style={{ width: '100%' }} 
                />
                <span>h</span>
                <input 
                  type="number" 
                  min="0" 
                  max="59" 
                  className="input-field" 
                  placeholder="M" 
                  value={targetMins} 
                  onFocus={e => e.target.select()}
                  onChange={e => {
                    const mVal = e.target.value;
                    setTargetMins(mVal);
                    if (mVal === '' && targetHours === '') {
                      setTargetTime('');
                    } else {
                      const h = parseInt(targetHours) || 0;
                      const m = parseInt(mVal) || 0;
                      setTargetTime(h + m / 60);
                    }
                  }} 
                  onBlur={() => {
                    if (targetMins !== '') {
                      const parsed = parseInt(targetMins);
                      if (!isNaN(parsed)) {
                        setTargetMins(parsed < 10 ? `0${parsed}` : `${parsed}`);
                      }
                    }
                  }}
                  style={{ width: '100%' }} 
                />
                <span>m</span>
              </div>
            </div>
            
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '220px' }}>
              <label className={styles.paramLabel}>Cote ITRA / UTMB</label>
              <input 
                type="number" 
                step="1" 
                className="input-field" 
                placeholder="Ex: 600" 
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
                style={{ width: '100%' }} 
              />
            </div>
          </div>

          <div className={styles.paramGroup}>
            <label className={styles.paramLabel}>Poids du coureur (kg)</label>
            <input 
              type="number" 
              step="1" 
              className="input-field" 
              placeholder="Ex: 70" 
              value={weight} 
              onFocus={e => e.target.select()}
              onChange={e => setWeight(e.target.value)} 
              style={{ width: '100%' }} 
            />
          </div>
        </div>

        {/* Course & Paramètres Physiologiques */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 className={styles.sectionTitle}>⚙️ Course & Physiologie</h3>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '220px' }}>
              <label className={styles.paramLabel} title="Résistance à la fatigue sur la durée de l'épreuve">Résistance à la fatigue</label>
              <select 
                className="input-field" 
                value={fatiguePercent}
                onChange={e => setFatiguePercent(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              >
                {(() => {
                  const base = Math.round(45 - ((Math.max(200, Math.min(1000, itraIndex || 600)) - 200) / 800) * 30);
                  return (
                    <>
                      <option value={Math.max(5, base - 10)}>💪 Excellente (Mieux que mon ITRA)</option>
                      <option value={base}>🏃 Normale (Conforme à mon ITRA)</option>
                      <option value={base + 10}>🥵 Difficile (Moins bien préparé)</option>
                      {![Math.max(5, base-10), base, base+10].includes(fatiguePercent) && (
                        <option value={fatiguePercent}>Personnalisé ({fatiguePercent}%)</option>
                      )}
                    </>
                  )
                })()}
              </select>
            </div>
            
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '220px' }}>
              <label className={styles.paramLabel}>Météo Prévue</label>
              <select className="input-field" value={weather} onChange={e => setWeather(e.target.value)} style={{ width: '100%' }}>
                <option value="froid">❄️ Froid (&lt; 10°C)</option>
                <option value="modere">☁️ Modéré (10-20°C)</option>
                <option value="chaud">☀️ Chaud (20-28°C)</option>
                <option value="tres_chaud">🔥 Canicule (&gt; 28°C)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '220px' }}>
              <label className={styles.paramLabel} title="Aisance dans les montées raides">Aisance en côte (Montée)</label>
              <select 
                className="input-field" 
                value={walkThreshold}
                onChange={e => setWalkThreshold(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              >
                {(() => {
                  const base = Math.round(8 + ((Math.max(200, Math.min(1000, itraIndex || 600)) - 200) / 800) * 12);
                  return (
                    <>
                      <option value={base + 4}>⛰️ Puissant (Court le plus possible)</option>
                      <option value={base}>🏃 Standard (Adapté à mon ITRA)</option>
                      <option value={Math.max(5, base - 4)}>🚶 Randonneur (Marche vite)</option>
                      {![base+4, base, Math.max(5, base-4)].includes(walkThreshold) && (
                        <option value={walkThreshold}>Personnalisé ({walkThreshold}%)</option>
                      )}
                    </>
                  )
                })()}
              </select>
            </div>

            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '220px' }}>
              <label className={styles.paramLabel} title="Aisance technique en descente">Aisance en descente</label>
              <select 
                className="input-field" 
                value={descentThreshold}
                onChange={e => setDescentThreshold(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              >
                {(() => {
                  const base = Math.round(10 + ((Math.max(200, Math.min(1000, itraIndex || 600)) - 200) / 800) * 15);
                  return (
                    <>
                      <option value={base + 5}>🦅 Très à l'aise (Relance facile)</option>
                      <option value={base}>🏃 Standard (Adapté à mon ITRA)</option>
                      <option value={Math.max(5, base - 5)}>🛑 Prudent (Freine dans la pente)</option>
                      {![base+5, base, Math.max(5, base-5)].includes(descentThreshold) && (
                        <option value={descentThreshold}>Personnalisé ({descentThreshold}%)</option>
                      )}
                    </>
                  )
                })()}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '220px' }}>
              <label className={styles.paramLabel}>Stratégie d'effort</label>
              <select className="input-field" value={pacingStrategy} onChange={e => setPacingStrategy(e.target.value)} style={{ width: '100%' }}>
                <option value="prudent">🐢 Prudent (départ lent)</option>
                <option value="regular">⏱️ Régulier (constant)</option>
                <option value="aggressive">🚀 Agressif (départ rapide)</option>
              </select>
            </div>
            
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '220px' }}>
              <label className={styles.paramLabel}>Profil d'allure</label>
              <select className="input-field" value={paceProfile} onChange={e => setPaceProfile(e.target.value)} style={{ width: '100%' }}>
                <option value="coach">🧠 Allure Coach (Idéal)</option>
                <option value="aggressive">🔥 Allure Course (Agressif)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Ajustements Organisateur */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 className={styles.sectionTitle}>📏 Données Organisateur</h3>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '220px' }}>
              <label className={styles.paramLabel}>Distance Off. (km)</label>
              <input 
                type="number" 
                step="0.1" 
                className="input-field" 
                placeholder="Ex: 42.5" 
                value={officialDistance} 
                onFocus={e => e.target.select()}
                onChange={e => setOfficialDistance(e.target.value)} 
                style={{ width: '100%' }} 
              />
            </div>

            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '220px' }}>
              <label className={styles.paramLabel}>Dénivelé Pos. (m)</label>
              <input 
                type="number" 
                step="10" 
                className="input-field" 
                placeholder="Ex: 2500" 
                value={officialElevation} 
                onFocus={e => e.target.select()}
                onChange={e => setOfficialElevation(e.target.value)} 
                style={{ width: '100%' }} 
              />
            </div>
          </div>
        </div>

        {/* Objectifs Nutritionnels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 className={styles.sectionTitle}>🍎 Objectifs Nutritionnels</h3>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '220px' }}>
              <label className={styles.paramLabel}>Glucides (g/h)</label>
              <input 
                type="number" 
                step="5" 
                className="input-field" 
                value={carbTarget} 
                onFocus={e => e.target.select()}
                onChange={e => setCarbTarget(e.target.value)} 
                style={{ width: '100%' }} 
              />
              <div style={{fontSize: '0.7rem', color: '#10B981', marginTop: '4px'}}>
                Conseil : 60-90 g/h
              </div>
            </div>

            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '220px' }}>
              <label className={styles.paramLabel}>Eau (ml/h)</label>
              <input 
                type="number" 
                step="50" 
                className="input-field" 
                value={waterTarget} 
                onFocus={e => e.target.select()}
                onChange={e => setWaterTarget(e.target.value)} 
                style={{ width: '100%' }} 
              />
              <div style={{fontSize: '0.7rem', color: '#3B82F6', marginTop: '4px'}}>
                Conseil : {weather === 'froid' ? '400-500' : weather === 'modere' ? '500-600' : weather === 'chaud' ? '600-800' : '800-1000'} ml/h
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '220px' }}>
              <label className={styles.paramLabel}>Sodium (mg/h)</label>
              <input 
                type="number" 
                step="50" 
                className="input-field" 
                value={sodiumTarget} 
                onFocus={e => e.target.select()}
                onChange={e => setSodiumTarget(e.target.value)} 
                style={{ width: '100%' }} 
              />
              <div style={{fontSize: '0.7rem', color: '#F59E0B', marginTop: '4px'}}>
                Conseil : {weather === 'froid' ? '300-400' : weather === 'modere' ? '400-500' : weather === 'chaud' ? '500-600' : '600-800'} mg/h
              </div>
            </div>

            <div className={styles.paramGroup} style={{ flex: 1, minWidth: '220px' }}>
              <label className={styles.paramLabel}>Caféine (ponctuel)</label>
              <input 
                type="number" 
                step="10" 
                className="input-field" 
                value={caffeineTarget} 
                title="Dose cible par prise (en mg)" 
                onFocus={e => e.target.select()}
                onChange={e => setCaffeineTarget(e.target.value)} 
                style={{ width: '100%' }} 
              />
              <div style={{fontSize: '0.7rem', color: '#8B5CF6', marginTop: '4px'}}>
                Conseil : {weight ? `~${Math.round(weight * 3)}-${Math.round(weight * 6)}mg max/course` : 'Prise de ~50mg en cas de coup de fatigue'}
              </div>
            </div>
          </div>
        </div>
        {/* Stratégie Nutritionnelle */}
        {/* Stratégie Nutritionnelle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className={styles.sectionTitle}>🎒 Stratégie Nutritionnelle</h3>
            <div style={{ position: 'relative' }}>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowNutritionModal(!showNutritionModal)}
                style={{ fontSize: '0.75rem', padding: '6px 12px' }}
              >
                Gérer mes produits {showNutritionModal ? '▲' : '▼'}
              </button>
              
              {showNutritionModal && (
                <div style={{ 
                  position: 'absolute', 
                  top: '100%', 
                  right: 0, 
                  marginTop: '8px', 
                  background: 'var(--bg-surface)', 
                  padding: '16px', 
                  borderRadius: 'var(--radius-md)', 
                  width: '320px', 
                  maxHeight: '400px',
                  overflowY: 'auto',
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '8px', 
                  boxShadow: 'var(--shadow-xl)', 
                  border: '1px solid var(--border-light)', 
                  zIndex: 50 
                }}>
                  <div style={{ fontWeight: 'bold', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', marginBottom: '8px' }}>
                    Sélection des produits
                  </div>
                  {(() => {
                    const allProductsMap = new Map();
                    DEFAULT_NUTRITION_PRODUCTS.forEach(p => allProductsMap.set(p.name, p));
                    dbProducts.forEach(p => allProductsMap.set(p.name, p));
                    inventory.forEach(p => {
                      if (!allProductsMap.has(p.name)) {
                        allProductsMap.set(p.name, { ...p, isLegacy: true });
                      }
                    });
                    return Array.from(allProductsMap.values());
                  })().map(p => {
                    const isSelected = inventory.some(item => item.name === p.name || item.id === p.id);
                    return (
                      <label 
                        key={p.id || p.name} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '12px', 
                          padding: '8px', 
                          background: isSelected ? 'var(--bg-surface-elevated)' : 'transparent', 
                          borderRadius: 'var(--radius-sm)', 
                          cursor: 'pointer', 
                          transition: 'all 0.2s' 
                        }}
                      >
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setInventory([...inventory, {
                                id: p.id || `custom-${Date.now()}`,
                                name: p.name,
                                carbs: p.carbs || 0,
                                sodium: p.sodium || 0,
                                caffeine: p.caffeine || 0,
                                water: p.water || 0
                              }]);
                            } else {
                              setInventory(inventory.filter(item => item.name !== p.name && item.id !== p.id));
                            }
                          }}
                          style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--color-primary)', flexShrink: 0 }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: '500', color: isSelected ? 'var(--color-primary)' : 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {p.brand ? `${p.brand} ${p.name}` : p.name}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {[
                              p.carbs ? `${p.carbs}g Glu` : null,
                              p.sodium ? `${p.sodium}mg Na` : null,
                              p.water ? `${p.water}ml` : null,
                              p.caffeine ? `${p.caffeine}mg Caf` : null
                            ].filter(Boolean).join(' • ')}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Sélectionnez les produits que vous prévoyez d'utiliser ou d'avoir à disposition.
          </p>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {inventory.length === 0 ? (
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Aucun produit sélectionné.</span>
            ) : (
              inventory.map(prod => (
                <div key={prod.id || prod.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-surface-elevated)', padding: '6px 12px', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', border: '1px solid var(--border-light)' }}>
                  <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{prod.name}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {[
                      prod.carbs ? `${prod.carbs}g Glu` : null,
                      prod.sodium ? `${prod.sodium}mg Na` : null,
                      prod.water ? `${prod.water}ml` : null,
                      prod.caffeine ? `${prod.caffeine}mg Caf` : null
                    ].filter(Boolean).join(' • ')}
                  </span>
                </div>
              ))
            )}
          </div>
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
                    <input 
                      type="number" 
                      step="0.1" 
                      placeholder="ex: 15.5" 
                      value={newWpKm} 
                      onFocus={e => e.target.select()}
                      onChange={e => setNewWpKm(e.target.value)} 
                      className="input-field" 
                      style={{ width: '100%' }} 
                    />
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
                        
                        if (prod.water !== undefined) {
                          plannedWater += (prod.water || 0) * qty;
                        } else {
                          // Rétrocompatibilité : si le nom contient "ml"
                          const mlMatch = prod.name.match(/(\d+)\s*ml/i);
                          if (mlMatch) {
                            plannedWater += parseInt(mlMatch[1]) * qty;
                          }
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
                          value={seg.to.time_modifier === '' || seg.to.time_modifier === undefined || seg.to.time_modifier === null || Number.isNaN(seg.to.time_modifier) ? "" : seg.to.time_modifier} 
                          min="50" 
                          max="200" 
                          placeholder="100"
                          onFocus={e => e.target.select()}
                          onChange={e => handleUpdateWaypoint(seg.to.id, { time_modifier: e.target.value === '' ? '' : (isNaN(parseFloat(e.target.value)) ? '' : parseFloat(e.target.value)) })} 
                          onBlur={e => {
                            if (seg.to.time_modifier === '' || isNaN(parseFloat(seg.to.time_modifier))) {
                              handleUpdateWaypoint(seg.to.id, { time_modifier: 100 });
                            }
                          }}
                        />
                      </div>
                      
                      <div className={styles.formGroup}>
                        <label>Pause (min)</label>
                        <input 
                          type="number" 
                          value={seg.to.pause === '' || seg.to.pause === undefined || seg.to.pause === null || Number.isNaN(seg.to.pause) ? "" : seg.to.pause} 
                          min="0" 
                          placeholder="0"
                          onFocus={e => e.target.select()}
                          onChange={e => handleUpdateWaypoint(seg.to.id, { pause: e.target.value === '' ? '' : (isNaN(parseFloat(e.target.value)) ? '' : parseFloat(e.target.value)) })} 
                          onBlur={e => {
                            if (seg.to.pause === '' || isNaN(parseFloat(seg.to.pause))) {
                              handleUpdateWaypoint(seg.to.id, { pause: 0 });
                            }
                          }}
                        />
                      </div>
                      
                      <div className={styles.formGroup}>
                        <label>Technicité</label>
                        <select 
                          value={seg.to.technicality || 2} 
                          onChange={e => handleUpdateWaypoint(seg.to.id, { technicality: parseFloat(e.target.value) })}
                        >
                          <option value="1">1 - Très Roulant</option>
                          <option value="2">2 - Classique</option>
                          <option value="3">3 - Technique</option>
                          <option value="4">4 - Très Technique</option>
                          <option value="5">5 - Extrême</option>
                        </select>
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
