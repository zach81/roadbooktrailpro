"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Users, Sparkles, BookOpen, GitCompare, Settings, ArrowLeft, Compass, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import styles from "./Navigation.module.css";

function MyKairnMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.logoSvg}>
      <defs>
        <linearGradient id="navBgGrad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F172A"/>
          <stop offset="100%" stopColor="#1E293B"/>
        </linearGradient>
        <linearGradient id="navCoralGrad" x1="120" y1="80" x2="392" y2="432" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF7A59"/>
          <stop offset="100%" stopColor="#FF5A36"/>
        </linearGradient>
        <linearGradient id="navMintGrad" x1="90" y1="300" x2="420" y2="390" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14C38E"/>
          <stop offset="100%" stopColor="#34D399"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="124" fill="url(#navBgGrad)"/>
      <path d="M 76 384 L 184 196 L 268 310 L 348 164 L 436 384 Z" fill="rgba(255,255,255,0.06)"/>
      <rect x="216" y="100" width="80" height="46" rx="23" transform="rotate(-4 256 123)" fill="url(#navCoralGrad)"/>
      <rect x="180" y="160" width="152" height="56" rx="28" transform="rotate(2.5 256 188)" fill="url(#navCoralGrad)"/>
      <rect x="144" y="230" width="224" height="64" rx="32" transform="rotate(-2 256 262)" fill="#FFFFFF"/>
      <rect x="112" y="308" width="288" height="70" rx="35" fill="url(#navCoralGrad)"/>
      <path d="M 86 422 C 165 428, 225 364, 286 388 C 340 408, 388 372, 426 348" stroke="url(#navMintGrad)" strokeWidth="22" strokeLinecap="round"/>
      <circle cx="426" cy="348" r="18" fill="#14C38E" stroke="#0F172A" strokeWidth="6"/>
    </svg>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, isAdmin, loading, logout } = useAuth();

  // Enforce authentication across all pages, and restrict Coaching routes to Admins
  useEffect(() => {
    if (loading) return;
    if (!currentUser && pathname !== "/login") {
      router.replace("/login");
      return;
    }
    if (currentUser && !isAdmin && pathname !== "/comparator" && pathname !== "/login") {
      router.replace("/comparator");
    }
  }, [currentUser, isAdmin, loading, pathname, router]);

  const allNavItems = [
    { name: "Athlètes & Plans", href: "/", icon: Users, matchPrefix: ["/athletes"], adminOnly: true },
    { name: "Coach IA", href: "/coach-ia", icon: Sparkles, adminOnly: true },
    { name: "Bibliothèque", href: "/workouts", icon: BookOpen, adminOnly: true },
    { name: "Comparateur", href: "/comparator", icon: GitCompare, adminOnly: false },
    { name: "Paramètres", href: "/settings", icon: Settings, adminOnly: true },
  ];

  const navItems = allNavItems.filter((item) => !item.adminOnly || isAdmin);

  // Dynamically update document title based on active route in Coaching app
  useEffect(() => {
    if (pathname === "/") {
      document.title = "Coaching & Athlètes | mykairn";
    } else if (pathname.startsWith("/coach-ia")) {
      document.title = "Coach IA Trail & Ultra | mykairn";
    } else if (pathname.startsWith("/workouts")) {
      document.title = "Bibliothèque de Séances | mykairn";
    } else if (pathname.startsWith("/settings")) {
      document.title = "Paramètres Coaching | mykairn";
    } else if (pathname.startsWith("/athletes/") && pathname.endsWith("/coach")) {
      document.title = "Générateur de Plan IA | mykairn";
    } else if (pathname.startsWith("/athletes/")) {
      document.title = "Profil & Planification Athlète | mykairn";
    }
  }, [pathname]);

  if (pathname === "/login") {
    return null;
  }

  const isItemActive = (item: typeof navItems[0]) => {
    if (item.href === "/") {
      return pathname === "/" || (item.matchPrefix?.some(p => pathname.startsWith(p)) ?? false);
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  return (
    <header className={`${styles.navbar} glass`}>
      <div className={`container ${styles.navContainer}`}>
        {/* Brand Logo & Module Switcher */}
        <div className={styles.brandGroup}>
          <Link href={isAdmin ? "/" : "/comparator"} className={styles.logo}>
            <MyKairnMark />
            <div className={styles.logoWordmark}>
              <span className={styles.logoText}>mykairn</span>
              <span className={styles.coachBadge}>{isAdmin ? "COACH" : "LAB"}</span>
            </div>
          </Link>
        </div>

        {/* Center Segmented Pill Navigation */}
        <nav className={styles.tabsContainer} aria-label="Navigation Coaching">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.tabLink} ${active ? styles.activeTab : ""}`}
              >
                <Icon size={16} className={active ? styles.activeIcon : styles.inactiveIcon} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Actions: Switch to Roadbook + User Pill + Logout */}
        <div className={styles.navActions}>
          <a href="/dashboard" className={styles.roadbookSwitchBtn} title="Retourner à l'espace Roadbooks GPX">
            <ArrowLeft size={14} />
            <Compass size={15} className={styles.roadbookSwitchIcon} />
            <span>Espace Roadbook</span>
          </a>

          {currentUser && (
            <>
              <div className={styles.userPill} title={`Connecté en tant que ${currentUser.email || ""}`}>
                <div className={styles.userAvatar}>
                  {(currentUser.email?.[0] || "U").toUpperCase()}
                </div>
                <span className={styles.userEmail}>
                  {currentUser.email?.split("@")[0]}
                </span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  router.push("/login");
                }}
                className={styles.logoutBtn}
                title="Se déconnecter de ce compte"
              >
                <LogOut size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
