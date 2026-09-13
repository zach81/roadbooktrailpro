"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db, storage } from "@/lib/firebase";
import { collection, query, getDocs, addDoc, deleteDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { parseGPX, readFileAsText } from "@/lib/gpxService";
import { Shield, Upload, Trash2, Plus, Map } from "lucide-react";
import styles from "./admin.module.css";

export default function AdminPage() {
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", event: "", distance: 0, elevation: 0 });
  const [gpxFile, setGpxFile] = useState(null);

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
      // Lire temporairement le fichier pour en extraire la distance et le D+
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
      
      // 1. Upload GPX to Firebase Storage
      const storageRef = ref(storage, `official_traces/${Date.now()}_${gpxFile.name}`);
      await uploadBytes(storageRef, gpxFile);
      const downloadURL = await getDownloadURL(storageRef);

      // 2. Add document to Firestore
      const docRef = await addDoc(collection(db, "official_traces"), {
        name: formData.name,
        event: formData.event,
        distance: formData.distance,
        elevation: formData.elevation,
        gpxUrl: downloadURL,
        storagePath: storageRef.fullPath,
        createdAt: new Date(),
        createdBy: currentUser.uid
      });

      // 3. Update state and reset form
      setTraces([...traces, {
        id: docRef.id,
        name: formData.name,
        event: formData.event,
        distance: formData.distance,
        elevation: formData.elevation,
        gpxUrl: downloadURL,
        storagePath: storageRef.fullPath,
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
      // 1. Delete from Storage
      if (trace.storagePath) {
        const storageRef = ref(storage, trace.storagePath);
        await deleteObject(storageRef).catch(e => console.error("Fichier introuvable dans storage", e));
      }

      // 2. Delete from Firestore
      await deleteDoc(doc(db, "official_traces", trace.id));

      setTraces(traces.filter(t => t.id !== trace.id));
    } catch (err) {
      console.error("Erreur lors de la suppression :", err);
      alert("Erreur lors de la suppression.");
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
                  <p><strong>Distance :</strong> {formData.distance} km</p>
                  <p><strong>Dénivelé :</strong> +{formData.elevation} m</p>
                </div>
              )}

              <button type="submit" className="btn btn-primary" disabled={uploading}>
                {uploading ? "Ajout en cours..." : "Sauvegarder la trace"}
              </button>
            </form>
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
