"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc, getDoc } from "firebase/firestore";
import { parseGPX, readFileAsText } from "@/lib/gpxService";
import { fetchStravaActivities, convertStravaActivityToRoadbook } from "@/lib/stravaClient";
import { Upload, Plus, FileText, Activity, Trash2, Edit2, Check, X, Send, Info, Share2, Trophy, Mountain, Loader2, Compass, Search } from "lucide-react";
import ShareModal from "@/components/ShareModal";
import Link from "next/link";

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

  // Import depuis Strava
  const [showStravaImportModal, setShowStravaImportModal] = useState(false);
  const [stravaActivities, setStravaActivities] = useState([]);
  const [loadingStravaActs, setLoadingStravaActs] = useState(false);
  const [importingStravaId, setImportingStravaId] = useState(null);
  const [stravaImportError, setStravaImportError] = useState(null);
  const [stravaSearch, setStravaSearch] = useState("");
  const [stravaFilterRaces, setStravaFilterRaces] = useState(false);
  const [stravaTokenCache, setStravaTokenCache] = useState("");

  const handleOpenStravaImport = async () => {
    setShowStravaImportModal(true);
    setLoadingStravaActs(true);
    setStravaImportError(null);

    try {
      const uid = currentUser.uid;
      let accessToken = typeof window !== 'undefined' ? (localStorage.getItem(`mykairn_strava_token_${uid}`) || '') : '';
      let refreshToken = typeof window !== 'undefined' ? (localStorage.getItem(`mykairn_strava_refresh_${uid}`) || '') : '';
      let clientId = typeof window !== 'undefined' ? (localStorage.getItem(`mykairn_strava_client_id_${uid}`) || '') : '';
      let clientSecret = typeof window !== 'undefined' ? (localStorage.getItem(`mykairn_strava_client_secret_${uid}`) || '') : '';
      let expiresAt = null;

      const userSnap = await getDoc(doc(db, "users", uid));
      if (userSnap.exists()) {
        const u = userSnap.data();
        if (u.stravaAccessToken) accessToken = String(u.stravaAccessToken).trim();
        if (u.stravaRefreshToken) refreshToken = String(u.stravaRefreshToken).trim();
        if (u.stravaExpiresAt) expiresAt = Number(u.stravaExpiresAt);
        if (u.stravaClientId) clientId = String(u.stravaClientId).trim();
        if (u.stravaClientSecret) clientSecret = String(u.stravaClientSecret).trim();
      }

      if (!accessToken && !refreshToken) {
        setStravaImportError("Aucun compte Strava connecté. Rendez-vous dans vos Paramètres pour connecter Strava en 1 clic.");
        setLoadingStravaActs(false);
        return;
      }

      const { activities, verified } = await fetchStravaActivities({
        accessToken,
        refreshToken,
        expiresAt,
        clientId,
        clientSecret,
        days: 365,
        perPage: 100,
      });

      setStravaTokenCache(verified.accessToken);
      setStravaActivities(activities.filter((a) => a.has_gps && a.distKm >= 2));
    } catch (err) {
      setStravaImportError(err.message || "Erreur lors de la récupération de vos activités Strava.");
    } finally {
      setLoadingStravaActs(false);
    }
  };

  const handleCreateRoadbookFromStrava = async (act) => {
    setImportingStravaId(act.id);
    setStravaImportError(null);
    try {
      const rbData = await convertStravaActivityToRoadbook(act, stravaTokenCache);
      const docRef = await addDoc(collection(db, "roadbooks"), {
        userId: currentUser.uid,
        name: rbData.name,
        stats: rbData.stats,
        points: JSON.stringify(rbData.points),
        waypoints: JSON.stringify(rbData.waypoints),
        segments: [],
        sourceType: "STRAVA",
        stravaActivityId: String(act.id),
        createdAt: new Date(),
      });
      setShowStravaImportModal(false);
      router.push(`/editor/${docRef.id}`);
    } catch (err) {
      setStravaImportError(err.message || "Impossible de convertir cette sortie Strava en Roadbook.");
    } finally {
      setImportingStravaId(null);
    }
  };

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

          <button
            type="button"
            onClick={handleOpenStravaImport}
            style={{
              background: '#FC4C02',
              color: '#fff',
              border: 'none',
              padding: '10px 16px',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(252, 76, 2, 0.25)',
            }}
          >
            <Compass size={18} />
            Importer depuis Strava
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

      {showStravaImportModal && (
        <div
          onClick={() => setShowStravaImportModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '720px',
              maxHeight: '85vh',
              background: 'var(--bg-surface)',
              borderRadius: '20px',
              border: '1px solid var(--border-light)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{
              padding: '18px 22px',
              background: '#0f172a',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#FC4C02',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                }}>
                  S
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                    Créer un Roadbook depuis une sortie Strava
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                    Transformez une course, une reconnaissance ou un entraînement Strava en Roadbook complet sans fichier GPX
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStravaImportModal(false)}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{
              padding: '12px 20px',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-surface-elevated)',
            }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Rechercher une sortie ou course Strava..."
                  value={stravaSearch}
                  onChange={(e) => setStravaSearch(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', paddingLeft: '32px', fontSize: '0.84rem' }}
                />
              </div>

              <button
                type="button"
                onClick={() => setStravaFilterRaces(!stravaFilterRaces)}
                className="btn btn-secondary"
                style={{
                  fontSize: '0.8rem',
                  padding: '7px 12px',
                  borderColor: stravaFilterRaces ? '#FC4C02' : undefined,
                  color: stravaFilterRaces ? '#FC4C02' : undefined,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Trophy size={14} />
                {stravaFilterRaces ? 'Toutes mes sorties' : 'Uniquement mes Courses / Trails'}
              </button>
            </div>

            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {stravaImportError && (
                <div style={{
                  padding: '14px',
                  borderRadius: '12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#EF4444',
                  fontSize: '0.84rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}>
                  <span>⚠️ {stravaImportError}</span>
                  <Link
                    href="/settings"
                    className="btn btn-primary"
                    style={{ fontSize: '0.78rem', padding: '6px 12px', background: '#FC4C02', borderColor: '#FC4C02' }}
                  >
                    Connecter Strava dans Paramètres &rarr;
                  </Link>
                </div>
              )}

              {loadingStravaActs ? (
                <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <Loader2 size={28} className="lucide-spin" style={{ color: '#FC4C02' }} />
                  <span>Récupération de vos sorties GPS Strava...</span>
                </div>
              ) : (
                (() => {
                  const filtered = stravaActivities.filter((a) => {
                    if (stravaFilterRaces && !a.isRace) return false;
                    if (stravaSearch.trim()) {
                      const q = stravaSearch.toLowerCase();
                      if (!(a.name || '').toLowerCase().includes(q) && !(a.type || '').toLowerCase().includes(q)) return false;
                    }
                    return true;
                  });

                  if (filtered.length === 0 && !stravaImportError) {
                    return (
                      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        Aucune activité Strava avec trace GPS ne correspond à votre recherche.
                      </div>
                    );
                  }

                  return filtered.map((act) => {
                    const isImportingThis = importingStravaId === act.id;
                    const dateStr = act.start_date_local ? new Date(act.start_date_local).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                    return (
                      <div
                        key={act.id}
                        style={{
                          padding: '12px 16px',
                          borderRadius: '14px',
                          background: 'var(--bg-surface-elevated)',
                          border: '1px solid var(--border-light)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              background: 'rgba(252, 76, 2, 0.14)',
                              color: '#FC4C02',
                            }}>
                              {act.type}
                            </span>
                            <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{dateStr}</span>
                            {act.isRace && (
                              <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '999px',
                                background: 'rgba(245, 158, 11, 0.16)',
                                color: '#F59E0B',
                              }}>
                                🏆 Course / Trail {act.empiricalItra ? `• ITRA ~${act.empiricalItra}` : ''}
                              </span>
                            )}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: '0.94rem', color: 'var(--text-primary)' }}>
                            {act.name}
                          </div>
                          <div style={{ display: 'flex', gap: '14px', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            <span><strong>{act.distKm}</strong> km</span>
                            <span style={{ color: '#10B981' }}><strong>+{act.eleM}</strong> m D+</span>
                            <span>{Math.floor((act.moving_time || 0) / 3600)}h{String(Math.floor(((act.moving_time || 0) % 3600) / 60)).padStart(2, '0')}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={Boolean(importingStravaId)}
                          onClick={() => handleCreateRoadbookFromStrava(act)}
                          style={{
                            background: '#FC4C02',
                            color: '#fff',
                            border: 'none',
                            padding: '8px 14px',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          {isImportingThis ? <Loader2 size={15} className="lucide-spin" /> : <Plus size={15} />}
                          {isImportingThis ? 'Création...' : 'Créer un Roadbook'}
                        </button>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
