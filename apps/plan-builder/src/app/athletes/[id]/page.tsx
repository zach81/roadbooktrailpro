"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { generateMacrocycle, generateWorkoutsForMacrocycle } from "@/lib/trainingEngine";
import { uploadWorkoutsToIntervals, fetchCoachedAthletes, deleteWorkoutsFromIntervals, fetchAthleteLoad, uploadPhasesToIntervals } from "@/lib/intervalsApi";
import { getAthletesFromFirebase, saveAthletesToFirebase, saveWorkoutTemplate, saveAthletePlan, getAthletePlans } from "@/lib/firebaseUtils";
import { Macrocycle, Workout } from "@/types";
import WorkoutEditorModal from "@/components/WorkoutEditorModal";
import WorkoutLibraryModal from "@/components/WorkoutLibraryModal";
import AiOptimizerModal from "@/components/AiOptimizerModal";
import WeeklyCalendar from "@/components/WeeklyCalendar";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area,
  ComposedChart,
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  PieChart, 
  Pie
} from "recharts";
import { Calendar, Activity, TrendingUp, Settings, Download, Trash2, Edit3, Database, ArrowLeft, Heart, Flame, Watch, Target, Mountain, Map, ShieldAlert, Zap, LayoutList, CalendarDays } from "lucide-react";

const generateDurabilityData = (stats: any) => {
  if (!stats) return [];
  const ctl = stats.ctl || 0;
  const ftp = stats.ftp || 200; // default lower ftp if none provided
  
  const normFtp = Math.min(1, ftp / 350);
  
  // On utilise le CTL pour définir le pic de la courbe en cloche
  // Plus le CTL est élevé, plus l'athlète est adapté aux longues distances.
  const getScore = (idealCtl: number) => {
    // Écart entre le CTL de l'athlète et le CTL idéal pour la distance
    const diff = Math.abs(ctl - idealCtl);
    // Pénalité qui augmente avec l'écart (ajusté pour que la courbe soit douce)
    const penalty = Math.max(0, diff / 70); 
    const matchMultiplier = Math.max(0, 1 - penalty);
    
    // Le score de base dépend de la vitesse (FTP) et du volume global (CTL)
    const basePerformance = 0.4 + (normFtp * 0.4) + (Math.min(1, ctl / 150) * 0.2);
    
    return Math.round(100 * basePerformance * (0.6 + 0.4 * matchMultiplier));
  };

  return [
    { distance: '5k', score: getScore(30), label: 'Vitesse pure' },
    { distance: '10k', score: getScore(50), label: 'Vitesse endurance' },
    { distance: 'Semi', score: getScore(70), label: 'Endurance critique' },
    { distance: 'Marathon', score: getScore(90), label: 'Endurance longue' },
    { distance: 'Ultra', score: getScore(110), label: 'Résistance' },
  ];
};

const generateDecouplingData = (stats: any) => {
  if (!stats) return { data: [], factor: 0 };
  const ctl = stats.ctl || 0;
  // Un débutant (CTL 30) pourrait avoir 8% de dérive. Un pro (CTL 120+) aura < 2%
  const decouplingFactor = Math.max(1.5, 10 - (ctl / 15)); 
  
  const data = [];
  for (let i = 0; i <= 120; i += 15) {
     const progress = i / 120;
     const power = 70; // Puissance constante à 70%
     const hr = 70 * (1 + (decouplingFactor / 100) * progress); // Dérive cardiaque
     data.push({
       time: `${i}m`,
       puissance: power,
       frequence_cardiaque: Number(hr.toFixed(1))
     });
  }
  return { data, factor: decouplingFactor.toFixed(1) };
};

const generateClimberProfile = (stats: any) => {
  if (!stats) return [];
  const ctl = stats.ctl || 30;
  const ftp = stats.ftp || 200;
  const weight = stats.weight || 70;
  
  const wKg = ftp / weight;
  
  // Approximation de la distribution normale (Percentile rank)
  // Renvoie une valeur entre 0 (pire) et 100 (meilleur)
  const zScoreToPercentile = (z: number) => {
    return 100 / (1 + Math.exp(-1.702 * z));
  };
  
  // Comparaison avec une "base de données" simulée d'athlètes amateurs/semi-pros
  // Z-Scores: (Valeur_Athlète - Moyenne_Population) / Ecart_Type_Population
  const zWkg = (wKg - 3.2) / 0.7; // Moyenne W/kg: 3.2, Ecart type: 0.7
  const zFtp = (ftp - 240) / 45;  // Moyenne FTP: 240W, Ecart type: 45W
  const zCtl = (ctl - 50) / 25;   // Moyenne CTL: 50, Ecart type: 25
  
  // Pondérations selon la pente
  // Faux Plat (3-5%) : Demande beaucoup de puissance brute (FTP) et d'endurance, l'impact du poids est faible
  const zFalseFlat = zFtp * 0.6 + zCtl * 0.4;
  
  // Pente Moyenne (8-10%) : Équilibre entre le rapport W/kg et l'endurance
  const zMedium = zWkg * 0.5 + zCtl * 0.5;
  
  // Pente Forte (15-20%) : Le rapport Poids/Puissance devient dominant
  const zSteep = zWkg * 0.8 + zCtl * 0.2;
  
  // Pente Extrême (+25%) : Pur rapport Poids/Puissance, la population moyenne s'effondre ici,
  // on durcit le Z-Score en exigeant un W/kg de 3.5 pour être à 50%
  const zExtreme = (wKg - 3.5) / 0.6;
  
  return [
    { slope: 'Faux Plat (3-5%)', efficiency: Math.round(zScoreToPercentile(zFalseFlat)), fill: '#3b82f6' },
    { slope: 'Moyenne (8-10%)', efficiency: Math.round(zScoreToPercentile(zMedium)), fill: '#8b5cf6' },
    { slope: 'Forte (15-20%)', efficiency: Math.round(zScoreToPercentile(zSteep)), fill: '#f43f5e' },
    { slope: 'Extrême (+25%)', efficiency: Math.round(zScoreToPercentile(zExtreme)), fill: '#f97316' },
  ];
};

// --- NOUVELLES FONCTIONS DE DONNÉES TRAIL RUNNING ---

