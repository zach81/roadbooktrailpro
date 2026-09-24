import { Workout, WorkoutPhase, Macrocycle, Mesocycle, MesocyclePhase, WorkoutTemplate, WorkoutCategory } from '@/types';
import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';
/**
 * Converts a Workout object into an Intervals.icu compatible text description
 */
export function generateIntervalsWorkoutText(workout: Workout): string {
  const phaseTexts: string[] = [];

  for (const phase of workout.phases) {
    if (phase.type === 'intervals' && phase.repeats && phase.workDuration && phase.restDuration) {
      // Structured intervals
      let stepText = `${phase.repeats}x\n`;
      
      // Work step
      let workDesc = phase.description ? ` ${phase.description}` : '';
      if (phase.isHill) workDesc += ` (Côte/D+)`;
      if (phase.cadenceTarget) workDesc += ` @ ${phase.cadenceTarget}rpm`;
      
      let workTarget = phase.workZone ? phase.workZone : (phase.workIntensity ? `${phase.workIntensity}%` : (phase.workRpe ? `RPE${phase.workRpe}` : ''));
      stepText += `- ${phase.workDuration}m ${workTarget}${workDesc}\n`;
      
      // Rest step
      let restTarget = phase.restZone ? phase.restZone : (phase.restIntensity ? `${phase.restIntensity}%` : (phase.restRpe ? `RPE${phase.restRpe}` : ''));
      stepText += `- ${phase.restDuration}m ${restTarget}`;
      
      phaseTexts.push(stepText);
    } else {
      // Standard single step
      let intensityText = '60%'; // default warmup
      if (phase.type === 'active') {
        intensityText = phase.workZone ? phase.workZone : (phase.rpe ? `RPE ${phase.rpe}` : `${phase.intensityTss}%`);
      } else if (phase.type === 'recovery' || phase.type === 'cooldown' || phase.type === 'warmup') {
        intensityText = phase.rpe ? `RPE ${phase.rpe}` : (phase.type === 'warmup' ? 'Z1-Z2' : 'Z1');
      }

      let stepText = `- ${phase.duration}m ${intensityText}`;
      if (phase.description) stepText += ` ${phase.description}`;
      if (phase.isHill) stepText += ` (Côte/D+)`;
      if (phase.cadenceTarget) stepText += ` @ ${phase.cadenceTarget}rpm`;
      
      phaseTexts.push(stepText);
    }
  }

  let text = phaseTexts.join('\n\n');

  // Ajouter les métadonnées globales à la fin de la description
  text += '\n\n---\n';
  text += `🎯 Objectif Charge : ${workout.totalTss} TSS\n`;
  text += `📍 Phase : ${workout.name.split(' - ')[0]}\n`;
  text += `🏔️ Terrain : ${workout.terrain}\n`;

  return text;
}

/**
 * Calcule la charge (TSS estimé) pour une phase donnée
 */
export function calculatePhaseTSS(durationMin: number, intensityPercent: number): number {
  // TSS = (sec x NP x IF) / (FTP x 3600) x 100
  // Simplified: 1 hour at 100% = 100 TSS
  const durationHours = durationMin / 60;
  const IF = intensityPercent / 100;
  return durationHours * (IF * IF) * 100; // quadratic relation of intensity to TSS
}

/**
 * Génère un plan d'entraînement basique basé sur la charge (TSS/Semaine).
 * C'est ici que réside la modélisation des cycles de la science de l'entraînement.
 */
/**
 * Génère un plan d'entraînement periodisé en utilisant la configuration avancée
 */
import { PlanConfig } from '@/types';

