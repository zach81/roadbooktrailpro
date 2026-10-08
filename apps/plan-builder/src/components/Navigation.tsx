"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Calendar, Users, Settings, Activity, Map, User, LogOut, ArrowLeft, Menu, X } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import styles from "./Navigation.module.css";

export default function Navigation() {
  const pathname = usePathname();
  const { currentUser, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();

  const tabs = [
    { name: "Athlètes", href: "/", icon: Users },
    { name: "Séances", href: "/workouts", icon: Activity },
    { name: "Paramètres", href: "/settings", icon: Settings },
  ];

  const handleLogout = async () => {
    try {
      await logout();
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
          <span className={styles.logoText}>plan-builder</span>
          <span className={styles.betaBadge}>BETA</span>
        </Link>

        <div className={styles.pageActions}>
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            const Icon = tab.icon;
            
            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={`${styles.tabLink} ${isActive ? styles.tabLinkActive : ""}`}
                onClick={() => setIsMenuOpen(false)}
              >
                <Icon size={18} />
                {tab.name}
              </Link>
            );
          })}
        </div>
        
        <button className={styles.hamburgerBtn} onClick={toggleMenu}>
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <div className={`${styles.navLinks} ${isMenuOpen ? styles.navLinksOpen : ''}`}>
          {/* Actions on Mobile inside menu */}
          <div className={styles.mobilePageActions}>
            {tabs.map((tab) => {
              const isActive = pathname === tab.href;
              const Icon = tab.icon;
              
              return (
                <Link
                  key={tab.name}
                  href={tab.href}
                  className={`${styles.tabLink} ${isActive ? styles.tabLinkActive : ""}`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Icon size={18} />
                  {tab.name}
                </Link>
              );
            })}
          </div>

          <div className={styles.userMenu}>
            <a 
              href="http://localhost:3000/dashboard"
              className={styles.settingsLink}
              title="Retour au Roadbook"
              onClick={() => setIsMenuOpen(false)}
            >
              <ArrowLeft size={16} className={styles.logoIcon} />
              <span className={styles.userEmail}>Roadbook</span>
            </a>

            {currentUser ? (
              <>
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
              </>
            ) : (
              <Link
                href="/login"
                className="btn btn-secondary"
                onClick={() => setIsMenuOpen(false)}
              >
                Connexion
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

