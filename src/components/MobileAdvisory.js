"use client";

import { useState, useEffect } from "react";
import { Monitor, X } from "lucide-react";
import styles from "./MobileAdvisory.module.css";

export default function MobileAdvisory() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if the user has already dismissed the advisory
    const hasDismissed = localStorage.getItem("mobileAdvisoryDismissed");
    
    // Check if device is mobile (very basic check based on screen width)
    const checkMobile = () => {
      if (window.innerWidth <= 1024 && !hasDismissed) {
        setShow(true);
      } else {
        setShow(false);
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem("mobileAdvisoryDismissed", "true");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <button className={styles.closeButton} onClick={handleDismiss} aria-label="Fermer">
          <X size={24} />
        </button>
        <Monitor size={48} className={styles.icon} />
        <h2 className={styles.title}>Conseil d'utilisation</h2>
        <p className={styles.text}>
          L'application mykairn est un outil de création complexe conçu spécifiquement pour un usage sur <strong>PC ou Mac</strong>. 
          <br /><br />
          L'utilisation sur smartphone est autorisée mais l'interface risque de ne pas être optimale. Pour une meilleure expérience, veuillez utiliser un ordinateur.
        </p>
        <button className="btn btn-primary" onClick={handleDismiss} style={{ width: '100%', marginTop: '1rem' }}>
          J'ai compris, continuer
        </button>
      </div>
    </div>
  );
}
