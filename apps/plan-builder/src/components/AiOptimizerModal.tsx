"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, Bot, User, Loader2, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Workout } from "@/types";

interface AiOptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: any;
  workouts: Workout[];
  onWorkoutsUpdated: (newWorkouts: Workout[]) => void;
}

export default function AiOptimizerModal({ isOpen, onClose, plan, workouts, onWorkoutsUpdated }: AiOptimizerModalProps) {
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        { 
          role: 'assistant', 
          content: "Salut ! Je suis ton coach IA spécialisé Trail & Ultra. Je viens d'analyser ton macrocycle et tes séances.\n\nComment puis-je t'aider à optimiser ce plan ? (Ex: *« Rends la semaine 3 plus facile »*, *« Ajoute du D+ ce week-end »*)" 
        }
      ]);
    }
  }, [isOpen, messages.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    
    const newMessages = [...messages, { role: 'user' as const, content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          history: messages,
          contextPlan: plan,
          contextWorkouts: workouts
        }),
      });

      if (!response.ok) {
        throw new Error("Erreur de l'API");
      }

      const data = await response.json();
      
      if (data.updatedWorkouts && data.updatedWorkouts.length > 0) {
        onWorkoutsUpdated(data.updatedWorkouts);
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.text }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Désolé, j'ai rencontré une erreur en essayant de te répondre. Vérifie ta clé API Gemini dans le fichier `.env.local`." }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-stretch justify-end bg-slate-900/40 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:w-[450px] bg-white sm:rounded-2xl shadow-2xl border border-slate-100 flex flex-col h-full sm:max-h-[calc(100vh-32px)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gradient-to-r from-blue-600 to-indigo-600 text-white sm:rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
              <Zap size={20} className="text-yellow-300" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Coach IA</h3>
              <p className="text-xs text-blue-100 font-medium">Expert Trail & Ultra</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-xl transition text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 custom-scrollbar">
          {messages.map((msg, index) => (
            <div key={index} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-blue-100 text-blue-600' : 'bg-indigo-100 text-indigo-600'}`}>
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={`max-w-[75%] p-3 rounded-2xl text-sm ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-sm' 
                  : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
              }`}>
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="prose prose-sm prose-p:leading-snug prose-p:mb-2 prose-ul:my-1 prose-li:my-0 max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <Bot size={16} />
              </div>
              <div className="bg-white border border-gray-200 p-3 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2 text-gray-500">
                <Loader2 size={16} className="animate-spin text-indigo-500" />
                <span className="text-sm font-medium">Analyse en cours...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-gray-100 bg-white sm:rounded-b-2xl">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ex: Réduis le volume de la S2..."
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-xl shadow-sm transition flex items-center justify-center shrink-0"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
