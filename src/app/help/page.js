"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, Mountain, Zap, Droplets, Map, HelpCircle, ChevronDown, ChevronRight, BookOpen, Activity, Wind, Moon } from "lucide-react";
import styles from "./help.module.css";

const sections = [
  {
    id: "start",
    icon: <BookOpen size={20} />,
    title: "Guide de Démarrage",
    color: "#10B981",
    content: [
      {
        subtitle: "Comment créer votre premier roadbook ?",
        text: `TrailRoadbookPro transforme votre fichier GPX en un plan de marche complet et scientifique. Voici le workflow recommandé :`,
        steps: [
          "Importez votre fichier GPX depuis le tableau de bord.",
          "Renseignez votre profil coureur : Index ITRA ou VMA. Ces données calculent automatiquement vos objectifs de temps.",
          "Entrez les données officielles de la course (distance et D+ annoncés). Le moteur calibre alors le fichier GPS sur les valeurs réelles.",
          "Définissez votre heure de départ et la météo prévue.",
          "Ajoutez vos points de passage depuis le graphique altimétrique (clic sur la trace) ou la carte.",
          "Planifiez vos ravitaillements et configurez vos pauses.",
          "Générez le tableau de marche final et imprimez-le !"
        ]
      },
      {
        subtitle: "Conseils avant une course",
        text: "Vérifiez toujours les points suivants avant de partir :",
        steps: [
          "La D+ officielle est renseignée pour calibrer correctement le dénivelé GPS.",
          "L'heure de départ est configurée pour que les effets de nuit soient bien calculés.",
          "Vos besoins nutritionnels sont adaptés à la météo prévue.",
          "Sauvegardez votre roadbook pour y accéder depuis le tableau de marche."
        ]
      }
    ]
  },
  {
    id: "time",
    icon: <Clock size={20} />,
    title: "Calcul du Temps — Modèle Scientifique",
    color: "#6366F1",
    content: [
      {
        subtitle: "Le km-effort (ke) — Unité de base",
        text: `Le km-effort est l'unité universelle du trail running. Elle transforme dénivelé et distance en une distance "équivalente" sur terrain plat pour exprimer le coût énergétique réel de la course.`,
        formula: `km-effort = Distance (km) + D+ / 100 + D- / 150 (descente douce)
                           + D- / 80  (descente raide)`,
        formulaNote: "Standard ITRA/UTMB. La descente raide (> seuil configuré) pénalise plus à cause des contractions musculaires excentriques.",
        example: "UTMB : 173 km + 10 000m D+ / 100 + 10 000m D- / 100 ≈ 373 ke"
      },
      {
        subtitle: "Modèle de coût énergétique — Minetti (2002)",
        text: `La formule standard "D+/100" ne distingue pas les descentes douces des descentes raides. Le modèle Minetti (publié dans Nature) mesure le coût métabolique réel selon la pente :`,
        steps: [
          "Montée : 100 m D+ = 1 km-effort (standard ITRA)",
          "Descente douce (< seuil) : 150 m D- = 1 km-effort. Courir en légère pente négative est économique.",
          "Descente raide (> seuil) : 80 m D- = 1 km-effort. Les quadriceps travaillent en excentrique, ce qui est très coûteux.",
          "Transition douce entre les deux régimes (sigmoïde logistique) → pas d'effet de seuil brutal."
        ]
      },
      {
        subtitle: "Fatigue exponentielle",
        text: `Sur un ultra, la fatigue n'est pas linéaire. Le modèle utilise une croissance exponentielle du temps nécessaire par km-effort au fil de la course.`,
        formula: `Facteur de temps(x) = (E/α) × [exp(α × (x+dx)/E) − exp(α × x/E)]
où α = ln(1 + fatiguePercent/100)`,
        formulaNote: "À 15% de fatigue : le dernier tiers de la course dure 15% plus longtemps que le premier tiers. À 30% (ultra extrême) : la différence est de 30%.",
        steps: [
          "0% : vitesse constante du début à la fin (pas réaliste sur ultra)",
          "10-15% : fatigue légère à modérée (trail 20-50 km)",
          "15-25% : fatigue typique d'un ultra (60-100 km)",
          "25-35% : ultra extrême, nuit, conditions difficiles (> 100 km)"
        ]
      },
      {
        subtitle: "Coefficients environnementaux",
        text: "La météo et la nuit modifient la vitesse de course :",
        steps: [
          "🥶 Froid (< 10°C) : −3% (contractures, équipement lourd)",
          "✅ Modéré (10-20°C) : référence 100%",
          "☀️ Chaud (20-28°C) : −5% (thermorégulation active)",
          "🥵 Canicule (> 28°C) : −12% (hyperthermie, déshydratation accélérée)",
          "🌙 Nuit partielle : jusqu'à −5% (terrain moins lisible)",
          "🌙 Nuit totale : −10% (fatigue cognitive + visibilité réduite)"
        ]
      },
      {
        subtitle: "Garantie de cohérence",
        text: `La somme de tous les temps de segments est toujours normalisée pour correspondre exactement à votre objectif (Rapide ou Lent). La fatigue et la météo redistribuent ce temps en donnant plus de poids aux segments difficiles, sans changer le total.`,
      }
    ]
  },
  {
    id: "profile",
    icon: <Activity size={20} />,
    title: "Profil Coureur — VMA & ITRA",
    color: "#F59E0B",
    content: [
      {
        subtitle: "Index ITRA",
        text: `L'ITRA (International Trail Running Association) attribue un index de performance entre 0 et 1000 basé sur vos résultats officiels de trail. C'est la référence mondiale pour évaluer le niveau d'un traileur.`,
        steps: [
          "100-200 : Débutant (premières courses trail)",
          "300-400 : Intermédiaire (trails réguliers, semi-marathon montagne)",
          "500-600 : Confirmé (finisher UTMB, CCC, etc.)",
          "700-800 : Expert (top 20% sur les grands ultras)",
          "900-1000 : Élite mondiale"
        ],
        formulaNote: "Consultez votre index sur le site officiel ITRA (itra.run). Votre index est disponible dans votre profil si vous avez des résultats validés."
      },
      {
        subtitle: "VMA — Vitesse Maximale Aérobie",
        text: `La VMA est la vitesse minimale à laquelle vous consommez le maximum d'oxygène (VO2max). Elle s'exprime en km/h. En trail, on travaille à un % bien inférieur à la VMA selon la durée.`,
        formula: `% VMA utilisé ≈ 82% × durée(h)^(-0.065)
Exemples : 1h → 80% VMA | 6h → 60% | 12h → 50% | 24h → 42%`,
        formulaNote: "Régression sur données ITRA/UTMB. Plus la course est longue, plus le % VMA utilisable est faible.",
        steps: [
          "VMA 14 km/h : niveau correct pour le trail",
          "VMA 16 km/h : bon niveau (régulier sur piste ou route)",
          "VMA 18+ km/h : excellent, pratique course à pied intensive",
          "Si vous ne connaissez pas votre VMA, utilisez l'index ITRA à la place."
        ]
      },
      {
        subtitle: "Seuil Marche / Course",
        text: `C'est le pourcentage de pente à partir duquel vous marchez plutôt que courir. Ce seuil influence directement la répartition terrain (descente/plat - montée courable - marche) affichée sur chaque segment.`,
        steps: [
          "8-10% : Bon coureur en montée, marche peu en dehors des passages très pentus",
          "12-15% : Traileur moyen (valeur par défaut)",
          "18-25% : Marche dès les premières côtes, préfère préserver les jambes",
          "Le seuil descend automatiquement avec la fatigue en cours de course (modèle empirique)."
        ]
      }
    ]
  },
  {
    id: "waypoints",
    icon: <Map size={20} />,
    title: "Points de Passage & Ravitaillements",
    color: "#EF4444",
    content: [
      {
        subtitle: "Ajouter un point de passage",
        text: "Trois méthodes pour ajouter un point :",
        steps: [
          "📊 Cliquez sur le profil altimétrique → un point est ajouté à la distance exacte du clic.",
          "🗺️ Cliquez sur la trace (ligne orange) sur la carte.",
          "✏️ Saisissez manuellement une distance en km via le bouton 'Ajouter un point manuellement'."
        ]
      },
      {
        subtitle: "Types de points",
        steps: [
          "📍 Point de passage : simple repère sur la trace (col, sommet, bifurcation...)",
          "💧 Point d'eau : source ou fontaine. Pas de ravitaillement complet.",
          "🍎 Ravito complet : ravitaillement officiel. Planifiez vos besoins nutritionnels.",
          "🏕️ Base vie : point d'assistance complète (dropbag, équipement de rechange)."
        ]
      },
      {
        subtitle: "Modificateur de vitesse (%)",
        text: "Ajustez le temps calculé pour un segment spécifique. Utile pour les segments avec terrain technique, altitude, ou conditions particulières.",
        steps: [
          "100% : vitesse calculée nominale (défaut)",
          "80% : segment difficile (terrain technique, neige, altitude élevée)",
          "120% : segment facile (plat, chemin roulant, bon sol)",
          "Les valeurs extrêmes (< 60% ou > 150%) sont rarement réalistes."
        ]
      },
      {
        subtitle: "Pause (minutes)",
        text: "Le temps de pause est déduit du temps de course avant le calcul. Cela garantit que la durée totale (temps de marche + pauses) correspond à votre objectif."
      },
      {
        subtitle: "Barrière horaire (BH)",
        text: "Entrez l'heure limite imposée par l'organisation. Si votre ETA lent dépasse la BH, vous risquez l'abandon. Planifiez une marge de sécurité !"
      }
    ]
  },
  {
    id: "nutrition",
    icon: <Droplets size={20} />,
    title: "Nutrition & Hydratation",
    color: "#3B82F6",
    content: [
      {
        subtitle: "Glucides (g/h)",
        text: "L'énergie primaire pour courir vite. Les réserves glycogènes (~2000 kcal) sont épuisées en ~90-120 minutes à haute intensité.",
        steps: [
          "30-45 g/h : trail court, faible intensité",
          "60 g/h : recommandation standard (standard IAAF 2023)",
          "60-90 g/h : ultra intensité, utiliser un mélange glucose/fructose (ratio 2:1)",
          "90+ g/h : tolérance digestive exceptionnelle requise"
        ],
        formulaNote: "Au-delà de 60 g/h de glucose seul, la saturation intestinale provoque des inconforts. Associez fructose pour atteindre 90 g/h sans problème."
      },
      {
        subtitle: "Eau (ml/h)",
        text: "La déshydratation est le facteur limitant majeur en trail par temps chaud. La perte sudorale varie énormément selon la chaleur.",
        steps: [
          "🥶 Froid : 400-500 ml/h",
          "✅ Modéré : 500-600 ml/h",
          "☀️ Chaud : 600-800 ml/h",
          "🥵 Canicule : 800-1000 ml/h (voire plus pour les forts sudateurs)",
          "Règle : urine foncée = déshydratation, continuez à boire avant la soif."
        ]
      },
      {
        subtitle: "Sodium (mg/h)",
        text: "Le sodium est l'électrolyte clé pour éviter l'hyponatrémie (trop d'eau sans sel) et les crampes. Il augmente avec la transpiration.",
        steps: [
          "300-400 mg/h par temps frais",
          "400-500 mg/h conditions modérées",
          "500-800 mg/h par grande chaleur ou si vous transpirez fortement"
        ]
      },
      {
        subtitle: "Caféine (mg par prise)",
        text: "La caféine est l'ergogène légal le plus efficace en endurance. Elle réduit la perception de l'effort et retarde la fatigue.",
        steps: [
          "3-6 mg/kg de poids corporel sur la course totale (dose maximale efficace)",
          "Prise ponctuelle recommandée : 50-100 mg (≈ 1-2 gels caféinés)",
          "À utiliser stratégiquement : passage difficile, coup de fatigue nocturne, dernier tiers",
          "Évitez la caféine < 6h avant la course si vous dormez peu."
        ]
      }
    ]
  },
  {
    id: "terrain",
    icon: <Mountain size={20} />,
    title: "Répartition Terrain & VAM",
    color: "#8B5CF6",
    content: [
      {
        subtitle: "La jauge de terrain",
        text: "La barre colorée sur chaque segment décompose le parcours en 3 types de locomotion, calculés à partir de la trace GPS et du seuil de marche configuré :",
        steps: [
          "🟢 Vert — Descente & Plat : zones courues à allure libre. La vitesse dépend du profil et de la fatigue.",
          "🟡 Jaune — Montée courable : pentes inférieures au seuil de marche. On court encore, même si c'est lent.",
          "🟣 Violet — Marche : pentes supérieures au seuil. La marche active avec bâtons est souvent plus économique."
        ]
      },
      {
        subtitle: "VAM — Vitesse Ascensionnelle Maximale (donnée avancée)",
        text: "La VAM (m/h) mesure la rapidité de montée. Elle est calculée en rapportant le D+ du segment au temps estimé passé en montée.",
        steps: [
          "300-400 m/h : débutant ou terrain très difficile",
          "400-600 m/h : traileur régulier",
          "600-800 m/h : niveau course à pied, montée efficace",
          "800-1000 m/h : excellent, niveau compétiteur",
          "1000+ m/h : élite (coureurs de type Xavier Thévenard, Kilian Jornet)"
        ],
        formulaNote: "Activez l'affichage VAM dans 'Paramètres d'affichage' (bouton ⚙️). Cette valeur est masquée par défaut car elle nécessite un départ chronométré précis pour être significative."
      }
    ]
  },
  {
    id: "calibration",
    icon: <Zap size={20} />,
    title: "Calibration GPS & Données Officielles",
    color: "#EC4899",
    content: [
      {
        subtitle: "Pourquoi calibrer ?",
        text: "Les fichiers GPX surestiment souvent la distance (bruit GPS, zigzags) et le dénivelé (erreur altimétrique). La calibration sur les données officielles corrige ces deux biais."
      },
      {
        subtitle: "Distance Officielle",
        text: "Renseignez la distance annoncée par l'organisation. Un facteur correctif est appliqué à chaque calcul de distance GPS pour correspondre exactement à la distance réelle.",
        formulaNote: "Facteur = Distance officielle / Distance mesurée GPS"
      },
      {
        subtitle: "Dénivelé Positif Officiel",
        text: "Renseignez le D+ officiel. Le moteur recherche automatiquement le seuil de lissage altimétrique optimal (par dichotomie) qui correspond exactement au D+ annoncé.",
        formulaNote: "Algorithme : recherche dichotomique sur le seuil de lissage (0 à 50m) en 15 itérations. Précision < 5m."
      },
      {
        subtitle: "Sans données officielles",
        text: "Le moteur utilise des valeurs par défaut : seuil de lissage = 5m, facteur distance = 1. Les résultats restent cohérents mais peuvent s'écarter des valeurs de l'organisation."
      }
    ]
  },
  {
    id: "faq",
    icon: <HelpCircle size={20} />,
    title: "FAQ — Questions Fréquentes",
    color: "#64748B",
    content: [
      {
        subtitle: "Pourquoi mes temps estimés changent après avoir entré la météo ?",
        text: "La météo applique un coefficient de vitesse à tous les segments. La chaleur (> 28°C) ralentit de 12% en moyenne en raison de la thermorégulation. Le total reste dans l'enveloppe de votre objectif."
      },
      {
        subtitle: "La VAM affiché est-elle ma VAM réelle ?",
        text: "Non, c'est une VAM estimée. Elle est calculée en supposant que le % de temps passé en montée est proportionnel au % de km-effort en montée. Pour mesurer votre vraie VAM, réalisez un test de 20 minutes sur une montée régulière."
      },
      {
        subtitle: "Pourquoi les temps fast/slow ne correspondent pas exactement à mes objectifs ?",
        text: "Les coefficients météo et nuit modifient les temps par segment. Cela peut légèrement décaler le total. La logique garantit uniquement que la somme sans malus = votre objectif. Avec malus, les temps finaux seront légèrement plus élevés."
      },
      {
        subtitle: "Comment interpréter 'Nuit partielle (−X%)' ?",
        text: "Le pourcentage est l'intensité nocturne (0=jour, 10%=nuit totale). La pénalité de −X% représente le ralentissement estimé dû à la visibilité réduite et à la fatigue cognitive nocturne."
      },
      {
        subtitle: "Quelle différence entre ETA Rapide et ETA Lent ?",
        text: "L'ETA Rapide est votre objectif ambitieux (tout se passe bien). L'ETA Lent est votre scénario conservateur (petits imprévus). Utilisez l'ETA Lent pour planifier vos ravitaillements et la logistique d'assistance, l'ETA Rapide comme objectif compétitif."
      },
      {
        subtitle: "Mon fichier GPX a trop ou trop peu de D+, que faire ?",
        text: "Entrez le D+ officiel dans 'Données Organisateur'. Le moteur calibre automatiquement le seuil de lissage pour correspondre à la valeur réelle. Sans cette information, le D+ GPS brut est utilisé (souvent surestimé de 5-15%)."
      },
      {
        subtitle: "Le modificateur de vitesse (%) sur un waypoint, ça change quoi ?",
        text: "Il multiplie le km-effort du segment par ce facteur. À 80%, le segment prend 20% de temps en plus (terrain difficile). À 120%, il est 20% plus rapide. Le calcul de fatigue s'applique toujours après ce modificateur."
      }
    ]
  }
];

