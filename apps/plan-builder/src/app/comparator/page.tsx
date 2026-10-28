"use client";

import React, { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import CourseComparator from '@/components/CourseComparator';

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
