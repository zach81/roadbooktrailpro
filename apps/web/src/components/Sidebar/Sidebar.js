"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { LayoutDashboard, Map, Compass, Settings, Apple, HelpCircle, Calendar } from 'lucide-react';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const { currentUser, isAdmin } = useAuth();
  const pathname = usePathname();

  if (!currentUser) return null;

  return (
    <aside className={styles.sidebar}>
      <Link href="/dashboard" className={`${styles.navItem} ${pathname === '/dashboard' ? styles.active : ''}`}>
        <LayoutDashboard size={20} className={styles.icon} />
        Dashboard
      </Link>
      
      {/* Lien vers le Plan Builder (Réservé aux admins) */}
      {isAdmin && (
        <a href="/coach" className={`${styles.navItem} ${pathname.startsWith('/coach') ? styles.active : ''}`}>
          <Calendar size={20} className={styles.icon} />
          Coaching & Plans
        </a>
      )}
      

      <Link href="/official-traces" className={`${styles.navItem} ${pathname === '/official-traces' ? styles.active : ''}`}>
        <Compass size={20} className={styles.icon} />
        Traces Officielles
      </Link>

      <Link href="/nutrition" className={`${styles.navItem} ${pathname === '/nutrition' ? styles.active : ''}`}>
        <Apple size={20} className={styles.icon} />
        Base Nutrition
      </Link>
      
      <div className={styles.divider}></div>
      
      <Link href="/help" className={`${styles.navItem} ${pathname === '/help' ? styles.active : ''}`}>
        <HelpCircle size={20} className={styles.icon} />
        Aide
      </Link>
      
      <Link href="/settings" className={`${styles.navItem} ${pathname === '/settings' ? styles.active : ''}`}>
        <Settings size={20} className={styles.icon} />
        Paramètres
      </Link>
    </aside>
  );
}
