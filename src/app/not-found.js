"use client";

import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>404 - Page non trouvée</h2>
      <p>La ressource demandée n'existe pas.</p>
      <Link href="/" style={{ textDecoration: 'underline', color: 'blue' }}>
        Retour à l'accueil
      </Link>
    </div>
  );
}
