"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useNavbarActions } from '@/context/NavbarActionsContext';
import { LogOut, User, Map, HelpCircle, Settings, Shield, Menu, X } from 'lucide-react';
import styles from './Navbar.module.css';

export default function Navbar() {
  const { currentUser, isAdmin, logout } = useAuth();
  const { actions } = useNavbarActions();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const router = useRouter();

  const handleLogout = async () => {
    console.log("Tentative de déconnexion...");
    try {
      await logout();
      console.log("Déconnexion réussie sur Firebase. Redirection...");
      setIsMenuOpen(false);
      router.push("/");
    } catch (error) {
      console.error("Erreur de déconnexion:", error);
    }
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <nav className={styles.navbar}>
      <div className={`container ${styles.navContainer}`}>
        <Link href="/" className={styles.logo} onClick={() => setIsMenuOpen(false)}>
          <Map size={22} className={styles.logoIcon} />
          <span className={styles.logoText}>mykairn</span>
          <span className={styles.betaBadge}>BETA</span>
        </Link>

        {/* Slot d'actions injecté par les pages (Desktop) */}
        {actions && (
          <div className={styles.pageActions}>
            {actions}
          </div>
        )}
        
        {/* Hamburger Menu Toggle (Mobile) */}
        <button className={styles.hamburgerBtn} onClick={toggleMenu}>
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <div className={`${styles.navLinks} ${isMenuOpen ? styles.navLinksOpen : ''}`}>
          {currentUser ? (
            <>
              {/* Actions on Mobile inside menu */}
              {actions && (
                <div className={styles.mobilePageActions}>
                  {actions}
                </div>
              )}
              <div className={styles.userMenu}>
                {isAdmin && (
                  <Link href="/admin" className={styles.helpLink} title="Administration" onClick={() => setIsMenuOpen(false)}>
                    <Shield size={18} />
                  </Link>
                )}
                <Link href="/help" className={styles.helpLink} title="Guide & Aide" onClick={() => setIsMenuOpen(false)}>
                  <HelpCircle size={18} />
                </Link>
                <Link href="/settings" className={styles.settingsLink} title="Paramètres" onClick={() => setIsMenuOpen(false)}>
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
              <Link href="/login" className="btn btn-secondary" onClick={() => setIsMenuOpen(false)}>Connexion</Link>
              <Link href="/register" className="btn btn-primary" onClick={() => setIsMenuOpen(false)}>S'inscrire</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
