"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useNavbarActions } from '@/context/NavbarActionsContext';
import { LogOut, User, Settings as SettingsIcon, Shield, HelpCircle, Menu, X, Compass, Apple, Mountain, Activity, GitCompare, Sparkles } from 'lucide-react';
import styles from './Navbar.module.css';

function MyKairnMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.logoSvg}>
      <defs>
        <linearGradient id="webNavBgGrad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F172A"/>
          <stop offset="100%" stopColor="#1E293B"/>
        </linearGradient>
        <linearGradient id="webNavCoralGrad" x1="120" y1="80" x2="392" y2="432" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF7A59"/>
          <stop offset="100%" stopColor="#FF5A36"/>
        </linearGradient>
        <linearGradient id="webNavMintGrad" x1="90" y1="300" x2="420" y2="390" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14C38E"/>
          <stop offset="100%" stopColor="#34D399"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="124" fill="url(#webNavBgGrad)"/>
      <path d="M 76 384 L 184 196 L 268 310 L 348 164 L 436 384 Z" fill="rgba(255,255,255,0.06)"/>
      <rect x="216" y="100" width="80" height="46" rx="23" transform="rotate(-4 256 123)" fill="url(#webNavCoralGrad)"/>
      <rect x="180" y="160" width="152" height="56" rx="28" transform="rotate(2.5 256 188)" fill="url(#webNavCoralGrad)"/>
      <rect x="144" y="230" width="224" height="64" rx="32" transform="rotate(-2 256 262)" fill="#FFFFFF"/>
      <rect x="112" y="308" width="288" height="70" rx="35" fill="url(#webNavCoralGrad)"/>
      <path d="M 86 422 C 165 428, 225 364, 286 388 C 340 408, 388 372, 426 348" stroke="url(#webNavMintGrad)" strokeWidth="22" strokeLinecap="round"/>
      <circle cx="426" cy="348" r="18" fill="#14C38E" stroke="#0F172A" strokeWidth="6"/>
    </svg>
  );
}