const generateAthleteRadar = (stats: any, id: string) => {
  if (!stats) return [];
  const ctl = stats.ctl || 30;
  const ftp = stats.ftp || 200;
  const weight = stats.weight || 70;
  
  const wKg = ftp / weight;
  
  // Utiliser l'ID pour avoir un peu de variance "aléatoire" mais fixe par athlète
  const seed = (id.charCodeAt(0) || 100) + (id.charCodeAt(id.length - 1) || 100);
  const variance = (seed % 20) - 10; // -10 à +10
  
  const zScoreToPercentile = (z: number) => 100 / (1 + Math.exp(-1.702 * z));
  
  const grimpeurScore = zScoreToPercentile((wKg - 3.2) / 0.7);
  const enduranceScore = zScoreToPercentile((ctl - 50) / 25);
  const vitesseScore = zScoreToPercentile((ftp - 240) / 45);
  
  // Traits simulés
  const descendeurScore = Math.min(100, Math.max(0, 60 + variance * 1.5 + (ctl / 4)));
  const techniciteScore = Math.min(100, Math.max(0, 50 - variance * 2));
  const mentalScore = Math.min(100, Math.max(0, 70 + (ctl / 5) + variance));
  
  return [
    { subject: 'Grimpeur', A: Math.round(grimpeurScore), fullMark: 100 },
    { subject: 'Descendeur', A: Math.round(descendeurScore), fullMark: 100 },
    { subject: 'Endurance', A: Math.round(enduranceScore), fullMark: 100 },
    { subject: 'Technicité', A: Math.round(techniciteScore), fullMark: 100 },
    { subject: 'Vitesse', A: Math.round(vitesseScore), fullMark: 100 },
    { subject: 'Mental', A: Math.round(mentalScore), fullMark: 100 },
  ];
};

const generateDescenderProfile = (stats: any, id: string) => {
  if (!stats) return [];
  const ctl = stats.ctl || 30;
  const seed = (id.charCodeAt(0) || 100);
  const isTechnical = seed % 2 === 0;
  
  const baseResistance = Math.min(100, ctl * 0.8 + 20); // Plus on s'entraine, plus les fibres tiennent
  
  return [
    { slope: 'Roulante (-5%)', efficiency: Math.min(100, Math.round(baseResistance + (isTechnical ? 5 : 15))), fill: '#34d399' },
    { slope: 'Technique (-15%)', efficiency: Math.min(100, Math.round(baseResistance * (isTechnical ? 1.1 : 0.7))), fill: '#10b981' },
    { slope: 'Extrême (-25%)', efficiency: Math.min(100, Math.round(baseResistance * (isTechnical ? 0.9 : 0.4))), fill: '#059669' },
  ];
};

const generateFatigueCurve = (stats: any) => {
  if (!stats) return [];
  const ctl = stats.ctl || 30;
  
  // Perte de VAM sur le long terme : un pro perd 10% en 10h, un amateur 40%
  const degradationRate = Math.max(0.05, 0.4 - (ctl / 300));
  
  return [
    { heure: '1h', vam: 100 },
    { heure: '3h', vam: Math.round(100 * (1 - degradationRate * 0.2)) },
    { heure: '5h', vam: Math.round(100 * (1 - degradationRate * 0.5)) },
    { heure: '10h', vam: Math.round(100 * (1 - degradationRate)) },
  ];
};

const generateTerrainDistribution = (stats: any, id: string) => {
  const seed = (id.charCodeAt(id.length - 1) || 100);
  const route = 20 + (seed % 30);
  const montagne = 15 + ((seed * 2) % 40);
  const sentier = 100 - route - montagne;
  
  return [
    { name: 'Route', value: route, color: '#94a3b8' },
    { name: 'Sentier', value: sentier, color: '#f59e0b' },
    { name: 'Montagne', value: montagne, color: '#ef4444' },
  ];
};

