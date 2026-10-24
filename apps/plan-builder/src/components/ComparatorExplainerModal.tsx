"use client";

import React, { useState } from 'react';
import { 
  X, BookOpen, Compass, Activity, Mountain, TrendingUp, 
  Clock, ShieldAlert, Award, CheckCircle2, ChevronRight, Zap,
  Layers, MapPin, Gauge
} from 'lucide-react';
import styles from './ComparatorExplainerModal.module.css';

interface ComparatorExplainerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ComparatorExplainerModal({ isOpen, onClose }: ComparatorExplainerModalProps) {
  const [activeTab, setActiveTab] = useState<'concept' | 'roadbook_fit' | 'charts' | 'strategy'>('roadbook_fit');

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitleWrap}>
            <div className={styles.headerIcon}>
              <BookOpen size={20} />
            </div>
            <div>
              <h2 className={styles.title}>Guide Méthodologique & Note Explicative</h2>
              <p className={styles.subtitle}>
                Comprendre le fonctionnement du Comparateur et l'analyse de votre fichier <strong>.FIT</strong> face au <strong>Pacing Idéal du Roadbook</strong>.
              </p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Fermer la note explicative">
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className={styles.tabsBar}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'roadbook_fit' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('roadbook_fit')}
          >
            <Zap size={15} />
            <span>Pacing Roadbook vs .FIT</span>
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'charts' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('charts')}
          >
            <TrendingUp size={15} />
            <span>Lecture des Graphiques</span>
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'concept' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('concept')}
          >
            <Compass size={15} />
            <span>Moteur & Algorithmes</span>
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'strategy' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('strategy')}
          >
            <Award size={15} />
            <span>Débriefing & Stratégie</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className={styles.body}>
          {/* TAB 1: Pacing Roadbook vs .FIT */}
          {activeTab === 'roadbook_fit' && (
            <div className={styles.tabContent}>
              <div className={styles.heroBox}>
                <h3 className={styles.heroTitle}>
                  Confronter la réalité de votre course (.FIT) à votre plan de marche théorique (Roadbook)
                </h3>
                <p className={styles.heroText}>
                  Le comparateur permet d'importer votre <strong>fichier .FIT d'activité réelle</strong> (enregistré par votre montre Garmin, Coros, Suunto, Polar ou Wahoo) et de le superposer point par point au <strong>Pacing Idéal calculé par Trail Roadbook Pro</strong>.
                </p>
              </div>

              <div className={styles.cardGrid}>
                <div className={styles.featureCard}>
                  <div className={styles.cardHeaderSmall}>
                    <Mountain className="text-rose-500" size={18} />
                    <span className="font-bold text-slate-800">1. Pacing Idéal Roadbook (Trace 1 - Norme)</span>
                  </div>
                  <p className={styles.cardDesc}>
                    Le pacing du roadbook n'est pas une simple moyenne de vitesse ! Il est calculé selon un modèle scientifique complet :
                  </p>
                  <ul className={styles.bulletList}>
                    <li><strong>Formule de Minetti :</strong> Ajuste le coût énergétique et la vitesse à chaque mètre selon la pente (montée raide, plat, descente douce ou technique).</li>
                    <li><strong>Index ITRA :</strong> Calibre la vitesse de base sur votre niveau physiologique réel.</li>
                    <li><strong>Modèle de fatigue exponentielle :</strong> Prévoit la dégradation d'allure naturelle au fil des heures.</li>
                    <li><strong>Temps d'arrêt aux ravitaillements :</strong> Intègre les pauses programmées (ex: 5 min au km 24) dans le chrono cumulé.</li>
                  </ul>
                </div>

                <div className={styles.featureCard}>
                  <div className={styles.cardHeaderSmall}>
                    <Activity className="text-sky-500" size={18} />
                    <span className="font-bold text-slate-800">2. Activité Réelle .FIT (Trace 2 - Comparée)</span>
                  </div>
                  <p className={styles.cardDesc}>
                    Votre fichier .FIT est décodé nativement sans perte de précision à partir des trames binaires de votre montre :
                  </p>
                  <ul className={styles.bulletList}>
                    <li><strong>Chrono & Horodatage réel :</strong> Heures de passage effectives avec détection des pauses.</li>
                    <li><strong>Trace GPS & Dénivelé :</strong> Altitude enregistrée par capteur barométrique.</li>
                    <li><strong>Fréquence Cardiaque (BPM) :</strong> Fréquence cardiaque réelle enregistrée pour mesurer l'intensité de l'effort.</li>
                    <li><strong>Temps réels aux ravitaillements :</strong> Détection automatique du temps d'arrêt effectif aux postes.</li>
                  </ul>
                </div>
              </div>

              <div className={styles.infoCallout}>
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                <div>
                  <strong>Pourquoi cette comparaison est-elle cruciale ?</strong>
                  <p className="mt-1 text-slate-600 text-xs">
                    Après une course, on se demande souvent : <em>« Où ai-je perdu ces 15 minutes ? Ai-je craqué en montée, perdu du temps dans les descentes techniques, ou suis-je resté trop longtemps assis aux ravitaillements ? »</em>. Le comparateur répond instantanément à ces questions chiffre à l'appui !
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Charts & Visualizations */}
          {activeTab === 'charts' && (
            <div className={styles.tabContent}>
              <div className={styles.explanationSection}>
                <h4 className={styles.sectionHeader}>
                  <TrendingUp size={16} className="text-orange-500" />
                  1. La Courbe d'Écart Chrono (Delta Alti-Chrono)
                </h4>
                <p className={styles.sectionParagraph}>
                  Ce graphique superpose les profils altimétriques et trace en trait plein la <strong>courbe d'écart chronométrique cumulé</strong>.
                </p>
                <div className={styles.badgeRow}>
                  <span className={`${styles.tagBadge} bg-emerald-50 text-emerald-700 border-emerald-200`}>
                    🟢 Zone Verte (Au-dessus de 0:00) : Avance sur le Roadbook
                  </span>
                  <span className={`${styles.tagBadge} bg-rose-50 text-rose-700 border-rose-200`}>
                    🔴 Zone Rouge (En-dessous de 0:00) : Retard sur le Roadbook
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Si la courbe monte, le coureur est plus rapide que le plan théorique sur ce tronçon. Si la courbe descend, il perd du temps par rapport à l'allure prévue. Un replat brutal vers le bas indique souvent un arrêt prolongé à un ravitaillement.
                </p>
              </div>

              <div className={styles.explanationSection}>
                <h4 className={styles.sectionHeader}>
                  <Gauge size={16} className="text-orange-500" />
                  2. Gains / Pertes Nets par Kilomètre (Splits Bar Chart)
                </h4>
                <p className={styles.sectionParagraph}>
                  Chaque barre représente un kilomètre individuel du parcours avec le gain ou la perte nette en secondes :
                </p>
                <ul className={styles.bulletList}>
                  <li><strong>Barre Verte (+XX s) :</strong> Kilomètre parcouru plus vite que la référence.</li>
                  <li><strong>Barre Rouge (-XX s) :</strong> Kilomètre parcouru plus lentement que la référence.</li>
                  <li><strong>Ligne pointillée grise :</strong> Pourcentage de pente du kilomètre. Permet de voir instantanément si le temps est perdu sur les fortes pentes positives (&gt; 15%) ou négatives.</li>
                </ul>
              </div>

              <div className={styles.explanationSection}>
                <h4 className={styles.sectionHeader}>
                  <MapPin size={16} className="text-orange-500" />
                  3. Duel Virtual Partner Ultra-HD (Carte Leaflet)
                </h4>
                <p className={styles.sectionParagraph}>
                  En lançant la lecture (Play) ou en glissant la barre temporelle, le comparateur anime les deux coureurs <strong>au même instant précis de course (seconde par seconde)</strong>.
                </p>
                <p className="text-xs text-slate-600">
                  Le marqueur <strong>Rose</strong> représente le Pacing Idéal et le marqueur <strong>Bleu Ciel</strong> votre position réelle. Une ligne de connexion affiche l'écart spatial exact en mètres en temps réel.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: Mathematical Engine */}
          {activeTab === 'concept' && (
            <div className={styles.tabContent}>
              <div className={styles.featureCard}>
                <h4 className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-2">
                  <Compass size={16} className="text-orange-500" />
                  Comment deux traces GPS différentes sont-elles alignées ?
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Deux enregistrements GPS (ou un fichier GPX et un fichier FIT de montre) ne possèdent jamais le même nombre de points, ni les mêmes coordonnées exactes en raison de la dérive des satellites GPS.
                </p>
                <div className={styles.stepGrid}>
                  <div className={styles.stepBox}>
                    <span className={styles.stepNum}>1</span>
                    <strong className="text-xs text-slate-800">Projection Géodésique</strong>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Calcul de la distance curviligne le long du parcours via la formule de <em>Haversine WGS-84</em> avec filtrage des anomalies GPS.
                    </p>
                  </div>
                  <div className={styles.stepBox}>
                    <span className={styles.stepNum}>2</span>
                    <strong className="text-xs text-slate-800">Échantillonnage Haute Résolution</strong>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Création d'une grille de référence régulière (120 à 220 points) synchronisant les distances et les altitudes des deux traces.
                    </p>
                  </div>
                  <div className={styles.stepBox}>
                    <span className={styles.stepNum}>3</span>
                    <strong className="text-xs text-slate-800">Interpolation Temporelle</strong>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Recherche binaire et interpolation linéaire des temps de passage écoulés (elapsed seconds), de la fréquence cardiaque et des allures.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-2 mt-4">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Layers size={14} className="text-orange-600" />
                  Formats supportés nativement :
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="px-2 py-1 rounded bg-white border border-slate-200 font-mono font-bold text-slate-700">.FIT (Garmin, Coros, Suunto, Wahoo, Polar, Apple Watch)</span>
                  <span className="px-2 py-1 rounded bg-white border border-slate-200 font-mono font-bold text-slate-700">.TCX (Garmin Training Center XML)</span>
                  <span className="px-2 py-1 rounded bg-white border border-slate-200 font-mono font-bold text-slate-700">.GPX 1.1 (Standard GPS Exchange)</span>
                  <span className="px-2 py-1 rounded bg-white border border-slate-200 font-mono font-bold text-orange-600">Intervals.icu (API directe avec flux d'altitude et FC)</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Tactical Debriefing */}
          {activeTab === 'strategy' && (
            <div className={styles.tabContent}>
              <div className={styles.heroBox} style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%)', borderColor: '#fde68a' }}>
                <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                  <Award size={18} className="text-amber-600" />
                  Les 3 pièges classiques révélés par le Comparateur
                </h3>
                <p className="text-xs text-amber-800 mt-1">
                  Voici comment interpréter les écarts observés pour adapter votre préparation et réussir votre prochain objectif :
                </p>
              </div>

              <div className="space-y-3 mt-3">
                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <strong className="text-xs text-slate-900 flex items-center gap-1.5">
                    <span className="text-rose-500 font-bold">1. Le piège du départ trop rapide (Sur-régime initial)</span>
                  </strong>
                  <p className="text-xs text-slate-600 mt-1">
                    <strong>Symptôme :</strong> La courbe Delta grimpe à +5 ou +10 minutes d'avance sur les 10 premiers kilomètres, puis s'effondre en flèche continue à partir de la mi-course.<br />
                    <strong>Leçon :</strong> Respecter strictement le pacing cible même si les sensations semblent faciles avec l'euphorie du départ.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <strong className="text-xs text-slate-900 flex items-center gap-1.5">
                    <span className="text-orange-500 font-bold">2. Le temps fantôme aux ravitaillements</span>
                  </strong>
                  <p className="text-xs text-slate-600 mt-1">
                    <strong>Symptôme :</strong> Des chutes verticales de la courbe d'écart au niveau des postes de ravitaillement (ex: 12 minutes d'arrêt réel vs 3 minutes prévues).<br />
                    <strong>Leçon :</strong> Préparer son ravito à l'avance (remplissage flasques, tri des emballages) pour limiter le temps statique.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <strong className="text-xs text-slate-900 flex items-center gap-1.5">
                    <span className="text-emerald-600 font-bold">3. La gestion des descentes</span>
                  </strong>
                  <p className="text-xs text-slate-600 mt-1">
                    <strong>Symptôme :</strong> Les splits kilométriques sur pente négative (&lt; -10%) deviennent fortement rouges en fin de course.<br />
                    <strong>Leçon :</strong> Travail excentrique et renforcement des quadriceps à inclure dans les macrocycles de préparation.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className="text-xs text-slate-500">
            Trail Roadbook Pro — Moteur d'analyse Virtual Partner Ultra-HD
          </span>
          <button className={styles.confirmBtn} onClick={onClose}>
            J'ai compris
          </button>
        </div>
      </div>
    </div>
  );
}
