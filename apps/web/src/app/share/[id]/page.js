"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import Link from "next/link";
import { 
  Navigation, 
  Clock, 
  MapPin, 
  Compass, 
  Droplets, 
  Package, 
  Printer, 
  Download, 
  Share2, 
  Check, 
  Lock, 
  Loader2, 
  ExternalLink,
  ShieldAlert,
  Flame,
  Activity,
  Heart
} from "lucide-react";
import { 
  calculateRoadbookSegments, 
  formatTime, 
  formatDurationMs, 
  getWaypointNutritionProducts, 
  calculateTotalCaddie 
} from "@/lib/roadbookHelper";
import { buildGPXString, downloadGPXFile } from "@/lib/gpxBuilder";
import PdfExportModal from "@/components/PdfExportModal";
import ShareModal from "@/components/ShareModal";
import dynamic from "next/dynamic";
import styles from "./share.module.css";

const ElevationProfile = dynamic(() => import("@/components/ElevationProfile"), { 
  ssr: false,
  loading: () => <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}><Loader2 className="lucide-spin" size={24} /> Chargement du profil altimétrique...</div>
});

export default function PublicSharePage() {
  const { id } = useParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [roadbook, setRoadbook] = useState(null);
  const [segments, setSegments] = useState([]);
  const [points, setPoints] = useState([]);
  const [waypoints, setWaypoints] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [activeTab, setActiveTab] = useState("assistance"); // "assistance" | "table"

  // Modals
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // État de pointage en direct de l'assistance (stocké localement sur le smartphone de l'accompagnateur)
  const [passedCheckpoints, setPassedCheckpoints] = useState({});

  useEffect(() => {
    if (typeof window !== "undefined" && id) {
      try {
        const saved = localStorage.getItem(`trail_passed_cps_${id}`);
        if (saved) {
          setPassedCheckpoints(JSON.parse(saved));
        }
      } catch (e) {
        console.error("Erreur lecture checkpoints passés:", e);
      }
    }
  }, [id]);

  const toggleCheckpointPassed = (cpId) => {
    const updated = {
      ...passedCheckpoints,
      [cpId]: !passedCheckpoints[cpId]
    };
    setPassedCheckpoints(updated);
    try {
      localStorage.setItem(`trail_passed_cps_${id}`, JSON.stringify(updated));
    } catch (e) {
      console.error("Erreur sauvegarde checkpoint:", e);
    }
  };

  useEffect(() => {
    async function fetchPublicRoadbook() {
      try {
        const docRef = doc(db, "roadbooks", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          const rbData = { id: docSnap.id, ...data };
          setRoadbook(rbData);

          if (data.inventory) {
            try {
              setInventory(JSON.parse(data.inventory));
            } catch (e) {
              setInventory([]);
            }
          }

          const { segments: segs, points: pts, waypoints: wps } = calculateRoadbookSegments(data);
          setSegments(segs);
          setPoints(pts);
          setWaypoints(wps);
        } else {
          setRoadbook(null);
        }
      } catch (err) {
        console.error("Erreur chargement public roadbook:", err);
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchPublicRoadbook();
    }
  }, [id]);

  const totalCaddie = useMemo(() => calculateTotalCaddie(segments, inventory), [segments, inventory]);

  const handleDownloadGPX = () => {
    if (!roadbook || segments.length === 0) return;
    try {
      const gpxString = buildGPXString({
        name: roadbook.name,
        points: points,
        segments: segments,
        waypoints: waypoints,
        startTime: roadbook.startTime,
        options: {
          paceType: "fast",
          nameFormat: "both",
          timestampTrack: true
        }
      });
      downloadGPXFile(roadbook.name, gpxString);
    } catch (err) {
      console.error("Erreur téléchargement GPX:", err);
      alert("Erreur lors de la création du fichier GPX.");
    }
  };

  if (loading) {
    return (
      <div className={styles.container} style={{ textAlign: "center", paddingTop: "5rem" }}>
        <Loader2 className="lucide-spin" size={36} color="var(--primary-color)" />
        <p style={{ marginTop: "1rem", color: "var(--text-secondary)" }}>
          Chargement du plan de course et des horaires d'assistance...
        </p>
      </div>
    );
  }

  if (!roadbook) {
    return (
      <div className={styles.container}>
        <div className={styles.privateState}>
          <ShieldAlert size={48} color="#ef4444" style={{ marginBottom: "16px" }} />
          <h2>Roadbook introuvable</h2>
          <p style={{ color: "var(--text-secondary)" }}>
            Ce lien est peut-être expiré ou le roadbook a été supprimé par son créateur.
          </p>
          <Link href="/" className="btn btn-primary" style={{ marginTop: "16px" }}>
            Retour à l'accueil
          </Link>
        </div>
      </div>
    );
  }

  // Vérifier si le roadbook est en mode privé
  if (roadbook.isPublic === false) {
    return (
      <div className={styles.container}>
        <div className={styles.privateState}>
          <Lock size={48} color="#64748b" style={{ marginBottom: "16px" }} />
          <h2>Ce roadbook est privé</h2>
          <p style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
            L'auteur de ce roadbook n'a pas encore activé le partage public. Si vous êtes le propriétaire, connectez-vous pour l'activer dans la page de résumé.
          </p>
          <div style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "center" }}>
            <Link href="/login" className="btn btn-primary">
              Se connecter
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const displayDistance = segments.length > 0 
    ? segments[segments.length - 1].cumulDistance 
    : (roadbook.stats?.distance || 0);

  const displayElePos = segments.length > 0 
    ? segments[segments.length - 1].cumulElevation 
    : (roadbook.stats?.elevation?.pos || 0);

  return (
    <div className={styles.container}>
      {/* Barre supérieure avec branding et actions rapides */}
      <div className={styles.topBar}>
        <Link href="/" className={styles.brandBadge}>
          <Compass size={16} /> Trail Roadbook Pro
        </Link>

        <div className={styles.headerActions}>
          <button 
            type="button" 
            className="btn btn-secondary"
            onClick={() => setShowPdfModal(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <Printer size={16} /> Export PDF / Imprimer
          </button>

          <button 
            type="button" 
            className="btn btn-secondary"
            onClick={handleDownloadGPX}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <Download size={16} /> Fichier GPX
          </button>

          <button 
            type="button" 
            className="btn btn-primary"
            onClick={() => setShowShareModal(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <Share2 size={16} /> Partager
          </button>
        </div>
      </div>

      {/* Carte héroïque de présentation de la course */}
      <div className={styles.heroCard}>
        <h1 className={styles.heroTitle}>{roadbook.name}</h1>
        <p className={styles.heroSubtitle}>
          Plan de course interactif & Feuille de route d'assistance en direct
        </p>

        <div className={styles.statsGrid}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Distance</span>
            <span className={styles.statValue}>{displayDistance.toFixed(1)} km</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Dénivelé +</span>
            <span className={styles.statValue} style={{ color: "#10B981" }}>+{Math.round(displayElePos)} m</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Départ</span>
            <span className={styles.statValue}>
              {roadbook.startTime ? formatTime(roadbook.startTime) : "--:--"}
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Arrivée Estimée</span>
            <span className={styles.statValue} style={{ color: "#0284c7" }}>
              {segments.length > 0 ? formatTime(segments[segments.length - 1].arr_fast) : "--:--"}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation par onglets */}
      <div className={styles.navTabs}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "assistance" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("assistance")}
        >
          <Package size={18} /> Ravitaillements & Assistance Directe
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "table" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("table")}
        >
          <Navigation size={18} /> Tableau de Marche & Profil
        </button>
      </div>

      {/* ONGLET 1 : ASSISTANCE EN DIRECT PAR POINT */}
      {activeTab === "assistance" && (
        <div className={styles.timeline}>
          <div style={{ background: "#e0f2fe", padding: "12px 16px", borderRadius: "10px", fontSize: "0.85rem", color: "#0369a1", marginBottom: "8px" }}>
            💡 <strong>Espace Assistance :</strong> Cliquez sur le cercle à gauche pour cocher chaque ravitaillement lorsque le coureur est passé. Cliquez sur <em>« S'y rendre (Waze / Maps) »</em> pour lancer directement le guidage GPS routier vers le point de ravitaillement.
          </div>

          {segments.map((seg, i) => {
            const cpId = seg.to.id || `cp-${i}`;
            const isPassed = !!passedCheckpoints[cpId];
            const products = getWaypointNutritionProducts(seg.to.planned_nutrition, inventory);
            const hasGps = seg.to.lat && seg.to.lon;
            const googleMapsUrl = hasGps 
              ? `https://www.google.com/maps/dir/?api=1&destination=${seg.to.lat},${seg.to.lon}`
              : null;
            const wazeUrl = hasGps
              ? `https://waze.com/ul?ll=${seg.to.lat},${seg.to.lon}&navigate=yes`
              : null;

            return (
              <div 
                key={i} 
                className={`${styles.stationCard} ${isPassed ? styles.stationCardPassed : ""}`}
              >
                <div className={styles.stationCardHeader}>
                  <div className={styles.stationTitleArea}>
                    <button
                      type="button"
                      className={`${styles.checkCircle} ${isPassed ? styles.checkCircleChecked : ""}`}
                      onClick={() => toggleCheckpointPassed(cpId)}
                      title={isPassed ? "Marquer comme non passé" : "Marquer comme passé"}
                    >
                      {isPassed && <Check size={18} />}
                    </button>

                    <div>
                      <h3 className={styles.stationName}>
                        {seg.to.name}
                        {isPassed && (
                          <span style={{ fontSize: "0.75rem", background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: "10px", fontWeight: 700 }}>
                            Passé ✅
                          </span>
                        )}
                      </h3>
                      <div className={styles.stationSub}>
                        Km {seg.cumulDistance.toFixed(1)} • Altitude {Math.round(seg.to.ele || 0)} m • D+ cumulé +{Math.round(seg.cumulElevation)} m
                      </div>
                    </div>
                  </div>

                  <div className={styles.stationBadges}>
                    {seg.to.assistance_allowed ? (
                      <span className={`${styles.badge} ${styles.badgeAssistYes}`}>Assistance Autorisée</span>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeAssistNo}`}>Assistance Interdite</span>
                    )}

                    {seg.to.has_dropbag && (
                      <span className={`${styles.badge} ${styles.badgeDropbag}`}>Dropbag</span>
                    )}
                  </div>
                </div>

                {/* Grille des horaires de passage */}
                <div className={styles.gridTimes}>
                  <div className={styles.timeBox}>
                    <span className={styles.timeLabel}>Passage Estimé (ETA)</span>
                    <span className={styles.timeValue} style={{ color: "#10B981" }}>
                      {formatTime(seg.arr_fast)}
                    </span>
                  </div>

                  {!roadbook.targetTime && (
                    <div className={styles.timeBox}>
                      <span className={styles.timeLabel}>Passage Lent (Max)</span>
                      <span className={styles.timeValue} style={{ color: "#F59E0B" }}>
                        {formatTime(seg.arr_slow)}
                      </span>
                    </div>
                  )}

                  <div className={styles.timeBox}>
                    <span className={styles.timeLabel}>Barrière Horaire (BH)</span>
                    <span className={styles.timeValue} style={{ color: seg.to.cutoffTime ? "#EF4444" : "#94a3b8" }}>
                      {seg.to.cutoffTime || "Aucune"}
                    </span>
                  </div>

                  <div className={styles.timeBox}>
                    <span className={styles.timeLabel}>Temps de Repos</span>
                    <span className={styles.timeValue}>
                      {seg.to.pause ? `${seg.to.pause} min` : "0 min"}
                    </span>
                  </div>
                </div>

                {/* Ce qu'il faut préparer / donner au coureur */}
                <div style={{ marginBottom: "14px" }}>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-secondary)" }}>
                    À préparer pour le coureur :
                  </span>
                  {products.length === 0 ? (
                    <div style={{ fontStyle: "italic", color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "4px" }}>
                      Ravitaillement standard de l'organisation
                    </div>
                  ) : (
                    <div className={styles.nutritionList}>
                      {products.map((p, idx) => (
                        <div key={idx} className={styles.nutritionTag}>
                          <span>{p.name}</span>
                          <strong style={{ color: "var(--primary-color)" }}>x{p.qty}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions de navigation GPS pour l'assistance */}
                <div className={styles.stationActions}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    Section : {seg.distance.toFixed(1)} km (+{Math.round(seg.elevationPos)}m / -{Math.round(seg.elevationNeg)}m)
                  </div>

                  {hasGps && (
                    <div style={{ display: "flex", gap: "8px" }}>
                      {googleMapsUrl && (
                        <a 
                          href={googleMapsUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className={styles.navBtn}
                          style={{ background: "#0284c7" }}
                        >
                          <MapPin size={14} /> Google Maps
                        </a>
                      )}
                      {wazeUrl && (
                        <a 
                          href={wazeUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className={styles.navBtn}
                          style={{ background: "#334155" }}
                        >
                          <Navigation size={14} /> Waze
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ONGLET 2 : TABLEAU DE MARCHE & PROFIL */}
      {activeTab === "table" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Profil altimétrique interactif */}
          {points.length > 0 && (
            <div className={styles.tableSection}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: 0, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Activity size={20} color="var(--primary-color)" /> Profil Altimétrique de la Course
              </h2>
              <div style={{ height: "260px", width: "100%" }}>
                <ElevationProfile points={points} waypoints={waypoints} />
              </div>
            </div>
          )}

          {/* Tableau de marche complet */}
          <div className={styles.tableSection}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: 0, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Navigation size={20} color="var(--primary-color)" /> Tableau de Marche Complet
            </h2>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Point / Ravitaillement</th>
                    <th style={{ textAlign: "right" }}>Km</th>
                    <th style={{ textAlign: "right" }}>Alt.</th>
                    <th style={{ textAlign: "right" }}>D+ Cumul</th>
                    <th style={{ textAlign: "center" }}>T. Inter</th>
                    <th style={{ textAlign: "center" }}>T. Total</th>
                    <th style={{ textAlign: "center" }}>
                      {roadbook.targetTime ? "ETA Objectif" : "ETA Rapide"}
                    </th>
                    {!roadbook.targetTime && <th style={{ textAlign: "center" }}>ETA Lent</th>}
                    <th style={{ textAlign: "center" }}>BH</th>
                  </tr>
                </thead>
                <tbody>
                  {segments.map((seg, i) => {
                    const totalDurationMs = segments.slice(0, i + 1).reduce(
                      (acc, s) => acc + (roadbook.targetTime ? s.durationFastMs : s.durationFastMs), 0
                    );
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 700 }}>
                          {seg.to.name}
                          {seg.to.has_dropbag && (
                            <span style={{ marginLeft: "6px", fontSize: "0.75rem", background: "#fef3c7", color: "#b45309", padding: "2px 6px", borderRadius: "4px" }}>
                              Dropbag
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>{seg.cumulDistance.toFixed(1)}</td>
                        <td style={{ textAlign: "right" }}>{Math.round(seg.to.ele || 0)}m</td>
                        <td style={{ textAlign: "right", color: "#10B981", fontWeight: 600 }}>
                          +{Math.round(seg.cumulElevation)}m
                        </td>
                        <td style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                          {formatDurationMs(seg.durationFastMs)}
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 700 }}>
                          {formatDurationMs(totalDurationMs)}
                        </td>
                        <td style={{ textAlign: "center", color: "#10B981", fontWeight: 700 }}>
                          {formatTime(seg.arr_fast)}
                        </td>
                        {!roadbook.targetTime && (
                          <td style={{ textAlign: "center", color: "#F59E0B", fontWeight: 700 }}>
                            {formatTime(seg.arr_slow)}
                          </td>
                        )}
                        <td style={{ textAlign: "center" }}>
                          {seg.to.cutoffTime ? (
                            <span style={{ background: "#fee2e2", color: "#b91c1c", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", fontSize: "0.8rem" }}>
                              {seg.to.cutoffTime}
                            </span>
                          ) : (
                            <span style={{ color: "#94a3b8" }}>--:--</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Caddie Nutrition */}
          {totalCaddie.length > 0 && (
            <div className={styles.tableSection}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: 0, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Flame size={20} color="#f97316" /> Caddie Global Nutrition de la Course
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
                {totalCaddie.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--bg-main)", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    <strong style={{ color: "var(--primary-color)", fontSize: "1.1rem" }}>x{p.qty}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showPdfModal && (
        <PdfExportModal
          roadbook={roadbook}
          segments={segments}
          points={points}
          inventory={inventory}
          isOpen={showPdfModal}
          onClose={() => setShowPdfModal(false)}
        />
      )}

      {showShareModal && (
        <ShareModal
          roadbook={roadbook}
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
}
