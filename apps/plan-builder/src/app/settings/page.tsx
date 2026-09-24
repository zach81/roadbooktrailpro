export default function SettingsPage() {
  return (
    <div className="flex-1 bg-gradient-to-br from-slate-50 to-blue-50/30 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h1 className="text-2xl font-bold text-slate-900">Paramètres</h1>
          <p className="text-gray-500 mt-1 text-sm">Configuration globale de l'application.</p>
        </header>

        <main className="bg-white p-12 rounded-2xl border-2 border-dashed border-gray-200 text-center">
          <h2 className="text-xl font-semibold text-gray-600">Fonctionnalité à venir</h2>
          <p className="text-gray-500 mt-2">Vous pourrez bientôt configurer vos clés API, préférences d'export et profil entraîneur ici.</p>
        </main>
      </div>
    </div>
  );
}
