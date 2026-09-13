import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from '@/context/AuthContext';
import { NavbarActionsProvider } from '@/context/NavbarActionsContext';
import Navbar from '@/components/Navbar';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export const metadata = {
  title: "mykairn",
  description: "Application professionnelle pour la génération de roadbooks de trail à partir de traces GPX.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="mobile-overlay">
          <svg className="mobile-overlay-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
          <h2>Version non supportée</h2>
          <p>L'application mykairn est un outil de création conçu spécifiquement pour un usage sur PC ou Mac. Veuillez vous connecter depuis un ordinateur pour une expérience optimale.</p>
        </div>
        <div className="desktop-only-content">
          <NavbarActionsProvider>
            <AuthProvider>
              <Navbar />
              <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem', flexGrow: 1 }}>
                {children}
              </main>
            </AuthProvider>
          </NavbarActionsProvider>
        </div>
      </body>
    </html>
  );
}
