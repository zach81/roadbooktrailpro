"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { storage } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Camera, User, Loader2 } from "lucide-react";
import styles from "./settings.module.css";

export default function SettingsPage() {
  const { currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!authLoading && !currentUser) {
      router.push("/login");
    }
  }, [currentUser, authLoading, router]);

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
      <h1 className={styles.title}>Paramètres</h1>

      <div className={styles.card}>
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

          {error && <p className={styles.error}>{error}</p>}
          {success && <p className={styles.success}>{success}</p>}

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
    </div>
  );
}
