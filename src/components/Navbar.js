"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useNavbarActions } from '@/context/NavbarActionsContext';
import { LogOut, User, Map, HelpCircle, Settings } from 'lucide-react';
import styles from './Navbar.module.css';

export default function Navbar() {
  const { currentUser, logout } = useAuth();
  const { actions } = useNavbarActions();

  const router = useRouter();

  const handleLogout = async () => {
    console.log("Tentative de déconnexion...");
    try {
      await logout();
      console.log("Déconnexion réussie sur Firebase. Redirection...");
      router.push("/");
    } catch (error) {
      console.error("Erreur de déconnexion:", error);
    }
  };

  return (
    <nav className={styles.navbar}>
      <div className={`container ${styles.navContainer}`}>
        <Link href="/" className={styles.logo}>
          <Map size={22} className={styles.logoIcon} />
          <span className={styles.logoText}>mykairn</span>
        </Link>

        {/* Slot d'actions injecté par les pages */}
        {actions && (
          <div className={styles.pageActions}>
            {actions}
          </div>
        )}
        
        <div className={styles.navLinks}>
          {currentUser ? (
            <>
              <div className={styles.userMenu}>
                <Link href="/help" className={styles.helpLink} title="Guide & Aide">
                  <HelpCircle size={18} />
                </Link>
                <Link href="/settings" className={styles.settingsLink} title="Paramètres">
                  {currentUser.photoURL ? (
                    <img src={currentUser.photoURL} alt="Profil" className={styles.profilePic} />
                  ) : (
                    <User size={16} />
                  )}
                  <span className={styles.userEmail}>{currentUser.email}</span>
                </Link>
                <button onClick={handleLogout} className={styles.logoutBtn} title="Déconnexion">
                  <LogOut size={18} />
                </button>
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-secondary">Connexion</Link>
              <Link href="/register" className="btn btn-primary">S'inscrire</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
