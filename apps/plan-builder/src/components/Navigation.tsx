"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Users, Settings, Activity, ArrowLeft } from "lucide-react";

export default function Navigation() {
  const pathname = usePathname();

  const tabs = [
    { name: "Athlètes", href: "/", icon: Users },
    { name: "Séances", href: "/workouts", icon: Activity },
    { name: "Paramètres", href: "/settings", icon: Settings },
  ];

  return (
    <nav className="bg-[var(--bg-surface)]/80 backdrop-blur-md border-b border-[var(--border-subtle)] sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto">
        <div className="flex justify-between items-center">
          <div className="flex space-x-2 sm:space-x-8 overflow-x-auto">
            {tabs.map((tab) => {
              const isActive = pathname === tab.href;
              const Icon = tab.icon;
              
              return (
                <Link
                  key={tab.name}
                  href={tab.href}
                  className={`flex items-center gap-2 py-4 px-3 border-b-2 font-medium text-sm whitespace-nowrap transition-all duration-200 ${
                    isActive
                      ? "border-blue-600 text-blue-700"
                      : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                  }`}
                >
                  <Icon size={18} className={isActive ? "text-blue-600" : "text-gray-400"} />
                  {tab.name}
                </Link>
              );
            })}
          </div>
          
          <div className="flex items-center">
            {/* Lien pour retourner vers le site principal (Web) */}
            <a 
              href="/dashboard"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100/80 hover:bg-slate-200 rounded-full transition-colors border border-slate-200"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Retour au Dashboard</span>
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
}

