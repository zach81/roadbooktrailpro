import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from '@/context/AuthContext';
import { NavbarActionsProvider } from '@/context/NavbarActionsContext';
import Navbar from '@/components/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import BottomNav from '@/components/BottomNav';
import LandscapePrompt from '@/components/LandscapePrompt';
import PwaManager from '@/components/PwaManager';
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
  title: {
    default: "mykairn — Trail Roadbook Pro & Stratégie de Course",
    template: "%s | mykairn",
  },
  description: "Application professionnelle pour la génération de roadbooks de trail, stratégie nutritionnelle et analyse de traces GPX.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "mykairn",
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
    ]
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#FF5A36",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-screen flex flex-col m-0">
        <NavbarActionsProvider>
          <AuthProvider>
            <Navbar />
            <LandscapePrompt />
            <div className="layout-with-sidebar">
              <Sidebar />
              <main className="container main-content">
                {children}
              </main>
            </div>
            <BottomNav />
            <PwaManager />
          </AuthProvider>
        </NavbarActionsProvider>
      </body>
    </html>
  );
}
