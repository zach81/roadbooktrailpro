"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { getWorkoutTemplates, saveWorkoutTemplate, deleteWorkoutTemplate } from "@/lib/firebaseUtils";
import { Workout } from "@/types";
import WorkoutEditorModal from "@/components/WorkoutEditorModal";
import { BookOpen, Plus, Edit3, Trash2, Clock, Activity, Map, Filter, Search } from "lucide-react";

const DEFAULT_TEMPLATES: Omit<Workout, 'id' | 'date'>[] = [
  {
    name: "30/30 Classique VMA",
    type: "VO2Max",
    sport: "Run",
    terrain: "Flat",
    estimatedDuration: 55,
    totalTss: 65,
    phases: [
      { type: "warmup", duration: 20, intensityTss: 65, description: "Footing progressif + gammes" },
      { type: "intervals", duration: 15, intensityTss: 95, repeats: 15, workDuration: 0.5, workIntensity: 105, restDuration: 0.5, restIntensity: 50, description: "30s vite / 30s trot" },
      { type: "cooldown", duration: 15, intensityTss: 60, description: "Retour au calme souple" }
    ]
  },
  {
    name: "Seuil Pyramidal Trail",
    type: "Threshold",
    sport: "Run",
    terrain: "Hilly",
    estimatedDuration: 75,
    totalTss: 85,
    phases: [
      { type: "warmup", duration: 20, intensityTss: 65, description: "Échauffement vallonné" },
      { type: "intervals", duration: 33, intensityTss: 88, repeats: 3, workDuration: 8, workIntensity: 90, restDuration: 3, restIntensity: 60, description: "8min au seuil en côte douce" },
      { type: "cooldown", duration: 15, intensityTss: 60, description: "Retour au calme" }
    ]
  },
  {
    name: "Sortie Longue Rando-Course",
    type: "Long Run",
    sport: "Run",
    terrain: "Technical Trail",
    estimatedDuration: 180,
    totalTss: 160,
    phases: [
      { type: "warmup", duration: 30, intensityTss: 65, description: "Mise en route tranquille" },
      { type: "active", duration: 120, intensityTss: 75, description: "Alternance marche rapide en côte (bâtons) et relance en descente" },
      { type: "cooldown", duration: 30, intensityTss: 65, description: "Fin de sortie souple sur le plat" }
    ]
  },
  {
    name: "Renforcement Excentrique Casse-Fibres",
    type: "Strength",
    sport: "WeightTraining",
    terrain: "Indoor",
    estimatedDuration: 45,
    totalTss: 40,
    phases: [
      { type: "warmup", duration: 10, intensityTss: 60, description: "Mobilité articulaire + squats à vide" },
      { type: "intervals", duration: 28, intensityTss: 80, repeats: 4, workDuration: 5, workIntensity: 85, restDuration: 2, restIntensity: 40, description: "Circuit: Fentes sautées, Chaise, Descendeur excentrique lent" },
      { type: "cooldown", duration: 5, intensityTss: 50, description: "Étirements légers" }
    ]
  }
];

