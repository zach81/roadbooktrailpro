"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import Link from "next/link";
import { ArrowLeft, Map, Clock, Navigation, Droplets, Activity, Package, Utensils, Loader2, Settings, Download, Watch, ExternalLink, Check, Copy, AlertCircle, Info } from "lucide-react";
import styles from "./export.module.css";
import { enrichWaypointsWithStartEnd, generateSegments, calculateTraceStats, findOptimalElevationThreshold } from "@/lib/roadbookCalculator";
import { buildGPXString, downloadGPXFile, buildTCXString, downloadTCXFile } from "@/lib/gpxBuilder";
import DisplaySettings, { defaultDisplayConfig } from "@/components/DisplaySettings";
import dynamic from 'next/dynamic';

const ElevationProfile = dynamic(() => import('@/components/ElevationProfile'), { 
  ssr: false,
  loading: () => <div className={styles.mapLoading}><Loader2 className="lucide-spin" size={32} /> Chargement du profil...</div>
});

function formatTime(dateStr) {
  if (!dateStr) return "--:--";
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return "--:--";
  }
}

function round10(num) {
  return Math.round(num / 10) * 10;
}

function formatDurationMs(ms) {
  if (!ms) return "0h00";
  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

export default function RoadbookSummary() {
  const { currentUser, isAdmin } = useAuth();
  const router = useRouter();
  const { id } = useParams();
  
  const [displayConfig, setDisplayConfig] = useState(defaultDisplayConfig);
  const [displayLoaded, setDisplayLoaded] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [roadbook, setRoadbook] = useState(null);
  const [segments, setSegments] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [weather, setWeather] = useState("modere");

  const [printConfig, setPrintConfig] = useState({
    table: true,
    segmentProfiles: true,
    segmentProfileTimes: true,
    nutrition: true
  });

  const [suuntoLoading, setSuuntoLoading] = useState(false);
  const [suuntoData, setSuuntoData] = useState(null);
  const [suuntoPaceType, setSuuntoPaceType] = useState("fast");
  const [suuntoCopied, setSuuntoCopied] = useState(false);
  const [suuntoError, setSuuntoError] = useState(null);
  const [gpxDownloaded, setGpxDownloaded] = useState(false);
  const [tcxDownloaded, setTcxDownloaded] = useState(false);
  const [activeWatchGuide, setActiveWatchGuide] = useState("garmin");
  const [gpxNameFormat, setGpxNameFormat] = useState("both");

  useEffect(() => {
    if (!currentUser) {
      router.push("/login");
      return;
    }

    async function fetchData() {
      try {
        const docRef = doc(db, "roadbooks", id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.userId !== currentUser.uid && !isAdmin) {
            router.push("/dashboard");
            return;
          }
          
          setRoadbook({ id: docSnap.id, ...data });
          if (data.displayConfig) {
            try {
              setDisplayConfig({ ...defaultDisplayConfig, ...JSON.parse(data.displayConfig) });
            } catch (e) {
              console.error("Error parsing displayConfig", e);
            }
          }
          setDisplayLoaded(true);

          if (data.inventory) {
            setInventory(JSON.parse(data.inventory));
          }
          if (data.weather) {
            setWeather(data.weather);
          }
          
          // Re-generate segments exactly as in editor
          const pts = JSON.parse(data.points || "[]");
          const wps = JSON.parse(data.waypoints || "[]").map((wp, i) => ({
            ...wp,
            id: wp.id || `wp-${i}-${Date.now()}`
          }));
          
          if (pts.length > 0) {
            const enrichedWp = enrichWaypointsWithStartEnd(wps, pts);
            
            const rawStats = calculateTraceStats(pts, 7, 1);
            const offDist = parseFloat(data.officialDistance) || 0;
            const offEle = parseFloat(data.officialElevation) || 0;
            const distFactor = (offDist > 0 && rawStats.distance > 0) ? (offDist / rawStats.distance) : 1;
            const optThreshold = (offEle > 0) ? findOptimalElevationThreshold(pts, offEle) : 5;
            
            const newSegments = generateSegments(
              pts, 
              enrichedWp, 
              data.itraIndex || 600,
              data.fatiguePercent || 15, 
              data.startTime || "", 
              optThreshold, 
              distFactor,
              data.weather || 'modere',
              data.descentThreshold || 15,
              data.walkThreshold || 12,
              data.targetTime ? parseFloat(data.targetTime) : null,
              data.upCostDivider || 80,
              data.downCostModifier || 1.0,
              data.pacingStrategy || 'regular',
              data.paceProfile || 'coach'
            );
            
            setSegments(newSegments);
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
  }, [id, currentUser, isAdmin, router]);

  const updateConfig = async (key, value) => {
    const newConfig = { ...displayConfig, [key]: value };
    setDisplayConfig(newConfig);
    try {
      const docRef = doc(db, "roadbooks", id);
      await updateDoc(docRef, {
        displayConfig: JSON.stringify(newConfig)
      });
    } catch (err) {
      console.error("Erreur lors de la sauvegarde des paramètres d'affichage", err);
    }
  };

  const handleDownloadGPX = () => {
    if (!roadbook) return;
    try {
      const pts = JSON.parse(roadbook.points || "[]");
      const wps = JSON.parse(roadbook.waypoints || "[]");
      const isFast = suuntoPaceType === "fast" || !!roadbook.targetTime;
      const gpxString = buildGPXString({
        name: roadbook.name,
        points: pts,
        segments: segments,
        waypoints: wps,
        startTime: roadbook.startTime,
        options: {
          paceType: isFast ? "fast" : "slow",
          nameFormat: gpxNameFormat,
          timestampTrack: true
        }
      });
      downloadGPXFile(roadbook.name, gpxString);
      setGpxDownloaded(true);
      setTimeout(() => setGpxDownloaded(false), 3000);
    } catch (err) {
      console.error("Erreur téléchargement GPX", err);
      alert("Erreur lors de la génération du GPX.");
    }
  };

  const handleDownloadTCX = () => {
    if (!roadbook) return;
    try {
      const pts = JSON.parse(roadbook.points || "[]");
      const wps = JSON.parse(roadbook.waypoints || "[]");
      const isFast = suuntoPaceType === "fast" || !!roadbook.targetTime;
      const tcxString = buildTCXString({
        name: roadbook.name,
        points: pts,
        segments: segments,
        waypoints: wps,
        startTime: roadbook.startTime,
        options: {
          paceType: isFast ? "fast" : "slow",
          nameFormat: gpxNameFormat
        }
      });
      downloadTCXFile(roadbook.name, tcxString);
      setTcxDownloaded(true);
      setTimeout(() => setTcxDownloaded(false), 3000);
    } catch (err) {
      console.error("Erreur téléchargement TCX", err);
      alert("Erreur lors de la génération du fichier TCX Garmin.");
    }
  };

  const handleGenerateSuunto = async (paceChoice) => {
    if (!roadbook || segments.length === 0) return;
    const choice = paceChoice || suuntoPaceType;
    setSuuntoPaceType(choice);
    setSuuntoLoading(true);
    setSuuntoError(null);

    try {
      const isFast = choice === "fast" || !!roadbook.targetTime;
      const baseStartMs = roadbook.startTime
        ? new Date(roadbook.startTime).getTime()
        : (new Date(segments[0].arr_fast).getTime() - segments[0].durationFastMs);

      const checkpoints = segments.map((seg, i) => {
        const arrIso = isFast ? seg.arr_fast : seg.arr_slow;
        const arrMs = new Date(arrIso).getTime();
        const targetElapsedMin = Math.max(1, Math.round((arrMs - baseStartMs) / 60000));

        return {
          name: seg.to.name,
          km: Number(seg.cumulDistance.toFixed(2)),
          targetElapsedMin,
          notes: seg.to.cutoffTime ? `BH: ${seg.to.cutoffTime}` : undefined,
          stopMin: seg.to.pause ? Math.round(seg.to.pause) : undefined
        };
      });

      const res = await fetch("/api/suunto-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raceName: roadbook.name,
          checkpoints
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Échec de l'export Suunto");
      }

      setSuuntoData(data);
    } catch (err) {
      console.error("Erreur lors de la génération Suunto:", err);
      setSuuntoError(err.message || "Erreur de connexion au service Parat.io");
    } finally {
      setSuuntoLoading(false);
    }
  };

  const handleCopySuuntoCode = () => {
    if (!suuntoData?.code) return;
    navigator.clipboard.writeText(suuntoData.code);
    setSuuntoCopied(true);
    setTimeout(() => setSuuntoCopied(false), 2500);
  };

  if (loading) {
    return <div className={styles.container} style={{textAlign: 'center', paddingTop: '4rem'}}><Loader2 className="lucide-spin" size={32} /> Chargement du roadbook...</div>;
  }
  
  if (!roadbook) return null;

  const displayDistance = segments.length > 0 ? segments[segments.length - 1].cumulDistance : (roadbook.stats?.distance || 0);
  const displayElePos = segments.length > 0 ? segments[segments.length - 1].cumulElevation : (roadbook.stats?.elevation?.pos || 0);

  // Isoler les points d'assistance et de dropbag
  const assistancePoints = segments.filter(seg => seg.to.assistance_allowed || seg.to.has_dropbag);

  // Fonction pour calculer les produits prévus sur un point donné
  const getProductsForWaypoint = (plannedNutrition) => {
    if (!plannedNutrition) return [];
    return Object.entries(plannedNutrition)
      .filter(([_, qty]) => qty > 0)
      .map(([prodId, qty]) => {
        const product = inventory.find(p => p.id === parseInt(prodId));
        return {
          name: product ? product.name : `Produit ${prodId}`,
          qty
        };
      });
  };
  
  // Total des produits pour toute la course (Le "caddie")
  const totalCaddie = {};
  segments.forEach(seg => {
    if (seg.to.planned_nutrition) {
      Object.entries(seg.to.planned_nutrition).forEach(([prodId, qty]) => {
        if (qty > 0) {
          totalCaddie[prodId] = (totalCaddie[prodId] || 0) + qty;
        }
      });
    }
  });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{roadbook.name}</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>Plan de marche & Logistique</p>
        </div>
        <div className={styles.actions}>
          <Link href={`/editor/${id}`} className="btn btn-secondary">
            <ArrowLeft size={16} /> Retour à l'éditeur
          </Link>
          <button 
            type="button"
            className="btn btn-secondary" 
            onClick={handleDownloadGPX}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {gpxDownloaded ? <Check size={16} color="#10B981" /> : <Download size={16} />}
            {gpxDownloaded ? "GPX Téléchargé !" : "Télécharger GPX"}
          </button>
          <a 
            href="#suunto-section" 
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ea580c', borderColor: '#ea580c', textDecoration: 'none' }}
          >
            <Watch size={16} /> Export Suunto
          </a>
          <button className="btn btn-secondary" onClick={() => window.print()}>
            Imprimer
          </button>
        </div>
      </header>

      <div className={styles.overviewCards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Distance</span>
          <span className={styles.cardValue}>{displayDistance.toFixed(1)} km</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Dénivelé +</span>
          <span className={styles.cardValue}>{Math.round(displayElePos)} m</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Départ</span>
          <span className={styles.cardValue} style={{ fontSize: '1.2rem' }}>
            {roadbook.startTime ? new Date(roadbook.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "Non défini"}
          </span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Arrivée Estimée</span>
          <span className={styles.cardValue} style={{ fontSize: '1.2rem' }}>
            {segments.length > 0 ? (
              <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'}}>
                {roadbook.targetTime ? (
                  <span style={{color: '#10B981', fontSize: '1rem'}}>Objectif: {formatTime(segments[segments.length - 1].arr_fast)}</span>
                ) : (
                  <>
                    <span style={{color: '#10B981', fontSize: '1rem'}}>Rapide: {formatTime(segments[segments.length - 1].arr_fast)}</span>
                    <span style={{color: '#F59E0B', fontSize: '1rem'}}>Lent: {formatTime(segments[segments.length - 1].arr_slow)}</span>
                  </>
                )}
              </div>
            ) : "--:--"}
          </span>
        </div>
      </div>

      {/* SECTION EXPORT GPS & SUUNTO (PARAT.IO MCP) */}
      <section id="suunto-section" className={`${styles.exportSection} no-print`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '2px solid var(--primary-light)', paddingBottom: '10px', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Watch size={24} color="#ea580c" /> Export Montres GPS (Garmin, Coros, Suunto)
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Exportez vos allures, checkpoints et temps de passage vers votre montre de trail préférée.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span className={styles.gpxBrandBadge}>GPX 1.1</span>
            <span className={styles.garminBrandBadge}>Garmin TCX</span>
            <span className={styles.suuntoBrandBadge}>SuuntoPlus™</span>
          </div>
        </div>

        {/* Paramétrage commun de l'affichage des temps */}
        <div style={{ background: 'var(--bg-main, #f8fafc)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '12px 16px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: '1 1 300px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Format d'affichage des temps dans les noms de points :
              </label>
              <select
                value={gpxNameFormat}
                onChange={(e) => setGpxNameFormat(e.target.value)}
                style={{ width: '100%', maxWidth: '420px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
              >
                <option value="both">Chrono cumulé & Heure (ex: Ravito 1 · 2h15 (08h15)) [Recommandé]</option>
                <option value="elapsed">Chrono de course seul (ex: Ravito 1 · 2h15)</option>
                <option value="clock">Heure estimée seule (ex: Ravito 1 · 08h15)</option>
                <option value="raw">Nom simple sans chrono (ex: Ravito 1)</option>
              </select>
            </div>
            
            {!roadbook.targetTime && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Allure de référence :</span>
                <button 
                  type="button"
                  onClick={() => setSuuntoPaceType("fast")}
                  className={suuntoPaceType === "fast" ? "btn btn-primary" : "btn btn-secondary"}
                  style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                >
                  Rapide / Cible
                </button>
                <button 
                  type="button"
                  onClick={() => setSuuntoPaceType("slow")}
                  className={suuntoPaceType === "slow" ? "btn btn-primary" : "btn btn-secondary"}
                  style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                >
                  Lente
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Grille des 3 modes d'export */}
        <div className={styles.exportGrid}>
          {/* Carte 1 : GPX Universel Enrichi (Coros, Suunto, etc.) */}
          <div className={styles.exportCard} style={{ borderColor: 'rgba(2, 132, 199, 0.4)' }}>
            <div>
              <div className={styles.exportCardHeader}>
                <h3 className={styles.exportCardTitle}>
                  <Download size={20} color="#0284c7" /> Tracé GPX Enrichi
                </h3>
                <span className={styles.gpxBrandBadge}>Coros & Multi-marques</span>
              </div>
              <p className={styles.cardDescription}>
                Fichier GPX standard avec waypoints nommés avec vos temps prévus (<code>Ravito · 2h15</code>) et trace horodatée pour les montres <strong>Coros</strong>, <strong>Suunto</strong>, <strong>Garmin</strong> ou applications tierces.
              </p>

              {/* Aperçu des points injectés */}
              <div style={{ background: 'var(--bg-card)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem', marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                  Aperçu des checkpoints injectés :
                </div>
                <div style={{ maxHeight: '110px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {segments.map((s, idx) => {
                    const isFast = suuntoPaceType === "fast" || !!roadbook.targetTime;
                    const arrIso = isFast ? s.arr_fast : s.arr_slow;
                    const baseMs = roadbook.startTime ? new Date(roadbook.startTime).getTime() : (new Date(segments[0].arr_fast).getTime() - segments[0].durationFastMs);
                    const elapsed = Math.max(0, new Date(arrIso).getTime() - baseMs);
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                        <span>📍 {s.to.name} <small style={{ color: 'var(--text-secondary)' }}>({s.cumulDistance.toFixed(1)} km)</small></span>
                        <strong style={{ color: '#0284c7' }}>{formatDurationMs(elapsed)} ({formatTime(arrIso)})</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div>
              <button 
                type="button"
                onClick={handleDownloadGPX}
                className="btn btn-secondary"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {gpxDownloaded ? <Check size={18} color="#10B981" /> : <Download size={18} />}
                {gpxDownloaded ? "Fichier GPX téléchargé !" : "Télécharger GPX Universel (.gpx)"}
              </button>
            </div>
          </div>

          {/* Carte 2 : Garmin Course TCX */}
          <div className={styles.exportCard} style={{ borderColor: 'rgba(0, 122, 194, 0.4)' }}>
            <div>
              <div className={styles.exportCardHeader}>
                <h3 className={styles.exportCardTitle}>
                  <Watch size={20} color="#007ac2" /> Garmin Course (TCX)
                </h3>
                <span className={styles.garminBrandBadge}>Garmin Connect</span>
              </div>
              <p className={styles.cardDescription}>
                Format Garmin TCX Course officiel. Alimente directement l'écran <strong>« Sur mon itinéraire » (Up Ahead)</strong> avec icônes natives (Ravitos, Eau, Sommets) et le <strong>« Partenaire Virtuel »</strong> avec vos allures réalistes.
              </p>

              {/* Aperçu des points Garmin CoursePoints */}
              <div style={{ background: 'var(--bg-card)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem', marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                  Points de parcours & Icônes Garmin :
                </div>
                <div style={{ maxHeight: '110px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {segments.map((s, idx) => {
                    const isFast = suuntoPaceType === "fast" || !!roadbook.targetTime;
                    const arrIso = isFast ? s.arr_fast : s.arr_slow;
                    const baseMs = roadbook.startTime ? new Date(roadbook.startTime).getTime() : (new Date(segments[0].arr_fast).getTime() - segments[0].durationFastMs);
                    const elapsed = Math.max(0, new Date(arrIso).getTime() - baseMs);
                    const isWater = (s.to.type || '').toLowerCase().includes('water') || s.to.name.toLowerCase().includes('eau');
                    const isSummit = (s.to.type || '').toLowerCase().includes('summit') || s.to.name.toLowerCase().includes('sommet') || s.to.name.toLowerCase().includes('col');
                    const iconEmoji = isWater ? '💧 Eau' : (isSummit ? '⛰️ Sommet' : '🍽️ Ravito');
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                        <span>{iconEmoji} {s.to.name}</span>
                        <strong style={{ color: '#007ac2' }}>{formatDurationMs(elapsed)} ({formatTime(arrIso)})</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div>
              <button 
                type="button"
                onClick={handleDownloadTCX}
                className="btn btn-secondary"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderColor: '#007ac2', color: '#007ac2' }}
              >
                {tcxDownloaded ? <Check size={18} color="#10B981" /> : <Download size={18} />}
                {tcxDownloaded ? "Fichier TCX téléchargé !" : "Télécharger TCX Garmin (.tcx)"}
              </button>
            </div>
          </div>

          {/* Carte 3 : Suunto / Parat.io */}
          <div className={styles.exportCard} style={{ borderColor: 'rgba(234, 88, 12, 0.4)' }}>
            <div>
              <div className={styles.exportCardHeader}>
                <h3 className={styles.exportCardTitle}>
                  <Watch size={20} color="#ea580c" /> Suunto Race App
                </h3>
                <span className={styles.suuntoBrandBadge}>SuuntoPlus™</span>
              </div>
              <p className={styles.cardDescription}>
                Plan de course synchronisé pour montres Suunto (Race, Vertical, 9 Peak Pro...) via l'application SuuntoPlus <strong>Parat Race</strong> (généré via l'API MCP Parat.io).
              </p>

              {/* Bouton de génération si pas encore fait */}
              {!suuntoData && (
                <button
                  type="button"
                  onClick={() => handleGenerateSuunto()}
                  disabled={suuntoLoading}
                  className="btn btn-primary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#ea580c', borderColor: '#ea580c', marginBottom: '12px' }}
                >
                  {suuntoLoading ? <Loader2 className="lucide-spin" size={18} /> : <Watch size={18} />}
                  {suuntoLoading ? "Génération via Parat.io MCP..." : "Générer le code Suunto (P8;...)"}
                </button>
              )}

              {suuntoError && (
                <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '10px' }}>
                  ⚠️ {suuntoError}
                </div>
              )}

              {/* Résultat généré */}
              {suuntoData && (
                <>
                  <div className={styles.codeBoxContainer} style={{ margin: '8px 0 12px' }}>
                    <div className={styles.codeBoxHeader}>
                      <span className={styles.codeBoxTitle}>Code SuuntoPlus (P8) :</span>
                      <button 
                        type="button"
                        onClick={handleCopySuuntoCode}
                        className={styles.copyBtn}
                      >
                        {suuntoCopied ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
                        {suuntoCopied ? "Copié !" : "Copier"}
                      </button>
                    </div>
                    <pre className={styles.codeSnippet}>{suuntoData.code}</pre>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {suuntoData.plannerUrl && (
                      <a 
                        href={suuntoData.plannerUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '4px 10px' }}
                      >
                        <ExternalLink size={14} /> Ouvrir Parat.io
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleGenerateSuunto()}
                      disabled={suuntoLoading}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                    >
                      {suuntoLoading ? <Loader2 className="lucide-spin" size={14} /> : "Actualiser"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* GUIDES PRATIQUES PAR MARQUE (GARMIN / COROS / SUUNTO) */}
        <div style={{ marginTop: '24px', background: 'var(--bg-main, #f8fafc)', borderRadius: '8px', border: '1px solid var(--border-light)', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              📖 Comment utiliser vos temps de pacing sur votre montre :
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setActiveWatchGuide("garmin")}
                className={`${styles.watchTabBtn} ${activeWatchGuide === "garmin" ? styles.watchTabBtnActive : ""}`}
                style={activeWatchGuide === "garmin" ? { background: '#007ac2', borderColor: '#007ac2' } : {}}
              >
                Garmin
              </button>
              <button
                type="button"
                onClick={() => setActiveWatchGuide("coros")}
                className={`${styles.watchTabBtn} ${activeWatchGuide === "coros" ? styles.watchTabBtnActive : ""}`}
                style={activeWatchGuide === "coros" ? { background: '#e11d48', borderColor: '#e11d48' } : {}}
              >
                Coros
              </button>
              <button
                type="button"
                onClick={() => setActiveWatchGuide("suunto")}
                className={`${styles.watchTabBtn} ${activeWatchGuide === "suunto" ? styles.watchTabBtnActive : ""}`}
                style={activeWatchGuide === "suunto" ? { background: '#ea580c', borderColor: '#ea580c' } : {}}
              >
                Suunto
              </button>
            </div>
          </div>

          {/* Guide GARMIN */}
          {activeWatchGuide === "garmin" && (
            <div className={styles.guideSteps}>
              <div className={styles.guideStepsTitle} style={{ color: '#007ac2' }}>
                Configuration Garmin (Fenix, Forerunner, Enduro, Epix) :
              </div>
              <div className={styles.stepItem}>
                <div className={styles.stepNumber} style={{ background: '#e0f2fe', color: '#007ac2' }}>1</div>
                <div className={styles.stepText}>
                  <strong>Import dans Garmin Connect :</strong> Téléchargez le fichier <strong>TCX</strong> ci-dessus. Rendez-vous sur <strong>connect.garmin.com</strong> &gt; <em>Entraînement et planification</em> &gt; <em>Parcours</em> &gt; <em>Importer</em> (ou ouvrez le fichier depuis votre smartphone dans l'application Garmin Connect).
                </div>
              </div>
              <div className={styles.stepItem}>
                <div className={styles.stepNumber} style={{ background: '#e0f2fe', color: '#007ac2' }}>2</div>
                <div className={styles.stepText}>
                  <strong>Écran « Sur mon itinéraire » (Up Ahead) :</strong> Vos ravitaillements apparaissent automatiquement avec leurs icônes dédiées (Ravitaillement, Eau, Sommet) et leurs temps cibles. Pendant la course, votre montre affiche la distance restante et votre heure d'arrivée estimée (ETA) pour chaque point !
                </div>
              </div>
              <div className={styles.stepItem}>
                <div className={styles.stepNumber} style={{ background: '#e0f2fe', color: '#007ac2' }}>3</div>
                <div className={styles.stepText}>
                  <strong>Partenaire Virtuel en direct :</strong> Comme notre trace contient les vitesses réalistes tenant compte des montées, descentes et pauses, Garmin active automatiquement le <strong>Partenaire Virtuel</strong>. Vous voyez en temps réel si vous êtes en avance ou en retard (ex: <code>+02:15</code> d'avance) sur votre plan de marche !
                </div>
              </div>
            </div>
          )}

          {/* Guide COROS */}
          {activeWatchGuide === "coros" && (
            <div className={styles.guideSteps}>
              <div className={styles.guideStepsTitle} style={{ color: '#e11d48' }}>
                Configuration Coros (Pace, Apex, Vertix) :
              </div>
              <div className={styles.stepItem}>
                <div className={styles.stepNumber} style={{ background: '#ffe4e6', color: '#e11d48' }}>1</div>
                <div className={styles.stepText}>
                  <strong>Import dans l'app Coros :</strong> Téléchargez le fichier <strong>GPX Enrichi</strong> ci-dessus. Ouvrez-le avec l'application mobile <strong>Coros</strong> (ou allez dans l'onglet <em>Exploration</em> &gt; <em>Mes itinéraires</em> &gt; <em>Importer</em>).
                </div>
              </div>
              <div className={styles.stepItem}>
                <div className={styles.stepNumber} style={{ background: '#ffe4e6', color: '#e11d48' }}>2</div>
                <div className={styles.stepText}>
                  <strong>Points de repère (Checkpoints) :</strong> L'application Coros convertit automatiquement tous les waypoints en checkpoints avec leur temps cible (ex: <code>Ravito 1 · 2h15</code>). Enregistrez puis cliquez sur <em>« Synchroniser avec la montre »</em>.
                </div>
              </div>
              <div className={styles.stepItem}>
                <div className={styles.stepNumber} style={{ background: '#ffe4e6', color: '#e11d48' }}>3</div>
                <div className={styles.stepText}>
                  <strong>Sur la montre le jour J :</strong> Lancez votre activité <em>Course Trail</em> &gt; <em>Navigation</em> &gt; Sélectionnez votre itinéraire.
                  L'écran dédié aux checkpoints affiche la distance et le D+ restant jusqu'au prochain ravitaillement, et votre montre vibre à l'approche du ravito !
                </div>
              </div>
            </div>
          )}

          {/* Guide SUUNTO */}
          {activeWatchGuide === "suunto" && (
            <div className={styles.guideSteps}>
              <div className={styles.guideStepsTitle} style={{ color: '#ea580c' }}>
                Configuration Suunto (Race, Vertical, 9 Peak Pro) :
              </div>
              <div className={styles.stepItem}>
                <div className={styles.stepNumber} style={{ background: '#ffedd5', color: '#ea580c' }}>1</div>
                <div className={styles.stepText}>
                  <strong>Trace GPX :</strong> Téléchargez le fichier <strong>GPX</strong> ci-dessus et ouvrez-le avec l'application <strong>Suunto</strong> sur votre smartphone. Activez l'option <em>« Utiliser dans la montre »</em>.
                </div>
              </div>
              <div className={styles.stepItem}>
                <div className={styles.stepNumber} style={{ background: '#ffedd5', color: '#ea580c' }}>2</div>
                <div className={styles.stepText}>
                  <strong>Application SuuntoPlus :</strong> Dans l'application Suunto, ouvrez le <strong>SuuntoPlus™ Store</strong> et ajoutez l'application <strong>Parat Race</strong>.
                </div>
              </div>
              <div className={styles.stepItem}>
                <div className={styles.stepNumber} style={{ background: '#ffedd5', color: '#ea580c' }}>3</div>
                <div className={styles.stepText}>
                  <strong>Code synchronisé :</strong> Cliquez sur <em>« Générer le code Suunto »</em>, copiez le code <code>P8;...</code> et collez-le dans les paramètres de Parat Race dans votre app Suunto.
                </div>
              </div>
              <div className={styles.stepItem}>
                <div className={styles.stepNumber} style={{ background: '#ffedd5', color: '#ea580c' }}>4</div>
                <div className={styles.stepText}>
                  <strong>Le jour J :</strong> Au départ, chargez la trace dans <em>Navigation</em> et sélectionnez <em>Parat Race</em> dans <em>SuuntoPlus</em>.
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className={`${styles.printSettings} no-print`} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', background: 'var(--bg-card)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-light)', marginBottom: '24px' }}>
        <strong>Options d'impression :</strong>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={printConfig.table} onChange={e => setPrintConfig({...printConfig, table: e.target.checked})} />
          Tableau de marche
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={printConfig.segmentProfiles} onChange={e => setPrintConfig({...printConfig, segmentProfiles: e.target.checked})} />
          Profils par segment
        </label>
        {printConfig.segmentProfiles && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginLeft: '-8px' }}>
            <input type="checkbox" checked={printConfig.segmentProfileTimes} onChange={e => setPrintConfig({...printConfig, segmentProfileTimes: e.target.checked})} />
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Afficher les temps</span>
          </label>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={printConfig.nutrition} onChange={e => setPrintConfig({...printConfig, nutrition: e.target.checked})} />
          Nutrition
        </label>
      </div>

      {printConfig.table && (
      <section className={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 className={styles.sectionTitle} style={{ margin: 0 }}><Navigation size={20} /> Tableau de Marche Global</h2>
          {displayLoaded && <DisplaySettings config={displayConfig} updateConfig={updateConfig} />}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Point</th>
                {displayConfig.dist && <th>Dist. (km)</th>}
                {displayConfig.elePos && <th>Alt. (m)</th>}
                {(displayConfig.elePos || displayConfig.eleNeg) && <th>D+ / D- Cumul</th>}
                {displayConfig.timeInter && <th>T. Inter.</th>}
                {displayConfig.timeTotal && <th>T. Total</th>}
                {displayConfig.etaFast && <th>{roadbook.targetTime ? "ETA Objectif" : "ETA Rapide"}</th>}
                {(!roadbook.targetTime && displayConfig.etaSlow) && <th>ETA Lent</th>}
                {displayConfig.cutoff && <th>BH</th>}
              </tr>
            </thead>
            <tbody>
              {segments.map((seg, i) => {
                const totalDNeg = segments.slice(0, i + 1).reduce((acc, s) => acc + Math.abs(s.elevationNeg || 0), 0);
                const useFast = !!roadbook.targetTime;
                const segDuration = useFast ? seg.durationFastMs : seg.durationSlowMs;
                const totalDurationMs = segments.slice(0, i + 1).reduce((acc, s) => acc + (useFast ? s.durationFastMs : s.durationSlowMs), 0);
                
                return (
                <tr key={i}>
                  <td style={{ fontWeight: 'bold' }}>
                    {seg.to.name}
                    {seg.to.has_dropbag && <span className={`${styles.badge} ${styles.badgeDropbag}`}>Dropbag</span>}
                    {seg.to.assistance_allowed && <span className={`${styles.badge} ${styles.badgeAssistance}`}>Assistance</span>}
                  </td>
                  {displayConfig.dist && <td>{seg.cumulDistance.toFixed(1)}</td>}
                  {displayConfig.elePos && <td>{Math.round(seg.to.ele)}</td>}
                  {(displayConfig.elePos || displayConfig.eleNeg) && (
                    <td>
                      {displayConfig.elePos && <span style={{ color: '#10B981' }}>+{Math.round(seg.cumulElevation)}</span>}
                      {displayConfig.elePos && displayConfig.eleNeg && " / "}
                      {displayConfig.eleNeg && <span style={{ color: '#EF4444' }}>-{Math.round(totalDNeg)}</span>}
                    </td>
                  )}
                  {displayConfig.timeInter && <td style={{ color: 'var(--text-secondary)' }}>{formatDurationMs(segDuration)}</td>}
                  {displayConfig.timeTotal && <td style={{ fontWeight: 'bold' }}>{formatDurationMs(totalDurationMs)}</td>}
                  {displayConfig.etaFast && <td style={{ color: '#10B981', fontWeight: 'bold' }}>{formatTime(seg.arr_fast)}</td>}
                  {(!roadbook.targetTime && displayConfig.etaSlow) && <td style={{ color: '#F59E0B', fontWeight: 'bold' }}>{formatTime(seg.arr_slow)}</td>}
                  {displayConfig.cutoff && <td style={{ color: '#EF4444', fontWeight: 'bold' }}>{seg.to.cutoffTime || "--:--"}</td>}
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {printConfig.segmentProfiles && segments.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 className={styles.sectionTitle} style={{ borderBottom: 'none' }}><Activity size={20} /> Profils par Segment</h2>
          {segments.map((seg, i) => {
            const totalDurationMs = segments.slice(0, i + 1).reduce((acc, s) => acc + s.durationSlowMs, 0);
            return (
            <div key={i} style={{ marginBottom: '40px', pageBreakInside: 'avoid', textAlign: 'center' }}>
              <div style={{ display: 'inline-block', width: '100%', maxWidth: '750px', textAlign: 'left', padding: '0 10px', boxSizing: 'border-box' }}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>
                  <span>{seg.from.name} ➔ {seg.to.name}</span>
                  <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
                    {seg.distance.toFixed(1)} km | +{Math.round(seg.elevationPos)}m | -{Math.round(seg.elevationNeg)}m
                  </span>
                </h3>
                {printConfig.segmentProfileTimes && (
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', gap: '16px', justifyContent: 'center' }}>
                    <span><strong>T. Inter:</strong> {formatDurationMs(seg.durationSlowMs)}</span>
                    <span><strong>T. Total:</strong> {formatDurationMs(totalDurationMs)}</span>
                    {seg.to.cutoffTime && <span style={{ color: '#EF4444' }}><strong>BH:</strong> {seg.to.cutoffTime}</span>}
                  </div>
                )}
                <div style={{ height: '220px', width: '100%', background: 'transparent' }}>
                  <ElevationProfile 
                    points={seg.points} 
                    waypoints={[seg.from, seg.to]} 
                  />
                </div>
              </div>
            </div>
          )})}
        </div>
      )}

      {printConfig.nutrition && (
      <>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><Package size={20} /> Plan d'Assistance & Logistique</h2>
        {assistancePoints.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>Aucun point d'assistance ou de dropbag n'a été défini pour cette course.</p>
        ) : (
          <div className={styles.checklist}>
            {assistancePoints.map((seg, i) => {
              const products = getProductsForWaypoint(seg.to.planned_nutrition);
              return (
                <div key={i} className={styles.checklistItem}>
                  <h4>
                    {seg.to.name}
                    <div>
                      {seg.to.has_dropbag && <span className={`${styles.badge} ${styles.badgeDropbag}`} style={{marginLeft: '4px'}}>Dropbag</span>}
                      {seg.to.assistance_allowed && <span className={`${styles.badge} ${styles.badgeAssistance}`} style={{marginLeft: '4px'}}>Assistance</span>}
                    </div>
                  </h4>
                  <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    ETA: {formatTime(seg.arr_fast)} - {formatTime(seg.arr_slow)} (km {seg.cumulDistance.toFixed(1)})
                  </p>
                  
                  {products.length === 0 ? (
                    <div style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Rien de prévu</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <strong style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginTop: '8px' }}>À préparer :</strong>
                      {products.map((p, idx) => (
                        <div key={idx} className={styles.itemDetail}>
                          <span>{p.name}</span>
                          <span className={styles.itemQty}>x{p.qty}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><Utensils size={20} /> Caddie Global (Nutrition Totale)</h2>
        <div className={styles.checklist}>
          {Object.keys(totalCaddie).length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', gridColumn: '1 / -1' }}>Aucune nutrition planifiée.</p>
          ) : (
            Object.entries(totalCaddie).map(([prodId, qty]) => {
              const product = inventory.find(p => p.id === parseInt(prodId));
              return (
                <div key={prodId} className={styles.checklistItem} style={{ padding: '12px 16px' }}>
                  <div className={styles.itemDetail} style={{ padding: 0 }}>
                    <span style={{ fontWeight: 'bold' }}>{product ? product.name : `Produit ${prodId}`}</span>
                    <span className={styles.itemQty} style={{ fontSize: '1.2rem' }}>x{qty}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
      </>
      )}

    </div>
  );
}
