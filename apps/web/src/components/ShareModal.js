"use client";

import { useState, useEffect } from "react";
import { 
  X, 
  Share2, 
  Copy, 
  Check, 
  ExternalLink, 
  QrCode, 
  Send, 
  MessageCircle, 
  Globe, 
  Lock, 
  Users, 
  Smartphone, 
  Download,
  Loader2 
} from "lucide-react";
import QRCode from "qrcode";
import { db } from "@/lib/firebase";
import { doc, updateDoc, collection, query, where, getDocs, addDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import styles from "./ShareModal.module.css";

export default function ShareModal({ roadbook, isOpen, onClose, onUpdateRoadbook }) {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState("public"); // "public" | "coaching"
  const [isPublic, setIsPublic] = useState(roadbook?.isPublic ?? true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [shareUrl, setShareUrl] = useState("");

  // État transfert de compte (coaching)
  const [coachEmail, setCoachEmail] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);
  const [transferError, setTransferError] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && roadbook?.id) {
      const url = `${window.location.origin}/share/${roadbook.id}`;
      setShareUrl(url);

      QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: {
          dark: "#0f172a",
          light: "#ffffff"
        }
      })
        .then((dataUrl) => setQrCodeUrl(dataUrl))
        .catch((err) => console.error("Erreur génération QR code:", err));
    }
  }, [roadbook?.id]);

  useEffect(() => {
    if (roadbook) {
      setIsPublic(roadbook.isPublic ?? true);
    }
  }, [roadbook]);

  if (!isOpen || !roadbook) return null;

  const handleTogglePublic = async (e) => {
    const newStatus = e.target.checked;
    setIsPublic(newStatus);
    setUpdatingStatus(true);
    try {
      const docRef = doc(db, "roadbooks", roadbook.id);
      await updateDoc(docRef, { isPublic: newStatus });
      if (onUpdateRoadbook) {
        onUpdateRoadbook({ ...roadbook, isPublic: newStatus });
      }
    } catch (err) {
      console.error("Erreur mise à jour statut public:", err);
      // Revert if error
      setIsPublic(!newStatus);
      alert("Impossible de mettre à jour le statut public.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Roadbook Trail : ${roadbook.name}`,
          text: `Suivez mon plan de course et mes temps de passage pour ${roadbook.name} !`,
          url: shareUrl
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Erreur de partage:", err);
        }
      }
    } else {
      handleCopyLink();
    }
  };

  const handleDownloadQr = () => {
    if (!qrCodeUrl) return;
    const a = document.createElement("a");
    a.href = qrCodeUrl;
    a.download = `qrcode_${roadbook.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}.png`;
    a.click();
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    if (!coachEmail.trim() || !currentUser) return;
    setTransferring(true);
    setTransferError("");
    setTransferSuccess(false);

    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", coachEmail.trim().toLowerCase()));
      const snap = await getDocs(q);

      if (snap.empty) {
        setTransferError("Aucun utilisateur trouvé avec cette adresse e-mail.");
        return;
      }

      const targetUserId = snap.docs[0].id;
      if (targetUserId === currentUser.uid) {
        setTransferError("Vous ne pouvez pas vous transférer un roadbook à vous-même.");
        return;
      }

      const { id, ...dataToCopy } = roadbook;
      dataToCopy.userId = targetUserId;
      dataToCopy.createdAt = new Date();
      dataToCopy.name = `${dataToCopy.name} (Partagé par ${currentUser.email})`;

      await addDoc(collection(db, "roadbooks"), dataToCopy);
      setTransferSuccess(true);
      setCoachEmail("");
      setTimeout(() => setTransferSuccess(false), 4000);
    } catch (err) {
      console.error("Erreur lors du transfert :", err);
      setTransferError("Une erreur est survenue lors de l'envoi de la copie.");
    } finally {
      setTransferring(false);
    }
  };

  const whatsappMessage = encodeURIComponent(
    `🏃 Mon plan de course et temps de passage pour *${roadbook.name}* sont disponibles ici :\n${shareUrl}`
  );

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>
            <Share2 size={22} color="var(--primary-color)" /> Partager le Roadbook
          </h2>
          <button className={styles.closeBtn} onClick={onClose} title="Fermer">
            <X size={20} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === "public" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("public")}
            >
              <Globe size={16} /> Lien d'Assistance & Public
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === "coaching" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("coaching")}
            >
              <Users size={16} /> Transférer à un athlète / coach
            </button>
          </div>

          {activeTab === "public" && (
            <>
              {/* Carte de contrôle du statut public */}
              <div className={styles.statusCard}>
                <div className={styles.statusInfo}>
                  <div className={styles.statusTitle}>
                    {isPublic ? (
                      <>
                        <Globe size={18} color="#10B981" />
                        <span style={{ color: "#10B981" }}>Lien public activé</span>
                      </>
                    ) : (
                      <>
                        <Lock size={18} color="#64748b" />
                        <span style={{ color: "#64748b" }}>Accès restreint (Privé)</span>
                      </>
                    )}
                    {updatingStatus && <Loader2 size={16} className="lucide-spin" />}
                  </div>
                  <p className={styles.statusDesc}>
                    {isPublic
                      ? "Votre assistance, vos proches et votre coach peuvent consulter vos horaires, ravitaillements et consignes sans avoir à créer de compte."
                      : "Seul votre compte peut accéder au roadbook. Activez le lien pour le partager avec votre équipe."}
                  </p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={handleTogglePublic}
                    disabled={updatingStatus}
                  />
                  <span className={styles.slider} />
                </label>
              </div>

              {isPublic && (
                <>
                  {/* Champ de copie du lien */}
                  <div className={styles.linkGroup}>
                    <label className={styles.label}>Lien direct vers la vue assistance :</label>
                    <div className={styles.copyInputGroup}>
                      <input
                        type="text"
                        readOnly
                        value={shareUrl}
                        className={styles.linkInput}
                        onClick={(e) => e.target.select()}
                      />
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className={`${styles.copyBtn} ${copied ? styles.copyBtnSuccess : ""}`}
                      >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? "Copié !" : "Copier"}
                      </button>
                    </div>
                  </div>

                  {/* Actions rapides de partage */}
                  <div className={styles.actionGrid}>
                    <a
                      href={`https://api.whatsapp.com/send?text=${whatsappMessage}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${styles.actionCardBtn} ${styles.whatsappBtn}`}
                    >
                      <MessageCircle size={20} />
                      <span>WhatsApp</span>
                    </a>

                    <button
                      type="button"
                      onClick={handleNativeShare}
                      className={styles.actionCardBtn}
                    >
                      <Smartphone size={20} color="var(--primary-color)" />
                      <span>Partager Mobile</span>
                    </button>

                    <a
                      href={shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.actionCardBtn}
                    >
                      <ExternalLink size={20} color="#0284c7" />
                      <span>Ouvrir la vue</span>
                    </a>
                  </div>

                  {/* QR Code pour flash direct */}
                  <div className={styles.qrContainer}>
                    {qrCodeUrl ? (
                      <img
                        src={qrCodeUrl}
                        alt="QR Code Roadbook"
                        className={styles.qrImage}
                      />
                    ) : (
                      <div className={styles.qrImage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Loader2 className="lucide-spin" size={24} />
                      </div>
                    )}
                    <p className={styles.qrNote}>
                      <strong>Flash direct sur smartphone :</strong> Idéal au retrait des dossards ou avant le départ pour que votre assistance enregistre la page en favori instantanément.
                    </p>
                    <button
                      type="button"
                      onClick={handleDownloadQr}
                      className="btn btn-secondary"
                      style={{ fontSize: "0.8rem", padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                    >
                      <Download size={14} /> Télécharger le QR Code (.png)
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === "coaching" && (
            <form onSubmit={handleTransferSubmit} className={styles.coachingForm}>
              <p className={styles.coachingDesc}>
                Envoyez une copie complète et modifiable de ce roadbook dans le tableau de bord d'un autre utilisateur de Trail Roadbook Pro (athlète suivi, coach, coéquipier de relais).
              </p>

              <div>
                <label className={styles.label} style={{ marginBottom: "6px", display: "block" }}>
                  Adresse e-mail du compte destinataire :
                </label>
                <input
                  type="email"
                  required
                  placeholder="exemple@athlete.com"
                  value={coachEmail}
                  onChange={(e) => setCoachEmail(e.target.value)}
                  className={styles.input}
                />
              </div>

              {transferError && (
                <div style={{ color: "#ef4444", fontSize: "0.85rem", background: "#fef2f2", padding: "8px 12px", borderRadius: "6px" }}>
                  ⚠️ {transferError}
                </div>
              )}

              {transferSuccess && (
                <div style={{ color: "#15803d", fontSize: "0.85rem", background: "#f0fdf4", padding: "8px 12px", borderRadius: "6px" }}>
                  ✅ Copie envoyée avec succès dans le compte de l'athlète !
                </div>
              )}

              <button
                type="submit"
                disabled={transferring}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              >
                {transferring ? <Loader2 size={16} className="lucide-spin" /> : <Send size={16} />}
                {transferring ? "Envoi de la copie..." : "Transférer le Roadbook"}
              </button>
            </form>
          )}
        </div>

        <div className={styles.footer}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
