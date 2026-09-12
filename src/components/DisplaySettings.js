"use client";

import { useState, useEffect } from 'react';
import { Settings, X } from 'lucide-react';

export const defaultDisplayConfig = {
  dist: true,
  elePos: true,
  eleNeg: true,
  timeInter: true,
  timeTotal: true,
  etaFast: true,
  etaSlow: true,
  cutoff: true,
  pace: true,
  nutrition: true,
  vam: false  // VAM masquée par défaut (donnée avancée)
};

export function useDisplaySettings(storageKey = "roadbookDisplayConfig") {
  const [config, setConfig] = useState(defaultDisplayConfig);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        setConfig({ ...defaultDisplayConfig, ...JSON.parse(saved) });
      } catch (e) {
        console.error("Error parsing display config", e);
      }
    }
    setIsLoaded(true);
  }, [storageKey]);

  const updateConfig = (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    localStorage.setItem(storageKey, JSON.stringify(newConfig));
  };

  return { config, updateConfig, isLoaded };
}

export default function DisplaySettings({ config, updateConfig }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)} 
        className="btn btn-secondary" 
        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
      >
        <Settings size={16} /> Affichage
      </button>
    );
  }

  const Checkbox = ({ id, label }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.875rem' }}>
      <input 
        type="checkbox" 
        checked={config[id]} 
        onChange={(e) => updateConfig(id, e.target.checked)} 
      />
      {label}
    </label>
  );

  return (
    <div style={{ position: 'relative' }}>
      <button 
        onClick={() => setIsOpen(false)} 
        className="btn btn-secondary" 
        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-surface)' }}
      >
        <Settings size={16} /> Affichage
      </button>
      
      <div style={{ 
        position: 'absolute', 
        top: 'calc(100% + 8px)', 
        right: 0, 
        width: '280px',
        background: 'var(--bg-surface)', 
        border: '1px solid var(--border-light)', 
        borderRadius: 'var(--radius-lg)', 
        padding: '16px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
        zIndex: 100,
        display: 'grid',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
          <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 'bold' }}>Paramètres d'affichage</h4>
          <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={16} />
          </button>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <Checkbox id="dist" label="Distance" />
          <Checkbox id="elePos" label="Dénivelé +" />
          <Checkbox id="eleNeg" label="Dénivelé -" />
          <Checkbox id="timeInter" label="Temps Inter." />
          <Checkbox id="timeTotal" label="Temps Total" />
          <Checkbox id="etaFast" label="ETA Rapide" />
          <Checkbox id="etaSlow" label="ETA Lent" />
          <Checkbox id="cutoff" label="Barrière Hor." />
          <Checkbox id="pace" label="Allure/Vitesse" />
          <Checkbox id="nutrition" label="Besoins Nutri." />
          <Checkbox id="vam" label="VAM (avancé)" />
        </div>
      </div>
    </div>
  );
}
