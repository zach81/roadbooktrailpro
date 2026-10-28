"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError("");
      setLoading(true);
      await login(email, password);
      router.push("/");
    } catch (err: any) {
      setError("Échec de la connexion. Vérifiez vos identifiants.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    try {
      setError("");
      setLoading(true);
      await loginWithGoogle();
      router.push("/");
    } catch (err: any) {
      setError("Échec de la connexion avec Google.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-7 bg-white p-8 rounded-2xl shadow-lg border border-slate-200/80">
        <div className="flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-[#FF5A36] text-[11px] font-extrabold uppercase tracking-wider mb-3">
            Espace Personnel Sécurisé
          </div>
          <h2 className="text-center text-3xl font-extrabold text-slate-900 tracking-tight">
            my<span className="text-[#FF5A36]">kairn</span>{" "}
            <span className="text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-orange-50 text-[#FF5A36] border border-orange-200 align-middle">
              Coach
            </span>
          </h2>
          <p className="mt-2 text-center text-sm text-slate-600">
            Connectez-vous à votre compte personnel pour accéder à votre espace Coaching et à vos données Intervals.icu privées.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm text-center font-semibold border border-red-200">
            {error}
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Adresse Email
              </label>
              <input
                type="email"
                required
                className="appearance-none relative block w-full px-3.5 py-2.5 border border-slate-300 placeholder-slate-400 text-slate-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF5A36] focus:border-[#FF5A36] sm:text-sm"
                placeholder="athlete@mykairn.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Mot de passe
              </label>
              <input
                type="password"
                required
                className="appearance-none relative block w-full px-3.5 py-2.5 border border-slate-300 placeholder-slate-400 text-slate-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF5A36] focus:border-[#FF5A36] sm:text-sm"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-gradient-to-r from-[#FF5A36] to-[#FF7A59] hover:opacity-95 shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Connexion..." : "Se connecter à mon espace"}
            </button>
          </div>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase font-bold">
              <span className="px-2 bg-white text-slate-400">Ou</span>
            </div>
          </div>

          <div className="mt-5">
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 border border-slate-300 rounded-xl shadow-xs bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 cursor-pointer"
            >
              Continuer avec Google
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
