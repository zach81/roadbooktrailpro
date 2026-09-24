"use client";

import React, { useState, useMemo } from 'react';
import { 
  DndContext, 
  DragOverlay, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragStartEvent, 
  DragEndEvent, 
  DragOverEvent,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import { 
  SortableContext, 
  arrayMove, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Workout, Macrocycle } from '@/types';
import { Plus, GripVertical, Activity, Clock } from 'lucide-react';

const parseDateSafe = (val: any) => {
  if (!val) return new Date(NaN);
  if (val instanceof Date) return val;
  if (typeof val === 'object' && 'seconds' in val) return new Date(val.seconds * 1000);
  return new Date(val);
};

const formatDateLocal = (d: Date) => {
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface WeeklyCalendarProps {
  plan: Macrocycle | null;
  workouts: Workout[];
  onWorkoutMove: (workoutId: string, newDate: Date) => void;
  onWorkoutEdit: (workout: Workout) => void;
  onAddWorkout: (date: Date) => void;
  getWorkoutColor: (type: string) => string;
}

// Composant pour une séance glissable
const SortableWorkout = ({ workout, getWorkoutColor, onEdit }: { workout: Workout, getWorkoutColor: (t: string) => string, onEdit: (w: Workout) => void }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: workout.id, data: { type: 'Workout', workout } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const bgColor = getWorkoutColor(workout.type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group bg-white border border-gray-200 rounded-lg shadow-sm p-2 mb-2 hover:border-blue-300 transition-colors ${isDragging ? 'z-50' : 'z-auto'}`}
    >
      <div 
        className="absolute top-0 left-0 w-1.5 h-full rounded-l-lg" 
        style={{ backgroundColor: bgColor }} 
      />
      <div className="pl-3">
        <div className="flex justify-between items-start">
          <h4 className="font-bold text-xs text-slate-800 leading-tight truncate pr-4 cursor-pointer hover:text-blue-600" onClick={(e) => { e.stopPropagation(); onEdit(workout); }}>
            {workout.name}
          </h4>
          <div 
            {...attributes} 
            {...listeners} 
            className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing p-0.5 rounded -mr-1 -mt-1"
          >
            <GripVertical size={14} />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-500 font-medium">
          <span className="flex items-center gap-0.5"><Clock size={10} /> {workout.estimatedDuration}m</span>
          <span className="flex items-center gap-0.5"><Activity size={10} /> {workout.totalTss}</span>
        </div>
      </div>
    </div>
  );
};

export default function WeeklyCalendar({
  plan,
  workouts,
  onWorkoutMove,
  onWorkoutEdit,
  onAddWorkout,
  getWorkoutColor
}: WeeklyCalendarProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Requires 5px movement before dragging starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Group workouts by day (YYYY-MM-DD)
  const workoutsByDay = useMemo(() => {
    const grouped: Record<string, Workout[]> = {};
    workouts.forEach(w => {
      const d = parseDateSafe(w.date);
      if (!isNaN(d.getTime())) {
        const dateStr = formatDateLocal(d);
        if (!grouped[dateStr]) grouped[dateStr] = [];
        grouped[dateStr].push(w);
      }
    });
    return grouped;
  }, [workouts]);

  if (!plan) return null;

  // Calculer la structure des semaines
  const weeks = useMemo(() => {
    if (!plan || !plan.startDate) return [];
    
    let currentWeekStart = parseDateSafe(plan.startDate);
    if (isNaN(currentWeekStart.getTime())) return [];
    
    // Assurer que le début est un lundi
    const day = currentWeekStart.getDay();
    const diff = currentWeekStart.getDate() - day + (day === 0 ? -6 : 1);
    currentWeekStart = new Date(currentWeekStart.setDate(diff));
    currentWeekStart.setHours(0,0,0,0);

    const generatedWeeks = [];
    let weekIndex = 0;

    for (const meso of plan.mesocycles) {
      for (let i = 0; i < meso.weeks; i++) {
        const targetTss = meso.targetTssPerWeek[i] || 0;
        const dailyTargetTss = Math.round(targetTss / 7);
        
        const days = [];
        let weekTss = 0;

        for (let j = 0; j < 7; j++) {
          const currentDate = new Date(currentWeekStart);
          currentDate.setDate(currentDate.getDate() + j);
          const dateStr = formatDateLocal(currentDate);
          
          const dayWorkouts = workoutsByDay[dateStr] || [];
          const dayTss = dayWorkouts.reduce((sum, w) => sum + (w.totalTss || 0), 0);
          weekTss += dayTss;

          days.push({
            date: currentDate,
            dateStr,
            workouts: dayWorkouts,
            dayTss
          });
        }

        generatedWeeks.push({
          id: `week-${weekIndex}`,
          name: `${meso.phase} W${i + 1}`,
          days,
          targetTss,
          dailyTargetTss,
          actualTss: weekTss,
          mesoPhase: meso.phase
        });

        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        weekIndex++;
      }
    }
    return generatedWeeks;
  }, [plan, workoutsByDay]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    // Only used if sorting within the same container, but we just move items between days mostly.
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // overId can be a droppable day area (e.g. "day-2023-10-05") or another sortable item
    let newDateStr = "";
    
    if (overId.startsWith("day-")) {
      newDateStr = overId.replace("day-", "");
    } else {
      // Find the workout that we dropped over to get its date
      const overWorkout = workouts.find(w => w.id === overId);
      if (overWorkout) {
        newDateStr = formatDateLocal(parseDateSafe(overWorkout.date));
      }
    }

    if (newDateStr) {
      const activeWorkout = workouts.find(w => w.id === activeId);
      if (activeWorkout) {
        const oldDateStr = formatDateLocal(parseDateSafe(activeWorkout.date));
        if (oldDateStr !== newDateStr) {
          // Construct a new date object keeping the original time (if any) or setting to noon
          const newDate = new Date(newDateStr + 'T12:00:00');
          onWorkoutMove(activeId, newDate);
        }
      }
    }
  };

  const activeWorkout = activeId ? workouts.find(w => w.id === activeId) : null;
  const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* En-tête des jours */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-slate-50 sticky top-0 z-10 hidden md:grid">
          {dayNames.map(day => (
            <div key={day} className="px-3 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-gray-100 last:border-0">
              {day}
            </div>
          ))}
        </div>

        {/* Semaines */}
        <div className="divide-y divide-gray-200">
          {weeks.map((week) => (
            <div key={week.id} className="relative">
              {/* En-tête de semaine */}
              <div className="bg-slate-100/50 px-4 py-2 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-slate-700">{week.name}</h3>
                </div>
                <div className="flex items-center gap-4 text-sm font-medium">
                  <div className="text-gray-500">
                    Moy. cible / jour: <span className="text-slate-700 font-bold">{week.dailyTargetTss} TSS</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Charge Semaine:</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      week.actualTss < week.targetTss * 0.9 ? 'bg-blue-100 text-blue-700' :
                      week.actualTss > week.targetTss * 1.1 ? 'bg-red-100 text-red-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {week.actualTss} / {week.targetTss} TSS
                    </span>
                  </div>
                </div>
              </div>

              {/* Jours de la semaine */}
              <div className="grid grid-cols-1 md:grid-cols-7 min-h-[120px]">
                {week.days.map((day) => (
                  <DroppableDay 
                    key={day.dateStr} 
                    day={day} 
                    onAddWorkout={() => onAddWorkout(day.date)}
                    getWorkoutColor={getWorkoutColor}
                    onWorkoutEdit={onWorkoutEdit}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }) }}>
        {activeWorkout ? (
          <div className="w-[180px] rotate-3 opacity-90 shadow-xl">
            <SortableWorkout workout={activeWorkout} getWorkoutColor={getWorkoutColor} onEdit={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// Composant pour le conteneur du jour
const DroppableDay = ({ 
  day, 
  onAddWorkout, 
  getWorkoutColor, 
  onWorkoutEdit 
}: { 
  day: any, 
  onAddWorkout: () => void,
  getWorkoutColor: (t: string) => string,
  onWorkoutEdit: (w: Workout) => void
}) => {
  const { setNodeRef, isOver } = useSortable({
    id: `day-${day.dateStr}`,
    data: { type: 'Day', dateStr: day.dateStr }
  });

  const isToday = formatDateLocal(new Date()) === day.dateStr;

  return (
    <div 
      ref={setNodeRef}
      className={`p-2 border-r border-b md:border-b-0 border-gray-100 last:border-r-0 min-h-[120px] flex flex-col transition-colors ${
        isOver ? 'bg-blue-50/50 ring-2 ring-inset ring-blue-300' : 
        isToday ? 'bg-indigo-50/20' : 'bg-white'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className={`text-xs font-semibold ${isToday ? 'bg-indigo-600 text-white px-1.5 py-0.5 rounded' : 'text-gray-400'}`}>
          {day.date.getDate()} {day.date.toLocaleDateString('fr-FR', { month: 'short' })}
        </span>
        {day.dayTss > 0 && (
          <span className="text-[10px] font-bold text-gray-400">{day.dayTss} TSS</span>
        )}
      </div>

      <div className="flex-1 space-y-2">
        <SortableContext 
          items={day.workouts.map((w: any) => w.id)} 
          strategy={verticalListSortingStrategy}
        >
          {day.workouts.map((w: any) => (
            <SortableWorkout 
              key={w.id} 
              workout={w} 
              getWorkoutColor={getWorkoutColor}
              onEdit={onWorkoutEdit}
            />
          ))}
        </SortableContext>
      </div>

      <button 
        onClick={onAddWorkout}
        className="mt-2 w-full py-1.5 flex items-center justify-center gap-1 text-xs font-semibold text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
      >
        <Plus size={14} /> Ajouter
      </button>
    </div>
  );
};
