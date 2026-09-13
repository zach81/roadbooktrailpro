"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { storage, db, auth } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { updateProfile } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Camera, User, Loader2, Save } from "lucide-react";
import styles from "./settings.module.css";

export default function SettingsPage() {
  const { currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  const [itraIndex, setItraIndex] = useState("");
  const [vma, setVma] = useState("");
  const [weight, setWeight] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!authLoading && !currentUser) {
      router.push("/login");
    } else if (currentUser) {
      fetchUserProfile();
    }
  }, [currentUser, authLoading, router]);

  const fetchUserProfile = async () => {
    try {
      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.itraIndex) setItraIndex(data.itraIndex);
        if (data.vma) setVma(data.vma);
        if (data.weight) setWeight(data.weight);
      }
    } catch (err) {
      console.error("Erreur chargement profil", err);
    }
  };

  const saveUserProfile = async () => {
    try {
      setSavingProfile(true);
      setError("");
      setSuccess("");
      await setDoc(doc(db, "users", currentUser.uid), {
        itraIndex: itraIndex ? parseFloat(itraIndex) : null,
        vma: vma ? parseFloat(vma) : null,
        weight: weight ? parseFloat(weight) : null,
      }, { merge: true });
      setSuccess("Profil coureur mis à jour !");
    } catch (err) {
      console.error("Erreur sauvegarde profil", err);
      setError("Erreur lors de la sauvegarde du profil coureur.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 2 * 1024 * 1024) {
        setError("L'image ne doit pas dépasser 2 Mo.");
        return;
      }
      setFile(selectedFile);
      handleUpload(selectedFile);
    }
  };

  const handleUpload = async (selectedFile) => {
    if (!selectedFile) return;

    try {
      setUploading(true);
      setError("");
      setSuccess("");

      const storageRef = ref(storage, `profiles/${currentUser.uid}/${selectedFile.name}`);
      const uploadTask = uploadBytesResumable(storageRef, selectedFile);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          // Progress can be tracked here if needed
        },
        (error) => {
          console.error("Upload error:", error);
          setError("Erreur lors de l'upload de l'image. Vérifiez la configuration Storage.");
          setUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          await updateProfile(auth.currentUser, {
            photoURL: downloadURL
          });
          setSuccess("Photo de profil mise à jour avec succès !");
          setUploading(false);
          // Forcer le re-rendu pour mettre à jour la Navbar (peut nécessiter un rafraichissement si l'état local n'écoute pas)
          router.refresh();
        }
      );
    } catch (err) {
      console.error("Erreur générale:", err);
      setError("Une erreur est survenue.");
      setUploading(false);
    }
  };

  if (authLoading) {
    return <div className="container" style={{paddingTop: '2rem'}}>Chargement...</div>;
  }

  if (!currentUser) return null;

  return (
    <div className={styles.settingsContainer}>
      <h1 className={styles.title}>Paramètres du Profil</h1>

      {error && <p className={styles.error}>{error}</p>}
      {success && <p className={styles.success}>{success}</p>}

      <div className={styles.cardsWrapper}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Compte</h2>
          <div className={styles.profileSection}>
            <div className={styles.avatarWrapper}>
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt="Profile" className={styles.avatar} />
              ) : (
                <div className={styles.avatarPlaceholder}>
                  <User size={48} />
                </div>
              )}
              
              <label className={styles.uploadOverlay} onClick={() => fileInputRef.current?.click()}>
                {uploading ? <Loader2 size={24} className="lucide-spin" /> : <Camera size={24} />}
              </label>
              <input 
                type="file" 
                accept="image/*" 
                ref={fileInputRef}
                onChange={handleFileChange}
                className={styles.fileInput}
                disabled={uploading}
              />
            </div>

            <div className={styles.infoSection}>
              <div className={styles.infoGroup}>
                <span className={styles.infoLabel}>Email</span>
                <span className={styles.infoValue}>{currentUser.email}</span>
              </div>
              
              <div className={styles.infoGroup}>
                <span className={styles.infoLabel}>ID Utilisateur</span>
                <span className={styles.infoValue} style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{currentUser.uid}</span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Profil Coureur</h2>
          <p className={styles.cardSubtitle}>Ces valeurs seront utilisées par défaut lors de la création de vos roadbooks.</p>
          
          <div className={styles.formGroup}>
            <label className={styles.inputLabel}>UTMB / ITRA Index</label>
            <input 
              type="number" 
              className="input-field" 
              placeholder="Ex: 500" 
              value={itraIndex} 
              onChange={e => setItraIndex(e.target.value)} 
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.inputLabel}>VMA (km/h)</label>
            <input 
              type="number" 
              step="0.1"
              className="input-field" 
              placeholder="Ex: 15" 
              value={vma} 
              onChange={e => setVma(e.target.value)} 
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.inputLabel}>Poids (kg)</label>
            <input 
              type="number" 
              step="1"
              className="input-field" 
              placeholder="Ex: 70" 
              value={weight} 
              onChange={e => setWeight(e.target.value)} 
            />
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: '100%', marginTop: '1rem' }} 
            onClick={saveUserProfile}
            disabled={savingProfile}
          >
            {savingProfile ? <Loader2 size={18} className="lucide-spin" /> : <Save size={18} />}
            Sauvegarder le profil
          </button>
        </div>
      </div>
    </div>
  );
}