function Section({ section }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className={styles.section}>
      <button
        className={styles.sectionHeader}
        onClick={() => setIsOpen(!isOpen)}
        style={{ borderLeft: `4px solid ${section.color}` }}
      >
        <div className={styles.sectionHeaderLeft}>
          <span className={styles.sectionIcon} style={{ color: section.color }}>
            {section.icon}
          </span>
          <h2 className={styles.sectionTitle}>{section.title}</h2>
        </div>
        <span className={styles.chevron}>
          {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </span>
      </button>

      {isOpen && (
        <div className={styles.sectionBody}>
          {section.content.map((item, i) => (
            <div key={i} className={styles.contentBlock}>
              {item.subtitle && (
                <h3 className={styles.blockTitle} style={{ color: section.color }}>
                  {item.subtitle}
                </h3>
              )}
              {item.text && <p className={styles.blockText}>{item.text}</p>}

              {item.formula && (
                <div className={styles.formulaBlock}>
                  <pre className={styles.formula}>{item.formula}</pre>
                  {item.formulaNote && (
                    <p className={styles.formulaNote}>💡 {item.formulaNote}</p>
                  )}
                </div>
              )}

              {!item.formula && item.formulaNote && (
                <div className={styles.noteBlock}>
                  <p className={styles.formulaNote}>💡 {item.formulaNote}</p>
                </div>
              )}

              {item.steps && (
                <ul className={styles.stepList}>
                  {item.steps.map((step, j) => (
                    <li key={j} className={styles.stepItem}>
                      {step}
                    </li>
                  ))}
                </ul>
              )}

              {item.example && (
                <div className={styles.exampleBlock}>
                  <span className={styles.exampleLabel}>Exemple :</span> {item.example}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HelpPage() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.backLink}>
          <ArrowLeft size={18} />
          Retour
        </Link>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>
            <HelpCircle size={28} style={{ display: 'inline', marginRight: '12px', verticalAlign: 'middle' }} />
            Guide & Documentation
          </h1>
          <p className={styles.subtitle}>
            Comprendre toutes les fonctions de TrailRoadbookPro — Calculs scientifiques, navigation, nutrition.
          </p>
        </div>

        {/* Navigation rapide */}
        <nav className={styles.quickNav}>
          {sections.map(s => (
            <a key={s.id} href={`#${s.id}`} className={styles.quickNavLink} style={{ borderColor: s.color, color: s.color }}>
              {s.title.split(' — ')[0].split(' & ')[0]}
            </a>
          ))}
        </nav>
      </header>

      <main className={styles.main}>
        {sections.map(section => (
          <div key={section.id} id={section.id}>
            <Section section={section} />
          </div>
        ))}
      </main>

      <footer className={styles.footer}>
        <p>TrailRoadbookPro — Basé sur les modèles : Minetti (2002), Jack Daniels VDOT, Périard (2015), Jared Ward (2017)</p>
        <Link href="/dashboard" className="btn btn-primary" style={{ marginTop: '16px' }}>
          Retour au tableau de bord
        </Link>
      </footer>
    </div>
  );
}
