"use client";

import { useEffect, useState } from "react";
import { Download, X, Share, PlusSquare } from "lucide-react";
import styles from "./PwaManager.module.css";

export default function PwaManager() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // 1. Enregistrement du Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("[PWA] Service Worker enregistré avec succès:", registration.scope);
          })
          .catch((error) => {
            console.warn("[PWA] Échec d'enregistrement du Service Worker:", error);
          });
      });
    }

    // 2. Vérification si déjà en mode Standalone (PWA installée)
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;
      setIsStandalone(isStandaloneMode);
      return isStandaloneMode;
    };

    if (checkStandalone()) return;

    // 3. Détection iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !window.MSStream;
    setIsIos(isIosDevice);

    // Vérifier si l'utilisateur a masqué le bandeau récemment (7 jours)
    const dismissedAt = localStorage.getItem("pwa_install_dismissed");
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const isDismissed = dismissedAt && Date.now() - parseInt(dismissedAt, 10) < sevenDays;

    // 4. Écoute de l'événement beforeinstallprompt (Android / Chrome / Edge)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!isDismissed) {
        setShowPrompt(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Pour iOS, afficher le guide si pas encore installé et pas dismiss
    if (isIosDevice && !isDismissed && !checkStandalone()) {
      // Temporiser un peu pour ne pas agresser au 1er rendu
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3500);
      return () => clearTimeout(timer);
    }

    const handleAppInstalled = () => {
      console.log("[PWA] Application installée !");
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosGuide(true);
      return;
    }

    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] Choix d'installation: ${outcome}`);
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa_install_dismissed", Date.now().toString());
  };

  if (isStandalone || !showPrompt) return null;

  return (
    <>
      <div className={styles.installBanner} role="alert">
        <div className={styles.leftSection}>
          <div className={styles.appIcon}>
            <span style={{ fontSize: "20px" }}>🏔️</span>
          </div>
          <div className={styles.textGroup}>
            <span className={styles.title}>Installer l'application mykairn</span>
            <span className={styles.subtitle}>Accès rapide 1 clic & mode hors-ligne</span>
          </div>
        </div>

        <div className={styles.actionGroup}>
          <button className={styles.installBtn} onClick={handleInstallClick}>
            Installer
          </button>
          <button className={styles.dismissBtn} onClick={handleDismiss} title="Fermer">
            <X size={18} />
          </button>
        </div>
      </div>

      {showIosGuide && (
        <div className={styles.iosModalOverlay} onClick={() => setShowIosGuide(false)}>
          <div className={styles.iosModalContent} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: "700" }}>
                Installer mykairn sur iPhone
              </h3>
              <button className={styles.dismissBtn} onClick={() => setShowIosGuide(false)}>
                <X size={20} />
              </button>
            </div>

            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5 }}>
              Pour installer l'application sur votre écran d'accueil sans passer par l'App Store :
            </p>

            <div className={styles.iosStep}>
              <div className={styles.iosStepBadge}>1</div>
              <div>
                Appuyez sur le bouton <strong>Partager</strong> <Share size={16} style={{ display: "inline", verticalAlign: "middle", margin: "0 2px" }} /> dans la barre Safari.
              </div>
            </div>

            <div className={styles.iosStep}>
              <div className={styles.iosStepBadge}>2</div>
              <div>
                Faites défiler vers le bas et sélectionnez <strong>Sur l'écran d'accueil</strong> <PlusSquare size={16} style={{ display: "inline", verticalAlign: "middle", margin: "0 2px" }} />.
              </div>
            </div>

            <div className={styles.iosStep}>
              <div className={styles.iosStepBadge}>3</div>
              <div>
                Appuyez sur <strong>Ajouter</strong> en haut à droite. Profitez de vos roadbooks plein écran !
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: "100%", marginTop: "16px", padding: "12px" }}
              onClick={() => {
                setShowIosGuide(false);
                handleDismiss();
              }}
            >
              Compris !
            </button>
          </div>
        </div>
      )}
    </>
  );
}
