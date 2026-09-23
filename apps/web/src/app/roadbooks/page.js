"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Map } from "lucide-react";

export default function RoadbooksPage() {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push("/login");
    }
  }, [currentUser, loading, router]);

  if (loading) return <div style={{ padding: '48px', textAlign: 'center' }}>Chargement...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Mes Roadbooks (Exports)</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
        Retrouvez ici les résumés et exports complets de vos roadbooks planifiés.
      </p>

      <div style={{ textAlign: 'center', padding: '64px 24px', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
        <Map size={48} style={{ color: 'var(--text-secondary)', opacity: 0.5, marginBottom: '16px' }} />
        <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Bientôt disponible</h3>
        <p style={{ color: 'var(--text-secondary)' }}>
          Cette section accueillera vos roadbooks exportés et prêts à être utilisés sur le terrain.
        </p>
      </div>
    </div>
  );
}
