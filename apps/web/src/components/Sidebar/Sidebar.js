"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Compass, Apple, Mountain, GitCompare, Sparkles, HelpCircle, Settings } from 'lucide-react';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const { currentUser, isAdmin } = useAuth();
  const pathname = usePathname();

  if (!currentUser || !pathname || pathname === '/' || pathname === '/login') {
    return null;
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Préparation Course</div>
        <nav className={styles.navMenu}>
          <Link 
            href="/dashboard" 
            className={`${styles.navLink} ${pathname === '/dashboard' || pathname?.startsWith('/editor/') ? styles.active : ''}`}
          >
            <div className={styles.iconBox}>
              <Compass size={17} />
            </div>
            <span>Mes Roadbooks</span>
          </Link>
          <Link 
            href="/official-traces" 
            className={`${styles.navLink} ${pathname?.startsWith('/official-traces') ? styles.active : ''}`}
          >
            <div className={styles.iconBox}>
              <Mountain size={17} />
            </div>
            <span>Traces Officielles</span>
          </Link>
          <Link 
            href="/nutrition" 
            className={`${styles.navLink} ${pathname === '/nutrition' ? styles.active : ''}`}
          >
            <div className={styles.iconBox}>
              <Apple size={17} />
            </div>
            <span>Base Nutrition</span>
          </Link>
        </nav>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Performance & Lab</div>
        <nav className={styles.navMenu}>
          <a 
            href="/coach/comparator" 
            className={styles.navLink}
          >
            <div className={`${styles.iconBox} ${styles.iconBoxCoral}`}>
              <GitCompare size={17} />
            </div>
            <div className={styles.linkContent}>
              <span>Comparateur GPX</span>
              <span className={styles.linkBadge}>LAB</span>
            </div>
          </a>
          {isAdmin && (
            <a 
              href="/coach" 
              className={styles.navLink}
            >
              <div className={`${styles.iconBox} ${styles.iconBoxMint}`}>
                <Sparkles size={17} />
              </div>
              <div className={styles.linkContent}>
                <span>Coaching & Plans</span>
                <span className={styles.linkBadgeMint}>ADMIN</span>
              </div>
            </a>
          )}
        </nav>
      </div>

      <div className={`${styles.section} ${styles.bottomSection}`}>
        <div className={styles.sectionLabel}>Espace Personnel</div>
        <nav className={styles.navMenu}>
          <Link 
            href="/help" 
            className={`${styles.navLink} ${pathname === '/help' ? styles.active : ''}`}
          >
            <div className={styles.iconBox}>
              <HelpCircle size={17} />
            </div>
            <span>Guide & Aide</span>
          </Link>
          <Link 
            href="/settings" 
            className={`${styles.navLink} ${pathname === '/settings' ? styles.active : ''}`}
          >
            <div className={styles.iconBox}>
              <Settings size={17} />
            </div>
            <span>Paramètres</span>
          </Link>
        </nav>
      </div>
    </aside>
  );
}
