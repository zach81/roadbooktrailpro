"use client";

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { LogOut, User, Map } from 'lucide-react';
import styles from './Navbar.module.css';

export default function Navbar() {
  const { currentUser, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Erreur de déconnexion", error);
    }
  };

  return (
    <nav className={styles.navbar}>
      <div className={`container ${styles.navContainer}`}>
        <Link href="/" className={styles.logo}>
          <Map className={styles.logoIcon} />
          <span>TrailRoadbookPro</span>
        </Link>
        
        <div className={styles.navLinks}>
          {currentUser ? (
            <>
              <Link href="/dashboard" className={styles.link}>Dashboard</Link>
              <div className={styles.userMenu}>
                <span className={styles.userEmail}>
                  <User size={16} />
                  {currentUser.email}
                </span>
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
