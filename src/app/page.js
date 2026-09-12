"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowRight, Mountain, Route, Watch, CheckCircle2, Zap, Target } from "lucide-react";
import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  const { currentUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (currentUser) {
      router.push("/dashboard");
    }
  }, [currentUser, router]);

  if (currentUser) return null; // Prevent flash before redirect

  return (
    <div className={styles.homeWrapper}>
      {/* Background elements */}
      <div className={styles.bgGlow1}></div>
      <div className={styles.bgGlow2}></div>

      {/* Hero Section */}
      <section className={styles.heroSection}>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <Zap size={14} /> Nouvelle version Pro
          </div>
          <h1 className={styles.title}>
            Votre <span className={styles.highlight}>Roadbook</span> de Trail
            <br />généré en quelques clics.
          </h1>
          <p className={styles.subtitle}>
            Planifiez votre allure, gérez votre nutrition, et maîtrisez vos barrières horaires
            sur vos ultras avec une précision absolue.
          </p>
          
          <div className={styles.ctaGroup}>
            <Link href="/register" className={`btn btn-primary ${styles.mainCta}`}>
              Commencer gratuitement <ArrowRight size={18} />
            </Link>
            <Link href="/login" className="btn btn-secondary">
              Se connecter
            </Link>
          </div>
          
          <div className={styles.trusted}>
            <p>Utilisé par des centaines de finishers sur UTMB®, Diagonale des Fous, et plus.</p>
          </div>
        </div>

        <div className={styles.heroImageWrapper}>
          <div className={styles.mockupContainer}>
            <Image 
              src="/mockup.jpg" 
              alt="Interface de TrailRoadbookPro" 
              width={800} 
              height={600} 
              className={styles.mockupImage}
              priority
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className={styles.howItWorks}>
        <h2 className={styles.sectionTitle}>Comment ça marche ?</h2>
        <div className={styles.stepsGrid}>
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>1</div>
            <h3>Importez votre trace</h3>
            <p>Uploadez votre fichier GPX. Nous analysons instantanément le profil altimétrique, la distance et le dénivelé.</p>
          </div>
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>2</div>
            <h3>Configurez vos paramètres</h3>
            <p>Définissez votre Index UTMB, vos ravitaillements et vos objectifs de nutrition pour la course.</p>
          </div>
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>3</div>
            <h3>Générez le Roadbook</h3>
            <p>Obtenez vos temps de passage estimés, vos allures cibles et votre plan nutritionnel segment par segment.</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className={styles.featuresSection}>
        <h2 className={styles.sectionTitle}>Conçu pour la performance</h2>
        <div className={styles.featuresGrid}>
          <div className={`card ${styles.featureCard}`}>
            <div className={styles.iconWrapper}><Route size={28} /></div>
            <h3>Analyse GPX Intelligente</h3>
            <p>Calcul automatique et lissé du profil altimétrique. Découpage dynamique des segments selon vos points de contrôle.</p>
          </div>
          
          <div className={`card ${styles.featureCard}`}>
            <div className={styles.iconWrapper}><Watch size={28} /></div>
            <h3>Planification du Pacing</h3>
            <p>Ajustez votre vitesse effort. Notre algorithme prend en compte la fatigue kilométrique pour des prévisions réalistes.</p>
          </div>
          
          <div className={`card ${styles.featureCard}`}>
            <div className={styles.iconWrapper}><Mountain size={28} /></div>
            <h3>Stratégie Nutritionnelle</h3>
            <p>Calculez précisément vos besoins en glucides et hydratation par segment pour éviter le mur.</p>
          </div>
          
          <div className={`card ${styles.featureCard}`}>
            <div className={styles.iconWrapper}><Target size={28} /></div>
            <h3>Gestion des Barrières</h3>
            <p>Anticipez les barrières horaires (Cut-offs) de l'organisation et visualisez votre marge de sécurité à chaque ravito.</p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className={styles.finalCta}>
        <div className={styles.ctaCard}>
          <h2>Prêt à écraser votre prochain objectif ?</h2>
          <p>Créez votre premier roadbook en moins de 2 minutes. C'est gratuit.</p>
          <ul className={styles.ctaChecklist}>
            <li><CheckCircle2 size={18} /> Pas de carte de crédit requise</li>
            <li><CheckCircle2 size={18} /> Roadbooks illimités</li>
            <li><CheckCircle2 size={18} /> Export facile</li>
          </ul>
          <Link href="/register" className={`btn btn-primary ${styles.hugeCta}`}>
            Créer mon compte maintenant
          </Link>
        </div>
      </section>
    </div>
  );
}
