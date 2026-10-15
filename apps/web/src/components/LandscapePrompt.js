"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Smartphone, X, RotateCw } from "lucide-react";
import styles from "./LandscapePrompt.module.css";

export default function LandscapePrompt() {
  const pathname = usePathname();
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Vérifie si la page courante bénéficie particulièrement du mode paysage
  const isTargetPage =
    pathname?.startsWith("/editor") ||
    pathname?.startsWith("/export");

  useEffect(() => {
    // Vérifier si déjà masqué pour cette session
    const isSessionDismissed = sessionStorage.getItem("landscape_prompt_dismissed") === "true";
    if (isSessionDismissed) {
      setDismissed(true);
    }

    const checkOrientation = () => {
      if (typeof window === "undefined") return;

      const isMobileWidth = window.innerWidth <= 850;
      const isPortrait = window.innerHeight > window.innerWidth;
      const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

      setIsPortraitMobile(isMobileWidth && isPortrait && isTouch);
    };

    checkOrientation();

    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, [pathname]);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("landscape_prompt_dismissed", "true");
  };

  // Ne rien afficher si l'écran est en paysage, si c'est desktop, si masqué, ou si ce n'est pas une page complexe
  if (!isTargetPage || !isPortraitMobile || dismissed) {
    return null;
  }

  return (
    <div className={styles.landscapePrompt} role="status" aria-live="polite">
      <div className={styles.iconWrapper}>
        <div className={styles.rotatePhoneIcon}>
          <Smartphone size={20} />
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.title}>
          <span>Mode Paysage recommandé</span>
          <span className={styles.badge}>Vue large</span>
        </div>
        <p className={styles.message}>
          Tournez votre smartphone à l'horizontale pour analyser le profil altimétrique et le tableau des segments avec un confort optimal.
        </p>
      </div>

      <button className={styles.closeBtn} onClick={handleDismiss} title="Masquer le conseil">
        <X size={18} />
      </button>
    </div>
  );
}
