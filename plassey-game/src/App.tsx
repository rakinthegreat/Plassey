import { useState, useEffect, useRef } from 'react';
import { useGameStore } from './store/gameStore';
import { MainMenu } from './components/MainMenu';
import { Lobby } from './components/Lobby';
import { GameBoard } from './components/GameBoard';
import { webRTCManager } from './lib/WebRTCManager';
import { AudioController } from './components/AudioController';
import { AudioToggle } from './components/AudioToggle';

function App() {
  const [showRules, setShowRules] = useState(false);
  const { status, lobbyId, localPlayerId, playerName, isHost, resetSession, networkStatus, phase, isLanMode } = useGameStore();
  const rejoinAttempted = useRef(false);

  useEffect(() => {
    // Auto-rejoin on refresh if session exists
    if (status !== 'menu' && lobbyId && localPlayerId && playerName && !rejoinAttempted.current) {
        console.log(`[SESSION] Recommencing session for ${playerName} in room ${lobbyId}`);
        rejoinAttempted.current = true;
        
        if (isHost) {
            webRTCManager.initializeAsHost(lobbyId);
        } else {
            webRTCManager.initializeAsClient(lobbyId, playerName);
        }
    }
  }, [status, lobbyId, localPlayerId, playerName, isHost]);

  const handleLeaveGame = () => {
    if (window.confirm("Abandon current campaign and return to Main Menu?")) {
        resetSession();
        window.location.reload(); // Hard refresh to clear classes/listeners
    }
  };

  const renderContent = () => {
    if (status === 'menu') return <MainMenu />;
    if (status === 'lobby') return <Lobby />;
    if (status === 'in_progress') return <GameBoard />;
    return null;
  };

  return (
    <div className="min-h-screen bg-[#0a0f18] text-slate-200 font-sans selection:bg-amber-500/30 selection:text-amber-200">
      <div className="max-w-7xl mx-auto px-4 py-8 md:py-12 flex flex-col items-center justify-center min-h-screen">
        
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

        {status !== 'menu' && (
            <div className="fixed top-3 right-4 z-40 md:top-6 md:right-6">
                <button
                    onClick={handleLeaveGame}
                    className="p-1.5 md:p-2 bg-slate-900/60 hover:bg-rose-900/40 border border-slate-800 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-rose-400 transition-all flex items-center gap-2 backdrop-blur-sm shadow-xl"
                >
                    <span>🚪</span> <span className="hidden sm:inline">Leave Campaign</span><span className="sm:hidden">Exit</span>
                </button>
            </div>
        )}

        {/* Dynamic Views */}
        <main className="w-full flex justify-center items-center flex-1">
          {renderContent()}
        </main>

        {/* Tactical Link Alert (Non-blocking) - Cloud Mode Only */}
        {status !== 'menu' && !isLanMode && (
            (phase === 'lobby' && (networkStatus === 'none' || networkStatus === 'signaling')) || 
            (phase !== 'lobby' && (networkStatus === 'none' || networkStatus === 'signaling'))
        ) && (
            <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm animate-in slide-in-from-top duration-500">
                <div className="bg-amber-600/90 backdrop-blur-md border border-amber-400/50 rounded-lg p-3 shadow-2xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                        <div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-white leading-none">Tactical Link Sync</h3>
                            <p className="text-[8px] font-bold uppercase tracking-tighter text-amber-100/70 mt-0.5">
                                {networkStatus === 'none' ? 'Restoring Signaling...' : 'Establishing Peer Tunnel...'}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleLeaveGame}
                            className="text-[8px] text-amber-200/50 hover:text-rose-400 underline uppercase font-black tracking-widest transition-all px-2"
                        >
                            Abandon
                        </button>
                        <button 
                            onClick={() => {
                                if (isHost) {
                                    webRTCManager.initializeAsHost(lobbyId!);
                                } else {
                                    webRTCManager.initializeAsClient(lobbyId!, playerName!);
                                }
                            }}
                            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-[8px] font-black uppercase tracking-widest text-white transition-all border border-white/20"
                        >
                            Sync
                        </button>
                    </div>
                </div>
            </div>
        )}

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

      {/* Atmospheric Audio Engine */}
      <AudioController />
      <AudioToggle />
    </div>
  );
}

export default App;
