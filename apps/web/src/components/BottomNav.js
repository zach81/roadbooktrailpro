"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { LayoutDashboard, Compass, Apple, HelpCircle, Settings, MapPin } from "lucide-react";
import styles from "./BottomNav.module.css";

export default function BottomNav() {
  const { currentUser } = useAuth();
  const pathname = usePathname();

  // Afficher uniquement si l'utilisateur est connecté
  if (!currentUser) return null;

  // Cacher également sur les pages d'auth
  if (pathname === "/login" || pathname === "/register") return null;

  const isEditor = pathname.startsWith("/editor");

  const navItems = [
    {
      label: "Roadbooks",
      href: "/dashboard",
      icon: LayoutDashboard,
      isActive: pathname === "/dashboard" || pathname === "/",
    },
    {
      label: "Traces",
      href: "/official-traces",
      icon: Compass,
      isActive: pathname === "/official-traces",
    },
    ...(isEditor
      ? [
          {
            label: "Éditeur",
            href: pathname,
            icon: MapPin,
            isActive: true,
          },
        ]
      : []),
    {
      label: "Nutrition",
      href: "/nutrition",
      icon: Apple,
      isActive: pathname === "/nutrition",
    },
    {
      label: "Aide",
      href: "/help",
      icon: HelpCircle,
      isActive: pathname === "/help",
    },
    {
      label: "Profil",
      href: "/settings",
      icon: Settings,
      isActive: pathname === "/settings",
    },
  ];

  return (
    <nav className={styles.bottomNav} aria-label="Navigation principale mobile">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            className={`${styles.navItem} ${item.isActive ? styles.navItemActive : ""}`}
          >
            <div className={styles.iconWrap}>
              {item.isActive && <div className={styles.activePill} />}
              <Icon size={20} />
            </div>
            <span className={styles.label}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
