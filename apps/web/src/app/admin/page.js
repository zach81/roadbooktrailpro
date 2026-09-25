"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { enrichWaypointsWithStartEnd, generateSegments, findPointByDistance } from "@/lib/roadbookCalculator";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db, storage } from "@/lib/firebase";
import { collection, query, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { parseGPX, readFileAsText } from "@/lib/gpxService";
import { Shield, Upload, Trash2, Plus, Map, Edit2, X, PlusCircle } from "lucide-react";
import styles from "./admin.module.css";

const MapComponent = dynamic(() => import('@/components/MapComponent'), { 
  ssr: false,
  loading: () => <div style={{padding: '2rem', textAlign: 'center'}}>Chargement de la carte...</div>
});

const ElevationProfile = dynamic(() => import('@/components/ElevationProfile'), { 
  ssr: false,
  loading: () => <div style={{padding: '2rem', textAlign: 'center'}}>Chargement du profil...</div>
});

export default function AdminPage() {
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", event: "", distance: 0, elevation: 0 });
  const [gpxFile, setGpxFile] = useState(null);

  // Edit state
  const [editingTrace, setEditingTrace] = useState(null);
  const [editFormData, setEditFormData] = useState(null);
  const [points, setPoints] = useState([]);
  const [segments, setSegments] = useState([]);
  const [isGPXLoading, setIsGPXLoading] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser || !isAdmin) {
      router.push("/dashboard");
      return;
    }

    fetchTraces();
  }, [currentUser, isAdmin, authLoading, router]);

  async function fetchTraces() {
    try {
      setLoading(true);
      const q = query(collection(db, "official_traces"));
      const snapshot = await getDocs(q);
      const data = [];
      snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() });
      });
      setTraces(data);
    } catch (err) {
      console.error("Erreur lors de la récupération des traces :", err);
    } finally {
      setLoading(false);
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setGpxFile(file);

    try {
      const gpxText = await readFileAsText(file);
      const { stats } = await parseGPX(gpxText);
      setFormData(prev => ({
        ...prev,
        distance: Math.round(stats.distance),
        elevation: Math.round(stats.elevation.pos)
      }));
    } catch (err) {
      console.error("Impossible de lire les stats du GPX", err);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!gpxFile || !formData.name || !formData.event) {
      alert("Veuillez remplir tous les champs et sélectionner un fichier.");
      return;
    }

    try {
      setUploading(true);
      
      const gpxText = await readFileAsText(gpxFile);
      const { waypoints } = await parseGPX(gpxText);

      // 1. Upload GPX to Firebase Storage
      const storageRef = ref(storage, `official_traces/${Date.now()}_${gpxFile.name}`);
      await uploadBytes(storageRef, gpxFile);
      const downloadURL = await getDownloadURL(storageRef);

      // 2. Add document to Firestore
      const docRef = await addDoc(collection(db, "official_traces"), {
        name: formData.name,
        event: formData.event,
        distance: parseFloat(formData.distance) || 0,
        elevation: parseFloat(formData.elevation) || 0,
        gpxUrl: downloadURL,
        storagePath: storageRef.fullPath,
        waypoints: JSON.stringify(waypoints),
        createdAt: new Date(),
        createdBy: currentUser.uid
      });

      // 3. Update state and reset form
      setTraces([...traces, {
        id: docRef.id,
        name: formData.name,
        event: formData.event,
        distance: parseFloat(formData.distance) || 0,
        elevation: parseFloat(formData.elevation) || 0,
        gpxUrl: downloadURL,
        storagePath: storageRef.fullPath,
        waypoints: JSON.stringify(waypoints),
      }]);
      
      setShowAddForm(false);
      setFormData({ name: "", event: "", distance: 0, elevation: 0 });
      setGpxFile(null);
      alert("Trace ajoutée avec succès !");

    } catch (err) {
      console.error("Erreur d'upload :", err);
      alert("Une erreur est survenue lors de l'ajout.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (trace) => {
    if (!window.confirm(`Voulez-vous vraiment supprimer "${trace.name}" ?`)) return;

    try {
      if (trace.storagePath) {
        const storageRef = ref(storage, trace.storagePath);
        await deleteObject(storageRef).catch(e => console.error("Fichier introuvable dans storage", e));
      }
      await deleteDoc(doc(db, "official_traces", trace.id));
      setTraces(traces.filter(t => t.id !== trace.id));
    } catch (err) {
      console.error("Erreur lors de la suppression :", err);
      alert("Erreur lors de la suppression.");
    }
  };

  const handleEditClick = async (trace) => {
    setEditingTrace(trace);
    let wps = [];
    if (trace.waypoints) {
      try {
        wps = typeof trace.waypoints === 'string' ? JSON.parse(trace.waypoints) : trace.waypoints;
        wps = wps.map(wp => ({
          ...wp,
          id: wp.id ? wp.id.toString() : Date.now().toString() + Math.random().toString()
        }));
      } catch (e) {
        console.error("Erreur de parsing des waypoints:", e);
      }
    }
    setEditFormData({
      name: trace.name || "",
      event: trace.event || "",
      distance: trace.distance || 0,
      elevation: trace.elevation || 0,
      waypoints: wps
    });
    setPoints([]);
    setSegments([]);

    if (trace.gpxUrl) {
      setIsGPXLoading(true);
      try {
        const response = await fetch(trace.gpxUrl);
        const gpxText = await response.text();
        const { points: parsedPoints } = await parseGPX(gpxText);
        setPoints(parsedPoints);
      } catch (err) {
        console.error("Erreur de chargement du GPX pour édition", err);
      } finally {
        setIsGPXLoading(false);
      }
    }
  };

  useEffect(() => {
    if (points.length > 0 && editFormData) {
      const enrichedWp = enrichWaypointsWithStartEnd(editFormData.waypoints || [], points);
      const optThreshold = 5;
      
      const newSegments = generateSegments(
        points, enrichedWp, 600, 15,
        "", optThreshold, 1,
        "modere", 15, 12
      );
      setSegments(newSegments);
    }
  }, [points, editFormData?.waypoints, editFormData?.distance, editFormData?.elevation]);

  const handleUpdateWaypoint = (id, newValues) => {
    if (!editFormData) return;
    const updated = editFormData.waypoints.map(wp => 
      wp.id === id ? { ...wp, ...newValues } : wp
    );
    updated.sort((a, b) => (parseFloat(a.km) || 0) - (parseFloat(b.km) || 0));
    setEditFormData({ ...editFormData, waypoints: updated });
  };

  const handleAddWaypoint = (newWp) => {
    if (!editFormData || points.length === 0) return;
    
    // newWp may come from MapComponent as { name, lat, lon, ele, id, type }
    const lat = newWp.lat;
    const lon = newWp.lon;
    
    let closestPoint = null;
    let minDiff = Infinity;
    for (const p of points) {
      const diff = Math.abs(p.lat - lat) + Math.abs(p.lon - lon);
      if (diff < minDiff) {
        minDiff = diff;
        closestPoint = p;
      }
    }
    if (!closestPoint) return;
    
    let d = 0;
    const pIndex = points.indexOf(closestPoint);
    for(let i=1; i<=pIndex; i++) {
        const R = 6371;
        const dLat = (points[i].lat - points[i-1].lat) * Math.PI / 180;
        const dLon = (points[i].lon - points[i-1].lon) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(points[i-1].lat * Math.PI / 180) * Math.cos(points[i].lat * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        d += R * c;
    }
    
    const waypointToAdd = {
      id: newWp.id || Date.now().toString(),
      name: newWp.name || "Nouveau Point",
      type: newWp.type || "point",
      lat: closestPoint.lat,
      lon: closestPoint.lon,
      km: d.toFixed(1),
      ele: closestPoint.ele,
      planned_nutrition: {}
    };
    
    const updated = [...editFormData.waypoints, waypointToAdd].sort((a, b) => parseFloat(a.km) - parseFloat(b.km));
    setEditFormData({ ...editFormData, waypoints: updated });
  };

  const handleHoverDistance = (dist) => {
    if (dist === null) {
      setHoveredPoint(null);
    } else {
      const p = findPointByDistance(dist, points);
      if (p) setHoveredPoint(p);
    }
  };

  const addWaypointAtDistance = (dist) => {
    if (!editFormData || points.length === 0) return;
    
    const point = findPointByDistance(dist, points);
    if (!point) return;

    const newWp = {
      id: Date.now().toString(),
      name: "Point " + dist.toFixed(1) + " km",
      type: "point",
      lat: point.lat,
      lon: point.lon,
      km: dist.toFixed(1),
      ele: point.ele,
      planned_nutrition: {}
    };
    const updated = [...editFormData.waypoints, newWp].sort((a, b) => parseFloat(a.km) - parseFloat(b.km));
    setEditFormData({ ...editFormData, waypoints: updated });
  };

  const handleRemoveWaypoint = (wpId) => {
    if (!editFormData) return;
    const updated = editFormData.waypoints.filter(w => w.id !== wpId);
    setEditFormData({ ...editFormData, waypoints: updated });
  };

  const handleEditSave = async () => {
    try {
      setUploading(true);
      const docRef = doc(db, "official_traces", editingTrace.id);
      
      const updateData = {
        name: editFormData.name,
        event: editFormData.event,
        distance: parseFloat(editFormData.distance) || 0,
        elevation: parseFloat(editFormData.elevation) || 0,
        waypoints: JSON.stringify(editFormData.waypoints)
      };

      await updateDoc(docRef, updateData);

      setTraces(traces.map(t => 
        t.id === editingTrace.id ? { ...t, ...updateData } : t
      ));
      
      setEditingTrace(null);
      setEditFormData(null);
      alert("Trace mise à jour avec succès !");
    } catch (err) {
      console.error("Erreur lors de la mise à jour :", err);
      alert("Erreur lors de la mise à jour de la trace.");
    } finally {
      setUploading(false);
    }
  };



  if (authLoading || loading) return <div className="loader">Chargement...</div>;
  if (!isAdmin) return null;

  return (
    <div className={styles.adminContainer}>
      <div className="container">
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <Shield size={32} className={styles.iconPrimary} />
            <div>
              <h1>Administration</h1>
              <p>Gérez les traces officielles de l'application</p>
            </div>
          </div>
          <button 
            className="btn btn-primary"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? 'Annuler' : <><Plus size={18}/> Ajouter une trace</>}
          </button>
        </header>

        {showAddForm && (
          <div className={styles.addFormCard}>
            <h3>Nouvelle Trace Officielle</h3>
            <form onSubmit={handleUpload} className={styles.form}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Événement (ex: UTMB Mont-Blanc)</label>
                  <input 
                    type="text" 
                    required 
                    value={formData.event}
                    onChange={e => setFormData({...formData, event: e.target.value})}
                    placeholder="Nom de l'événement"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Nom de la course (ex: CCC)</label>
                  <input 
                    type="text" 
                    required 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="Nom de la course"
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Fichier GPX</label>
                <div className={styles.fileUploadWrapper}>
                  <input 
                    type="file" 
                    accept=".gpx" 
                    onChange={handleFileChange} 
                    required
                    id="gpx-upload"
                    className={styles.fileInput}
                  />
                  <label htmlFor="gpx-upload" className={styles.fileLabel}>
                    <Upload size={20} />
                    {gpxFile ? gpxFile.name : "Sélectionner un fichier GPX"}
                  </label>
                </div>
              </div>

              {formData.distance > 0 && (
                <div className={styles.statsPreview}>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>Distance Officielle (km)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={formData.distance}
                        onChange={e => setFormData({...formData, distance: e.target.value})}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Dénivelé Officiel (m)</label>
                      <input 
                        type="number"
                        value={formData.elevation}
                        onChange={e => setFormData({...formData, elevation: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              )}

              <button type="submit" className="btn btn-primary" disabled={uploading}>
                {uploading ? "Ajout en cours..." : "Sauvegarder la trace"}
              </button>
            </form>
          </div>
        )}

        {editingTrace && (
          <div className={styles.modalOverlay}>
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <h2>Édition : {editingTrace.name}</h2>
                <button onClick={() => setEditingTrace(null)} className={styles.closeBtn}><X size={24} /></button>
              </div>
              <div className={styles.modalBody}>
                <div className={styles.mapSection}>
                  {isGPXLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg-surface)' }}>Chargement de la trace GPX...</div>
                  ) : points.length > 0 ? (
                    <>
                      <div style={{ height: '400px', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
                        <MapComponent 
                          points={points} 
                          segments={segments} 
                          onAddWaypoint={handleAddWaypoint}
                          onRemoveWaypoint={handleRemoveWaypoint}
                          hoveredPoint={hoveredPoint}
                          waypointCount={editFormData.waypoints.length}
                        />
                      </div>
                      <div style={{ height: '200px', background: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)' }}>
                        <ElevationProfile 
                          points={points} 
                          segments={segments} 
                          startTime="" 
                          distanceFactor={1}
                          onAddWaypointByDistance={(dist) => addWaypointAtDistance(dist)} 
                          onHoverDistance={handleHoverDistance}
                        />
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg-surface)' }}>Trace non disponible.</div>
                  )}
                </div>

                <div className={styles.formSection}>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>Événement</label>
                      <input type="text" className="input-field" value={editFormData.event} onChange={e => setEditFormData({...editFormData, event: e.target.value})} />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Nom de la course</label>
                      <input type="text" className="input-field" value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} />
                    </div>
                  </div>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>Distance Officielle (km)</label>
                      <input type="number" step="0.1" className="input-field" value={editFormData.distance} onChange={e => setEditFormData({...editFormData, distance: e.target.value})} />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Dénivelé Officiel (m)</label>
                      <input type="number" className="input-field" value={editFormData.elevation} onChange={e => setEditFormData({...editFormData, elevation: e.target.value})} />
                    </div>
                  </div>

                  <div className={styles.waypointsSection}>
                    <div className={styles.waypointsHeader}>
                      <h3>Ravitaillements & Points</h3>
                    </div>
                    
                    <div className={styles.waypointsList}>
                      {editFormData.waypoints.map((wp) => (
                        <div key={wp.id} className={styles.waypointCard}>
                          <div className={styles.waypointRow}>
                            <input type="text" value={wp.name} onChange={e => handleUpdateWaypoint(wp.id, {name: e.target.value})} placeholder="Nom" className={styles.wpInput} />
                            <select value={wp.type || 'point'} onChange={e => handleUpdateWaypoint(wp.id, {type: e.target.value})} className={styles.wpSelect}>
                              <option value="point">Passage</option>
                              <option value="water">Eau</option>
                              <option value="full">Ravito</option>
                              <option value="base">Base vie</option>
                            </select>
                            <input type="number" step="0.1" value={wp.km || 0} onChange={e => handleUpdateWaypoint(wp.id, {km: parseFloat(e.target.value) || 0})} placeholder="km" className={styles.wpInputSmall} />
                            <span className={styles.wpLabel}>km</span>
                            <input type="number" value={wp.ele || 0} onChange={e => handleUpdateWaypoint(wp.id, {ele: parseFloat(e.target.value) || 0})} placeholder="Alt" className={styles.wpInputSmall} />
                            <span className={styles.wpLabel}>m</span>
                            <button type="button" onClick={() => handleRemoveWaypoint(wp.id)} className={styles.deleteWpBtn}><Trash2 size={16} /></button>
                          </div>
                          
                          <div className={styles.checkboxesContainer}>
                            <label className={styles.checkboxGroup}>
                              <input type="checkbox" checked={wp.assistance_allowed || false} onChange={e => handleUpdateWaypoint(wp.id, {assistance_allowed: e.target.checked})} /> 
                              Assistance
                            </label>
                            <label className={styles.checkboxGroup}>
                              <input type="checkbox" checked={wp.has_dropbag || false} onChange={e => handleUpdateWaypoint(wp.id, {has_dropbag: e.target.checked})} /> 
                              Dropbag
                            </label>
                            <label className={styles.checkboxGroup}>
                              <input type="checkbox" checked={wp.sleep || false} onChange={e => handleUpdateWaypoint(wp.id, {sleep: e.target.checked})} /> 
                              Sommeil
                            </label>
                          </div>
                        </div>
                      ))}
                      {editFormData.waypoints.length === 0 && <p className={styles.emptyText}>Aucun point défini. Cliquez sur la carte ou le profil.</p>}
                    </div>
                  </div>
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button className="btn btn-secondary" onClick={() => setEditingTrace(null)}>Annuler</button>
                <button className="btn btn-primary" onClick={handleEditSave} disabled={uploading}>
                  {uploading ? "Sauvegarde..." : "Sauvegarder"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={styles.tracesList}>
          <h2>Traces Actuelles</h2>
          {traces.length === 0 ? (
            <p className={styles.emptyState}>Aucune trace officielle trouvée.</p>
          ) : (
            <div className={styles.grid}>
              {traces.map(trace => (
                <div key={trace.id} className={`card ${styles.traceCard}`}>
                  <div className={styles.cardHeader}>
                    <h4><Map size={18} className={styles.iconPrimary}/> {trace.name}</h4>
                    <span className={styles.eventBadge}>{trace.event}</span>
                  </div>
                  <div className={styles.cardBody}>
                    <p>{trace.distance} km • +{trace.elevation} m</p>
                  </div>
                  <div className={styles.cardFooter}>
                    <button 
                      className={styles.editBtn}
                      onClick={() => handleEditClick(trace)}
                      title="Éditer"
                    >
                      <Edit2 size={16} /> Éditer
                    </button>
                    <button 
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(trace)}
                      title="Supprimer"
                    >
                      <Trash2 size={16} /> Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
