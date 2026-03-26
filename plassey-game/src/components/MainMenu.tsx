import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { webRTCManager } from '../lib/WebRTCManager';
import { v4 as uuidv4 } from 'uuid';

export const MainMenu: React.FC = () => {
  const [playerName, setPlayerName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  
  const setStatus = useGameStore((state) => state.setStatus);
  const setLocalPlayerId = useGameStore((state) => state.setLocalPlayerId);
  const setLobbyId = useGameStore((state) => state.setLobbyId);
  const updatePlayers = useGameStore((state) => state.updatePlayers);
  const setStorePlayerName = useGameStore((state) => state.setPlayerName);
  const setIsHost = useGameStore((state) => state.setIsHost);
  const resetSession = useGameStore((state) => state.resetSession);
  const lobbyId = useGameStore((state) => state.lobbyId);

  React.useEffect(() => {
    // If we're on the Main Menu but have leftover lobby state, clean it.
    if (lobbyId) {
      console.log("[IDENTITY] Deep Scour: Clearing leftover tactical metadata.");
      resetSession();
    }
  }, [lobbyId, resetSession]);

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleHost = () => {
    if (!playerName.trim()) return alert('Please enter a name');
    
    const id = uuidv4();
    const code = generateRoomCode();
    
    setLocalPlayerId(id);
    setLobbyId(code);
    setStorePlayerName(playerName);
    setIsHost(true);
    
    // Initialize WebRTC as Host
    webRTCManager.initializeAsHost(code);
    
    // Add host to player list
    updatePlayers([{ id, name: playerName, isHost: true, connected: true }]);
    
    setStatus('lobby');
  };

  const handleJoin = () => {
    if (!playerName.trim()) return alert('Please enter a name');
    if (roomCodeInput.length !== 4) return alert('Please enter a valid 4-letter room code');
    
    setIsHost(false); // Immediate Reset
    const id = uuidv4();
    const code = roomCodeInput.toUpperCase();
    
    setLocalPlayerId(id);
    setLobbyId(code);
    setStorePlayerName(playerName);
    setIsHost(false);
    
    // Initialize WebRTC as Client
    webRTCManager.initializeAsClient(code, playerName);
    
    setStatus('lobby');
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-slate-900 rounded-xl shadow-2xl border border-slate-700 max-w-md w-full mx-auto">
      <h2 className="text-3xl font-bold text-white mb-6 tracking-tight">Commander's Quarters</h2>
      
      <div className="w-full space-y-4">
        <div>
          <label className="block text-slate-400 text-sm font-semibold mb-1 uppercase tracking-wider">Your Name</label>
          <input
            type="text"
            className="w-full bg-slate-800 border border-slate-600 rounded-lg py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
            placeholder="Enter Name..."
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
        </div>

        <button
          onClick={handleHost}
          className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:shadow-amber-500/20 transform active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <span>Host a Campaign</span>
        </button>

        <div className="relative flex items-center py-2">
          <div className="flex-grow border-t border-slate-700"></div>
          <span className="flex-shrink mx-4 text-slate-500 text-xs font-bold uppercase">OR</span>
          <div className="flex-grow border-t border-slate-700"></div>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            className="w-full bg-slate-800 border border-slate-600 rounded-lg py-3 px-4 text-white text-center text-xl font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
            placeholder="CODE"
            maxLength={4}
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
          />
          <button
            onClick={handleJoin}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg transform active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span>Join Existing Front</span>
          </button>
        </div>
      </div>
      
      <p className="mt-8 text-slate-500 text-[10px] uppercase tracking-widest text-center">Battle of Plassey 1757 • P2P Deduction</p>
    </div>
  );
};
