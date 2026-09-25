import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from '@/context/AuthContext';
import { NavbarActionsProvider } from '@/context/NavbarActionsContext';
import Navbar from '@/components/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
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
      <body className="min-h-screen flex flex-col m-0">
        <NavbarActionsProvider>
          <AuthProvider>
            <Navbar />
            <div className="layout-with-sidebar">
              <Sidebar />
              <main className="container main-content">
                {children}
              </main>
            </div>
          </AuthProvider>
        </NavbarActionsProvider>
      </body>
    </html>
  );
}
