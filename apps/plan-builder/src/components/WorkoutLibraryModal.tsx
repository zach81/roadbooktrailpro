import React, { useState, useEffect } from 'react';
import { Workout } from '@/types';
import { X, Search, CheckCircle2 } from 'lucide-react';
import { getWorkoutTemplates } from '@/lib/firebaseUtils';

interface WorkoutLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  coachId: string;
  initialTypeFilter?: string;
  onSelect: (workout: Workout) => void;
}

const WorkoutLibraryModal: React.FC<WorkoutLibraryModalProps> = ({
  isOpen,
  onClose,
  coachId,
  initialTypeFilter,
  onSelect
}) => {
  const [templates, setTemplates] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>(initialTypeFilter || '');

  const fetchTemplates = async () => {
    setLoading(true);
    const data = await getWorkoutTemplates(coachId);
    setTemplates(data);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      if (initialTypeFilter) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        setTypeFilter(initialTypeFilter);
      }
      fetchTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTypeFilter, coachId]);

  if (!isOpen) return null;

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (t.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter ? t.type === typeFilter : true;
    return matchesSearch && matchesType;
  });

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

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50 rounded-t-3xl">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-800">Bibliothèque de Séances</h2>
            <p className="text-sm text-gray-500 font-medium">Piochez une séance thématique pour remplacer la séance actuelle.</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 border-b border-gray-100 flex gap-4 bg-white">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Rechercher une séance..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
            />
          </div>
          <select 
            value={typeFilter} 
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-48 px-4 py-2 bg-slate-50 border border-gray-200 rounded-xl outline-none text-sm font-semibold text-slate-700"
          >
            <option value="">Tous les axes</option>
            <option value="Recovery">Recovery</option>
            <option value="Endurance">Endurance</option>
            <option value="Tempo">Tempo</option>
            <option value="Threshold">Threshold</option>
            <option value="VO2Max">VO2Max</option>
            <option value="Long Run">Long Run</option>
            <option value="Strength">Strength</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>Aucune séance trouvée dans la bibliothèque.</p>
              <p className="text-sm mt-2">Vous pouvez sauvegarder vos propres séances comme templates depuis l&apos;éditeur.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTemplates.map(t => (
                <div 
                  key={t.id} 
                  className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer transition flex flex-col justify-between"
                  onClick={() => onSelect(t)}
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-slate-800">{t.name}</h4>
                      <span className="px-2 py-1 text-xs font-bold text-white rounded-md" style={{ backgroundColor: getWorkoutColor(t.type) }}>{t.type}</span>
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{t.description || "Aucune description"}</p>
                    <div className="text-xs font-semibold text-gray-600 flex gap-3">
                      <span>⏱️ {t.estimatedDuration} min</span>
                      <span>📈 {t.totalTss} TSS</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                    <button className="text-sm font-bold text-blue-600 flex items-center gap-1 hover:text-blue-700">
                      <CheckCircle2 size={16} /> Sélectionner
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkoutLibraryModal;
