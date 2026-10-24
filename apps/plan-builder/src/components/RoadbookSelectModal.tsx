"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, BookOpen, Mountain, Clock, MapPin, Search, 
  ChevronRight, Sparkles, CheckCircle2, Loader2, Upload,
  AlertCircle, ShieldCheck, Flag, ArrowRight, Zap, Activity
} from 'lucide-react';
import styles from './RoadbookSelectModal.module.css';
import { 
  fetchUserRoadbooks, 
  fetchRoadbookById, 
  convertRoadbookToParsedCourse, 
  RoadbookSummary, 
  RoadbookDoc 
} from '@/lib/roadbookPacing';
import { ParsedCourse, parseCourseFile } from '@/lib/courseParser';
import { useAuth } from '@/context/AuthContext';

interface RoadbookSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRoadbook: (course: ParsedCourse, raceFitCourse?: ParsedCourse) => void;
}

export default function RoadbookSelectModal({
  isOpen,
  onClose,
  onSelectRoadbook,
}: RoadbookSelectModalProps) {
  const { currentUser } = useAuth();

  const [roadbooks, setRoadbooks] = useState<RoadbookSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedRbId, setSelectedRbId] = useState<string>('demo-roc-de-france');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [paceProfile, setPaceProfile] = useState<'target' | 'fast' | 'slow'>('target');

  // Optional simultaneous .FIT file upload
  const [fitFile, setFitFile] = useState<File | null>(null);
  const [loadingFit, setLoadingFit] = useState<boolean>(false);
  const [fitError, setFitError] = useState<string | null>(null);

  // Fetch Roadbooks
  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);

    fetchUserRoadbooks(currentUser?.uid)
      .then((data) => {
        setRoadbooks(data);
        if (data.length > 0 && !selectedRbId) {
          setSelectedRbId(data[0].id);
        }
      })
      .catch((err) => {
        console.error('Erreur chargement roadbooks', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen, currentUser?.uid]);

  // Filtered roadbooks
  const filteredRoadbooks = useMemo(() => {
    return roadbooks.filter((rb) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return rb.name.toLowerCase().includes(q);
    });
  }, [roadbooks, searchQuery]);

  const selectedRoadbook = useMemo(() => {
    return roadbooks.find((rb) => rb.id === selectedRbId) || roadbooks[0];
  }, [roadbooks, selectedRbId]);

  const handleFitDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) setFitFile(file);
  };

  const handleFitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFitFile(file);
  };

  const handleConfirm = async () => {
    if (!selectedRoadbook) return;

    try {
      const fullDoc = await fetchRoadbookById(selectedRoadbook.id);
      if (!fullDoc) {
        alert("Impossible de charger les données détaillées de ce Roadbook.");
        return;
      }

      const roadbookCourse = convertRoadbookToParsedCourse(fullDoc, { paceProfile });

      let parsedFitCourse: ParsedCourse | undefined = undefined;
      if (fitFile) {
        setLoadingFit(true);
        try {
          parsedFitCourse = await parseCourseFile(fitFile);
        } catch (err: any) {
          setFitError(`Erreur fichier .FIT : ${err.message || err}`);
          setLoadingFit(false);
          return;
        }
      }

      onSelectRoadbook(roadbookCourse, parsedFitCourse);
      onClose();
    } catch (err: any) {
      alert(`Erreur : ${err.message || err}`);
    } finally {
      setLoadingFit(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerBrand}>
            <div className={styles.headerIcon}>
              <BookOpen size={20} />
            </div>
            <div>
              <h2 className={styles.title}>Comparer avec le Pacing Idéal d'un Roadbook</h2>
              <p className={styles.subtitle}>
                Sélectionnez votre plan de marche théorique (Trace 1) et associez votre fichier <strong>.FIT</strong> de course (Trace 2).
              </p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Layout */}
        <div className={styles.modalGrid}>
          {/* Left Column: Roadbook Selector */}
          <div className={styles.roadbookListCol}>
            <div className={styles.searchBox}>
              <Search size={14} className="text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher parmi vos roadbooks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center p-8 text-slate-500 text-xs gap-2">
                <Loader2 className="animate-spin text-orange-500" size={24} />
                <span>Chargement de vos roadbooks...</span>
              </div>
            ) : filteredRoadbooks.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                Aucun roadbook trouvé correspondant à votre recherche.
              </div>
            ) : (
              <div className={styles.roadbookList}>
                {filteredRoadbooks.map((rb) => {
                  const isSelected = rb.id === selectedRbId;
                  return (
                    <div
                      key={rb.id}
                      className={`${styles.roadbookCard} ${isSelected ? styles.roadbookCardActive : ''}`}
                      onClick={() => setSelectedRbId(rb.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <strong className="text-xs font-bold text-slate-800 line-clamp-1">
                          {rb.name}
                        </strong>
                        {rb.isDemo ? (
                          <span className={styles.demoBadge}>DÉMO</span>
                        ) : (
                          <span className={styles.cloudBadge}>MON ROADBOOK</span>
                        )}
                      </div>

                      <div className={styles.roadbookMetaRow}>
                        <span className="flex items-center gap-1">
                          <MapPin size={11} className="text-orange-500" />
                          {rb.distanceKm} km
                        </span>
                        <span className="flex items-center gap-1">
                          <Mountain size={11} className="text-rose-500" />
                          D+ {rb.elevationGainM}m
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={11} className="text-sky-500" />
                          {rb.targetTimeFormatted}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Configuration & FIT file upload */}
          <div className={styles.configCol}>
            {selectedRoadbook && (
              <div className={styles.selectedSummaryCard}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-orange-600 uppercase tracking-wide">
                    Roadbook sélectionné
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {selectedRoadbook.waypointsCount} Postes & Ravitaillements
                  </span>
                </div>
                <h3 className="text-sm font-extrabold text-slate-900 mb-2">
                  {selectedRoadbook.name}
                </h3>
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-white border border-slate-200 text-center">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block uppercase">Distance</span>
                    <span className="text-xs font-extrabold text-slate-800">{selectedRoadbook.distanceKm} km</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block uppercase">Dénivelé D+</span>
                    <span className="text-xs font-extrabold text-rose-600">+{selectedRoadbook.elevationGainM} m</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block uppercase">Chrono Cible</span>
                    <span className="text-xs font-extrabold text-emerald-600">{selectedRoadbook.targetTimeFormatted}</span>
                  </div>
                </div>

                {/* Profile Mode Option */}
                <div className="mt-3">
                  <label className="text-[11px] font-bold text-slate-700 block mb-1.5">
                    Allure & Profil du Roadbook à comparer :
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      className={`${styles.modeBtn} ${paceProfile === 'target' ? styles.modeBtnActive : ''}`}
                      onClick={() => setPaceProfile('target')}
                    >
                      <span>🎯 Cible Roadbook</span>
                      <small className="block text-[10px] opacity-75 font-normal">Chrono calculé</small>
                    </button>
                    <button
                      type="button"
                      className={`${styles.modeBtn} ${paceProfile === 'fast' ? styles.modeBtnActive : ''}`}
                      onClick={() => setPaceProfile('fast')}
                    >
                      <span>⚡ Optimiste (-6%)</span>
                      <small className="block text-[10px] opacity-75 font-normal">Allure haute</small>
                    </button>
                    <button
                      type="button"
                      className={`${styles.modeBtn} ${paceProfile === 'slow' ? styles.modeBtnActive : ''}`}
                      onClick={() => setPaceProfile('slow')}
                    >
                      <span>🛡️ Prudent (+12%)</span>
                      <small className="block text-[10px] opacity-75 font-normal">Sécurité barrières</small>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Optional File .FIT Dropzone */}
            <div className="mt-3">
              <label className="text-[11px] font-bold text-slate-700 block mb-1.5 flex items-center justify-between">
                <span>Associer votre activité réelle (.FIT / .TCX / .GPX) :</span>
                <span className="text-[10px] font-normal text-slate-500">(Optionnel - modifiable après)</span>
              </label>

              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFitDrop}
                className={`${styles.fitDropzone} ${fitFile ? styles.fitDropzoneFilled : ''} cursor-pointer`}
              >
                <input
                  type="file"
                  accept=".fit,.tcx,.gpx"
                  onChange={handleFitChange}
                  className="hidden"
                />
                <div className="flex flex-col items-center justify-center gap-1 text-center">
                  <div className="w-8 h-8 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center">
                    <Activity size={16} />
                  </div>
                  {fitFile ? (
                    <div>
                      <strong className="text-xs font-bold text-slate-800 block truncate max-w-[260px]">
                        {fitFile.name}
                      </strong>
                      <span className="text-[11px] text-emerald-600 font-semibold flex items-center justify-center gap-1">
                        <CheckCircle2 size={12} /> Fichier prêt pour analyse
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs font-bold text-sky-700 block">
                        Glissez votre fichier .FIT de course ici
                      </span>
                      <span className="text-[11px] text-slate-400">
                        (ou cliquez pour parcourir Garmin, Coros, Suunto...)
                      </span>
                    </div>
                  )}
                </div>
              </label>
              {fitError && (
                <p className="mt-1 text-xs text-red-600 font-semibold">{fitError}</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <Zap size={14} className="text-orange-500" />
            <span>Pacing calculé selon Minetti, pente, ITRA et arrêts ravitaillement.</span>
          </span>

          <div className="flex items-center gap-2">
            <button className={styles.cancelBtn} onClick={onClose}>
              Annuler
            </button>
            <button
              className={styles.launchBtn}
              onClick={handleConfirm}
              disabled={!selectedRoadbook || loadingFit}
            >
              {loadingFit ? (
                <>
                  <Loader2 className="animate-spin" size={15} />
                  <span>Analyse en cours...</span>
                </>
              ) : (
                <>
                  <Zap size={15} />
                  <span>Lancer la Comparaison Roadbook</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
