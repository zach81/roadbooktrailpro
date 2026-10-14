"use client";

import { useState, useRef, useEffect } from "react";
import { 
  Bot, User, Send, Loader2, Sparkles, Database, Key, 
  ArrowRight, Activity, Calendar, Zap, RefreshCw, AlertCircle
} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { getApiUrl } from "@/lib/apiHelper";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
}

export default function CoachIaPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [athleteId, setAthleteId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [athleteName, setAthleteName] = useState("Mon profil");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedId = localStorage.getItem("intervalsAthleteId") || "";
    const storedKey = localStorage.getItem("intervalsApiKey") || "";
    setAthleteId(storedId);
    setApiKey(storedKey);

    const isConnected = Boolean(storedId && storedKey);

    setMessages([
      {
        role: 'assistant',
        content: isConnected
          ? `Bonjour ! Je suis ton **Coach IA Trail & Ultra**.\n\nJe suis connecté en direct à ton compte **Intervals.icu** (\`${storedId}\`).\n\nTu peux me poser des questions sur tes **séances passées**, ta **charge (CTL / ATL / Forme)**, ta **récupération (HRV / Sommeil)** ou me demander des conseils d'entraînement personnalisés !`
          : `Bonjour ! Je suis ton **Coach IA Trail & Ultra**.\n\n⚠️ **Intervals.icu n'est pas encore connecté.** Pour me permettre d'interroger tes séances réelles, ton HRV et ta charge d'entraînement, configure ta clé API dans les [Paramètres](/settings).`
      }
    ]);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (messageText?: string) => {
    const textToSend = (messageText || input).trim();
    if (!textToSend || isLoading) return;

    setInput("");
    const newMessages: Message[] = [...messages, { role: 'user', content: textToSend }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch(getApiUrl('/api/coach'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: messages,
          intervalsAthleteId: athleteId,
          intervalsApiKey: apiKey,
          athleteName
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.details || errorData?.error || `Erreur serveur (${response.status})`);
      }

      const data = await response.json();
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.text,
          toolsUsed: data.toolsUsed
        }
      ]);
    } catch (err: any) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Désolé, une erreur s'est produite : **${err.message || 'Erreur inconnue'}**.\n\nVérifiez votre clé API Gemini dans le fichier \`.env.local\` et vos accès Intervals.icu.`
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const isConnected = Boolean(athleteId && apiKey);

  const quickPrompts = isConnected ? [
    "📊 Analyse ma forme actuelle (CTL / ATL / Forme)",
    "🏃 Quelles sont mes dernières séances réalisées sur Intervals.icu ?",
    "💤 Vérifie mon sommeil et mon HRV sur les 14 derniers jours",
    "🏔️ Analyse mon volume de dénivelé (D+) récent et donne-moi tes conseils"
  ] : [
    "Comment structurer un plan de trail de 16 semaines ?",
    "Quelle est la différence entre modèle polarisé et pyramidal ?",
    "Comment gérer un bloc week-end choc ?"
  ];

  return (
    <div className="flex-1 bg-gradient-to-br from-slate-50 via-white to-orange-50/20 flex flex-col h-[calc(100vh-65px)]">
      {/* Top Banner */}
      <div className="bg-white border-b border-gray-100 px-6 py-3.5 flex items-center justify-between shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-tr from-orange-500 to-emerald-500 text-white rounded-xl shadow-xs">
            <Sparkles size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-800 leading-tight">Coach IA — Assistant Trail & Ultra</h1>
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                isConnected 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`}></span>
                {isConnected ? `Intervals.icu Connecté (${athleteId})` : "Intervals.icu non connecté"}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Interroge vos sorties réelles, votre fatigue et vos indicateurs physiologiques en direct.
            </p>
          </div>
        </div>

        {!isConnected && (
          <Link 
            href="/settings"
            className="flex items-center gap-1.5 text-xs font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-3 py-1.5 rounded-xl transition"
          >
            <Key size={14} /> Connecter Intervals.icu
          </Link>
        )}
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 max-w-4xl w-full mx-auto custom-scrollbar">
        {messages.map((msg, index) => (
          <div key={index} className={`flex gap-3.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-2xs ${
              msg.role === 'user' ? 'bg-orange-600 text-white' : 'bg-emerald-600 text-white'
            }`}>
              {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            
            <div className={`max-w-[85%] md:max-w-[80%] p-4 rounded-2xl text-sm ${
              msg.role === 'user' 
                ? 'bg-orange-600 text-white rounded-tr-sm shadow-xs' 
                : 'bg-white border border-gray-200/80 text-gray-800 rounded-tl-sm shadow-xs'
            }`}>
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <>
                  <div className="prose prose-sm prose-p:leading-relaxed prose-headings:my-2 prose-ul:my-1 prose-li:my-0.5 max-w-none text-gray-800">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>

                  {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                    <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                        <Database size={12} className="text-emerald-600" /> Données consultées :
                      </span>
                      {msg.toolsUsed.map((tool, tIdx) => (
                        <span 
                          key={tIdx} 
                          className="bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-[10px] font-medium px-2 py-0.5 rounded-full"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3.5">
            <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center">
              <Bot size={16} />
            </div>
            <div className="bg-white border border-gray-200 p-4 rounded-2xl rounded-tl-sm shadow-xs flex items-center gap-3 text-gray-600">
              <Loader2 size={16} className="animate-spin text-emerald-600" />
              <span className="text-xs font-medium">Interrogation de votre base Intervals.icu & analyse par le coach...</span>
            </div>
          </div>
        )}

        {/* Quick suggestions if few messages */}
        {messages.length <= 1 && !isLoading && (
          <div className="pt-4 max-w-2xl">
            <p className="text-xs font-bold text-slate-400 mb-2.5 flex items-center gap-1.5 uppercase tracking-wider">
              <Zap size={14} className="text-orange-500" /> Questions rapides :
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {quickPrompts.map((prompt, pIdx) => (
                <button
                  key={pIdx}
                  onClick={() => handleSend(prompt)}
                  className="text-left text-xs bg-white hover:bg-orange-50/80 hover:border-orange-300 border border-slate-200/80 text-slate-700 hover:text-orange-950 rounded-xl p-3 transition shadow-2xs font-medium flex items-center justify-between group"
                >
                  <span>{prompt}</span>
                  <ArrowRight size={14} className="text-slate-300 group-hover:text-orange-500 transition shrink-0 ml-2" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-4 border-t border-gray-200 bg-white shadow-lg shrink-0">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="max-w-4xl mx-auto flex gap-2.5"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isConnected 
                ? "Pose une question au coach (ex: Comment s'est passée ma semaine ? Analyse mon HRV...)" 
                : "Pose une question au coach..."
            }
            disabled={isLoading}
            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition text-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white rounded-xl shadow-xs transition flex items-center justify-center font-bold text-sm gap-2 shrink-0"
          >
            <Send size={16} />
            <span className="hidden sm:inline">Envoyer</span>
          </button>
        </form>
      </div>
    </div>
  );
}
