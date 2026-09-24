export interface Athlete {
  id: string;
  name: string;
  vma: number; // Vitesse Maximale Aérobie (km/h)
  fcMax: number; // Fréquence Cardiaque Maximale
  fcRest: number; // Fréquence Cardiaque de Repos
  ftp: number; // Functional Threshold Power (if using Stryd or similar, optional)
  weight: number; // Poids (kg)
  currentCTL: number; // Chronic Training Load (Fitness)
  currentATL: number; // Acute Training Load (Fatigue)
  intervalsApiKey?: string; // Optionnel : clé API pour l'upload direct
  intervalsAthleteId?: string; // ID sur Intervals.icu
}

export type MesocyclePhase = 'Base' | 'Build' | 'Peak' | 'Taper' | 'Recovery';

export type TrainingDistribution = 'POLARIZED' | 'PYRAMIDAL' | 'THRESHOLD';
export type TargetModality = 'RPE' | 'HR' | 'POWER' | 'PACE' | 'ZONE';
export type SportType = 'Run' | 'Ride' | 'WeightTraining' | 'CrossTraining';
export type WorkoutFocus = 'Uphill' | 'Downhill' | 'Speed' | 'Endurance' | 'General';

export type IntensityZone = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5' | 'Z6'; // Z1: Récupération, Z2: Endurance, Z3: Tempo, Z4: Seuil, Z5: VO2Max, Z6: Anaérobie/SIT
export type WorkoutCategory = 'Recovery' | 'Endurance' | 'FatMax' | 'Tempo' | 'SweetSpot' | 'Threshold' | 'OverUnder' | 'VO2Max' | 'AnaerobicCapacity' | 'SIT' | 'Durability' | 'Long Run' | 'Strength';

export interface Mesocycle {
  id: string;
  name: string;
  phase: MesocyclePhase;
  weeks: number;
  targetTssPerWeek: number[]; // e.g. [300, 350, 400, 200]
}

export interface Macrocycle {
  id: string;
  athleteId: string;
  name: string;
  targetRaceDate: Date;
  targetDistance: number; // km
  targetElevation: number; // D+ en mètres
  mesocycles: Mesocycle[];
  startDate: Date;
}

export interface WorkoutPhase {
  type: 'warmup' | 'active' | 'recovery' | 'cooldown' | 'intervals';
  duration: number; // minutes
  intensityTss: number; // TSS/heure ciblé, ou intensité % (ex: 60)
  rpe?: number; // Rate of Perceived Exertion (1-10)
  description?: string;
  isHill?: boolean; // Spécifique Trail : travail en côte
  
  // Specific for 'intervals' type
  repeats?: number;
  workDuration?: number; // minutes
  workIntensity?: number; // % FTP ou Pace
  workZone?: IntensityZone;
  workRpe?: number;
  restDuration?: number; // minutes
  restIntensity?: number; // % FTP ou Pace
  restZone?: IntensityZone;
  restRpe?: number;
  
  // Nouveaux paramètres avancés
  cadenceTarget?: number; // rpm
  drainWPrime?: boolean; // vrai si l'objectif est d'épuiser la capacité anaérobie (W')
}

export interface Workout {
  id: string;
  name: string;
  date: Date;
  phases: WorkoutPhase[];
  totalTss: number;
  estimatedDuration: number;
  type: WorkoutCategory;
  terrain: 'Flat' | 'Hilly' | 'Technical Trail' | 'Indoor';
  sport: SportType;
  focus?: WorkoutFocus;
  description?: string; // Globale description of the session
  isTemplate?: boolean;
}

export interface WorkoutTemplate {
  id: string; // ex: 'ss-3x15'
  name: string; // ex: 'Sweet Spot 3x15'
  category: WorkoutCategory;
  sport: SportType;
  description: string;
  defaultDuration: number; // minutes
  defaultTss: number;
  phases: WorkoutPhase[];
  tags: string[]; // ex: ['durability', 'w-prime']
  author: string;
}

export type RacePriority = 'A' | 'B' | 'C' | 'Training';

export interface Race {
  id: string;
  name: string;
  date: Date;
  priority: RacePriority;
  isTarget: boolean; // Is it the main race where the plan ends?
  daysAway?: number; // Calculated dynamically
}

export type TargetType = 'Charge' | 'Durée' | 'Distance';

export interface ProgressionParams {
  mesocycleProgressionRate: number; // % increase between blocks
  intramesocycleProgressionRate: number; // % increase within block
  plateauThreshold: number; // % at which longest plans plateau
  recoveryVolumeReduction: number; // % reduction in volume during recovery week
  recoveryFrequency: number; // Every X weeks
}

export type PlanMode = 'RACE' | 'MANUAL';

export interface ManualPhases {
  base: number;
  build: number;
  peak: number;
  taper: number;
}

export interface PlanConfig {
  planName: string;
  hoursPerWeek: number;
  sports?: {id: string, name: string, hours: number}[];
  targetTypes: Record<TargetType, boolean>;
  startDate: string;
  startWithRecovery: boolean;
  races: Race[];
  progression: ProgressionParams;
  planMode?: PlanMode;
  manualPhases?: ManualPhases;
  
  // Nouveaux paramètres dynamiques
  sessionsPerWeek: number;
  availableDays: number[]; // 0=Dimanche, 1=Lundi, ..., 6=Samedi
  longRunDays: number[]; // Jours préférés pour les sorties longues
  distributionModel: TrainingDistribution;
  targetModality: TargetModality;
  includeHomeTrainer: boolean;
  includeStrength: boolean;
  weChocFrequency: number; // 0 = Jamais, 3 = Toutes les 3 semaines, etc.
  initialTss?: number; // Base TSS for the first week, derived from past activities
}

