import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from '@/context/AuthContext';
import Navbar from '@/components/Navbar';
import "./globals.css";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "TrailRoadbookPro",
  description: "Application professionnelle pour la génération de roadbooks de trail à partir de traces GPX.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <Navbar />
          <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
