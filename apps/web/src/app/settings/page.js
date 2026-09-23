"use client";

import { useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '@/lib/firebase';
import { User, Upload, Loader2 } from 'lucide-react';
import styles from './settings.module.css';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const fileInputRef = useRef(null);
  const router = useRouter();

  if (!currentUser) {
    if (typeof window !== 'undefined') {
      router.push('/login');
    }
    return null;
  }

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Veuillez sélectionner une image.' });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);

      // Upload file to Firebase Storage
      const storageRef = ref(storage, `users/${currentUser.uid}/profile_${Date.now()}`);
      await uploadBytes(storageRef, file);
      
      // Get the download URL
      const photoURL = await getDownloadURL(storageRef);

      // Update the user's profile
      await updateProfile(auth.currentUser, { photoURL });

      // Force a reload to reflect changes in UI
      setMessage({ type: 'success', text: 'Photo de profil mise à jour !' });
      
      // Reload window to update Context if needed, or NextRouter refresh
      router.refresh();
      
    } catch (error) {
      console.error("Erreur lors de l'upload:", error);
      setMessage({ type: 'error', text: 'Erreur lors de la mise à jour de la photo.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.settingsContainer}>
      <h2>Paramètres du Profil</h2>
      
      <div className={`card ${styles.profileSection}`}>
        <h3>Photo de profil</h3>
        
        <div className={styles.avatarGroup}>
          {currentUser.photoURL ? (
            <img src={currentUser.photoURL} alt="Avatar" className={styles.avatarPreview} />
          ) : (
            <div className={styles.avatarPreview}>
              <User size={40} className={styles.avatarPlaceholder} />
            </div>
          )}
          
          <div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className={styles.fileInput} 
              accept="image/*"
            />
            <button 
              className={`btn btn-secondary ${styles.uploadBtn}`} 
              onClick={() => fileInputRef.current.click()}
              disabled={loading}
            >
              {loading ? <Loader2 size={18} className="lucide-spin" /> : <Upload size={18} />}
              {loading ? 'Téléchargement...' : 'Changer la photo'}
            </button>
          </div>
        </div>

        {message && (
          <div className={`${styles.message} ${styles[message.type]}`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