export default function AthletePlanner() {
  const params = useParams();
  const router = useRouter();
  const athleteId = params.id as string;

  const [selectedAthlete, setSelectedAthlete] = useState(athleteId);
  const [athleteStats, setAthleteStats] = useState<any>(null);
  const [plan, setPlan] = useState<Macrocycle | null>(null);
  const [planConfig, setPlanConfig] = useState<any>(null);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const [viewMode, setViewMode] = useState<"LIST" | "CALENDAR">("CALENDAR");
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [libraryTypeFilter, setLibraryTypeFilter] = useState('');
  const [exportStatus, setExportStatus] = useState("");
  const [showExportConfig, setShowExportConfig] = useState(false);
  const [intervalsAthleteId, setIntervalsAthleteId] = useState("");
  const [intervalsApiKey, setIntervalsApiKey] = useState("");
  const [configPendingAction, setConfigPendingAction] = useState<"EXPORT" | "FETCH" | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isGeneratingMoreAi, setIsGeneratingMoreAi] = useState(false);
  const [savedPlans, setSavedPlans] = useState<any[]>([]);

  const initialMockAthletes = [
    { id: "athlete-1", name: "Jean Dupont (UTMB)" },
    { id: "athlete-2", name: "Marie Curie (Templiers)" },
    { id: "athlete-3", name: "Kilian J. (Zegama)" },
  ];
  
  const [athletes, setAthletes] = useState(initialMockAthletes);
  const [isFetchingAthletes, setIsFetchingAthletes] = useState(false);

  useEffect(() => {
    const storedId = localStorage.getItem("intervalsAthleteId");
    const storedKey = localStorage.getItem("intervalsApiKey");
    if (storedId) setIntervalsAthleteId(storedId);
    if (storedKey) setIntervalsApiKey(storedKey);

    const initAthletes = async () => {
      if (storedId) {
        // Load from Firebase first
        const cachedAthletes = await getAthletesFromFirebase(storedId);
        let currentAthletes = cachedAthletes || [];
        
        if (currentAthletes.length > 0) {
          setAthletes(currentAthletes);
          const found = currentAthletes.find((a: any) => a.id === athleteId);
          if (found) setAthleteStats(found);
        }

        if (storedKey) {
          try {
            // Fetch load specifically for this athlete to have fresh data
            let load = null;
            if (athleteId === storedId) {
                // To fetch coach's own load, we need to bypass coaching check if needed, but fetchAthleteLoad handles it
                load = await fetchAthleteLoad(athleteId, storedKey);
            } else {
                // It's an athlete, we can use fetchAthleteLoad
                load = await fetchAthleteLoad(athleteId, storedKey);
            }
            
            // Also fetch all athletes to update the list/names in background if needed
            const data = await fetchCoachedAthletes(storedId, storedKey);
            if (Array.isArray(data) && data.length > 0) {
              const fetchedAthletes = data.map((a: any, index: number) => {
                const id = a.id || a.athlete?.id || a.athlete_id || `unknown-${index}`;
                const name = a.athlete_name || a.name || a.athlete?.name || (a.firstname ? `${a.firstname} ${a.lastname || ''}`.trim() : `Athlète ${index + 1}`);
                const ctl = Math.round(a.fitness ?? a.ctl ?? a.icu?.ctl ?? 0);
                const atl = Math.round(a.fatigue ?? a.atl ?? a.icu?.atl ?? 0);
                const form = Math.round(a.form ?? a.icu?.form ?? (ctl - atl));
                return { id, name, ctl, atl, form };
              });
              
              if (!fetchedAthletes.find((a: any) => a.id === storedId)) {
                fetchedAthletes.unshift({ id: storedId, name: "Moi", ctl: 0, atl: 0, form: 0 }); 
              }
              
              setAthletes(fetchedAthletes);
              await saveAthletesToFirebase(storedId, fetchedAthletes);
              
              const currentAthleteData = fetchedAthletes.find((a: any) => a.id === athleteId);
              if (currentAthleteData) {
                  // Merge with specific load data if available
                  const mergedData = {
                      ...currentAthleteData,
                      ctl: load?.ctl !== undefined ? Math.round(load.ctl) : currentAthleteData.ctl,
                      atl: load?.atl !== undefined ? Math.round(load.atl) : currentAthleteData.atl,
                      form: load?.form !== undefined ? Math.round(load.form) : currentAthleteData.form,
                      ftp: load?.ftp,
                      weight: load?.weight,
                      restingHR: load?.restingHR,
                      thresholdPace: load?.thresholdPace,
                  };
                  setAthleteStats(mergedData);
              }
            }
          } catch (e) {
            console.error("Erreur de synchronisation", e);
          }
        }
        
        // Charger les plans sauvegardés
        if (storedId) {
          const plans = await getAthletePlans(storedId, athleteId as string);
          setSavedPlans(plans);
        }
      }
    };

    initAthletes();
  }, [athleteId]);

  useEffect(() => {
    // Automatically load newly generated plan from the Coach Page
    const latestPlanStr = localStorage.getItem(`latestPlan_${athleteId}`);
    if (latestPlanStr) {
      try {
        const latestPlan = JSON.parse(latestPlanStr);
        setPlan(latestPlan.macrocycle);
        setPlanConfig(latestPlan.config);
        
        const parsedWorkouts = (latestPlan.workouts || []).map((w: any) => ({
          ...w,
          date: new Date(w.date)
        }));
        setWorkouts(parsedWorkouts);
        
        // Clear to avoid reloading on refresh
        localStorage.removeItem(`latestPlan_${athleteId}`);
      } catch (e) {
        console.error("Error loading latest plan", e);
      }
    }
  }, [athleteId]);

  const saveConfig = () => {
    localStorage.setItem("intervalsAthleteId", intervalsAthleteId);
    localStorage.setItem("intervalsApiKey", intervalsApiKey);
    setShowExportConfig(false);
    
    if (configPendingAction === "EXPORT") {
      handleExport();
    } else if (configPendingAction === "FETCH") {
      handleFetchAthletes();
    }
    setConfigPendingAction(null);
  };

  const handleFetchAthletes = async () => {
    if (!intervalsAthleteId || !intervalsApiKey) {
      setConfigPendingAction("FETCH");
      setShowExportConfig(true);
      return;
    }

    setIsFetchingAthletes(true);
    try {
      const data = await fetchCoachedAthletes(intervalsAthleteId, intervalsApiKey);
      if (Array.isArray(data) && data.length > 0) {
        // Map intervals.icu athletes to our format
        const fetchedAthletes = data.map((a: any, index: number) => {
          const id = a.id || a.athlete?.id || a.athlete_id || `unknown-${index}`;
          const name = a.athlete_name || a.name || a.athlete?.name || (a.firstname ? `${a.firstname} ${a.lastname || ''}`.trim() : `Athlète ${index + 1}`);
          const ctl = Math.round(a.fitness ?? a.ctl ?? a.icu?.ctl ?? 0);
          const atl = Math.round(a.fatigue ?? a.atl ?? a.icu?.atl ?? 0);
          const form = Math.round(a.form ?? a.icu?.form ?? (ctl - atl));
          return { id, name, ctl, atl, form };
        });
        
        if (!fetchedAthletes.find((a: any) => a.id === intervalsAthleteId)) {
          fetchedAthletes.unshift({ id: intervalsAthleteId, name: "Moi", ctl: 0, atl: 0, form: 0 });
        }
        
        setAthletes(fetchedAthletes);
        setSelectedAthlete(fetchedAthletes[0].id);
        
        // Save to Firebase
        await saveAthletesToFirebase(intervalsAthleteId, fetchedAthletes);
        
        alert("Athlètes synchronisés avec succès !");
      } else {
        alert("Aucun athlète trouvé ou format inattendu.");
      }
    } catch (e: any) {
      alert("Erreur lors de la récupération des athlètes: " + e.message);
    } finally {
      setIsFetchingAthletes(false);
    }
  };

  // Advanced generation replaces the basic handleGenerate

  // Prepare chart data
  let currentWeekDate = new Date(plan?.startDate || new Date());
  
  const durabilityData = generateDurabilityData(athleteStats || athletes.find(a => a.id === athleteId));
  const idealDistance = durabilityData.length > 0 
    ? durabilityData.reduce((prev, current) => (prev.score > current.score) ? prev : current)
    : null;
    
  const decoupling = generateDecouplingData(athleteStats || athletes.find(a => a.id === athleteId));
  const climberProfile = generateClimberProfile(athleteStats || athletes.find(a => a.id === athleteId));

  const athleteObj = athleteStats || athletes.find(a => a.id === athleteId);
  const radarData = generateAthleteRadar(athleteObj, athleteId);
  const descenderProfile = generateDescenderProfile(athleteObj, athleteId);
  const fatigueCurve = generateFatigueCurve(athleteObj);
  const terrainDistribution = generateTerrainDistribution(athleteObj, athleteId);

  const chartData = plan?.mesocycles.flatMap((meso) =>
    meso.targetTssPerWeek.map((tss, idx) => {
      const dateStr = currentWeekDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      currentWeekDate.setDate(currentWeekDate.getDate() + 7);
      return {
        name: `${meso.phase} W${idx + 1}`,
        date: dateStr,
        tss: Math.round(tss),
        phase: meso.phase,
        dPlus: Math.round(tss * (meso.phase === 'Build' || meso.phase === 'Peak' ? 15 : 8)),
      }
    })
  ) || [];

  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'Base': return '#4ade80';
      case 'Build': return '#3b82f6';
      case 'Peak': return '#f59e0b';
      case 'Taper': return '#fcd34d';
      case 'Recovery': return '#9ca3af';
      default: return '#4ade80';
    }
  };

  const getWorkoutColor = (type: string) => {
    switch (type) {
      case 'VO2Max': return '#ef4444';
      case 'Tempo': 
      case 'Threshold': return '#f59e0b';
      case 'Endurance': 
      case 'Long Run': return '#3b82f6';
      case 'Recovery': return '#10b981';
      case 'Strength': return '#8b5cf6';
      default: return '#9ca3af';
    }
  };

  const handleSaveWorkout = (updatedWorkout: Workout) => {
    setWorkouts(prev => {
      const exists = prev.some(w => w.id === updatedWorkout.id);
      if (exists) {
        return prev.map(w => w.id === updatedWorkout.id ? updatedWorkout : w);
      } else {
        return [...prev, updatedWorkout].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }
    });
    setEditingWorkout(null);
  };

  const handleWorkoutMove = async (workoutId: string, newDate: Date) => {
    setWorkouts(prev => prev.map(w => w.id === workoutId ? { ...w, date: newDate } : w));
    
    if (intervalsAthleteId && intervalsApiKey) {
      const movedWorkout = workouts.find(w => w.id === workoutId);
      if (movedWorkout) {
        try {
          const workoutToUpload = { ...movedWorkout, date: newDate };
          await uploadWorkoutsToIntervals(intervalsAthleteId, intervalsApiKey, [workoutToUpload]);
        } catch (e) {
          console.error("Failed to update workout on Intervals.icu", e);
        }
      }
    }
  };

  const handleAddWorkout = (date: Date) => {
    const newEmptyWorkout: Workout = {
       id: `new-${Date.now()}`,
       name: "Nouvelle séance",
       type: "Endurance",
       date: date,
       phases: [],
       estimatedDuration: 0,
       totalTss: 0,
       terrain: "Flat",
       sport: "Run"
    };
    
    setEditingWorkout(newEmptyWorkout);
  };

  const handleSaveAsTemplate = async (workout: Workout) => {
    if (!intervalsAthleteId) {
      alert("ID Coach manquant pour sauvegarder un template.");
      return;
    }
    try {
      await saveWorkoutTemplate(intervalsAthleteId, workout);
      alert("Template sauvegardé avec succès dans la bibliothèque !");
    } catch (e) {
      alert("Erreur lors de la sauvegarde du template.");
    }
  };

  const handleLibrarySelect = (template: Workout) => {
    if (editingWorkout) {
      // Replace current workout properties but keep date and ID
      const updatedWorkout = {
        ...template,
        id: editingWorkout.id,
        date: editingWorkout.date,
        name: template.name, // Take the template name
      };
      setEditingWorkout(updatedWorkout);
      setIsLibraryOpen(false);
    }
  };

  const handleSavePlanToFirebase = async () => {
    if (!intervalsAthleteId || !plan) {
      alert("Veuillez configurer votre compte (Intervals API) pour avoir un ID Coach.");
      return;
    }
    setExportStatus("Sauvegarde dans Firebase...");
    try {
      await saveAthletePlan(intervalsAthleteId, selectedAthlete, {
        macrocycle: plan,
        workouts: workouts,
        config: planConfig
      });
      setExportStatus("Plan sauvegardé dans la base !");
      setTimeout(() => setExportStatus(""), 3000);
    } catch (e: any) {
      setExportStatus("");
      alert("Erreur de sauvegarde: " + e.message);
    }
  };

  const handleAdvancedGenerate = async (config: any) => {
    const newPlan = generateMacrocycle(selectedAthlete, config);
    setPlan(newPlan);
    setPlanConfig(config);
    
    // Si on a des instructions IA, on génère les 4 premières semaines
    if (config.aiNotes) {
      setIsGeneratingAi(true);
      try {
        const response = await fetch('/api/generate-workouts', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
              macrocycle: newPlan,
              config,
              weeksToGenerate: 4
           })
        });
        
        if (!response.ok) {
           const errData = await response.json().catch(() => ({}));
           throw new Error(`Erreur de l'API IA: ${errData.error || response.statusText}`);
        }
        
        const data = await response.json();
        if (data.workouts) {
           const parsedWorkouts = data.workouts.map((w: any) => ({
             ...w,
             date: new Date(w.date)
           }));
           setWorkouts(parsedWorkouts);
        }
      } catch (e) {
        console.error(e);
        alert("Erreur lors de la génération IA, génération déterministe par défaut...");
        const newWorkouts = await generateWorkoutsForMacrocycle(newPlan, config);
        setWorkouts(newWorkouts);
      } finally {
        setIsGeneratingAi(false);
      }
    } else {
      const newWorkouts = await generateWorkoutsForMacrocycle(newPlan, config);
      setWorkouts(newWorkouts);
    }
  };

  const handleGenerateMoreAI = async (weeksToGenerate: number) => {
    if (!plan || !planConfig || workouts.length === 0) return;
    setIsGeneratingMoreAi(true);
    
    // Find the latest workout date
    const maxDateStr = workouts.reduce((max, w) => w.date > max ? w.date : max, workouts[0].date);
    const nextStartDate = new Date(maxDateStr);
    nextStartDate.setDate(nextStartDate.getDate() + 1); // Start next day

    try {
      const response = await fetch('/api/generate-workouts', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            macrocycle: plan,
            config: planConfig,
            weeksToGenerate,
            startDate: nextStartDate.toISOString()
         })
      });
      
      if (!response.ok) {
         const errData = await response.json().catch(() => ({}));
         throw new Error(`Erreur de l'API IA: ${errData.error || response.statusText}`);
      }
      
      const data = await response.json();
      if (data.workouts) {
         const parsedWorkouts = data.workouts.map((w: any) => ({
           ...w,
           date: new Date(w.date)
         }));
         setWorkouts((prev) => [...prev, ...parsedWorkouts]);
      }
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la génération IA pour la suite du plan.");
    } finally {
      setIsGeneratingMoreAi(false);
    }
  };

  const handleExport = async () => {
    if (!intervalsAthleteId || !intervalsApiKey) {
      setConfigPendingAction("EXPORT");
      setShowExportConfig(true);
      return;
    }
    
    if (!plan || !planConfig) return;
    
    const weeksToExportStr = window.prompt("Combien de semaines voulez-vous exporter ? (Laissez vide pour exporter tout le plan)", "");
    
    setExportStatus("Génération des entraînements...");
    try {
      let workoutsToExport = workouts;
      let weeksToExport: number | undefined = undefined;
      let planStartDateObj = new Date(plan.startDate);
      if (isNaN(planStartDateObj.getTime()) && workouts.length > 0) {
        planStartDateObj = new Date(workouts[0].date);
      }
      
      if (weeksToExportStr && !isNaN(parseInt(weeksToExportStr))) {
        weeksToExport = parseInt(weeksToExportStr);
        // Filtre les entraînements qui tombent dans les X premières semaines
        const startDateMs = planStartDateObj.getTime();
        const maxDate = startDateMs + (weeksToExport * 7 * 24 * 60 * 60 * 1000);
        workoutsToExport = workouts.filter(w => new Date(w.date).getTime() <= maxDate);
      }
      
      setExportStatus("Exportation en cours (entraînements)...");
      await uploadWorkoutsToIntervals(intervalsAthleteId, intervalsApiKey, workoutsToExport);
      setExportStatus("Exportation en cours (phases)...");
      
      // Assurer que le plan envoyé à uploadPhasesToIntervals a une startDate valide
      const planToUpload = { ...plan, startDate: planStartDateObj.toISOString() };
      await uploadPhasesToIntervals(intervalsAthleteId, intervalsApiKey, planToUpload, weeksToExport);
      setExportStatus("Plan exporté avec succès vers Intervals.icu !");
      setTimeout(() => setExportStatus(""), 3000);
    } catch (e: any) {
      setExportStatus("");
      alert("Erreur lors de l'exportation: " + e.message);
    }
  };

  const handleDeleteExport = async () => {
    if (!intervalsAthleteId || !intervalsApiKey) {
      setConfigPendingAction("EXPORT");
      setShowExportConfig(true);
      return;
    }
    
    if (!plan || !planConfig) return;
    
    if (!confirm("Voulez-vous vraiment supprimer les entraînements de ce plan sur Intervals.icu ?")) {
      return;
    }

    setExportStatus("Suppression en cours...");
    try {
      await deleteWorkoutsFromIntervals(intervalsAthleteId, intervalsApiKey, workouts);
      setExportStatus("Plan supprimé avec succès d'Intervals.icu !");
      setTimeout(() => setExportStatus(""), 3000);
    } catch (e: any) {
      setExportStatus("");
      alert("Erreur lors de la suppression: " + e.message);
    }
  };

  return (
    <div className="py-0 md:py-4">
      <div className="space-y-8">
        
        {/* Header / Controls */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push('/')}
              className="btn btn-secondary px-3 py-2"
              title="Retour aux athlètes"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-[2rem] font-bold text-[var(--text-primary)] m-0 leading-tight">
                {athleteStats ? athleteStats.name : "Athlète"}
              </h1>
              <p className="text-[var(--text-secondary)] mt-1 text-sm font-medium">Profil & Planification</p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">

            <button
              type="button"
              onClick={handleFetchAthletes}
              disabled={isFetchingAthletes}
              className={`btn btn-secondary ${isFetchingAthletes ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Synchroniser les athlètes depuis Intervals.icu"
            >
              <svg className={`w-5 h-5 ${isFetchingAthletes ? 'lucide-spin text-[var(--color-primary)]' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
            </button>
            
            <button
              type="button"
              onClick={() => router.push(`/athletes/${athleteId}/coach`)}
              className="btn btn-primary w-full sm:w-auto"
            >
              <Settings size={18} />
              Générateur de Plan IA
            </button>
          </div>
        </header>

        {/* Profil de l'athlète (Dashboard Premium Layout) */}
        {athleteStats && (
          <div className="flex flex-col gap-6 mb-8">
            {/* Top Row: Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Form Metrics */}
              <div className="card p-0 overflow-hidden md:col-span-2">
                <div className="p-5 bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)]">
                  <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 m-0">
                    <Activity size={20} className="text-[var(--color-primary)]" />
                    Métriques de forme
                  </h3>
                </div>
                <div className="p-6 grid grid-cols-3 gap-4 text-center bg-[var(--bg-surface)]">
                  <div>
                    <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Fitness (CTL)</p>
                    <div className="text-4xl font-black text-blue-600">{athleteStats.ctl}</div>
                  </div>
                  <div className="relative before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-px before:bg-[var(--border-subtle)] after:content-[''] after:absolute after:right-0 after:top-2 after:bottom-2 after:w-px after:bg-[var(--border-subtle)]">
                    <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Fatigue (ATL)</p>
                    <div className="text-4xl font-black text-indigo-500">{athleteStats.atl}</div>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Forme (TSB)</p>
                    <div className={`text-4xl font-black ${athleteStats.form < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {athleteStats.form > 0 ? '+' : ''}{athleteStats.form}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Physical Traits */}
              <div className="card p-0 overflow-hidden md:col-span-1">
                <div className="p-5 bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)]">
                  <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 m-0">
                    <Zap size={20} className="text-[var(--color-primary)]" />
                    Physiologie
                  </h3>
                </div>
                <div className="p-4 grid grid-cols-2 gap-px bg-[var(--border-subtle)] h-full">
                  <div className="bg-[var(--bg-surface)] p-4 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1 text-[var(--text-muted)] mb-1"><Flame size={14} /><span className="text-[10px] uppercase font-bold tracking-wide">FTP</span></div>
                    <span className="font-bold text-lg text-[var(--text-primary)]">{athleteStats.ftp ? `${athleteStats.ftp} W` : '-'}</span>
                  </div>
                  <div className="bg-[var(--bg-surface)] p-4 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1 text-[var(--text-muted)] mb-1"><Heart size={14} /><span className="text-[10px] uppercase font-bold tracking-wide">FC Repos</span></div>
                    <span className="font-bold text-lg text-[var(--text-primary)]">{athleteStats.restingHR ? `${athleteStats.restingHR} bpm` : '-'}</span>
                  </div>
                  <div className="bg-[var(--bg-surface)] p-4 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1 text-[var(--text-muted)] mb-1"><Watch size={14} /><span className="text-[10px] uppercase font-bold tracking-wide">Seuil</span></div>
                    <span className="font-bold text-lg text-[var(--text-primary)]">{athleteStats.thresholdPace ? `${(athleteStats.thresholdPace/60).toFixed(2).replace('.',':')} /km` : '-'}</span>
                  </div>
                  <div className="bg-[var(--bg-surface)] p-4 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1 text-[var(--text-muted)] mb-1"><Activity size={14} /><span className="text-[10px] uppercase font-bold tracking-wide">Poids</span></div>
                    <span className="font-bold text-lg text-[var(--text-primary)]">{athleteStats.weight ? `${athleteStats.weight} kg` : '-'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Dashboard Grid for Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Radar Chart */}
              <div className="card p-6 flex flex-col">
                <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 mb-6 m-0">
                  <Target size={20} className="text-[var(--color-primary)]" /> Profil Global
                </h3>
                <div className="h-[250px] w-full flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="Athlete" dataKey="A" stroke="#6366f1" strokeWidth={2} fill="#818cf8" fillOpacity={0.5} />
                      <Tooltip formatter={(value: any) => [`${value}/100`, "Score"]} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Durability Chart */}
              {durabilityData.length > 0 && (
                <div className="card p-6 flex flex-col">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 m-0">
                      <Mountain size={20} className="text-[var(--color-primary)]" /> Durabilité
                    </h3>
                    {idealDistance && (
                      <div className="bg-purple-50 px-3 py-1 rounded-lg border border-purple-100 flex items-center gap-2">
                        <span className="text-xs text-purple-600 font-bold uppercase tracking-wide">Idéal :</span>
                        <span className="text-sm font-black text-purple-700">{idealDistance.distance}</span>
                      </div>
                    )}
                  </div>
                  <div className="h-[250px] w-full flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={durabilityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="distance" stroke="#9ca3af" tick={{fontSize: 12, fill: '#64748b', fontWeight: 500}} axisLine={false} tickLine={false} dy={10} />
                        <YAxis domain={[0, 100]} stroke="#9ca3af" tick={{fontSize: 12, fill: '#64748b', fontWeight: 500}} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#0f172a', fontWeight: 700 }} formatter={(value: any, name: any, props: any) => [`${value} pts`, props.payload.label]} labelFormatter={(label) => `Distance : ${label}`} />
                        <Area type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Decoupling Chart */}
              {decoupling.data.length > 0 && (
                <div className="card p-6 flex flex-col">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 m-0">
                      <Activity size={20} className="text-[var(--color-primary)]" /> Test Aérobie
                    </h3>
                    <div className="bg-rose-50 px-3 py-1 rounded-lg border border-rose-100 flex items-center gap-2">
                      <span className="text-xs text-rose-600 font-bold uppercase tracking-wide">Dérive :</span>
                      <span className="text-sm font-black text-rose-700">+{decoupling.factor}%</span>
                    </div>
                  </div>
                  <div className="h-[250px] w-full flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={decoupling.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="time" stroke="#9ca3af" tick={{fontSize: 12, fill: '#64748b', fontWeight: 500}} axisLine={false} tickLine={false} dy={10} />
                        <YAxis yAxisId="left" domain={[60, 90]} stroke="#9ca3af" tick={{fontSize: 12, fill: '#64748b', fontWeight: 500}} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" domain={[60, 90]} hide />
                        <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#0f172a', fontWeight: 700 }} labelFormatter={(label) => `Temps : ${label}`} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 600, paddingTop: '10px' }} />
                        <Line yAxisId="left" type="monotone" name="FC (%)" dataKey="frequence_cardiaque" stroke="#f43f5e" strokeWidth={3} dot={false} activeDot={{r: 6}} />
                        <Line yAxisId="right" type="stepAfter" name="Puissance (%)" dataKey="puissance" stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Climber Profile */}
              {climberProfile.length > 0 && (
                <div className="card p-6 flex flex-col">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 m-0">
                      <TrendingUp size={20} className="text-[var(--color-primary)]" /> Profil Grimpeur
                    </h3>
                    <div className="bg-orange-50 px-3 py-1 rounded-lg border border-orange-100 flex items-center gap-2">
                      <span className="text-xs text-orange-600 font-bold uppercase tracking-wide">Spécialité :</span>
                      <span className="text-sm font-black text-orange-700">
                        {climberProfile.reduce((prev, current) => (prev.efficiency > current.efficiency) ? prev : current).slope.split(' ')[0]}
                      </span>
                    </div>
                  </div>
                  <div className="h-[250px] w-full flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={climberProfile} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="slope" stroke="#9ca3af" tick={{fontSize: 10, fill: '#64748b', fontWeight: 500}} axisLine={false} tickLine={false} dy={10} />
                        <YAxis domain={[0, 100]} stroke="#9ca3af" tick={{fontSize: 12, fill: '#64748b', fontWeight: 500}} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#0f172a', fontWeight: 700 }} formatter={(value: any) => [`${value}/100`, "Efficacité"]} />
                        <Bar dataKey="efficiency" radius={[4, 4, 0, 0]} maxBarSize={50}>
                          {climberProfile.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Fatigue Curve */}
              {fatigueCurve.length > 0 && (
                <div className="card p-6 flex flex-col">
                  <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 mb-6 m-0">
                    <ShieldAlert size={20} className="text-[var(--color-primary)]" /> Résistance (Fatigue)
                  </h3>
                  <div className="h-[250px] w-full flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={fatigueCurve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="heure" stroke="#9ca3af" tick={{fontSize: 12, fill: '#64748b', fontWeight: 500}} axisLine={false} tickLine={false} dy={10} />
                        <YAxis domain={[60, 100]} stroke="#9ca3af" tick={{fontSize: 12, fill: '#64748b', fontWeight: 500}} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#0f172a', fontWeight: 700 }} formatter={(value: any) => [`${value}%`, "VAM Maintenue"]} />
                        <Line type="monotone" dataKey="vam" stroke="#f43f5e" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Terrain Distribution */}
              {terrainDistribution.length > 0 && (
                <div className="card p-6 flex flex-col">
                  <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 mb-2 m-0">
                    <Map size={20} className="text-[var(--color-primary)]" /> Répartition Terrain
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">Suggestions basées sur le profil.</p>
                  <div className="h-[250px] w-full flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={terrainDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                          {terrainDistribution.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#0f172a', fontWeight: 700 }} formatter={(value: any) => [`${value}%`, "Proportion"]} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 600, paddingTop: '10px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* Main View / Chart */}
        <main>
          {plan ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
                <div className="card p-6 flex flex-col justify-center">
                  <p className="text-[var(--text-secondary)] text-sm font-medium">Fin du plan</p>
                  <p className="text-xl font-extrabold text-[var(--text-primary)] mt-1">
                    {new Date(plan.targetRaceDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric'})}
                  </p>
                </div>
                <div className="card p-6 flex flex-col justify-center">
                  <p className="text-[var(--text-secondary)] text-sm font-medium">TSS Max Prévu</p>
                  <p className="text-2xl font-extrabold text-blue-600 mt-1">
                    {Math.max(...chartData.map(d => d.tss))}
                  </p>
                </div>
                <div className="card p-6 flex flex-col justify-center">
                  <p className="text-[var(--text-secondary)] text-sm font-medium">Charge Totale (TSS)</p>
                  <p className="text-2xl font-extrabold text-blue-500 mt-1">
                    {chartData.reduce((acc, d) => acc + d.tss, 0)}
                  </p>
                </div>
              </div>

              <div className="card p-6 md:p-8 h-[500px] flex flex-col">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                  <h3 className="text-xl font-bold flex items-center gap-2 text-[var(--text-primary)] m-0">
                    <TrendingUp size={24} className="text-[var(--color-primary)]" /> Évolution de la Charge (TSS)
                  </h3>
                  <div className="flex items-center gap-4">
                    {exportStatus && <span className="text-emerald-600 text-sm font-semibold bg-emerald-50 px-3 py-1 rounded-full">{exportStatus}</span>}
                    <button 
                      onClick={handleDeleteExport}
                      className="btn btn-secondary !text-red-500 hover:!text-red-600 !border-red-200 hover:!border-red-300 px-3"
                      title="Supprimer ce plan d'Intervals.icu"
                    >
                      <Trash2 size={16} /> 
                    </button>
                    <button 
                      onClick={handleSavePlanToFirebase}
                      className="btn btn-secondary"
                      title="Sauvegarder dans la base de données"
                    >
                      <Database size={16} /> Sauvegarder
                    </button>
                    <button 
                      onClick={() => setIsAiModalOpen(true)}
                      className="btn btn-primary"
                    >
                      <Zap size={16} /> Optimiser avec l'IA
                    </button>
                    {isGeneratingAi && (
                      <span className="text-sm font-semibold text-[var(--color-primary)] flex items-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                        Génération IA en cours...
                      </span>
                    )}
                    <button 
                      onClick={handleExport}
                      className="btn btn-secondary"
                    >
                      <Download size={16} /> Exporter
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 min-h-0 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        stroke="#9ca3af" 
                        tick={{fontSize: 12, fill: '#64748b', fontWeight: 500}} 
                        axisLine={false} 
                        tickLine={false} 
                        dy={10}
                      />
                      <YAxis 
                        yAxisId="left"
                        stroke="#9ca3af" 
                        tick={{fontSize: 12, fill: '#64748b', fontWeight: 500}} 
                        axisLine={false} 
                        tickLine={false} 
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        stroke="#9ca3af" 
                        tick={{fontSize: 12, fill: '#64748b', fontWeight: 500}} 
                        axisLine={false} 
                        tickLine={false}
                        hide 
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', padding: '12px 16px' }}
                        itemStyle={{ color: '#0f172a', fontWeight: 700, fontSize: '14px' }}
                        cursor={{fill: '#f8fafc'}}
                        formatter={(value: any, name: any, props: any) => {
                          if (name === "tss") return [`${value} TSS`, props.payload.name];
                          if (name === "dPlus") return [`${value} m`, "D+ Estimé"];
                          return [value, name];
                        }}
                        labelFormatter={(label) => `Semaine du ${label}`}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '14px', fontWeight: 600, paddingTop: '10px' }} />
                      <Bar yAxisId="left" name="TSS" dataKey="tss" radius={[4, 4, 0, 0]} maxBarSize={60}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={getPhaseColor(entry.phase)} />
                        ))}
                      </Bar>
                      <Line yAxisId="right" type="monotone" name="D+ Estimé" dataKey="dPlus" stroke="#10b981" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Affichage des entraînements */}
              {workouts.length > 0 && (
                <div className="card p-6 md:p-8 mt-8">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2 m-0">
                      <Calendar size={24} className="text-[var(--color-primary)]" /> Détail des séances ({workouts.length})
                    </h3>
                    
                    <div className="flex bg-[var(--bg-surface-elevated)] p-1 rounded-lg">
                       <button onClick={() => setViewMode("LIST")} className={`px-4 py-2 text-sm font-semibold rounded-md flex items-center gap-2 transition ${viewMode === 'LIST' ? 'bg-[var(--bg-surface)] text-[var(--color-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                         <LayoutList size={16} /> Liste
                       </button>
                       <button onClick={() => setViewMode("CALENDAR")} className={`px-4 py-2 text-sm font-semibold rounded-md flex items-center gap-2 transition ${viewMode === 'CALENDAR' ? 'bg-[var(--bg-surface)] text-[var(--color-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                         <CalendarDays size={16} /> Calendrier
                       </button>
                    </div>
                  </div>
                  
                  {viewMode === "LIST" ? (
                    <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
                      {workouts.map((w, i) => (
                      <div key={w.id} className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] hover:bg-[var(--bg-surface-elevated)] hover:shadow-md transition duration-200">
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                          <div>
                            <div className="text-sm font-semibold text-[var(--color-primary)] mb-1 capitalize">
                              {new Date(w.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </div>
                            <h4 className="text-lg font-bold text-[var(--text-primary)]">{w.name}</h4>
                            <div className="text-sm text-[var(--text-secondary)] mt-1 flex flex-wrap gap-3">
                              <span className="flex items-center gap-1">⏱️ {w.estimatedDuration} min</span>
                              <span className="flex items-center gap-1">📈 {w.totalTss} TSS</span>
                              <span className="flex items-center gap-1">🏃 {w.terrain}</span>
                            </div>
                          </div>
                          <div 
                            className="px-4 py-1.5 rounded-full text-sm font-bold text-white whitespace-nowrap shadow-sm" 
                            style={{ backgroundColor: getWorkoutColor(w.type) }}
                          >
                            {w.type}
                          </div>
                        </div>
                        
                        <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
                          <ul className="text-sm text-[var(--text-secondary)] space-y-2.5 font-medium">
                            {w.phases.map((p: any, idx: number) => {
                               if (p.type === 'intervals') {
                                 return (
                                   <li key={idx} className="flex items-start gap-2">
                                     <span className="font-bold text-[var(--color-primary)] bg-[var(--bg-surface-elevated)] px-2 py-0.5 rounded-md">{p.repeats}x</span> 
                                     <span>{p.workDuration}m @ {p.workIntensity}% <span className="text-[var(--border-subtle)] mx-1">/</span> {p.restDuration}m @ {p.restIntensity}% {p.description ? <span className="italic text-[var(--text-muted)]">({p.description})</span> : ''}</span>
                                   </li>
                                 );
                               } else {
                                 const phaseName = p.type === 'warmup' ? 'Échauffement' : p.type === 'cooldown' ? 'Retour au calme' : 'Bloc actif';
                                 return (
                                   <li key={idx} className="flex items-start gap-2">
                                     <span className="font-semibold text-[var(--text-secondary)] bg-[var(--bg-surface-elevated)] px-2 py-0.5 rounded-md w-12 text-center">{p.duration}m</span> 
                                     <span>{phaseName} {p.description ? <span className="italic text-[var(--text-muted)]">({p.description})</span> : ''}</span>
                                   </li>
                                 );
                               }
                            })}
                          </ul>
                        </div>
                        <div className="mt-4 pt-3 flex gap-2 justify-end border-t border-[var(--border-subtle)]">
                          <button 
                            onClick={() => { setEditingWorkout(w); setIsLibraryOpen(true); }}
                            className="btn btn-secondary !py-1.5 !px-3 !text-xs"
                          >
                            <Database size={14} /> Bibliothèque
                          </button>
                          <button 
                            onClick={() => setEditingWorkout(w)}
                            className="btn btn-secondary !py-1.5 !px-3 !text-xs"
                          >
                            <Edit3 size={14} /> Éditer
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  ) : (
                    <WeeklyCalendar 
                      plan={plan}
                      workouts={workouts} 
                      onWorkoutMove={handleWorkoutMove}
                      onAddWorkout={handleAddWorkout}
                      onWorkoutEdit={setEditingWorkout}
                      getWorkoutColor={getWorkoutColor}
                    />
                  )}
                  
                  {workouts.length > 0 && plan && (
                    <div className="mt-6 flex justify-center border-t border-[var(--border-subtle)] pt-6">
                      <button 
                        onClick={() => handleGenerateMoreAI(1)}
                        disabled={isGeneratingMoreAi}
                        className="btn btn-primary"
                      >
                        {isGeneratingMoreAi ? (
                          <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                          </svg>
                        ) : <Zap size={18} />}
                        {isGeneratingMoreAi ? "Génération en cours..." : "Générer la semaine suivante avec l'IA"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-[var(--text-muted)] border-2 border-dashed border-[var(--border-subtle)] rounded-2xl bg-[var(--bg-surface)] backdrop-blur-sm p-12 min-h-[400px]">
              <div className="bg-[var(--bg-surface-elevated)] p-4 rounded-full mb-4">
                <Activity className="w-10 h-10 text-[var(--color-primary)]" />
              </div>
              <p className="font-medium text-[var(--text-secondary)] text-lg">Aucun plan actuellement affiché</p>
              <p className="text-sm mt-1 mb-8 text-center text-[var(--text-secondary)]">Configurez les paramètres pour créer votre macrocycle, ou chargez un plan sauvegardé.</p>
              
              {savedPlans.length > 0 && (
                <div className="w-full max-w-2xl mt-4">
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                    <Database className="text-[var(--color-primary)]" size={20} /> Vos plans sauvegardés
                  </h3>
                  <div className="space-y-3">
                    {savedPlans.map((sp, idx) => (
                      <div key={idx} className="card !p-4 !shadow-none hover:shadow-sm flex flex-col sm:flex-row items-center justify-between transition">
                        <div>
                          <div className="font-semibold text-[var(--text-primary)]">
                            Objectif : {sp.macrocycle?.targetRaceDate ? new Date(sp.macrocycle.targetRaceDate).toLocaleDateString('fr-FR') : "Inconnu"}
                          </div>
                          <div className="text-sm text-[var(--text-secondary)] flex items-center gap-3 mt-1">
                            <span>🏃 {sp.macrocycle?.raceDistance} km</span>
                            <span>🏔️ {sp.macrocycle?.raceElevation} m D+</span>
                            {sp.lastUpdated && <span>⏱️ Sauvegardé le {new Date(sp.lastUpdated).toLocaleDateString('fr-FR')}</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const loadedPlan = {
                              ...sp.macrocycle,
                              targetRaceDate: new Date(sp.macrocycle.targetRaceDate),
                              startDate: new Date(sp.macrocycle.startDate)
                            };
                            const loadedWorkouts = (sp.workouts || []).map((w: any) => ({
                              ...w,
                              date: new Date(w.date)
                            }));
                            
                            setPlan(loadedPlan);
                            setWorkouts(loadedWorkouts);
                            setPlanConfig(sp.config);
                          }}
                          className="btn btn-secondary mt-3 sm:mt-0"
                        >
                          Charger ce plan
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {showExportConfig && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="card shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Configuration Intervals.icu</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Pour exporter votre plan, veuillez renseigner votre ID Athlète et votre clé API Intervals.icu (disponibles dans les paramètres de votre compte Intervals).
            </p>
            <div className="space-y-4 mb-8">
              <div className="input-group">
                <label className="input-label">Athlete ID</label>
                <input 
                  type="text" 
                  value={intervalsAthleteId} 
                  onChange={e => setIntervalsAthleteId(e.target.value)} 
                  className="input-field" 
                  placeholder="ex: i12345" 
                />
              </div>
              <div className="input-group">
                <label className="input-label">API Key</label>
                <input 
                  type="password" 
                  value={intervalsApiKey} 
                  onChange={e => setIntervalsApiKey(e.target.value)} 
                  className="input-field" 
                  placeholder="ex: abc123def456..." 
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => { setShowExportConfig(false); setConfigPendingAction(null); }} 
                className="btn btn-secondary"
              >
                Annuler
              </button>
              <button 
                onClick={saveConfig} 
                className="btn btn-primary"
              >
                Sauvegarder & Continuer
              </button>
            </div>
          </div>
        </div>
      )}

      {editingWorkout && (
        <WorkoutEditorModal 
          isOpen={true} 
          workout={editingWorkout} 
          onClose={() => setEditingWorkout(null)} 
          onSave={handleSaveWorkout}
          onSaveAsTemplate={handleSaveAsTemplate}
          onOpenLibrary={() => setIsLibraryOpen(true)}
        />
      )}

      {isLibraryOpen && (
        <WorkoutLibraryModal
          isOpen={true}
          onClose={() => setIsLibraryOpen(false)}
          coachId={intervalsAthleteId}
          initialTypeFilter={editingWorkout?.type}
          onSelect={handleLibrarySelect}
        />
      )}

      {isAiModalOpen && plan && workouts && (
        <AiOptimizerModal
          isOpen={isAiModalOpen}
          onClose={() => setIsAiModalOpen(false)}
          plan={plan}
          workouts={workouts}
          onWorkoutsUpdated={setWorkouts}
        />
      )}
    </div>
  );
}