export default function WorkoutsLibraryPage() {
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<(Workout & { isDefault?: boolean })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);

  const coachId = currentUser?.uid || "";

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    loadTemplates();
  }, [coachId, isAdmin, authLoading]);

  if (!authLoading && currentUser && !isAdmin) {
    return null;
  }

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const customTemplates = coachId ? await getWorkoutTemplates(coachId) : [];
      const formattedDefaults = DEFAULT_TEMPLATES.map((t, idx) => ({
        ...t,
        id: `default-${idx}`,
        date: new Date(),
        isDefault: true
      })) as (Workout & { isDefault?: boolean })[];

      setTemplates([...customTemplates, ...formattedDefaults]);
    } catch (e) {
      console.error("Failed to load templates", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = () => {
    const newWorkout: Workout = {
      id: `template-${Date.now()}`,
      name: "Nouveau Modèle de Séance",
      type: "Endurance",
      sport: "Run",
      terrain: "Hilly",
      date: new Date(),
      estimatedDuration: 60,
      totalTss: 50,
      phases: [
        { type: "warmup", duration: 15, intensityTss: 65, description: "Échauffement progressif" },
        { type: "active", duration: 35, intensityTss: 75, description: "Corps de séance" },
        { type: "cooldown", duration: 10, intensityTss: 60, description: "Retour au calme" }
      ]
    };
    setEditingWorkout(newWorkout);
  };

  const handleSaveWorkout = async (updatedWorkout: Workout) => {
    try {
      const workoutToSave = { ...updatedWorkout };
      if ((workoutToSave as any).isDefault) {
        delete (workoutToSave as any).isDefault;
        workoutToSave.id = `template-${Date.now()}`;
        workoutToSave.name = `${workoutToSave.name} (Copie)`;
      }

      await saveWorkoutTemplate(coachId, workoutToSave);
      setEditingWorkout(null);
      await loadTemplates();
    } catch (e) {
      alert("Erreur lors de la sauvegarde du modèle.");
    }
  };

  const handleDeleteTemplate = async (templateId: string, isDefault?: boolean) => {
    if (isDefault) {
      alert("Les modèles par défaut ne peuvent pas être supprimés, mais vous pouvez les modifier pour créer votre propre copie.");
      return;
    }
    if (!confirm("Voulez-vous vraiment supprimer ce modèle de séance ?")) return;

    try {
      await deleteWorkoutTemplate(coachId, templateId);
      await loadTemplates();
    } catch (e) {
      alert("Erreur lors de la suppression.");
    }
  };

  const getWorkoutColor = (type: string) => {
    switch (type) {
      case 'VO2Max': return '#ef4444';
      case 'Tempo':
      case 'Threshold': return '#f59e0b';
      case 'Endurance':
      case 'Long Run': return '#FF5A36';
      case 'Recovery': return '#10b981';
      case 'Strength': return '#14C38E';
      default: return '#9ca3af';
    }
  };

  const filteredTemplates = templates.filter(t => {
    const matchesType = selectedType === "ALL" || t.type === selectedType;
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.phases && t.phases.some(p => p.description?.toLowerCase().includes(searchQuery.toLowerCase())));
    return matchesType && matchesSearch;
  });

  const workoutTypes = ["ALL", "Endurance", "Long Run", "Threshold", "VO2Max", "Strength", "Recovery"];

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-7 space-y-6">
      {/* Unified Hero Header Card */}
      <header className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 text-[var(--color-primary)] flex items-center justify-center shrink-0">
            <BookOpen size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-extrabold text-[var(--text-primary)] m-0 tracking-tight">
                Bibliothèque de Séances
              </h1>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-orange-500/10 text-[var(--color-primary)] border border-orange-500/20">
                {templates.length} MODÈLES
              </span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5 m-0">
              Créez, organisez et réutilisez vos séances structurées favorites dans les calendriers d&apos;entraînement.
            </p>
          </div>
        </div>

        <button
          onClick={handleCreateNew}
          className="btn btn-primary flex items-center gap-2 w-full md:w-auto"
        >
          <Plus size={18} />
          Créer un modèle
        </button>
      </header>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[var(--bg-surface)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-none">
          <Filter size={16} className="text-[var(--text-muted)] mr-1 shrink-0" />
          {workoutTypes.map(type => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
                selectedType === type
                  ? 'bg-[var(--color-primary)] text-white shadow-sm'
                  : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {type === "ALL" ? "Toutes" : type}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
          <input
            type="text"
            placeholder="Rechercher une séance..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field !w-full !py-2 !pl-9 !pr-4 !text-sm !rounded-full"
          />
        </div>
      </div>

      {/* Grid of Templates */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card p-6 h-64 animate-pulse flex flex-col justify-between">
              <div className="h-6 bg-gray-200 rounded w-3/4"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              </div>
              <div className="h-8 bg-gray-200 rounded w-1/3 self-end"></div>
            </div>
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="card p-12 text-center border-dashed">
          <BookOpen size={44} className="mx-auto text-[var(--text-muted)] mb-4 opacity-50" />
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">Aucune séance trouvée</h3>
          <p className="text-[var(--text-secondary)] text-sm mb-6">
            Aucun modèle ne correspond à vos critères de recherche.
          </p>
          <button onClick={handleCreateNew} className="btn btn-secondary">
            Créer ma première séance
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTemplates.map((template) => (
            <div key={template.id} className="card p-5 flex flex-col justify-between hover:shadow-md transition duration-200 border border-[var(--border-subtle)]">
              <div>
                <div className="flex justify-between items-start gap-2 mb-3">
                  <span
                    className="px-2.5 py-1 rounded-full text-[10px] font-extrabold text-white uppercase tracking-wider"
                    style={{ backgroundColor: getWorkoutColor(template.type) }}
                  >
                    {template.type}
                  </span>
                  {template.isDefault && (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] px-2 py-0.5 rounded border border-[var(--border-subtle)]">
                      Standard
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-extrabold text-[var(--text-primary)] mb-2 line-clamp-1">
                  {template.name}
                </h3>

                <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)] mb-4 font-semibold">
                  <span className="flex items-center gap-1"><Clock size={14} className="text-[var(--color-primary)]" /> {template.estimatedDuration} min</span>
                  <span className="flex items-center gap-1"><Activity size={14} className="text-emerald-500" /> {template.totalTss} TSS</span>
                  <span className="flex items-center gap-1"><Map size={14} className="text-slate-400" /> {template.terrain}</span>
                </div>

                <div className="border-t border-[var(--border-subtle)] pt-3 mb-4">
                  <ul className="text-xs text-[var(--text-secondary)] space-y-1.5">
                    {template.phases?.slice(0, 3).map((p: any, idx: number) => {
                      if (p.type === 'intervals') {
                        return (
                          <li key={idx} className="truncate">
                            <strong className="text-[var(--color-primary)]">{p.repeats}x</strong> {p.workDuration}m @ {p.workIntensity}% / {p.restDuration}m
                          </li>
                        );
                      } else {
                        const phaseName = p.type === 'warmup' ? 'Échauff.' : p.type === 'cooldown' ? 'Calme' : 'Actif';
                        return (
                          <li key={idx} className="truncate">
                            <strong className="text-[var(--text-primary)]">{p.duration}m</strong> {phaseName} {p.description ? `- ${p.description}` : ''}
                          </li>
                        );
                      }
                    })}
                    {(template.phases?.length || 0) > 3 && (
                      <li className="text-[var(--text-muted)] italic">+ {(template.phases?.length || 0) - 3} autre(s) bloc(s)...</li>
                    )}
                  </ul>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                {!template.isDefault && (
                  <button
                    onClick={() => handleDeleteTemplate(template.id, template.isDefault)}
                    className="btn btn-secondary !p-2 !text-red-500 hover:!bg-red-50 !border-transparent"
                    title="Supprimer"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <button
                  onClick={() => setEditingWorkout(template)}
                  className="btn btn-secondary !py-1.5 !px-3.5 !text-xs flex items-center gap-1.5"
                >
                  <Edit3 size={14} /> {template.isDefault ? "Dupliquer & Éditer" : "Modifier"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingWorkout && (
        <WorkoutEditorModal
          isOpen={true}
          workout={editingWorkout}
          onClose={() => setEditingWorkout(null)}
          onSave={handleSaveWorkout}
          onOpenLibrary={() => {}}
          onSaveAsTemplate={handleSaveWorkout}
        />
      )}
    </div>
  );
}
