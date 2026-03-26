import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { webRTCManager } from '../lib/WebRTCManager';

interface Message {
  sender: string;
  senderName?: string;
  text: string;
  time: string;
}

export const ChatBox: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const localPlayerId = useGameStore(state => state.localPlayerId);
  const players = useGameStore(state => state.players);

  useEffect(() => {
    // Listen for incoming chat messages via WebRTC
    const unsubscribe = webRTCManager.onChatMessage((msg) => {
      setMessages(prev => [...prev, msg]);
    });
    
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Scroll to bottom on new messages
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const localPlayer = players.find(p => p.id === localPlayerId);
    const senderName = localPlayer ? localPlayer.name : 'Unknown';

    webRTCManager.sendActionToHost({
      action: 'chat',
      senderId: localPlayerId || 'unknown',
      senderName: senderName,
      text: inputText
    } as any);

    setInputText('');
  };

  const getPlayerName = (id: string) => {
    const p = players.find(p => p.id === id);
    return p ? p.name : 'Unknown Commander';
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/80 border border-slate-800 rounded-lg overflow-hidden shadow-2xl">
      <div className="p-3 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Military Communications</h4>
        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
      </div>

      <div 
        ref={scrollRef}
        className="flex-grow overflow-y-auto p-4 space-y-3 custom-scrollbar"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 #0f172a' }}
      >
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center opacity-20 pointer-events-none">
            <p className="text-[10px] uppercase font-bold tracking-widest text-center">Lines are clear...<br/>Awaiting orders.</p>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.sender === localPlayerId ? 'items-end' : 'items-start'}`}>
            <span className="text-[8px] font-bold text-slate-500 uppercase mb-0.5 px-1 tracking-tighter">
              {msg.senderName || getPlayerName(msg.sender)} • {msg.time}
            </span>
            <div className={`px-3 py-2 rounded-2xl max-w-[85%] text-sm ${
              msg.sender === localPlayerId 
                ? 'bg-amber-600 text-white rounded-tr-none' 
                : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="p-2 bg-slate-900/80 border-t border-slate-800 flex gap-2">
        <input
          type="text"
          className="flex-grow bg-slate-950 border border-slate-700 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all placeholder:text-slate-600"
          placeholder="Type a dispatch..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="w-10 h-10 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925a1.5 1.5 0 001.035 1.035l5.124 1.47a.125.125 0 010 .24l-5.124 1.47a1.5 1.5 0 00-1.035 1.035l-1.414 4.925a.75.75 0 00.826.95 24.996 24.996 0 0014.288-8.731.75.75 0 000-1.015A24.996 24.996 0 003.105 2.289z" />
          </svg>
        </button>
      </form>
    </div>
  );
};
