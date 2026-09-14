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

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NavbarActionsProvider>
          <AuthProvider>
            <Navbar />
            <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem', flexGrow: 1 }}>
              {children}
            </main>
          </AuthProvider>
        </NavbarActionsProvider>
      </body>
    </html>
  );
}
