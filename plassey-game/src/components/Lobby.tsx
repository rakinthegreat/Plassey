import React from 'react';
import { useGameStore } from '../store/gameStore';
import { webRTCManager } from '../lib/WebRTCManager';
import { GameEngine } from '../lib/GameEngine';

export const Lobby: React.FC = () => {
  const { lobbyId, players, localPlayerId, setMasterState, networkStatus } = useGameStore();

  const localPlayer = players.find(p => p.id === localPlayerId);
  const isHost = localPlayer?.isHost || false;
  const toggleAdvancedMode = useGameStore(state => state.toggleAdvancedMode);
  const toggleHouseRules = useGameStore(state => state.toggleHouseRules);
  const isAdvancedMode = useGameStore(state => state.isAdvancedMode);
  const isHouseRulesEnabled = useGameStore(state => state.isHouseRulesEnabled);

  const minPlayers = isHouseRulesEnabled ? 4 : 5;
  const canStart = players.length >= minPlayers;

  const handleToggleAdvanced = () => {
    if (!isHost) return;
    toggleAdvancedMode();
    webRTCManager.broadcastState({ isAdvancedMode: !isAdvancedMode });
  };

  const handleToggleHouseRules = () => {
    if (!isHost) return;
    toggleHouseRules();
    webRTCManager.broadcastState({ isHouseRulesEnabled: !isHouseRulesEnabled });
  };

  const handleStartGame = () => {
    if (!isHost) return;

    // 1. Assign Secret Roles
    const playersWithRoles = GameEngine.assignRoles(players, isAdvancedMode);

    // 2. Select First Leader (Random)
    const leader = playersWithRoles[Math.floor(Math.random() * playersWithRoles.length)];

    // 3. Prepare Initial Master State
    const initialState = {
      status: 'in_progress' as const,
      phase: 'role_reveal' as const,
      players: playersWithRoles,
      currentRound: 1,
      leaderId: leader.id,
      failedProposals: 0
    };

    // 4. Update Local Store
    setMasterState(initialState);

    // 5. Broadcast to all peers
    webRTCManager.broadcastState({
      lobbyId: lobbyId || '',
      isAdvancedMode,
      ...initialState
    } as any);
  };

  return (
    <div className="w-full max-w-4xl bg-slate-900/50 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-500">
      <div className="p-8 border-b border-slate-800 bg-slate-900/80 flex justify-between items-center">
        <div>
          <h2 className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em] mb-1">Active Lobby</h2>
          <div className="flex items-center gap-3">
            <span className="text-4xl font-black text-white tracking-widest leading-none">{lobbyId}</span>
            <button
              onClick={() => navigator.clipboard.writeText(lobbyId)}
              className="text-slate-500 hover:text-amber-500 transition-all active:text-emerald-500 active:scale-90"
              title="Copy Code"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
              </svg>
            </button>
          </div>
        </div>
        {isHost && (
          <div className="text-right">
            <div className="flex flex-col gap-2 mb-4">
              <div className="flex items-center justify-end gap-3">
                <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isAdvancedMode ? 'text-amber-500' : 'text-slate-600'}`}>
                  Advanced Mode
                </span>
                <button
                  onClick={handleToggleAdvanced}
                  className={`w-10 h-5 rounded-full transition-all relative ${isAdvancedMode ? 'bg-amber-600 shadow-[0_0_10px_rgba(217,119,6,0.3)]' : 'bg-slate-700'}`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white absolute top-1 transition-transform ${isAdvancedMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-end gap-3">
                <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isHouseRulesEnabled ? 'text-amber-500' : 'text-slate-600'}`}>
                  House Rules (Allow 4P)
                </span>
                <button
                  onClick={handleToggleHouseRules}
                  className={`w-10 h-5 rounded-full transition-all relative ${isHouseRulesEnabled ? 'bg-amber-600 shadow-[0_0_10px_rgba(217,119,6,0.3)]' : 'bg-slate-700'}`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white absolute top-1 transition-transform ${isHouseRulesEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <button
              onClick={handleStartGame}
              disabled={!canStart}
              className={`px-8 py-3 rounded-xl font-bold transition-all transform active:scale-95 shadow-lg ${canStart
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/20'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'
                }`}
            >
              {canStart ? 'Commence Battle' : `Need ${minPlayers - players.length} More`}
            </button>
            <p className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest">Only the host can start</p>
          </div>
        )}
      </div>

      <div className="p-8">
        <h3 className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
          Connected Commanders <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-[10px]">{players.length}</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {players.map((player) => (
            <div
              key={player.id}
              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${player.id === localPlayerId
                  ? 'bg-amber-500/5 border-amber-500/30'
                  : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/60'
                }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg ${player.isHost ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-300'
                  }`}>
                  {player.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">{player.name}</span>
                    {player.id === localPlayerId && <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded uppercase">You</span>}
                  </div>
                  {player.isHost && <span className="text-[10px] text-amber-500 font-bold uppercase tracking-tighter">Mission Host</span>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${player.connected ? 'bg-emerald-500' : 'bg-rose-500'} shadow-[0_0_8px_rgba(16,185,129,0.3)]`}></div>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">
                  {player.connected ? 'Ready' : 'Lost Link'}
                </span>
              </div>
            </div>
          ))}

          {/* Skeleton slots */}
          {Array.from({ length: Math.max(0, 5 - players.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="flex items-center p-4 rounded-xl border border-slate-800/50 border-dashed opacity-40">
              <div className="w-10 h-10 rounded-lg bg-slate-800/50 border border-slate-700/50 mr-4"></div>
              <div className="space-y-2">
                <div className="h-4 w-24 bg-slate-800/50 rounded"></div>
                <div className="h-2 w-12 bg-slate-800/20 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between px-8">
        <div className="flex items-center gap-2 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></span>
          Peer Signaling Active
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Network:</span>
          <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter ${networkStatus === 'turn'
              ? 'bg-emerald-500/20 text-emerald-500'
              : networkStatus === 'stun'
                ? 'bg-amber-500/20 text-amber-500'
                : 'bg-rose-500/20 text-rose-500'
            }`}>
            {networkStatus === 'turn' ? 'Open (TURN)' : networkStatus === 'stun' ? 'Limited (STUN)' : 'Restricted'}
          </div>
        </div>
      </div>
    </div>
  );
};
