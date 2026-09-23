"use client";

export default function GlobalError({ error, reset }) {
  return (
    <html lang="fr">
      <body>
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Une erreur est survenue !</h2>
          <button onClick={() => reset()} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
