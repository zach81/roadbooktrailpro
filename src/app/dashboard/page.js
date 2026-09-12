"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { parseGPX, readFileAsText } from "@/lib/gpxService";
import { Upload, Plus, FileText, Activity, Trash2, Edit2, Check, X, Map as MapIcon, ChevronRight } from "lucide-react";
import { officialRaces } from "@/data/officialRaces";
import styles from "./dashboard.module.css";

export default function Dashboard() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const [roadbooks, setRoadbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [showOfficialModal, setShowOfficialModal] = useState(false);

  useEffect(() => {
    if (!currentUser) {
      router.push("/login");
      return;
    }

    async function fetchRoadbooks() {
      try {
        const q = query(collection(db, "roadbooks"), where("userId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        const data = [];
        querySnapshot.forEach((doc) => {
          data.push({ id: doc.id, ...doc.data() });
        });
        setRoadbooks(data);
      } catch (err) {
        console.error("Erreur lors de la récupération des roadbooks", err);
      } finally {
        setLoading(false);
      }
    }

    fetchRoadbooks();
  }, [currentUser, router]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      console.log("1. Début de l'upload pour le fichier:", file.name);
      setUploading(true);
      
      console.log("2. Lecture du fichier GPX...");
      const gpxText = await readFileAsText(file);
      
      console.log("3. Analyse du GPX...");
      const { stats, points, waypoints } = await parseGPX(gpxText);
      console.log("   - Stats:", stats);
      console.log("   - Points extraits:", points.length);

      console.log("4. Sauvegarde dans Firestore (cela peut bloquer si la BDD n'est pas créée)...");
      const docRef = await addDoc(collection(db, "roadbooks"), {
        userId: currentUser.uid,
        name: file.name.replace(".gpx", ""),
        stats,
        points: JSON.stringify(points),
        waypoints: JSON.stringify(waypoints),
        segments: [],
        createdAt: new Date(),
      });
      console.log("5. Sauvegarde réussie, ID du document:", docRef.id);

      router.push(`/editor/${docRef.id}`);

    } catch (err) {
      console.error("Erreur lors de l'upload du GPX :", err);
      alert("Erreur lors de la lecture du fichier GPX. Regardez la console (F12) pour plus de détails.");
    } finally {
      setUploading(false);
    }
  };

  const handleLoadOfficialTrace = async (race) => {
    try {
      setUploading(true);
      setShowOfficialModal(false);
      
      const response = await fetch(`/traces/${race.gpxFile}`);
      if (!response.ok) throw new Error("Fichier introuvable");
      const gpxText = await response.text();
      
      const { stats, points, waypoints } = await parseGPX(gpxText);
      
      const docRef = await addDoc(collection(db, "roadbooks"), {
        userId: currentUser.uid,
        name: race.name,
        stats,
        points: JSON.stringify(points),
        waypoints: JSON.stringify(waypoints),
        segments: [],
        createdAt: new Date(),
      });
      
      router.push(`/editor/${docRef.id}`);
    } catch (err) {
      console.error("Erreur lors du chargement de la trace officielle :", err);
      alert("Erreur lors du chargement de cette course.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce roadbook ? Cette action est irréversible.")) {
      try {
        await deleteDoc(doc(db, "roadbooks", id));
        setRoadbooks(roadbooks.filter(rb => rb.id !== id));
      } catch (err) {
        console.error("Erreur lors de la suppression:", err);
        alert("Erreur lors de la suppression du roadbook.");
      }
    }
  };

  const handleRenameStart = (rb) => {
    setEditingId(rb.id);
    setEditName(rb.name);
  };

  const handleRenameCancel = () => {
    setEditingId(null);
    setEditName("");
  };

  const handleRenameSave = async (id) => {
    if (!editName.trim()) return;
    try {
      await updateDoc(doc(db, "roadbooks", id), {
        name: editName.trim()
      });
      setRoadbooks(roadbooks.map(rb => 
        rb.id === id ? { ...rb, name: editName.trim() } : rb
      ));
      setEditingId(null);
      setEditName("");
    } catch (err) {
      console.error("Erreur lors du renommage:", err);
      alert("Erreur lors du renommage du roadbook.");
    }
  };

  if (loading) return <div className={styles.loader}>Chargement...</div>;

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.header}>
        <h1>Mes Roadbooks</h1>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => setShowOfficialModal(true)}
            disabled={uploading}
          >
            <MapIcon size={18} />
            Courses Officielles
          </button>
          
          <label className={`btn btn-primary ${styles.uploadBtn}`}>
            {uploading ? "Analyse en cours..." : (
              <>
                <Upload size={18} />
                Nouveau Roadbook (GPX)
              </>
            )}
            <input 
              type="file" 
              accept=".gpx" 
              onChange={handleFileUpload} 
              disabled={uploading}
              style={{ display: 'none' }} 
            />
          </label>
        </div>
      </header>

      {roadbooks.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><Plus size={48} /></div>
          <h3>Aucun roadbook pour le moment</h3>
          <p>Importez votre première trace GPX pour commencer la planification de votre course.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {roadbooks.map((rb) => (
            <div key={rb.id} className={`card ${styles.roadbookCard}`}>
              <div className={styles.cardHeader}>
                {editingId === rb.id ? (
                  <div style={{ display: 'flex', width: '100%', alignItems: 'center' }}>
                    <input 
                      type="text" 
                      value={editName} 
                      onChange={(e) => setEditName(e.target.value)}
                      className={styles.editInput}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSave(rb.id);
                        if (e.key === 'Escape') handleRenameCancel();
                      }}
                    />
                    <div className={styles.cardActions}>
                      <button className={`${styles.actionBtn} ${styles.success}`} onClick={() => handleRenameSave(rb.id)} title="Enregistrer">
                        <Check size={16} />
                      </button>
                      <button className={`${styles.actionBtn} ${styles.danger}`} onClick={handleRenameCancel} title="Annuler">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className={styles.cardHeaderTitle} onClick={() => router.push(`/editor/${rb.id}`)}>
                      <FileText size={20} className={styles.iconPrimary} /> {rb.name}
                    </h3>
                    <div className={styles.cardActions}>
                      <button className={styles.actionBtn} onClick={() => handleRenameStart(rb)} title="Renommer">
                        <Edit2 size={16} />
                      </button>
                      <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => handleDelete(rb.id)} title="Supprimer">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className={styles.cardBody}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Distance</span>
                  <span className={styles.statValue}>{rb.stats.distance.toFixed(1)} km</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Dénivelé Positif</span>
                  <span className={styles.statValue} style={{ color: '#27ae60' }}>+{rb.stats.elevation.pos.toFixed(0)} m</span>
                </div>
              </div>
              <div className={styles.cardFooter}>
                <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => router.push(`/editor/${rb.id}`)}>
                  <Activity size={16} /> Configurer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showOfficialModal && (
        <div className={styles.modalOverlay} onClick={() => setShowOfficialModal(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%', padding: '24px', borderRadius: '12px', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Courses Officielles</h2>
              <button onClick={() => setShowOfficialModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxHeight: '60vh', overflowY: 'auto' }}>
              {Array.from(new Set(officialRaces.map(r => r.event))).map(event => (
                <div key={event}>
                  <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-light)' }}>{event}</h3>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {officialRaces.filter(r => r.event === event).map(race => (
                      <div 
                        key={race.id}
                        onClick={() => handleLoadOfficialTrace(race)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: '8px', cursor: 'pointer', border: '1px solid transparent' }}
                        onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                        onMouseOut={(e) => e.currentTarget.style.borderColor = 'transparent'}
                      >
                        <div>
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{race.name}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{race.distance} km • {race.elevation} m D+</div>
                        </div>
                        <ChevronRight size={18} style={{ color: 'var(--color-primary)' }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
