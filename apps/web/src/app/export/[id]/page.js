"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import Link from "next/link";
import { ArrowLeft, Map, Clock, Navigation, Droplets, Activity, Package, Utensils, Loader2, Settings } from "lucide-react";
import styles from "./export.module.css";
import { enrichWaypointsWithStartEnd, generateSegments, calculateTraceStats, findOptimalElevationThreshold } from "@/lib/roadbookCalculator";
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
              data.targetFast || 28, 
              data.targetSlow || 35, 
              data.fatiguePercent || 15, 
              data.startTime || "", 
              optThreshold, 
              distFactor,
              data.weather || 'modere',
              data.descentThreshold || 15
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
  }, [id, currentUser, router]);

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
          <button className="btn btn-primary" onClick={() => window.print()}>
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
                <span style={{color: '#10B981', fontSize: '1rem'}}>Rapide: {formatTime(segments[segments.length - 1].arr_fast)}</span>
                <span style={{color: '#F59E0B', fontSize: '1rem'}}>Lent: {formatTime(segments[segments.length - 1].arr_slow)}</span>
              </div>
            ) : "--:--"}
          </span>
        </div>
      </div>

      <div className={styles.printSettings} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', background: 'var(--bg-card)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-light)', marginBottom: '24px' }} className="no-print">
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
                {displayConfig.etaFast && <th>ETA Rapide</th>}
                {displayConfig.etaSlow && <th>ETA Lent</th>}
                {displayConfig.cutoff && <th>BH</th>}
              </tr>
            </thead>
            <tbody>
              {segments.map((seg, i) => {
                const totalDNeg = segments.slice(0, i + 1).reduce((acc, s) => acc + Math.abs(s.elevationNeg || 0), 0);
                const totalDurationMs = segments.slice(0, i + 1).reduce((acc, s) => acc + s.durationSlowMs, 0);
                
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
                  {displayConfig.timeInter && <td style={{ color: 'var(--text-secondary)' }}>{formatDurationMs(seg.durationSlowMs)}</td>}
                  {displayConfig.timeTotal && <td style={{ fontWeight: 'bold' }}>{formatDurationMs(totalDurationMs)}</td>}
                  {displayConfig.etaFast && <td style={{ color: '#10B981', fontWeight: 'bold' }}>{formatTime(seg.arr_fast)}</td>}
                  {displayConfig.etaSlow && <td style={{ color: '#F59E0B', fontWeight: 'bold' }}>{formatTime(seg.arr_slow)}</td>}
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
