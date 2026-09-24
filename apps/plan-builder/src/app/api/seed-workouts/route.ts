import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { WorkoutTemplate } from '@/types';

const workoutTemplates: WorkoutTemplate[] = [
  // --- RECOVERY / ENDURANCE ---
  {
    id: 'rec-active-30',
    name: 'Récupération Active 30m',
    category: 'Recovery',
    sport: 'Run',
    description: 'Petite sortie pour faire circuler le sang. Aucun essoufflement, aisance totale.',
    defaultDuration: 30,
    defaultTss: 20,
    author: 'System',
    tags: ['recovery', 'easy'],
    phases: [
      { type: 'active', duration: 30, intensityTss: 40, rpe: 2, description: 'Z1 / RPE 2' }
    ]
  },
  {
    id: 'end-fatmax-60',
    name: 'Endurance FatMax 60m',
    category: 'FatMax',
    sport: 'Run',
    description: 'Travail au seuil aérobie (LT1) pour maximiser l\'oxydation des graisses.',
    defaultDuration: 60,
    defaultTss: 50,
    author: 'System',
    tags: ['endurance', 'base', 'fatmax'],
    phases: [
      { type: 'active', duration: 60, intensityTss: 50, rpe: 3, description: 'Zone 2 / RPE 3' }
    ]
  },
  
  // --- TEMPO / SWEET SPOT ---
  {
    id: 'sst-2x20',
    name: 'Sweet Spot 2x20m',
    category: 'SweetSpot',
    sport: 'Run',
    description: 'Séance classique de Sweet Spot (88-92% FTP ou RPE 6-7). Excellent ratio bénéfice/fatigue pour construire la base solide.',
    defaultDuration: 70,
    defaultTss: 80,
    author: 'System',
    tags: ['sweet-spot', 'muscular-endurance'],
    phases: [
      { type: 'warmup', duration: 15, intensityTss: 45, rpe: 3, description: 'Échauffement Z2' },
      { type: 'intervals', duration: 45, intensityTss: 85, repeats: 2, workDuration: 20, workZone: 'Z3', workIntensity: 90, workRpe: 7, restDuration: 5, restZone: 'Z1', restIntensity: 50, restRpe: 2, description: 'Blocs Sweet Spot' },
      { type: 'cooldown', duration: 10, intensityTss: 40, rpe: 2, description: 'Retour au calme' }
    ]
  },
  
  // --- THRESHOLD / OVER-UNDER ---
  {
    id: 'ou-3x9',
    name: 'Over-Under 3x9m',
    category: 'OverUnder',
    sport: 'Run',
    description: 'Travail de clairance du lactate. Alternance entre juste au-dessus du seuil (sur-production) et juste en dessous (clairance).',
    defaultDuration: 65,
    defaultTss: 85,
    author: 'System',
    tags: ['threshold', 'lactate-clearance'],
    phases: [
      { type: 'warmup', duration: 15, intensityTss: 50, rpe: 3, description: 'Échauffement' },
      { 
        type: 'intervals', duration: 35, intensityTss: 95, repeats: 3, 
        workDuration: 9, workZone: 'Z4', workIntensity: 105, workRpe: 8,
        restDuration: 4, restZone: 'Z1', restIntensity: 50, restRpe: 2, 
        description: 'Chaque bloc : alterner 2m @ 95% FTP (Z4) et 1m @ 105% FTP (Z5)' 
      },
      { type: 'cooldown', duration: 10, intensityTss: 40, rpe: 2, description: 'Retour au calme' }
    ]
  },

  // --- VO2MAX / HIIT ---
  {
    id: 'vo2-5x3',
    name: 'VO2Max 5x3m',
    category: 'VO2Max',
    sport: 'Run',
    description: 'Classique VO2Max pour augmenter le plafond aérobie. RPE 8-9.',
    defaultDuration: 60,
    defaultTss: 90,
    author: 'System',
    tags: ['vo2max', 'hiit'],
    phases: [
      { type: 'warmup', duration: 15, intensityTss: 50, rpe: 3, description: 'Échauffement progressif' },
      { type: 'intervals', duration: 30, intensityTss: 110, repeats: 5, workDuration: 3, workZone: 'Z5', workIntensity: 115, workRpe: 9, restDuration: 3, restZone: 'Z1', restIntensity: 50, restRpe: 2, drainWPrime: true, description: 'Intervalles VO2Max' },
      { type: 'cooldown', duration: 15, intensityTss: 40, rpe: 2, description: 'Retour au calme' }
    ]
  },

  // --- SIT (SPRINT INTERVAL TRAINING) ---
  {
    id: 'sit-6x30s',
    name: 'SIT 6x30s All-out',
    category: 'SIT',
    sport: 'Run',
    description: 'Sprint Interval Training. Des sprints maximaux (all-out) avec une longue récupération. Active les fibres rapides et génère un signal d\'adaptation mitochondrial puissant sans énorme volume.',
    defaultDuration: 50,
    defaultTss: 60, // Faible TSS mais fort impact
    author: 'System',
    tags: ['sit', 'anaerobic', 'sprint'],
    phases: [
      { type: 'warmup', duration: 20, intensityTss: 50, rpe: 3, description: 'Échauffement long et complet' },
      { type: 'intervals', duration: 24, intensityTss: 90, repeats: 6, workDuration: 0.5, workZone: 'Z6', workIntensity: 150, workRpe: 10, restDuration: 3.5, restZone: 'Z1', restIntensity: 50, restRpe: 2, drainWPrime: true, description: 'Sprints All-out' },
      { type: 'cooldown', duration: 6, intensityTss: 40, rpe: 2, description: 'Retour au calme' }
    ]
  },

  // --- DURABILITY ---
  {
    id: 'durability-z4-late',
    name: 'Résistance Fatigue : Seuil sur fatigue',
    category: 'Durability',
    sport: 'Run',
    description: 'Séance visant la durabilité. On pré-fatigue les fibres lentes avec une longue zone 2, puis on impose un travail au seuil quand la fatigue est déjà là.',
    defaultDuration: 105,
    defaultTss: 130,
    author: 'System',
    tags: ['durability', 'advanced', 'threshold'],
    phases: [
      { type: 'active', duration: 70, intensityTss: 55, rpe: 4, description: 'Pré-fatigue en Z2 Haute / FatMax' },
      { type: 'intervals', duration: 25, intensityTss: 100, repeats: 2, workDuration: 10, workZone: 'Z4', workIntensity: 100, workRpe: 8, restDuration: 5, restZone: 'Z1', restIntensity: 50, restRpe: 2, description: 'Blocs Seuil sous fatigue' },
      { type: 'cooldown', duration: 10, intensityTss: 40, rpe: 2, description: 'Retour au calme' }
    ]
  },
  // --- TRAIL RUNNING : SPECIFIC ---
  {
    id: 'trail-rolling-endurance',
    name: 'Endurance Trail Vallonné',
    category: 'Endurance',
    sport: 'Run',
    description: 'Sortie trail sur terrain vallonné. Gestion de l\'effort : Z2 sur le plat et les descentes, tolérance jusqu\'en Z3 basse dans les montées.',
    defaultDuration: 90,
    defaultTss: 70,
    author: 'System',
    tags: ['trail', 'endurance', 'rolling-hills'],
    phases: [
      { type: 'active', duration: 90, intensityTss: 50, rpe: 4, description: 'Z2 avec variations de terrain. RPE 3-4 sur plat, max RPE 5 en côte.' }
    ]
  },
  {
    id: 'trail-hill-repeats-short',
    name: 'Puissance VMA : Côtes Courtes',
    category: 'VO2Max',
    sport: 'Run',
    description: 'Intervalles très intenses en montée (pente 8-15%). Améliore la puissance musculaire, la VO2max et la foulée en côte.',
    defaultDuration: 55,
    defaultTss: 85,
    author: 'System',
    tags: ['trail', 'vo2max', 'hills', 'power'],
    phases: [
      { type: 'warmup', duration: 20, intensityTss: 45, rpe: 3, description: 'Échauffement sur le plat' },
      { type: 'intervals', duration: 20, intensityTss: 120, repeats: 10, workDuration: 1, workZone: 'Z5', workIntensity: 115, workRpe: 9, restDuration: 1, restZone: 'Z1', restIntensity: 50, restRpe: 2, description: 'Côtes courtes à fond (RPE 9). Redescente en trottinant ou marchant.' },
      { type: 'cooldown', duration: 15, intensityTss: 40, rpe: 2, description: 'Retour au calme' }
    ]
  },
  {
    id: 'trail-sweetspot-climb',
    name: 'Tempo Long en Montée',
    category: 'SweetSpot',
    sport: 'Run',
    description: 'Blocs de Sweet Spot / Tempo réalisés exclusivement en montée continue. Prépare aux longues ascensions.',
    defaultDuration: 75,
    defaultTss: 85,
    author: 'System',
    tags: ['trail', 'sweet-spot', 'climbing'],
    phases: [
      { type: 'warmup', duration: 15, intensityTss: 50, rpe: 3, description: 'Approche' },
      { type: 'intervals', duration: 45, intensityTss: 85, repeats: 3, workDuration: 12, workZone: 'Z3', workIntensity: 90, workRpe: 7, restDuration: 3, restZone: 'Z1', restIntensity: 50, restRpe: 2, description: 'Montée tempo continu (Sweet Spot). RPE 7.' },
      { type: 'cooldown', duration: 15, intensityTss: 40, rpe: 2, description: 'Descente souple' }
    ]
  },
  {
    id: 'trail-downhill-eccentric',
    name: 'Renforcement Descente',
    category: 'Durability',
    sport: 'Run',
    description: 'Séance spécifique pour habituer les fibres musculaires (casse excentrique) aux descentes. Rythme soutenu en descente technique.',
    defaultDuration: 60,
    defaultTss: 65,
    author: 'System',
    tags: ['trail', 'downhill', 'eccentric', 'durability'],
    phases: [
      { type: 'warmup', duration: 20, intensityTss: 50, rpe: 3, description: 'Montée tranquille (marche autorisée)' },
      { type: 'intervals', duration: 30, intensityTss: 80, repeats: 5, workDuration: 3, workZone: 'Z3', workIntensity: 85, workRpe: 6, restDuration: 3, restZone: 'Z1', restIntensity: 50, restRpe: 3, description: 'Descente engagée RPE 6-7. Remontée très lente Z1.' },
      { type: 'cooldown', duration: 10, intensityTss: 40, rpe: 2, description: 'Retour au calme sur plat' }
    ]
  },
  {
    id: 'trail-power-hiking',
    name: 'Rando-Course / Power Hiking',
    category: 'FatMax',
    sport: 'Run',
    description: 'Sortie longue très spécifique Ultra-Trail. Alternance course sur plat/descente et marche active (Power Hiking) dès que la pente s\'élève. RPE très bas.',
    defaultDuration: 180,
    defaultTss: 120,
    author: 'System',
    tags: ['trail', 'ultra', 'power-hiking', 'long-run'],
    phases: [
      { type: 'active', duration: 180, intensityTss: 45, rpe: 3, description: 'Z1/Z2 continu. Marche active forte dans toutes les montées.' }
    ]
  }
];

export async function GET() {
  try {
    const workoutsRef = collection(db, 'workout_templates');
    
    let count = 0;
    for (const template of workoutTemplates) {
      await setDoc(doc(workoutsRef, template.id), template);
      count++;
    }

    return NextResponse.json({ 
      success: true, 
      message: `${count} workout templates seeded successfully.`,
      templates: workoutTemplates
    });
  } catch (error: any) {
    console.error("Error seeding templates:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
