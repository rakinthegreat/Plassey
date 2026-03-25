import { useState } from 'react';
import { useGameStore } from './store/gameStore';
import { MainMenu } from './components/MainMenu';
import { Lobby } from './components/Lobby';
import { GameBoard } from './components/GameBoard';

function App() {
  const [showRules, setShowRules] = useState(false);
  const status = useGameStore((state) => state.status);

  return (
    <div className="min-h-screen bg-[#0a0f18] text-slate-200 font-sans selection:bg-amber-500/30 selection:text-amber-200">
      <div className="max-w-7xl mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-screen">
        
        {/* Header Section (Visible on Menu) */}
        {status === 'menu' && (
          <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-500 mb-4 tracking-tighter">
              PLASSEY 1757
            </h1>
            <div className="h-1 w-24 bg-amber-600 mx-auto mb-6 rounded-full"></div>
            <p className="text-slate-500 uppercase tracking-[0.3em] text-sm font-bold mb-6">
              The Battle for Bengal • Social Deduction
            </p>
            <button
              onClick={() => setShowRules(true)}
              className="px-6 py-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-full text-xs uppercase tracking-widest font-black transition-all shadow-lg active:scale-95 flex items-center gap-2 mx-auto"
            >
               <span>📖</span> Rules of Engagement
            </button>
          </div>
        )}

        {/* Dynamic Views */}
        <main className="w-full flex justify-center items-center">
          {status === 'menu' && <MainMenu />}
          {status === 'lobby' && <Lobby />}
          {status === 'in_progress' && <GameBoard />}
        </main>

      </div>

      {/* Rules Modal */}
      {showRules && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500">
             <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
               <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
                 <span>📜</span> Field Manual
               </h2>
               <button onClick={() => setShowRules(false)} className="text-slate-500 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 bg-slate-900/50 text-xl pb-1">
                 &times;
               </button>
             </div>
             
             <div className="p-6 overflow-y-auto custom-scrollbar flex-grow space-y-6 text-slate-300 text-sm leading-relaxed">
               
               <section>
                 <h3 className="text-amber-500 font-black uppercase tracking-widest mb-2 border-b border-slate-800 pb-2">The War Room</h3>
                 <p>Plassey 1757 is a social deduction game of secret identities and hidden treason for 5-10 players. The Nawab of Bengal defends his territory, but the British East India Company (EIC) has infiltrated his General Staff.</p>
               </section>

               <section>
                 <h3 className="text-amber-500 font-black uppercase tracking-widest mb-2 border-b border-slate-800 pb-2">The Factions</h3>
                 <ul className="space-y-3">
                   <li className="flex gap-3"><span className="text-emerald-500">🛡️</span> <div><strong>Nawab Loyalists (Majority):</strong> Your goal is to secure three successful campaigns. You do not know who anyone is. Find your true allies.</div></li>
                   <li className="flex gap-3"><span className="text-emerald-400">👁️</span> <div><strong>Mir Madan (Nawab Commander):</strong> You fight for the Nawab, but possess a distinct advantage: during the initial Role Reveal phase, you can secretly see the identities of all EIC Saboteurs. Use this to guide your team without exposing yourself.</div></li>
                   <li className="flex gap-3"><span className="text-rose-500">⚔️</span> <div><strong>EIC Saboteurs (Minority):</strong> Your goal is to sabotage three campaigns or assassinate Mir Madan. <em>You know the identity of your fellow traitors.</em></div></li>
                 </ul>
               </section>

               <section>
                 <h3 className="text-amber-500 font-black uppercase tracking-widest mb-2 border-b border-slate-800 pb-2">Game Flow</h3>
                 <ol className="list-decimal list-inside space-y-2 marker:text-slate-500 marker:font-bold">
                   <li className="mb-2"><strong>Role Reveal ("Eyes Open"):</strong> Before the first round begins, EIC members and Mir Madan are shown their targets in the tactical sidebar. <em>Once you click "Continue to Front" and the first proposal starts, all identities are permanently hidden. You must rely entirely on your memory!</em></li>
                   <li><strong>Team Proposal:</strong> The current Leader selects a specific number of players to lead the campaign.</li>
                   <li><strong>Voting:</strong> Every player openly votes to Approve or Reject the proposed team. If rejected, leadership rotates. If 5 consecutive teams are rejected, the EIC wins by default.</li>
                   <li><strong>Execution:</strong> If approved, the players on the mission privately vote to <em>Support</em> or <em>Sabotage</em>. A single Sabotage fails the campaign (except in round 4 for 7+ players, where 2 Sabotages are required).</li>
                 </ol>
               </section>

               <section>
                 <h3 className="text-amber-500 font-black uppercase tracking-widest mb-2 border-b border-slate-800 pb-2">The Endgame</h3>
                 <p className="mb-2">The game ends immediately when either faction secures 3 campaign victories. However, if the Nawab's forces win their 3rd campaign, the EIC has one final, desperate chance.</p>
                 <div className="pl-4 border-l-2 border-rose-500 text-slate-400 italic">
                   <strong className="text-rose-500 not-italic block mb-1">The Hunt for Mir Madan:</strong> 
                   The lead EIC conspirator, Mir Jafar, may assassinate a single player. If they correctly identify and execute the Nawab's primary commander, Mir Madan, the British instantly win the game.
                 </div>
               </section>

             </div>
             
             <div className="p-4 border-t border-slate-800 bg-slate-900/30 flex justify-end">
                <button onClick={() => setShowRules(false)} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold uppercase tracking-widest transition-colors text-xs">
                  Understood
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
