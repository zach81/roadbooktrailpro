"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, addDoc } from "firebase/firestore";
import { parseGPX } from "@/lib/gpxService";
import { Search, Map as MapIcon, ArrowDownToLine, Mountain, Navigation, Compass } from "lucide-react";
import styles from "./official-traces.module.css";

export default function OfficialTraces() {
  const { currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const [officialRaces, setOfficialRaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      router.push("/login");
      return;
    }

    async function fetchOfficialRaces() {
      try {
        const q = query(collection(db, "official_traces"));
        const snap = await getDocs(q);
        const data = [];
        snap.forEach((doc) => {
          data.push({ id: doc.id, ...doc.data() });
        });
        setOfficialRaces(data);
      } catch (err) {
        console.error("Erreur lors de la récupération des traces officielles", err);
      } finally {
        setLoading(false);
      }
    }

    fetchOfficialRaces();
  }, [currentUser, authLoading, router]);

  const handleLoadOfficialTrace = async (race) => {
    if (importing) return;
    try {
      setImporting(true);
      
      const response = await fetch(race.gpxUrl);
      if (!response.ok) throw new Error("Fichier introuvable");
      const gpxText = await response.text();
      
      const { stats, points, waypoints: gpxWaypoints } = await parseGPX(gpxText);
      const importedWaypoints = race.waypoints ? JSON.parse(race.waypoints) : gpxWaypoints;
      
      const docRef = await addDoc(collection(db, "roadbooks"), {
        userId: currentUser.uid,
        name: race.name,
        officialDistance: race.distance || 0,
        officialElevation: race.elevation || 0,
        stats,
        points: JSON.stringify(points),
        waypoints: JSON.stringify(importedWaypoints),
        segments: [],
        createdAt: new Date(),
      });
      
      router.push(`/editor/${docRef.id}`);
    } catch (err) {
      console.error("Erreur lors du chargement de la trace officielle :", err);
      alert("Erreur lors du chargement de cette course.");
      setImporting(false);
    }
  };

  const filteredRaces = officialRaces.filter(race => 
    race.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (race.event && race.event.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (authLoading || loading) return <div className={styles.loader}>Chargement...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Traces Officielles</h1>
        <p>Importez les parcours des plus grandes courses de trail et préparez votre roadbook.</p>
      </header>

      <div className={styles.searchContainer}>
        <Search className={styles.searchIcon} size={20} />
        <input 
          type="text" 
          placeholder="Rechercher une course (ex: UTMB, Diagonale...)" 
          className={styles.searchInput}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {filteredRaces.length === 0 ? (
        <div className={styles.emptyState}>
          <Compass size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
          <h3>Aucune course trouvée</h3>
          <p>Essayez de modifier votre recherche.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredRaces.map((race) => (
            <div key={race.id} className={styles.card} onClick={() => handleLoadOfficialTrace(race)}>
              <div className={styles.imagePlaceholder}>
                {race.event && <span className={styles.eventBadge}>{race.event}</span>}
                <MapIcon size={48} opacity={0.3} />
              </div>
              
              <div className={styles.cardContent}>
                <h3>{race.name}</h3>
                
                <div className={styles.statsRow}>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Distance</span>
                    <span className={styles.statValue}>
                      <Navigation size={16} /> {race.distance} km
                    </span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Dénivelé</span>
                    <span className={styles.statValue} style={{ color: '#27ae60' }}>
                      <Mountain size={16} /> +{race.elevation}m
                    </span>
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  <button className={styles.importBtn} disabled={importing}>
                    {importing ? "Importation..." : (
                      <>
                        <ArrowDownToLine size={18} /> Importer et planifier
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
