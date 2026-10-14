"use client";

import { useState, useRef, useMemo } from "react";
import { 
  X, 
  Printer, 
  Download, 
  FileText, 
  Layers, 
  Watch, 
  Package, 
  Check, 
  Loader2, 
  Sparkles,
  MapPin,
  Clock,
  TrendingUp,
  AlertTriangle
} from "lucide-react";
import { formatTime, formatDurationMs, getWaypointNutritionProducts, calculateTotalCaddie } from "@/lib/roadbookHelper";
import { exportElementToPdf } from "@/lib/pdfGenerator";
import styles from "./PdfExportModal.module.css";

/**
 * Génère les coordonnées vectorielles SVG et métadonnées d'altitude d'un profil altimétrique
 */
function generateSvgProfile(pts, width = 700, height = 120, padX = 10, padY = 14) {
  if (!pts || pts.length < 2) return null;

  let minEle = Infinity;
  let maxEle = -Infinity;
  for (let p of pts) {
    if (p.ele != null) {
      if (p.ele < minEle) minEle = p.ele;
      if (p.ele > maxEle) maxEle = p.ele;
    }
  }
  if (minEle === Infinity) minEle = 0;
  if (maxEle === -Infinity) maxEle = 1000;
  const eleSpan = Math.max(30, maxEle - minEle);

  const maxSamples = 300;
  const step = Math.max(1, Math.floor(pts.length / maxSamples));
  const sampled = [];
  for (let i = 0; i < pts.length; i += step) {
    sampled.push(pts[i]);
  }
  if (sampled[sampled.length - 1] !== pts[pts.length - 1]) {
    sampled.push(pts[pts.length - 1]);
  }

  const usableW = width - padX * 2;
  const usableH = height - padY * 2;

  const pathPoints = sampled.map((p, idx) => {
    const x = padX + (idx / (sampled.length - 1)) * usableW;
    const y = height - padY - (((p.ele ?? minEle) - minEle) / eleSpan) * usableH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const dLine = `M ${pathPoints.join(" L ")}`;
  const dArea = `${dLine} L ${(width - padX).toFixed(1)},${(height - padY).toFixed(1)} L ${padX.toFixed(1)},${(height - padY).toFixed(1)} Z`;

  const startEle = Math.round(pts[0]?.ele ?? minEle);
  const endEle = Math.round(pts[pts.length - 1]?.ele ?? maxEle);

  return {
    w: width,
    h: height,
    dLine,
    dArea,
    minEle: Math.round(minEle),
    maxEle: Math.round(maxEle),
    startEle,
    endEle,
    startPoint: pathPoints[0],
    endPoint: pathPoints[pathPoints.length - 1]
  };
}

export default function PdfExportModal({ 
  roadbook, 
  segments = [], 
  points = [], 
  inventory = [], 
  isOpen, 
  onClose 
}) {
  const [selectedFormat, setSelectedFormat] = useState("full"); // "full" | "pocket" | "wristband" | "crew"
  const [includeElevation, setIncludeElevation] = useState(true);
  const [includeSegmentProfiles, setIncludeSegmentProfiles] = useState(true);
  const [includeLogistics, setIncludeLogistics] = useState(true);
  const [includeNutrition, setIncludeNutrition] = useState(true);
  const [includeCutoffs, setIncludeCutoffs] = useState(true);
  
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState("");
  const printContentRef = useRef(null);

  const displayDistance = segments.length > 0 
    ? segments[segments.length - 1].cumulDistance 
    : (roadbook?.stats?.distance || 0);

  const displayElePos = segments.length > 0 
    ? segments[segments.length - 1].cumulElevation 
    : (roadbook?.stats?.elevation?.pos || 0);

  const totalDNeg = segments.reduce((acc, s) => acc + Math.abs(s.elevationNeg || 0), 0);

  // Assistance points
  const assistanceSegments = segments.filter(s => s.to.assistance_allowed || s.to.has_dropbag);

  // Total nutrition caddie
  const totalCaddie = useMemo(() => calculateTotalCaddie(segments, inventory), [segments, inventory]);

  // Génération du SVG vectoriel du profil altimétrique global
  const svgProfile = useMemo(() => {
    return generateSvgProfile(points, 700, 110, 10, 14);
  }, [points]);

  // Génération des SVG vectoriels pour chaque segment individuel
  const segmentSvgProfiles = useMemo(() => {
    if (!segments || segments.length === 0) return {};
    const map = {};
    segments.forEach((seg, idx) => {
      let segPts = seg.points;
      if ((!segPts || segPts.length < 2) && points && points.length > 0) {
        const startIdx = seg.from?.pointIndex ?? 0;
        const endIdx = seg.to?.pointIndex ?? (points.length - 1);
        if (startIdx < endIdx && endIdx <= points.length) {
          segPts = points.slice(startIdx, endIdx + 1);
        }
      }
      map[idx] = generateSvgProfile(segPts, 700, 75, 8, 10);
    });
    return map;
  }, [segments, points]);


  if (!isOpen || !roadbook) return null;

  const handleDownloadPdf = async () => {
    if (!printContentRef.current) return;
    setGeneratingPdf(true);
    setPdfProgress("Initialisation...");

    try {
      const isLandscape = selectedFormat === "pocket";
      const cleanName = (roadbook.name || "roadbook")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .slice(0, 30);
      
      const filename = `${cleanName}_${selectedFormat}.pdf`;

      await exportElementToPdf(printContentRef.current, {
        filename,
        orientation: isLandscape ? "landscape" : "portrait",
        onProgress: (msg) => setPdfProgress(msg)
      });
    } catch (err) {
      console.error("Erreur lors de la génération PDF:", err);
      alert("Erreur lors de la création du fichier PDF. Vous pouvez également utiliser le bouton 'Imprimer'.");
    } finally {
      setGeneratingPdf(false);
      setPdfProgress("");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* En-tête du modal */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>
            <Printer size={22} color="var(--primary-color)" /> Export PDF & Impression Professionnelle
          </h2>
          <button className={styles.closeBtn} onClick={onClose} title="Fermer">
            <X size={20} />
          </button>
        </div>

        {/* Corps principal : Barre de configuration à gauche + Aperçu Document à droite */}
        <div className={styles.mainLayout}>
          {/* Panneau de configuration des options */}
          <div className={styles.sidebar}>
            <div>
              <div className={styles.sectionTitle}>1. Format de Roadbook</div>
              
              <button
                type="button"
                className={`${styles.formatOption} ${selectedFormat === "full" ? styles.formatOptionActive : ""}`}
                onClick={() => setSelectedFormat("full")}
              >
                <FileText size={20} className={styles.formatIcon} />
                <div>
                  <div className={styles.formatName}>Livret A4 Complet</div>
                  <div className={styles.formatDesc}>
                    Guide officiel multi-pages complet : tableau de marche, profil altimétrique, consignes et caddie.
                  </div>
                </div>
              </button>

              <button
                type="button"
                className={`${styles.formatOption} ${selectedFormat === "pocket" ? styles.formatOptionActive : ""}`}
                onClick={() => setSelectedFormat("pocket")}
              >
                <Layers size={20} className={styles.formatIcon} />
                <div>
                  <div className={styles.formatName}>Roadbook de Poche Pliable</div>
                  <div className={styles.formatDesc}>
                    Format accordéon 3 volets compact (1 page A4), prêt à découper et plastifier pour la poche du short.
                  </div>
                </div>
              </button>

              <button
                type="button"
                className={`${styles.formatOption} ${selectedFormat === "wristband" ? styles.formatOptionActive : ""}`}
                onClick={() => setSelectedFormat("wristband")}
              >
                <Watch size={20} className={styles.formatIcon} />
                <div>
                  <div className={styles.formatName}>Bandeau Poignet / Gourde</div>
                  <div className={styles.formatDesc}>
                    Bandelette de pacing ultra-étroite à scotcher autour de la flasque ou à fixer au poignet.
                  </div>
                </div>
              </button>

              <button
                type="button"
                className={`${styles.formatOption} ${selectedFormat === "crew" ? styles.formatOptionActive : ""}`}
                onClick={() => setSelectedFormat("crew")}
              >
                <Package size={20} className={styles.formatIcon} />
                <div>
                  <div className={styles.formatName}>Fiches Assistance Ravitaillement</div>
                  <div className={styles.formatDesc}>
                    Fiches pratiques par point d'assistance pour vos suiveurs (heures d'arrivée, ce qu'il faut donner).
                  </div>
                </div>
              </button>
            </div>

            <div>
              <div className={styles.sectionTitle}>2. Sections à inclure</div>
              <div className={styles.togglesList}>
                {selectedFormat === "full" && (
                  <>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={includeElevation}
                        onChange={(e) => setIncludeElevation(e.target.checked)}
                      />
                      Profil Altimétrique Global
                    </label>

                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={includeSegmentProfiles}
                        onChange={(e) => setIncludeSegmentProfiles(e.target.checked)}
                      />
                      Profils de chaque segment ({segments.length})
                    </label>
                  </>
                )}
                
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={includeCutoffs}
                    onChange={(e) => setIncludeCutoffs(e.target.checked)}
                  />
                  Barrières Horaires (BH en rouge)
                </label>

                {(selectedFormat === "full" || selectedFormat === "crew") && (
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={includeLogistics}
                      onChange={(e) => setIncludeLogistics(e.target.checked)}
                    />
                    Points d'assistance & Dropbags
                  </label>
                )}

                {selectedFormat === "full" && (
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={includeNutrition}
                      onChange={(e) => setIncludeNutrition(e.target.checked)}
                    />
                    Caddie Nutrition Global
                  </label>
                )}
              </div>
            </div>

            <div style={{ background: '#e0f2fe', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', color: '#0369a1', lineHeight: '1.4' }}>
              💡 <strong>Astuce Impression :</strong> Choisissez <em>« Enregistrer au format PDF »</em> dans la boîte de dialogue d'impression ou utilisez notre téléchargement direct PDF pour un rendu instantané.
            </div>
          </div>

          {/* Zone d'aperçu de la feuille de papier (WYSIWYG) */}
          <div className={styles.previewArea}>
            <div 
              id="pdf-printable-content"
              ref={printContentRef}
              className={`${styles.paperSheet} ${selectedFormat === "pocket" ? styles.paperA4Landscape : styles.paperA4Portrait}`}
            >
              {/* FORMAT 1 : LIVRET A4 COMPLET */}
              {selectedFormat === "full" && (
                <>
                  <div className={styles.docHeader}>
                    <div>
                      <h1 className={styles.docTitle}>{roadbook.name}</h1>
                      <div className={styles.docSubtitle}>
                        Plan de marche, Temps de passage & Assistance Officielle
                      </div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: "0.8rem", color: "#64748b" }}>
                      <strong>Édité le :</strong> {new Date().toLocaleDateString("fr-FR")}<br />
                      <strong>Trail Roadbook Pro</strong>
                    </div>
                  </div>

                  {/* Cartouche Métriques */}
                  <div className={styles.docMetaGrid}>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Distance</span>
                      <span className={styles.metaValue}>{displayDistance.toFixed(1)} km</span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Dénivelé +</span>
                      <span className={styles.metaValue} style={{ color: "#15803d" }}>+{Math.round(displayElePos)} m</span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Heure Départ</span>
                      <span className={styles.metaValue}>
                        {roadbook.startTime ? formatTime(roadbook.startTime) : "Non défini"}
                      </span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Arrivée Estimée</span>
                      <span className={styles.metaValue} style={{ color: "#0284c7" }}>
                        {segments.length > 0 ? formatTime(segments[segments.length - 1].arr_fast) : "--:--"}
                      </span>
                    </div>
                  </div>

                  {/* Profil altimétrique global vectoriel */}
                  {includeElevation && svgProfile && (
                    <div style={{ marginBottom: "18px", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px 10px", background: "#f8fafc", boxSizing: "border-box", overflow: "hidden", maxWidth: "100%" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#64748b", marginBottom: "4px", fontWeight: 600 }}>
                        <span>Profil Altimétrique Global</span>
                        <span>Min: {svgProfile.minEle}m / Max: {svgProfile.maxEle}m</span>
                      </div>
                      <div style={{ width: "100%", maxWidth: "100%", overflow: "hidden", boxSizing: "border-box" }}>
                        <svg 
                          viewBox={`0 0 ${svgProfile.w} ${svgProfile.h}`} 
                          preserveAspectRatio="none"
                          style={{ width: "100%", height: "85px", display: "block", overflow: "hidden" }}
                        >
                          <defs>
                            <linearGradient id="pdfElevationGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.35" />
                              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.02" />
                            </linearGradient>
                          </defs>
                          <path d={svgProfile.dArea} fill="url(#pdfElevationGrad)" />
                          <path d={svgProfile.dLine} fill="none" stroke="#0284c7" strokeWidth="2.5" />
                        </svg>
                      </div>
                    </div>
                  )}

                  {/* Tableau de marche */}
                  <table className={styles.docTable}>
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
                        {includeCutoffs && <th style={{ textAlign: "center" }}>BH</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {segments.map((seg, idx) => {
                        const totalDurationMs = segments.slice(0, idx + 1).reduce(
                          (acc, s) => acc + (roadbook.targetTime ? s.durationFastMs : s.durationFastMs), 0
                        );
                        return (
                          <tr key={idx}>
                            <td style={{ fontWeight: 700 }}>
                              {seg.to.name}
                              {seg.to.has_dropbag && <span className={styles.dropbagTag}>Dropbag</span>}
                              {seg.to.assistance_allowed && <span className={styles.assistTag}>Assist.</span>}
                            </td>
                            <td style={{ textAlign: "right" }}>{seg.cumulDistance.toFixed(1)}</td>
                            <td style={{ textAlign: "right" }}>{Math.round(seg.to.ele || 0)}m</td>
                            <td style={{ textAlign: "right", color: "#15803d", fontWeight: 600 }}>
                              +{Math.round(seg.cumulElevation)}m
                            </td>
                            <td style={{ textAlign: "center", color: "#64748b" }}>
                              {formatDurationMs(seg.durationFastMs)}
                            </td>
                            <td style={{ textAlign: "center", fontWeight: 700 }}>
                              {formatDurationMs(totalDurationMs)}
                            </td>
                            <td style={{ textAlign: "center", color: "#15803d", fontWeight: 700 }}>
                              {formatTime(seg.arr_fast)}
                            </td>
                            {!roadbook.targetTime && (
                              <td style={{ textAlign: "center", color: "#b45309", fontWeight: 700 }}>
                                {formatTime(seg.arr_slow)}
                              </td>
                            )}
                            {includeCutoffs && (
                              <td style={{ textAlign: "center" }}>
                                {seg.to.cutoffTime ? (
                                  <span className={styles.bhTag}>{seg.to.cutoffTime}</span>
                                ) : (
                                  <span style={{ color: "#94a3b8" }}>--:--</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Profils altimétriques détaillés par segment */}
                  {includeSegmentProfiles && segments.length > 0 && (
                    <div style={{ marginTop: "22px", pageBreakBefore: "auto" }}>
                      <h3 style={{ 
                        fontSize: "1.05rem", 
                        fontWeight: 800, 
                        borderBottom: "1.5px solid #0f172a", 
                        paddingBottom: "4px", 
                        marginBottom: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px"
                      }}>
                        <TrendingUp size={18} color="#0284c7" /> Profils de chaque segment ({segments.length})
                      </h3>

                      <div className={styles.segmentProfilesGrid}>
                        {segments.map((seg, idx) => {
                          const segSvg = segmentSvgProfiles[idx];
                          const totalDurationMs = segments.slice(0, idx + 1).reduce(
                            (acc, s) => acc + (roadbook.targetTime ? s.durationFastMs : s.durationFastMs), 0
                          );

                          return (
                            <div key={idx} className={styles.segmentProfileCard}>
                              {/* En-tête du segment */}
                              <div className={styles.segmentCardHeader}>
                                <div style={{ fontWeight: 800, fontSize: "0.85rem", color: "#0f172a" }}>
                                  <span className={styles.segBadge}>Tronçon {idx + 1}</span> {seg.from.name} ➔ {seg.to.name}
                                </div>
                                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0284c7" }}>
                                  {seg.distance.toFixed(1)} km · Cumul {seg.cumulDistance.toFixed(1)} km
                                </div>
                              </div>

                              {/* Métriques clés */}
                              <div className={styles.segmentCardMetrics}>
                                <span>
                                  <strong>D+ :</strong> <span style={{ color: "#15803d" }}>+{Math.round(seg.elevationPos)}m</span>
                                </span>
                                <span>
                                  <strong>D- :</strong> <span style={{ color: "#b91c1c" }}>-{Math.round(Math.abs(seg.elevationNeg || 0))}m</span>
                                </span>
                                <span>
                                  <strong>T. Inter :</strong> {formatDurationMs(seg.durationFastMs)}
                                </span>
                                <span>
                                  <strong>T. Total :</strong> {formatDurationMs(totalDurationMs)}
                                </span>
                                <span>
                                  <strong>ETA :</strong> <strong style={{ color: "#15803d" }}>{formatTime(seg.arr_fast)}</strong>
                                </span>
                                {seg.to.cutoffTime && (
                                  <span style={{ color: "#b91c1c", fontWeight: 700 }}>
                                    BH : {seg.to.cutoffTime}
                                  </span>
                                )}
                              </div>

                              {/* Graphique SVG du profil altimétrique du segment */}
                              {segSvg ? (
                                <div className={styles.segmentSvgContainer}>
                                  <div className={styles.segmentSvgMeta}>
                                    <span>Départ : {segSvg.startEle}m</span>
                                    <span>Min : {segSvg.minEle}m / Max : {segSvg.maxEle}m</span>
                                    <span>Arrivée : {segSvg.endEle}m</span>
                                  </div>
                                  <svg
                                    viewBox={`0 0 ${segSvg.w} ${segSvg.h}`}
                                    preserveAspectRatio="none"
                                    className={styles.segmentSvg}
                                  >
                                    <defs>
                                      <linearGradient id={`segElevGrad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#0284c7" stopOpacity="0.4" />
                                        <stop offset="100%" stopColor="#0284c7" stopOpacity="0.05" />
                                      </linearGradient>
                                    </defs>
                                    <path d={segSvg.dArea} fill={`url(#segElevGrad-${idx})`} />
                                    <path d={segSvg.dLine} fill="none" stroke="#0284c7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                    <circle cx={segSvg.startPoint.split(",")[0]} cy={segSvg.startPoint.split(",")[1]} r="3" fill="#15803d" stroke="#ffffff" strokeWidth="1.5" />
                                    <circle cx={segSvg.endPoint.split(",")[0]} cy={segSvg.endPoint.split(",")[1]} r="3" fill="#0284c7" stroke="#ffffff" strokeWidth="1.5" />
                                  </svg>
                                </div>
                              ) : (
                                <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontStyle: "italic", padding: "6px 0" }}>
                                  Profil altimétrique non disponible pour ce tronçon
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Logistique & Assistance */}
                  {includeLogistics && assistanceSegments.length > 0 && (
                    <div style={{ marginTop: "24px", pageBreakInside: "avoid" }}>
                      <h3 style={{ fontSize: "1.05rem", fontWeight: 800, borderBottom: "1.5px solid #0f172a", paddingBottom: "4px", marginBottom: "12px" }}>
                        Points d'Assistance & Logistique Ravitaillements
                      </h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
                        {assistanceSegments.map((seg, i) => {
                          const prods = getWaypointNutritionProducts(seg.to.planned_nutrition, inventory);
                          return (
                            <div key={i} style={{ border: "1px solid #cbd5e1", borderRadius: "6px", padding: "10px", background: "#f8fafc", fontSize: "0.8rem" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginBottom: "4px" }}>
                                <span>📍 {seg.to.name} (km {seg.cumulDistance.toFixed(1)})</span>
                                <div>
                                  {seg.to.has_dropbag && <span className={styles.dropbagTag}>Dropbag</span>}
                                  {seg.to.assistance_allowed && <span className={styles.assistTag}>Assistance</span>}
                                </div>
                              </div>
                              <div style={{ color: "#475569", marginBottom: "6px" }}>
                                ETA : <strong>{formatTime(seg.arr_fast)}</strong>
                                {seg.to.cutoffTime && <> | BH : <strong style={{ color: "#b91c1c" }}>{seg.to.cutoffTime}</strong></>}
                                {seg.to.pause && <> | Pause : <strong>{seg.to.pause} min</strong></>}
                              </div>
                              {prods.length > 0 && (
                                <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "4px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                  {prods.map((p, idx) => (
                                    <span key={idx} style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 6px", fontSize: "0.75rem" }}>
                                      {p.name} <strong>x{p.qty}</strong>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Caddie Nutrition */}
                  {includeNutrition && totalCaddie.length > 0 && (
                    <div style={{ marginTop: "24px", pageBreakInside: "avoid" }}>
                      <h3 style={{ fontSize: "1.05rem", fontWeight: 800, borderBottom: "1.5px solid #0f172a", paddingBottom: "4px", marginBottom: "12px" }}>
                        Récapitulatif Nutrition Totale (Le Caddie)
                      </h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", fontSize: "0.8rem" }}>
                        {totalCaddie.map((p) => (
                          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "4px" }}>
                            <span>{p.name}</span>
                            <strong style={{ color: "#0284c7" }}>x{p.qty}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* FORMAT 2 : ROADBOOK DE POCHE PLIABLE (3 VOLETS ACCORDÉON) */}
              {selectedFormat === "pocket" && (
                <>
                  <div style={{ textAlign: "center", borderBottom: "1px dashed #94a3b8", paddingBottom: "8px", marginBottom: "12px" }}>
                    <h2 style={{ fontSize: "1.2rem", margin: "0 0 2px 0", fontWeight: 800 }}>{roadbook.name} — Roadbook de Poche Pliable</h2>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      ✂️ Découpez sur les bords et pliez selon les 3 colonnes en accordéon (format 9 x 14 cm)
                    </span>
                  </div>

                  <div className={styles.pocketGrid}>
                    {/* Volet 1 : Début de course & infos vitales */}
                    <div className={styles.pocketFoldColumn}>
                      <div className={styles.pocketFoldHeader}>Volet 1 / 3 — Début & Clés</div>
                      <div style={{ fontSize: "0.7rem", marginBottom: "8px", background: "#f8fafc", padding: "6px", borderRadius: "4px" }}>
                        <strong>Départ :</strong> {roadbook.startTime ? formatTime(roadbook.startTime) : "--:--"}<br />
                        <strong>Distance :</strong> {displayDistance.toFixed(1)} km | <strong>D+ :</strong> +{Math.round(displayElePos)}m
                      </div>
                      {segments.slice(0, Math.ceil(segments.length / 3)).map((s, idx) => (
                        <div key={idx} className={styles.pocketRow}>
                          <div style={{ fontWeight: 700 }}>
                            {s.to.name}
                            {s.to.has_dropbag && <span className={styles.dropbagTag}>🎒</span>}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 700, color: "#15803d" }}>{formatTime(s.arr_fast)}</div>
                            <div style={{ fontSize: "0.68rem", color: "#64748b" }}>
                              {s.cumulDistance.toFixed(1)}k | +{Math.round(s.cumulElevation)}m
                              {s.to.cutoffTime && <span style={{ color: "#b91c1c", fontWeight: 700, marginLeft: "4px" }}>BH:{s.to.cutoffTime}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Volet 2 : Cœur de course */}
                    <div className={styles.pocketFoldColumn}>
                      <div className={styles.pocketFoldHeader}>Volet 2 / 3 — Milieu de Course</div>
                      {segments.slice(Math.ceil(segments.length / 3), Math.ceil((segments.length * 2) / 3)).map((s, idx) => (
                        <div key={idx} className={styles.pocketRow}>
                          <div style={{ fontWeight: 700 }}>
                            {s.to.name}
                            {s.to.has_dropbag && <span className={styles.dropbagTag}>🎒</span>}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 700, color: "#15803d" }}>{formatTime(s.arr_fast)}</div>
                            <div style={{ fontSize: "0.68rem", color: "#64748b" }}>
                              {s.cumulDistance.toFixed(1)}k | +{Math.round(s.cumulElevation)}m
                              {s.to.cutoffTime && <span style={{ color: "#b91c1c", fontWeight: 700, marginLeft: "4px" }}>BH:{s.to.cutoffTime}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Volet 3 : Final & Numéros d'urgence */}
                    <div className={styles.pocketFoldColumn}>
                      <div className={styles.pocketFoldHeader}>Volet 3 / 3 — Final & Arrivée</div>
                      {segments.slice(Math.ceil((segments.length * 2) / 3)).map((s, idx) => (
                        <div key={idx} className={styles.pocketRow}>
                          <div style={{ fontWeight: 700 }}>
                            {s.to.name}
                            {s.to.has_dropbag && <span className={styles.dropbagTag}>🎒</span>}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 700, color: "#15803d" }}>{formatTime(s.arr_fast)}</div>
                            <div style={{ fontSize: "0.68rem", color: "#64748b" }}>
                              {s.cumulDistance.toFixed(1)}k | +{Math.round(s.cumulElevation)}m
                              {s.to.cutoffTime && <span style={{ color: "#b91c1c", fontWeight: 700, marginLeft: "4px" }}>BH:{s.to.cutoffTime}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div style={{ marginTop: "auto", borderTop: "1px dashed #cbd5e1", paddingTop: "6px", fontSize: "0.7rem", color: "#b91c1c" }}>
                        🚨 <strong>Secours : 112</strong><br />
                        <span style={{ color: "#475569" }}>Note : hydratez-vous régulièrement !</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* FORMAT 3 : BANDEAU POIGNET / GOURDE */}
              {selectedFormat === "wristband" && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ marginBottom: "16px", fontSize: "0.85rem", color: "#475569" }}>
                    ✂️ Découpez l'une des bandelettes ci-dessous et scotchez-la autour de votre flasque ou plastifiez-la au poignet.
                  </div>
                  <div className={styles.wristbandContainer}>
                    {/* Bandelette 1 : ETA Cible / Rapide */}
                    <div className={styles.wristbandStrip}>
                      <div className={styles.wristbandTitle}>{roadbook.name.slice(0, 18)}</div>
                      <div style={{ fontSize: "0.65rem", textAlign: "center", color: "#64748b", marginBottom: "6px" }}>
                        Allure Cible / Rapide
                      </div>
                      {segments.map((s, idx) => (
                        <div key={idx} className={styles.wristbandRow}>
                          <span style={{ fontWeight: 700 }}>{s.to.name.slice(0, 10)}</span>
                          <span>{s.cumulDistance.toFixed(0)}k</span>
                          <strong style={{ color: "#15803d" }}>{formatTime(s.arr_fast)}</strong>
                          {s.to.cutoffTime && <span style={{ color: "#b91c1c" }}>{s.to.cutoffTime}</span>}
                        </div>
                      ))}
                    </div>

                    {/* Bandelette 2 : Copie de rechange ou allure lente */}
                    <div className={styles.wristbandStrip}>
                      <div className={styles.wristbandTitle}>{roadbook.name.slice(0, 18)}</div>
                      <div style={{ fontSize: "0.65rem", textAlign: "center", color: "#64748b", marginBottom: "6px" }}>
                        Barrières Horaires & D+
                      </div>
                      {segments.map((s, idx) => (
                        <div key={idx} className={styles.wristbandRow}>
                          <span style={{ fontWeight: 700 }}>{s.to.name.slice(0, 10)}</span>
                          <span>+{Math.round(s.cumulElevation)}m</span>
                          <strong style={{ color: s.to.cutoffTime ? "#b91c1c" : "#0284c7" }}>
                            {s.to.cutoffTime ? `BH ${s.to.cutoffTime}` : formatTime(s.arr_fast)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* FORMAT 4 : FICHES D'ASSISTANCE PAR POINT */}
              {selectedFormat === "crew" && (
                <div>
                  <div style={{ borderBottom: "1.5px solid #0f172a", paddingBottom: "6px", marginBottom: "16px" }}>
                    <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0 }}>
                      {roadbook.name} — Fiches d'Assistance Ravitaillements
                    </h2>
                    <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      Fiches individuelles prêtes à distribuer à votre équipe de soutien et d'assistance.
                    </span>
                  </div>

                  {assistanceSegments.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
                      Aucun ravitaillement avec assistance autorisée ou dropbag n'a été coché sur ce parcours.
                    </div>
                  ) : (
                    <div className={styles.crewGrid}>
                      {assistanceSegments.map((s, idx) => {
                        const prods = getWaypointNutritionProducts(s.to.planned_nutrition, inventory);
                        return (
                          <div key={idx} className={styles.crewCard}>
                            <div className={styles.crewCardHeader}>
                              <div>
                                <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0 }}>
                                  📍 {s.to.name}
                                </h3>
                                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                  Km {s.cumulDistance.toFixed(1)} | Alt. {Math.round(s.to.ele || 0)}m
                                </div>
                              </div>
                              <div>
                                {s.to.has_dropbag && <span className={styles.dropbagTag}>Dropbag</span>}
                                {s.to.assistance_allowed && <span className={styles.assistTag}>Assistance</span>}
                              </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "0.8rem", marginBottom: "10px", background: "#f8fafc", padding: "8px", borderRadius: "6px" }}>
                              <div>
                                <span style={{ color: "#64748b", fontSize: "0.7rem", display: "block" }}>ARRIVÉE ESTIMÉE</span>
                                <strong style={{ color: "#15803d", fontSize: "1rem" }}>{formatTime(s.arr_fast)}</strong>
                              </div>
                              <div>
                                <span style={{ color: "#64748b", fontSize: "0.7rem", display: "block" }}>BARRIÈRE HORAIRE</span>
                                <strong style={{ color: s.to.cutoffTime ? "#b91c1c" : "#64748b", fontSize: "1rem" }}>
                                  {s.to.cutoffTime || "Aucune"}
                                </strong>
                              </div>
                              <div style={{ gridColumn: "span 2" }}>
                                <span style={{ color: "#64748b", fontSize: "0.7rem" }}>TEMPS DE PAUSE PRÉVU : </span>
                                <strong>{s.to.pause ? `${s.to.pause} min` : "Arrêt express (< 5 min)"}</strong>
                              </div>
                            </div>

                            <div style={{ fontSize: "0.78rem" }}>
                              <strong style={{ color: "#0f172a", textTransform: "uppercase", fontSize: "0.7rem", letterSpacing: "0.03em" }}>
                                À donner au coureur :
                              </strong>
                              {prods.length === 0 ? (
                                <div style={{ color: "#94a3b8", fontStyle: "italic", marginTop: "2px" }}>
                                  Eau et ravitaillement classique de la course
                                </div>
                              ) : (
                                <ul style={{ margin: "4px 0 0 0", paddingLeft: "16px" }}>
                                  {prods.map((p, pIdx) => (
                                    <li key={pIdx}>
                                      {p.name} <strong>x{p.qty}</strong>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pied du modal avec actions */}
        <div className={styles.footer}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {generatingPdf && (
              <span style={{ fontSize: "0.85rem", color: "var(--primary-color)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Loader2 size={16} className="lucide-spin" /> {pdfProgress}
              </span>
            )}
          </div>

          <div className={styles.footerButtons}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={generatingPdf}
            >
              Fermer
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handlePrint}
              disabled={generatingPdf}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <Printer size={16} /> Imprimer / Navigateur
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDownloadPdf}
              disabled={generatingPdf}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              {generatingPdf ? <Loader2 size={16} className="lucide-spin" /> : <Download size={16} />}
              {generatingPdf ? "Création du PDF..." : "Télécharger en PDF (.pdf)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
