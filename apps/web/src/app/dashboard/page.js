"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { parseGPX, readFileAsText } from "@/lib/gpxService";
import { Upload, Plus, FileText, Activity, Trash2, Edit2, Check, X, Send, Info, Share2 } from "lucide-react";
import ShareModal from "@/components/ShareModal";

import styles from "./dashboard.module.css";

export default function Dashboard() {
  const { currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const [roadbooks, setRoadbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedRoadbookForShare, setSelectedRoadbookForShare] = useState(null);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasSeenGuide = localStorage.getItem('hasSeenGuide');
      if (!hasSeenGuide) {
        setShowGuide(true);
      }
    }
  }, []);

  const dismissGuide = () => {
    setShowGuide(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('hasSeenGuide', 'true');
    }
  };

  useEffect(() => {
    if (authLoading) return;
    
    if (!currentUser) {
      setLoading(false);
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
  }, [currentUser, authLoading, router]);

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

  const handleShareStart = (rb) => {
    setSelectedRoadbookForShare(rb);
    setShowShareModal(true);
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

  if (authLoading || loading) return <div className={styles.loader}>Chargement...</div>;

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.header}>
        <h1>Mes Roadbooks</h1>
        
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          
          <button className="btn btn-secondary" onClick={() => setShowGuide(true)}>
            <Info size={18} /> Marche à suivre
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

      {showGuide && (
        <div style={{ background: 'var(--bg-surface-elevated)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid var(--primary-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-color)', fontSize: '1.25rem' }}>
              <Info size={24} /> Comment ça marche ?
            </h2>
            <button onClick={dismissGuide} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <X size={24} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--text-primary)' }}>1. Importez votre trace</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Uploadez votre fichier GPX. Le profil altimétrique sera analysé et découpé automatiquement.</p>
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--text-primary)' }}>2. Réglez vos paramètres</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Renseignez votre Index UTMB et vos objectifs de nutrition pour une planification sur-mesure.</p>
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--text-primary)' }}>3. Analysez le Roadbook</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Consultez vos temps de passages, allures cibles et exportez le résultat pour le jour J.</p>
            </div>
          </div>
        </div>
      )}

      {roadbooks.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><Plus size={48} /></div>
          <h3>Aucun roadbook pour le moment</h3>
          <p>Importez votre première trace GPX pour commencer la planification de votre course.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {roadbooks.map((rb) => (
            <div 
              key={rb.id} 
              className={`card ${styles.roadbookCard}`} 
              onClick={() => router.push(`/editor/${rb.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <div className={styles.cardHeader} onClick={e => e.stopPropagation()}>
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
                    <h3 className={styles.cardHeaderTitle}>
                      <FileText size={20} className={styles.iconPrimary} /> {rb.name}
                    </h3>
                    <div className={styles.cardActions}>
                      <button className={styles.actionBtn} onClick={(e) => { e.stopPropagation(); handleShareStart(rb); }} title="Partager le roadbook">
                        <Share2 size={16} />
                      </button>
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
                  <span className={styles.statValue}>{rb.stats?.distance?.toFixed(1) || 0} km</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Dénivelé Positif</span>
                  <span className={styles.statValue} style={{ color: '#27ae60' }}>+{rb.stats?.elevation?.pos?.toFixed(0) || 0} m</span>
                </div>
                {rb.itraIndex && (
                  <div className={styles.stat} style={{ gridColumn: 'span 2', background: 'var(--bg-surface-elevated)', padding: '8px', borderRadius: '8px', marginTop: '4px' }}>
                    <span className={styles.statLabel} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Activity size={14}/> Index UTMB</span>
                    <span className={styles.statValue} style={{ fontSize: '0.9rem' }}>
                      <span style={{ color: '#10B981' }}>{rb.itraIndex}</span>
                    </span>
                  </div>
                )}
              </div>
              <div className={styles.cardFooter}>
                <button className="btn btn-secondary" style={{ width: '100%' }} onClick={(e) => { e.stopPropagation(); router.push(`/editor/${rb.id}`); }}>
                  <Activity size={16} /> Ouvrir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showShareModal && selectedRoadbookForShare && (
        <ShareModal
          roadbook={selectedRoadbookForShare}
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          onUpdateRoadbook={(updated) => {
            setRoadbooks(prev => prev.map(r => r.id === updated.id ? updated : r));
            setSelectedRoadbookForShare(updated);
          }}
        />
      )}
    </div>
  );
}
