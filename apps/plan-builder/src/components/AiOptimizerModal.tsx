"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, Bot, User, Loader2, Zap, Database, Activity, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Workout } from "@/types";
import { getApiUrl } from "@/lib/apiHelper";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
}

interface AiOptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: any;
  workouts: Workout[];
  onWorkoutsUpdated: (newWorkouts: Workout[]) => void;
  athleteId?: string;
  athleteName?: string;
  intervalsAthleteId?: string;
  intervalsApiKey?: string;
}

export default function AiOptimizerModal({ 
  isOpen, 
  onClose, 
  plan, 
  workouts, 
  onWorkoutsUpdated,
  athleteId,
  athleteName,
  intervalsAthleteId,
  intervalsApiKey
}: AiOptimizerModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isConnectedToIntervals = Boolean(intervalsAthleteId && intervalsApiKey);

  // Initialize welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeText = isConnectedToIntervals
        ? `Salut ! Je suis ton **Coach IA Trail & Ultra**.\n\nJe suis connecté en direct à ta base de données **Intervals.icu** (${intervalsAthleteId}) et à ton macrocycle.\n\nTu peux me demander d'analyser tes **sorties récentes**, ton **niveau de fatigue / forme (CTL/ATL)**, ton **HRV / sommeil**, ou d'adapter tes séances !`
        : `Salut ! Je suis ton **Coach IA Trail & Ultra**. J'ai analysé ton macrocycle et tes séances.\n\nComment puis-je t'aider à optimiser ce plan ? *(Ex: « Rends la semaine 3 plus facile », « Ajoute du D+ ce week-end »)*\n\n*(Note : Renseigne ta clé API Intervals.icu pour que je puisse interroger tes séances et ta forme en direct).*`;

      setMessages([
        { 
          role: 'assistant', 
          content: welcomeText
        }
      ]);
    }
  }, [isOpen, messages.length, isConnectedToIntervals, intervalsAthleteId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const sendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMessage = textToSend.trim();
    setInput("");
    
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch(getApiUrl('/api/coach'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          history: messages,
          contextPlan: plan,
          contextWorkouts: workouts,
          intervalsAthleteId,
          intervalsApiKey,
          athleteName
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.details || errorData?.error || `Erreur serveur (${response.status})`);
      }

      const data = await response.json();
      
      if (data.updatedWorkouts && data.updatedWorkouts.length > 0) {
        onWorkoutsUpdated(data.updatedWorkouts);
      }

      setMessages(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          content: data.text,
          toolsUsed: data.toolsUsed
        }
      ]);
    } catch (error: any) {
      console.error(error);
      setMessages(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          content: `Désolé, une erreur s'est produite lors de l'analyse : **${error.message || 'Erreur inconnue'}**.\n\nVérifiez votre clé API Gemini dans le fichier \`.env.local\` et vos accès Intervals.icu.` 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    sendMessage(input);
  };

  const quickPrompts = isConnectedToIntervals ? [
    "📊 Analyse ma forme actuelle (CTL / Fatigue / Forme)",
    "🏃 Quelles sont mes dernières séances réalisées sur Intervals ?",
    "💤 Comment sont mes indicateurs de récupération (HRV, sommeil) ?",
    "⚡ Allège la semaine prochaine de 20%"
  ] : [
    "⚡ Allège la semaine 2 de 20%",
    "🏔️ Ajoute plus de dénivelé sur les sorties longues",
    "🎯 Prépare-moi un week-end choc sur 2 jours"
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-stretch justify-end bg-slate-900/40 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:w-[480px] bg-white sm:rounded-2xl shadow-2xl border border-slate-100 flex flex-col h-full sm:max-h-[calc(100vh-32px)]">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-orange-600 via-emerald-600 to-teal-600 text-white sm:rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                <Zap size={20} className="text-yellow-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg leading-tight">Coach IA</h3>
                  {isConnectedToIntervals && (
                    <span className="inline-flex items-center gap-1 bg-emerald-950/40 text-emerald-200 border border-emerald-400/30 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Intervals.icu Live
                    </span>
                  )}
                </div>
                <p className="text-xs text-orange-100 font-medium">Expert Trail & Ultra — {athleteName || "Athlète"}</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl transition text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 custom-scrollbar">
          {messages.map((msg, index) => (
            <div key={index} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'}`}>
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm ${
                msg.role === 'user' 
                  ? 'bg-orange-600 text-white rounded-tr-sm shadow-sm' 
                  : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
              }`}>
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <>
                    <div className="prose prose-sm prose-p:leading-snug prose-p:mb-2 prose-ul:my-1 prose-li:my-0 prose-headings:my-1.5 max-w-none text-gray-800">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>

                    {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                          <Database size={12} className="text-emerald-600" /> Base interrogée :
                        </span>
                        {msg.toolsUsed.map((tool, tIdx) => (
                          <span 
                            key={tIdx} 
                            className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-medium px-2 py-0.5 rounded-full"
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
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Bot size={16} />
              </div>
              <div className="bg-white border border-gray-200 p-3.5 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2.5 text-gray-600">
                <Loader2 size={16} className="animate-spin text-emerald-600" />
                <span className="text-xs font-medium">Interrogation de la base Intervals.icu & analyse...</span>
              </div>
            </div>
          )}

          {/* Quick suggestions when conversation starts */}
          {messages.length === 1 && !isLoading && (
            <div className="pt-2">
              <p className="text-[11px] uppercase font-bold text-slate-400 mb-2 px-1 flex items-center gap-1">
                <Sparkles size={12} className="text-orange-500" /> Suggestions rapides :
              </p>
              <div className="flex flex-col gap-1.5">
                {quickPrompts.map((prompt, pIdx) => (
                  <button
                    key={pIdx}
                    onClick={() => sendMessage(prompt)}
                    className="text-left text-xs bg-white hover:bg-orange-50 hover:border-orange-200 border border-slate-200 text-slate-700 hover:text-orange-900 rounded-xl px-3 py-2 transition shadow-2xs"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-3.5 border-t border-gray-100 bg-white sm:rounded-b-2xl">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isConnectedToIntervals ? "Pose une question sur tes séances, ta forme..." : "Ex: Allège la semaine 2..."}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white rounded-xl shadow-xs transition flex items-center justify-center shrink-0"
              title="Envoyer"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