export function generateMacrocycle(
  athleteId: string,
  config: PlanConfig
): Macrocycle {
  const mesocycles: Mesocycle[] = [];
  
  const targetRace = config.races.find(r => r.isTarget) || config.races[0];
  const startDate = new Date(config.startDate);
  // Default to 16 weeks if no race
  const targetRaceDate = targetRace ? new Date(targetRace.date) : new Date(startDate.getTime() + 16 * 7 * 24 * 60 * 60 * 1000);
  
  const totalDays = Math.ceil((targetRaceDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const totalWeeks = Math.max(4, Math.ceil(totalDays / 7));

  let phaseDurations = [];

  if (config.planMode === 'MANUAL' && config.manualPhases) {
    phaseDurations = [
      { phase: 'Base' as MesocyclePhase, weeks: config.manualPhases.base },
      { phase: 'Build' as MesocyclePhase, weeks: config.manualPhases.build },
      { phase: 'Peak' as MesocyclePhase, weeks: config.manualPhases.peak },
      { phase: 'Taper' as MesocyclePhase, weeks: config.manualPhases.taper }
    ];
  } else {
    // Determine phases working backwards
    let taperWeeks = 2;
    let peakWeeks = 3;
    let remainingWeeks = totalWeeks - taperWeeks - peakWeeks;
    
    if (remainingWeeks < 0) {
      taperWeeks = Math.floor(totalWeeks * 0.2);
      peakWeeks = Math.floor(totalWeeks * 0.3);
      remainingWeeks = totalWeeks - taperWeeks - peakWeeks;
    }
    
    const buildWeeks = Math.max(1, Math.floor(remainingWeeks * 0.4));
    const baseWeeks = Math.max(1, remainingWeeks - buildWeeks);

    phaseDurations = [
      { phase: 'Base' as MesocyclePhase, weeks: baseWeeks },
      { phase: 'Build' as MesocyclePhase, weeks: buildWeeks },
      { phase: 'Peak' as MesocyclePhase, weeks: peakWeeks },
      { phase: 'Taper' as MesocyclePhase, weeks: taperWeeks }
    ];
  }

  let currentTss = config.initialTss && config.initialTss > 0 
    ? config.initialTss 
    : config.hoursPerWeek * 50; // Estimation: 50 TSS/h en moyenne pour démarrer
  const maxTss = currentTss * (1 + config.progression.plateauThreshold / 100); // Plafond défini par l'utilisateur
  
  let globalWeekIndex = 0;
  let hasTrained = false;

  phaseDurations.forEach((p, idx) => {
    if (p.weeks <= 0) return;
    const targetTssPerWeek = [];

    for (let i = 0; i < p.weeks; i++) {
      const isRecoveryWeek = p.phase !== 'Taper' && (
        config.startWithRecovery 
          ? (globalWeekIndex % config.progression.recoveryFrequency === 0)
          : ((globalWeekIndex + 1) % config.progression.recoveryFrequency === 0)
      );
      
      if (p.phase === 'Taper') {
        // En période d'affûtage, la base de charge ne croît plus
      } else if (isRecoveryWeek) {
        // En semaine de récupération, la base d'entraînement de fond ne croît pas
      } else {
        // Semaine d'entraînement effectif
        if (hasTrained) {
          if (i === 0) {
            // Progression inter-mésocycle (nouveau bloc)
            currentTss = currentTss * (1 + config.progression.mesocycleProgressionRate / 100);
          } else {
            // Progression intra-mésocycle (semaine après semaine)
            currentTss = currentTss * (1 + config.progression.intramesocycleProgressionRate / 100);
          }
        }
        hasTrained = true;
      }
      
      // Plafonnement de la charge pour éviter le surentraînement (plateau)
      currentTss = Math.min(currentTss, maxTss);

      if (p.phase === 'Taper') {
        // Chute progressive pendant l'affûtage : -30% puis -50% etc.
        const reduction = 30 + (i * 20);
        targetTssPerWeek.push(Math.round(currentTss * (Math.max(0, 100 - reduction) / 100)));
      } else if (isRecoveryWeek) {
        // Réduction ponctuelle du volume (ex: -40%) pour surcompensation
        targetTssPerWeek.push(Math.round(currentTss * (1 - config.progression.recoveryVolumeReduction / 100)));
      } else {
        targetTssPerWeek.push(Math.round(currentTss));
      }
      
      globalWeekIndex++;
    }

    mesocycles.push({
      id: `meso-${idx}`,
      name: `${p.phase} Phase`,
      phase: p.phase,
      weeks: p.weeks,
      targetTssPerWeek
    });
  });

  return {
    id: `macro-${Date.now()}`,
    athleteId,
    name: config.planName || `Plan Objectif Trail`,
    targetRaceDate: targetRaceDate,
    targetDistance: 50,
    targetElevation: 2000,
    startDate: startDate,
    mesocycles,
  };
}

export async function generateWorkoutsForMacrocycle(macrocycle: Macrocycle, config: PlanConfig): Promise<Workout[]> {
  const workouts: Workout[] = [];

  // 1. Fetch templates from Firebase
  let templates: WorkoutTemplate[] = [];
  try {
    const querySnapshot = await getDocs(collection(db, 'workout_templates'));
    querySnapshot.forEach((doc) => {
      templates.push(doc.data() as WorkoutTemplate);
    });
  } catch (error) {
    console.error("Failed to fetch workout templates from Firebase:", error);
    // Fallback simple si pas de connexion
  }

  // Helper pour trouver un template par catégorie
  const getTemplateForCategory = (category: WorkoutCategory): WorkoutTemplate | undefined => {
    const matches = templates.filter(t => t.category === category);
    if (matches.length > 0) {
      // Pour l'instant on prend le premier ou on pourrait tirer au hasard / selon TSS
      return matches[Math.floor(Math.random() * matches.length)];
    }
    return undefined;
  };
  let currentDate = new Date(macrocycle.startDate);
  
  // By default, if PlanConfig is not fully populated, use some defaults
  const sessionsPerWeek = config.sessionsPerWeek || 4;
  const availableDays = config.availableDays || [1, 3, 5, 6, 0]; // default: Mon, Wed, Fri, Sat, Sun
  const longRunDays = config.longRunDays || [0]; // default: Sun
  const distributionModel = config.distributionModel || 'POLARIZED';
  const targetModality = config.targetModality || 'RPE';
  const includeStrength = config.includeStrength || false;
  
  let globalWeekIdx = 0;

  macrocycle.mesocycles.forEach((meso) => {
    meso.targetTssPerWeek.forEach((weeklyTss, weekIdx) => {
      if (weeklyTss <= 0) {
        currentDate.setDate(currentDate.getDate() + 7);
        globalWeekIdx++;
        return;
      }

      // 1. Déterminer les jours d'entraînement de la semaine (0 à 6 où 0 = Lundi dans notre boucle relative)
      // On boucle sur les 7 prochains jours à partir de currentDate
      const weekDays: { offset: number, dayOfWeek: number, date: Date, isLongRun: boolean }[] = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(currentDate);
        date.setDate(date.getDate() + i);
        const dayOfWeek = date.getDay(); // 0 = Dimanche, 1 = Lundi, etc.
        weekDays.push({
          offset: i,
          dayOfWeek,
          date,
          isLongRun: longRunDays.includes(dayOfWeek)
        });
      }

      // Filtrer les jours disponibles
      const possibleDays = weekDays.filter(d => availableDays.includes(d.dayOfWeek));
      
      // Sélectionner les jours de sortie longue (priorité)
      let selectedDays = possibleDays.filter(d => d.isLongRun);
      
      // Si pas de jour de sortie longue disponible, on prendra juste les autres
      // Compléter avec les jours restants jusqu'à atteindre sessionsPerWeek
      const remainingDays = possibleDays.filter(d => !d.isLongRun);
      
      // Trier de manière à espacer les entraînements (très simplifié : on prend le début, milieu, fin)
      while (selectedDays.length < sessionsPerWeek && remainingDays.length > 0) {
        // Ajouter le premier disponible
        selectedDays.push(remainingDays.shift()!);
      }
      
      // Limiter si trop de jours sélectionnés
      selectedDays = selectedDays.slice(0, sessionsPerWeek);
      
      // Trier chronologiquement
      selectedDays.sort((a, b) => a.offset - b.offset);

      // Si aucun jour sélectionné, on passe à la semaine suivante
      if (selectedDays.length === 0) {
        currentDate.setDate(currentDate.getDate() + 7);
        globalWeekIdx++;
        return;
      }

      // 2. Répartition du TSS et définition du type de séance
      // Sortie longue : ~40-50% du TSS
      // Le reste est divisé sur les autres séances
      const numSessions = selectedDays.length;
      let longRunSessionIdx = selectedDays.findIndex(d => d.isLongRun);
      if (longRunSessionIdx === -1) longRunSessionIdx = numSessions - 1; // par défaut la dernière séance
      
      // "Week-end Choc" logic
      const isWeChoc = config.weChocFrequency > 0 && (globalWeekIdx > 0 && globalWeekIdx % config.weChocFrequency === 0);
      
      selectedDays.forEach((day, idx) => {
        let sessionTss = 0;
        let type: WorkoutCategory = 'Endurance';
        let rpe = 4;
        let isHill = false;
        let isStrength = false;

        if (numSessions === 1) {
          sessionTss = weeklyTss;
          type = 'Long Run';
        } else {
          if (idx === longRunSessionIdx) {
            sessionTss = Math.round(weeklyTss * 0.45);
            type = 'Long Run';
            rpe = 4;
            isHill = true; // Souvent en trail, la sortie longue a du D+
          } else {
            // Autres séances (55% du TSS réparti)
            const remainingTss = weeklyTss * 0.55;
            sessionTss = Math.round(remainingTss / (numSessions - 1));
            
            // Attribution des types selon le modèle TID
            if (distributionModel === 'POLARIZED') {
              if (idx === 0) {
                type = 'VO2Max';
                rpe = 9;
              } else {
                type = 'Recovery';
                rpe = 2;
              }
            } else if (distributionModel === 'PYRAMIDAL') {
              if (idx === 0) {
                type = 'VO2Max';
                rpe = 8;
              } else if (idx === 1) {
                type = 'SweetSpot';
                rpe = 6;
              } else {
                type = 'Recovery';
                rpe = 2;
              }
            } else { // THRESHOLD
              if (idx === 0) {
                type = 'Threshold';
                rpe = 8;
              } else if (idx === 1) {
                type = 'OverUnder';
                rpe = 8;
              } else {
                type = 'Recovery';
                rpe = 2;
              }
            }
          }
        }

        // Renforcement musculaire
        if (includeStrength && type === 'Recovery' && !isStrength) {
          type = 'Strength';
          rpe = 5;
          isStrength = true;
        }
        
        // Week-end Choc : Durability
        if (isWeChoc && (idx === numSessions - 1 || idx === numSessions - 2)) {
          sessionTss = Math.round(sessionTss * 1.5);
          type = idx === numSessions - 1 ? 'Long Run' : 'Durability';
          rpe = 6;
          isHill = true;
        }

        const durationMin = Math.round((sessionTss / 50) * 60); // Base: 50 TSS/h
        
        // Chercher un template dans la BDD Firebase
        const template = getTemplateForCategory(type);
        
        let phases: WorkoutPhase[] = [];
        let description = "";

        if (template) {
          // On scale le template pour qu'il corresponde approximativement à la durée souhaitée
          // Pour un template structuré, l'idéal est d'ajuster l'échauffement / récup, ou multiplier les répétitions.
          // Ici on fera un clone simple, et on va juste ajuster l'échauffement ou le cooldown pour atteindre la durée.
          const totalCoreDuration = template.phases.reduce((sum, p) => sum + p.duration, 0);
          let extraDuration = durationMin - totalCoreDuration;
          
          phases = JSON.parse(JSON.stringify(template.phases)); // deep copy
          description = template.description;
          
          if (extraDuration > 0) {
            // Ajouter à l'échauffement ou cooldown
            const warmup = phases.find(p => p.type === 'warmup');
            if (warmup) {
              warmup.duration += extraDuration;
            } else {
              phases.unshift({ type: 'warmup', duration: extraDuration, intensityTss: 40, rpe: 3 });
            }
          } else if (extraDuration < 0) {
            // Le template est trop long, on peut difficilement couper le corps de séance sans casser la logique.
            // On réduit le warmup / cooldown, si c'est encore négatif, la séance sera juste plus longue que prévu (le TSS l'emporte).
            const warmup = phases.find(p => p.type === 'warmup');
            if (warmup && warmup.duration > Math.abs(extraDuration)) {
               warmup.duration += extraDuration;
            }
          }
        } else {
          // Fallback génération dynamique si aucun template
          phases.push({ type: 'warmup', duration: 15, intensityTss: 40, description: "Echauffement", rpe: 3 });
          const coreDuration = Math.max(15, durationMin - 30);
          
          if (type === 'VO2Max') {
            phases.push({
              type: 'intervals', duration: coreDuration, intensityTss: 110, repeats: Math.max(1, Math.floor(coreDuration / 5)), 
              workDuration: 3, workZone: 'Z5', workIntensity: 110, workRpe: 9, restDuration: 2, restZone: 'Z1', restIntensity: 50, restRpe: 2
            });
          } else if (type === 'Threshold' || type === 'SweetSpot') {
            phases.push({
              type: 'intervals', duration: coreDuration, intensityTss: 90, repeats: Math.max(1, Math.floor(coreDuration / 13)), 
              workDuration: 10, workZone: type === 'Threshold' ? 'Z4' : 'Z3', workIntensity: type === 'Threshold' ? 100 : 90, workRpe: 8, restDuration: 3, restZone: 'Z1', restIntensity: 50, restRpe: 2
            });
          } else {
            phases.push({ type: 'active', duration: coreDuration, intensityTss: Math.min(100, sessionTss), rpe: rpe, isHill: isHill });
          }
          phases.push({ type: 'cooldown', duration: 15, intensityTss: 40, description: "Retour au calme", rpe: 2 });
        }

        workouts.push({
          id: `w-${day.date.getTime()}-${day.offset}`,
          name: `${meso.phase} - ${template?.name || type}${isWeChoc && (idx === numSessions - 1 || idx === numSessions - 2) ? ' (WE CHOC)' : ''}`,
          date: day.date,
          totalTss: sessionTss,
          estimatedDuration: durationMin,
          type: type,
          sport: 'Run',
          terrain: isHill ? 'Technical Trail' : 'Flat',
          description: description,
          phases: phases,
          isTemplate: !!template
        });
      });
      
      // advance 1 week
      currentDate.setDate(currentDate.getDate() + 7);
      globalWeekIdx++;
    });
  });
  
  return workouts;
}
