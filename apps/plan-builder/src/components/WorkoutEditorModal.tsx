import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Workout, WorkoutPhase, IntensityZone } from '@/types';
import { X, Plus, Trash2, Save, Library, GripVertical, Activity, Timer, Zap, ArrowRight, Flame, Settings } from 'lucide-react';

interface WorkoutEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  workout: Workout | null;
  onSave: (updatedWorkout: Workout) => void;
  onOpenLibrary: (type: string) => void;
  onSaveAsTemplate: (workout: Workout) => void;
}

const getZoneColor = (zone?: string) => {
  switch (zone) {
    case 'Z1': return '#3b82f6'; // blue-500
    case 'Z2': return '#10b981'; // emerald-500
    case 'Z3': return '#f59e0b'; // amber-500
    case 'Z4': return '#f97316'; // orange-500
    case 'Z5': return '#ef4444'; // red-500
    case 'Z6': return '#8b5cf6'; // violet-500
    default: return '#94a3b8';   // slate-400
  }
};

const getZoneBgClass = (zone?: string) => {
  switch (zone) {
    case 'Z1': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'Z2': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'Z3': return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'Z4': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'Z5': return 'bg-red-100 text-red-800 border-red-200';
    case 'Z6': return 'bg-violet-100 text-violet-800 border-violet-200';
    default: return 'bg-slate-100 text-slate-800 border-slate-200';
  }
};

