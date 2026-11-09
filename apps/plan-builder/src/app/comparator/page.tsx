"use client";

import React, { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const CourseComparator = dynamic(
  () => import('@/components/CourseComparator'),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-12 text-slate-500 font-medium text-sm gap-3">
        <Loader2 className="animate-spin text-orange-500" size={28} />
        <span>Chargement du comparateur de courses & virtuel partner...</span>
      </div>
    )
  }
);

function ComparatorContent() {
  const searchParams = useSearchParams();
  const athleteName = searchParams.get('athlete') || undefined;
  const athleteId = searchParams.get('athleteId') || undefined;

  useEffect(() => {
    document.title = athleteName
      ? `Comparateur (${athleteName}) | mykairn`
      : 'Comparateur & Virtual Partner | mykairn';
  }, [athleteName]);

  return <CourseComparator initialAthleteName={athleteName} initialAthleteId={athleteId} />;
}

export default function ComparatorPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm font-semibold text-slate-500">Chargement du comparateur...</div>}>
      <ComparatorContent />
    </Suspense>
  );
}