export default function Navbar() {
  const { currentUser, isAdmin, logout } = useAuth();
  const { actions } = useNavbarActions();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Dynamically set browser tab title based on current web page
  useEffect(() => {
    if (!pathname) return;
    if (pathname === '/dashboard') {
      document.title = 'Mes Roadbooks | mykairn';
    } else if (pathname.startsWith('/official-traces')) {
      document.title = 'Traces Officielles | mykairn';
    } else if (pathname.startsWith('/nutrition')) {
      document.title = 'Base Nutrition Trail | mykairn';
    } else if (pathname.startsWith('/settings')) {
      document.title = 'Paramètres & Profil | mykairn';
    } else if (pathname.startsWith('/help')) {
      document.title = 'Guide & Aide | mykairn';
    } else if (pathname.startsWith('/admin')) {
      document.title = 'Administration | mykairn';
    } else if (pathname.startsWith('/editor/')) {
      document.title = 'Éditeur de Roadbook | mykairn';
    }
  }, [pathname]);

  if (!pathname || pathname === '/' || pathname === '/login') {
    return null;
  }

  return (
    <header className={`${styles.navbar} glass`}>
      <div className={`container ${styles.navContainer}`}>
        <div className={styles.leftSection}>
          <Link href="/dashboard" className={styles.logo}>
            <MyKairnMark />
            <div className={styles.logoWordmark}>
              <span className={styles.logoText}>mykairn</span>
              <span className={styles.proBadge}>PRO</span>
            </div>
          </Link>

          {/* Desktop Quick Module Switcher */}
          {currentUser && !actions && (
            <div className={styles.moduleSwitcher}>
              <a href="/coach/comparator" className={styles.modulePill} title="Ouvrir le Comparateur GPX/FIT & Virtual Partner">
                <GitCompare size={14} className={styles.modulePillIcon} />
                <span>Comparateur</span>
              </a>
              {isAdmin && (
                <a href="/coach" className={styles.modulePillAccent} title="Ouvrir l'espace Coaching, Plans & Coach IA (Réservé Admin)">
                  <Sparkles size={14} className={styles.modulePillAccentIcon} />
                  <span>Espace Coaching</span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Dynamic Page Actions (e.g. Roadbook Editor Toolbar) */}
        {actions && (
          <div className={styles.dynamicActions}>
            {actions}
          </div>
        )}

        <nav className={styles.navActions}>
          {currentUser ? (
            <>
              <div className={styles.userMenu}>
                {isAdmin && (
                  <Link href="/admin" className={styles.iconBtn} title="Administration">
                    <Shield size={17} color="#14C38E" />
                  </Link>
                )}
                <Link href="/help" className={styles.iconBtn} title="Guide d'utilisation">
                  <HelpCircle size={17} />
                </Link>
                <Link href="/settings" className={styles.iconBtn} title="Paramètres du Profil">
                  <SettingsIcon size={17} />
                </Link>

                <div className={styles.userPill} title={currentUser.email}>
                  <div className={styles.userAvatar}>
                    {(currentUser.email?.[0] || 'U').toUpperCase()}
                  </div>
                  <span className={styles.userEmail}>{currentUser.email?.split('@')[0]}</span>
                </div>

                <button onClick={logout} className={styles.logoutBtn} title="Se déconnecter">
                  <LogOut size={16} />
                </button>
              </div>
              <button 
                className={styles.hamburgerBtn} 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label="Menu"
              >
                {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </>
          ) : (
            <Link href="/login" className="btn btn-primary">
              Connexion
            </Link>
          )}
        </nav>
      </div>

      {/* Mobile Drawer Menu */}
      {isMobileMenuOpen && currentUser && (
        <div className={styles.mobileMenu}>
          <div className={styles.mobileNavLinks}>
            <Link 
              href="/dashboard" 
              className={`${styles.mobileNavLink} ${pathname === '/dashboard' ? styles.activeMobileLink : ''}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <Compass size={20} />
              <span>Mes Roadbooks</span>
            </Link>
            <Link 
              href="/official-traces" 
              className={`${styles.mobileNavLink} ${pathname?.startsWith('/official-traces') ? styles.activeMobileLink : ''}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <Mountain size={20} />
              <span>Traces Officielles</span>
            </Link>
            <Link 
              href="/nutrition" 
              className={`${styles.mobileNavLink} ${pathname === '/nutrition' ? styles.activeMobileLink : ''}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <Apple size={20} />
              <span>Base Nutrition</span>
            </Link>
            <a 
              href="/coach/comparator" 
              className={styles.mobileNavLink}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <GitCompare size={20} />
              <span>Comparateur GPX / FIT</span>
            </a>
            {isAdmin && (
              <a 
                href="/coach" 
                className={styles.mobileNavLink}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Activity size={20} />
                <span>Coaching & Plans IA</span>
              </a>
            )}
            <Link 
              href="/help" 
              className={`${styles.mobileNavLink} ${pathname === '/help' ? styles.activeMobileLink : ''}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <HelpCircle size={20} />
              <span>Guide & Aide</span>
            </Link>
            <Link 
              href="/settings" 
              className={`${styles.mobileNavLink} ${pathname === '/settings' ? styles.activeMobileLink : ''}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <SettingsIcon size={20} />
              <span>Paramètres</span>
            </Link>
            {isAdmin && (
              <Link 
                href="/admin" 
                className={`${styles.mobileNavLink} ${pathname === '/admin' ? styles.activeMobileLink : ''}`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Shield size={20} color="#14C38E" />
                <span>Administration</span>
              </Link>
            )}
          </div>
          
          <div className={styles.mobileUserFooter}>
            <div className={styles.mobileUserInfo}>
              <User size={16} />
              <span>{currentUser.email}</span>
            </div>
            <button 
              onClick={() => { setIsMobileMenuOpen(false); logout(); }} 
              className={styles.mobileLogoutBtn}
            >
              <LogOut size={18} />
              <span>Déconnexion</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