const WorkoutEditorModal: React.FC<WorkoutEditorModalProps> = ({
  isOpen,
  onClose,
  workout,
  onSave,
  onOpenLibrary,
  onSaveAsTemplate
}) => {
  const [edited, setEdited] = useState<Workout | null>(null);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  useEffect(() => {
    if (workout) {
      const cloned = JSON.parse(JSON.stringify(workout));
      cloned.date = new Date(cloned.date); // Restore Date object
      setEdited(cloned);
    }
  }, [workout]);

  const chartData = useMemo(() => {
    if (!edited) return [];
    const data: any[] = [];
    edited.phases.forEach((p, idx) => {
      if (p.type === 'intervals') {
        const reps = p.repeats || 1;
        for (let i = 0; i < reps; i++) {
          if (p.workDuration) {
            data.push({
              name: `Travail ${i+1}/${reps}`,
              duration: p.workDuration,
              intensity: p.workIntensity || 100,
              zone: p.workZone || 'Z4',
              index: idx
            });
          }
          if (p.restDuration) {
            data.push({
              name: `Repos ${i+1}/${reps}`,
              duration: p.restDuration,
              intensity: p.restIntensity || 50,
              zone: p.restZone || 'Z1',
              index: idx
            });
          }
        }
      } else {
        data.push({
          name: p.type === 'warmup' ? 'Échauffement' : p.type === 'cooldown' ? 'Retour au calme' : 'Actif',
          duration: p.duration || 0,
          intensity: p.intensityTss || 60,
          zone: p.type === 'warmup' || p.type === 'cooldown' || p.type === 'recovery' ? 'Z1' : 'Z2',
          index: idx
        });
      }
    });
    return data;
  }, [edited?.phases]);

  // Auto-calculate duration and TSS when phases change
  useEffect(() => {
    if (!edited) return;
    let totalDuration = 0;
    let totalTss = 0;
    
    edited.phases.forEach(p => {
      if (p.type === 'intervals') {
        const reps = p.repeats || 1;
        const wD = p.workDuration || 0;
        const rD = p.restDuration || 0;
        totalDuration += reps * (wD + rD);
        totalTss += reps * (((wD / 60) * (p.workIntensity || 0)) + ((rD / 60) * (p.restIntensity || 0)));
      } else {
        totalDuration += p.duration || 0;
        totalTss += ((p.duration || 0) / 60) * (p.intensityTss || 0);
      }
    });

    if (Math.round(totalDuration) !== edited.estimatedDuration || Math.round(totalTss) !== edited.totalTss) {
      setEdited(prev => ({
        ...prev!,
        estimatedDuration: Math.round(totalDuration),
        totalTss: Math.round(totalTss)
      }));
    }
  }, [edited?.phases]);

  if (!isOpen || !edited) return null;

  const handleGlobalChange = (field: keyof Workout, value: any) => {
    setEdited((prev) => ({ ...prev!, [field]: value }));
  };

  const handlePhaseChange = (index: number, field: keyof WorkoutPhase, value: any) => {
    setEdited((prev) => {
      const newPhases = [...prev!.phases];
      newPhases[index] = { ...newPhases[index], [field]: value };
      return { ...prev!, phases: newPhases };
    });
  };

  const addPhase = (template?: Partial<WorkoutPhase>) => {
    const defaultPhase: WorkoutPhase = { type: 'active', duration: 10, intensityTss: 60 };
    setEdited((prev) => ({
      ...prev!,
      phases: [...prev!.phases, { ...defaultPhase, ...template }] as WorkoutPhase[]
    }));
  };

  const removePhase = (index: number) => {
    setEdited((prev) => {
      const newPhases = [...prev!.phases];
      newPhases.splice(index, 1);
      return { ...prev!, phases: newPhases };
    });
  };

  const handleSort = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      setEdited(prev => {
        const newPhases = [...prev!.phases];
        const draggedPhase = newPhases.splice(dragItem.current!, 1)[0];
        newPhases.splice(dragOverItem.current!, 0, draggedPhase);
        return { ...prev!, phases: newPhases };
      });
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[95vh] animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50/80 rounded-t-3xl backdrop-blur">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-800 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">Éditeur de Séance Pro</h2>
            <p className="text-sm text-gray-500 font-medium mt-1">
              {new Date(edited.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => onOpenLibrary(edited.type)} className="px-4 py-2 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-xl font-semibold flex items-center gap-2 transition shadow-sm">
              <Library size={18} /> Bibliothèque
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-xl transition">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 custom-scrollbar bg-slate-50">
          
          {/* Left Column: Global Info & Visuals */}
          <div className="lg:col-span-5 space-y-6 flex flex-col">
            
            {/* Visual Workout Profile */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <Activity size={16} className="text-blue-500" /> Profil de l'entraînement
                </h3>
                <div className="flex gap-3 text-sm font-semibold text-slate-600">
                  <span className="flex items-center gap-1"><Timer size={14}/> {edited.estimatedDuration}m</span>
                  <span className="flex items-center gap-1"><Zap size={14} className="text-orange-500"/> {edited.totalTss} TSS</span>
                </div>
              </div>
              
              <div className="h-48 w-full flex items-end gap-[1px] bg-slate-50/50 p-2 rounded-xl border border-gray-100 overflow-hidden group">
                {chartData.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm font-medium">
                    Ajoutez des blocs pour visualiser la séance
                  </div>
                ) : (
                  chartData.map((d, i) => (
                    <div 
                      key={i} 
                      className="transition-all duration-300 rounded-t-sm hover:brightness-110 relative"
                      style={{
                        height: `${Math.min(100, Math.max(5, (d.intensity / 150) * 100))}%`, // Scale assuming 150% is max height
                        flexGrow: d.duration,
                        backgroundColor: getZoneColor(d.zone),
                        minWidth: '2px'
                      }}
                      title={`${d.name}: ${d.duration}m @ ${d.intensity}% (${d.zone})`}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Global Settings */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nom de la séance</label>
                <input type="text" value={edited.name} onChange={(e) => handleGlobalChange('name', e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition font-semibold text-slate-800" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Type (Axe)</label>
                  <select value={edited.type} onChange={(e) => handleGlobalChange('type', e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-gray-200 rounded-xl outline-none text-sm font-medium text-slate-700">
                    <option value="Recovery">Récupération</option>
                    <option value="Endurance">Endurance</option>
                    <option value="Tempo">Tempo</option>
                    <option value="Threshold">Seuil</option>
                    <option value="VO2Max">VO2Max</option>
                    <option value="Long Run">Sortie Longue</option>
                    <option value="Strength">Renforcement</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Terrain</label>
                  <select value={edited.terrain} onChange={(e) => handleGlobalChange('terrain', e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-gray-200 rounded-xl outline-none text-sm font-medium text-slate-700">
                    <option value="Flat">Plat</option>
                    <option value="Hilly">Vallonné</option>
                    <option value="Technical Trail">Trail Technique</option>
                    <option value="Indoor">Indoor (HT)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Consignes globales</label>
                <textarea value={edited.description || ''} onChange={(e) => handleGlobalChange('description', e.target.value)} rows={4} className="w-full px-4 py-2 bg-slate-50 border border-gray-200 rounded-xl focus:border-blue-500 outline-none resize-none text-sm text-slate-700" placeholder="Objectif principal, matériel requis..."></textarea>
              </div>
            </div>
          </div>

          {/* Right Column: Phase Builder */}
          <div className="lg:col-span-7 flex flex-col h-[calc(100vh-200px)] lg:h-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Settings size={20} className="text-slate-400" /> Structure de la séance
              </h3>
              
              {/* Quick Presets */}
              <div className="flex gap-2">
                <button onClick={() => addPhase({ type: 'warmup', duration: 15, intensityTss: 50 })} className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition">
                  + Échauffement
                </button>
                <button onClick={() => addPhase({ type: 'intervals', repeats: 5, workDuration: 3, workIntensity: 110, workZone: 'Z5', restDuration: 1.5, restIntensity: 50, restZone: 'Z1' })} className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-xs font-bold transition">
                  + Fractionné
                </button>
                <button onClick={() => addPhase({ type: 'cooldown', duration: 10, intensityTss: 40 })} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold transition">
                  + Récupération
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar pb-12">
              {edited.phases.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-10 flex flex-col items-center justify-center text-center">
                  <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center text-blue-500 mb-4">
                    <Plus size={32} />
                  </div>
                  <h4 className="font-bold text-slate-700 text-lg mb-2">Aucun bloc</h4>
                  <p className="text-sm text-slate-500 max-w-xs mb-6">Commencez par ajouter un bloc ou utilisez les raccourcis ci-dessus.</p>
                  <button onClick={() => addPhase()} className="px-6 py-2 bg-slate-800 text-white rounded-xl font-semibold shadow-lg hover:bg-slate-700 transition">
                    Créer un bloc
                  </button>
                </div>
              ) : (
                edited.phases.map((phase, idx) => (
                  <div 
                    key={idx} 
                    draggable
                    onDragStart={() => (dragItem.current = idx)}
                    onDragEnter={() => (dragOverItem.current = idx)}
                    onDragEnd={handleSort}
                    onDragOver={(e) => e.preventDefault()}
                    className="bg-white p-0 rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex transition-all hover:shadow-md group"
                  >
                    {/* Drag Handle */}
                    <div className="w-10 bg-slate-50 border-r border-gray-100 flex items-center justify-center cursor-grab active:cursor-grabbing">
                      <GripVertical size={16} className="text-slate-400 group-hover:text-slate-600" />
                    </div>
                    
                    {/* Phase Content */}
                    <div className="flex-1 p-4 relative">
                      <button onClick={() => removePhase(idx)} className="absolute right-4 top-4 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition">
                        <Trash2 size={16} />
                      </button>

                      <div className="grid grid-cols-12 gap-x-4 gap-y-3 pr-8">
                        {/* Type Selection */}
                        <div className="col-span-12 sm:col-span-4">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Type</label>
                          <select value={phase.type} onChange={(e) => handlePhaseChange(idx, 'type', e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-gray-200 rounded-lg outline-none text-sm font-semibold text-slate-700">
                            <option value="warmup">Échauffement</option>
                            <option value="active">Actif (Continu)</option>
                            <option value="intervals">Fractionné</option>
                            <option value="recovery">Récupération</option>
                            <option value="cooldown">Retour au calme</option>
                          </select>
                        </div>

                        {phase.type === 'intervals' ? (
                          <>
                            <div className="col-span-6 sm:col-span-3">
                              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Répétitions</label>
                              <div className="flex items-center">
                                <input type="number" min="1" value={phase.repeats || 1} onChange={(e) => handlePhaseChange(idx, 'repeats', parseInt(e.target.value) || 1)} className="w-full px-3 py-1.5 bg-slate-50 border border-gray-200 rounded-lg outline-none text-sm font-bold text-center" />
                                <span className="ml-2 text-sm font-bold text-slate-400">x</span>
                              </div>
                            </div>
                            
                            {/* Fractionné - Ligne Travail */}
                            <div className="col-span-12 bg-red-50/50 p-3 rounded-xl border border-red-100/50 mt-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Flame size={14} className="text-red-500" />
                                <span className="text-xs font-bold text-red-800 uppercase tracking-wider">Effort</span>
                              </div>
                              <div className="grid grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Durée (m)</label>
                                  <input type="number" step="0.5" value={phase.workDuration || ''} onChange={(e) => handlePhaseChange(idx, 'workDuration', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none text-sm" />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Zone</label>
                                  <select value={phase.workZone || 'Z4'} onChange={(e) => handlePhaseChange(idx, 'workZone', e.target.value as IntensityZone)} className={`w-full px-2 py-1.5 border rounded-lg outline-none text-sm font-bold ${getZoneBgClass(phase.workZone || 'Z4')}`}>
                                    <option value="Z1">Z1 (Récup)</option><option value="Z2">Z2 (Endur)</option><option value="Z3">Z3 (Tempo)</option>
                                    <option value="Z4">Z4 (Seuil)</option><option value="Z5">Z5 (VO2)</option><option value="Z6">Z6 (Ana)</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">% FTP/VMA</label>
                                  <input type="number" value={phase.workIntensity || ''} onChange={(e) => handlePhaseChange(idx, 'workIntensity', parseInt(e.target.value) || 0)} className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none text-sm" />
                                </div>
                              </div>
                            </div>

                            {/* Fractionné - Ligne Repos */}
                            <div className="col-span-12 bg-blue-50/50 p-3 rounded-xl border border-blue-100/50">
                              <div className="flex items-center gap-2 mb-2">
                                <ArrowRight size={14} className="text-blue-500" />
                                <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">Repos</span>
                              </div>
                              <div className="grid grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Durée (m)</label>
                                  <input type="number" step="0.5" value={phase.restDuration || ''} onChange={(e) => handlePhaseChange(idx, 'restDuration', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none text-sm" />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Zone</label>
                                  <select value={phase.restZone || 'Z1'} onChange={(e) => handlePhaseChange(idx, 'restZone', e.target.value as IntensityZone)} className={`w-full px-2 py-1.5 border rounded-lg outline-none text-sm font-bold ${getZoneBgClass(phase.restZone || 'Z1')}`}>
                                    <option value="Z1">Z1 (Récup)</option><option value="Z2">Z2 (Endur)</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">% FTP/VMA</label>
                                  <input type="number" value={phase.restIntensity || ''} onChange={(e) => handlePhaseChange(idx, 'restIntensity', parseInt(e.target.value) || 0)} className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none text-sm" />
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="col-span-6 sm:col-span-3">
                              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Durée (m)</label>
                              <input type="number" step="0.5" value={phase.duration} onChange={(e) => handlePhaseChange(idx, 'duration', parseFloat(e.target.value) || 0)} className="w-full px-3 py-1.5 bg-slate-50 border border-gray-200 rounded-lg outline-none text-sm font-bold text-center" />
                            </div>
                            <div className="col-span-6 sm:col-span-3">
                              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">% / TSS</label>
                              <input type="number" value={phase.intensityTss} onChange={(e) => handlePhaseChange(idx, 'intensityTss', parseInt(e.target.value) || 0)} className="w-full px-3 py-1.5 bg-slate-50 border border-gray-200 rounded-lg outline-none text-sm font-bold text-center" />
                            </div>
                            
                            {/* Advanced Fields for Continuous Blocks */}
                            <div className="col-span-12 grid grid-cols-3 gap-3 mt-1 bg-slate-50 p-2 rounded-lg border border-gray-100">
                               <div>
                                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">RPE (1-10)</label>
                                  <input type="number" min="1" max="10" placeholder="-" value={phase.rpe || ''} onChange={(e) => handlePhaseChange(idx, 'rpe', parseInt(e.target.value))} className="w-full px-2 py-1 bg-white border border-gray-200 rounded outline-none text-xs" />
                               </div>
                               <div>
                                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Cadence (rpm)</label>
                                  <input type="number" placeholder="-" value={phase.cadenceTarget || ''} onChange={(e) => handlePhaseChange(idx, 'cadenceTarget', parseInt(e.target.value))} className="w-full px-2 py-1 bg-white border border-gray-200 rounded outline-none text-xs" />
                               </div>
                               <div className="flex items-end pb-1">
                                  <label className="flex items-center gap-1.5 cursor-pointer group/chk">
                                    <input type="checkbox" checked={phase.isHill || false} onChange={(e) => handlePhaseChange(idx, 'isHill', e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase group-hover/chk:text-slate-800">En Côte</span>
                                  </label>
                               </div>
                            </div>
                          </>
                        )}
                        
                        <div className="col-span-12">
                          <input type="text" value={phase.description || ''} onChange={(e) => handlePhaseChange(idx, 'description', e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-transparent hover:border-gray-200 focus:border-blue-300 focus:bg-white rounded-lg outline-none text-xs italic text-slate-600 placeholder-gray-400 transition" placeholder="Consigne spécifique (ex: En danseuse, focus respiration)..." />
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
              
              <div className="pt-2">
                 <button onClick={() => addPhase()} className="w-full py-3 bg-white border-2 border-dashed border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 rounded-xl font-bold flex items-center justify-center gap-2 transition">
                  <Plus size={18} /> Ajouter un bloc manuel
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 bg-white rounded-b-3xl flex justify-between items-center shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] relative z-10">
          <button onClick={() => onSaveAsTemplate(edited)} className="px-5 py-2.5 text-sm font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition flex items-center gap-2">
            <Save size={16} /> Sauvegarder comme Template
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition">Annuler</button>
            <button onClick={() => onSave(edited)} className="px-8 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/30 transition flex items-center gap-2">
               Appliquer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkoutEditorModal;
