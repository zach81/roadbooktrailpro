"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Compass, Mountain, Apple, GitCompare, Sparkles } from 'lucide-react';
import styles from './BottomNav.module.css';

export default function BottomNav() {
  const { currentUser, isAdmin } = useAuth();
  const pathname = usePathname();

  if (!currentUser || !pathname || pathname === '/' || pathname === '/login') {
    return null;
  }

  const items = [
    { href: '/dashboard', label: 'Roadbooks', icon: Compass, external: false },
    { href: '/official-traces', label: 'Traces', icon: Mountain, external: false },
    { href: '/coach/comparator', label: 'Comparateur', icon: GitCompare, external: true },
    ...(isAdmin ? [{ href: '/coach', label: 'Coaching', icon: Sparkles, external: true }] : []),
    { href: '/nutrition', label: 'Nutrition', icon: Apple, external: false },
  ];

  return (
    <nav className={styles.bottomNav} aria-label="Navigation principale">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          !item.external &&
          (pathname === item.href ||
            (item.href !== '/dashboard' && pathname?.startsWith(item.href)) ||
            (item.href === '/dashboard' && pathname?.startsWith('/editor/')));

        if (item.external) {
          return (
            <a
              key={item.href}
              href={item.href}
              className={styles.navItem}
            >
              <div className={styles.iconWrap}>
                <Icon size={20} strokeWidth={1.8} />
              </div>
              <span className={styles.label}>{item.label}</span>
            </a>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
          >
            <div className={styles.iconWrap}>
              <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} />
              {isActive && <span className={styles.activePill} />}
            </div>
            <span className={styles.label}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
