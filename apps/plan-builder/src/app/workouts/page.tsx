"use client";

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { WorkoutTemplate } from '@/types';
import { Activity, Clock, Zap, Tag } from 'lucide-react';

export default function WorkoutsPage() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const querySnapshot = await getDocs(collection(db, 'workout_templates'));
        const fetchedTemplates: WorkoutTemplate[] = [];
        querySnapshot.forEach((doc) => {
          fetchedTemplates.push(doc.data() as WorkoutTemplate);
        });
        setTemplates(fetchedTemplates);
      } catch (error) {
        console.error("Error fetching templates:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchTemplates();
  }, []);

  return (
    <div className="flex-1 bg-gradient-to-br from-slate-50 to-blue-50/30 p-4 md:p-8 overflow-y-auto h-[calc(100vh-64px)]">
      <div className="max-w-6xl mx-auto space-y-6 pb-20">
        <header className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Bibliothèque de Séances</h1>
            <p className="text-gray-500 mt-1 text-sm">Parcourez les modèles d'entraînement disponibles.</p>
          </div>
          <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium">
            {templates.length} Séances
          </div>
        </header>

        {loading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : templates.length === 0 ? (
          <main className="bg-white p-12 rounded-2xl border-2 border-dashed border-gray-200 text-center">
            <h2 className="text-xl font-semibold text-gray-600">Aucune séance trouvée</h2>
            <p className="text-gray-500 mt-2">La base de données est vide. Veuillez exécuter le script d'initialisation.</p>
          </main>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <div key={template.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-bold text-slate-900 line-clamp-2">{template.name}</h3>
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-semibold whitespace-nowrap ml-2">
                    {template.category}
                  </span>
                </div>
                
                <p className="text-sm text-gray-600 flex-1 mb-4 line-clamp-3">
                  {template.description}
                </p>
                
                <div className="space-y-3">
                  <div className="flex gap-4 text-sm text-slate-700">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-slate-400" />
                      {template.defaultDuration} min
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-orange-400" />
                      {template.defaultTss} TSS
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-blue-400" />
                      {template.sport}
                    </div>
                  </div>
                  
                  {template.tags && template.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-50">
                      {template.tags.map(tag => (
                        <span key={tag} className="flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-50 px-2 py-1 rounded">
                          <Tag className="w-3 h-3" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
