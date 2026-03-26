import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { webRTCManager } from '../lib/WebRTCManager';
import { v4 as uuidv4 } from 'uuid';

export const MainMenu: React.FC = () => {
  const [playerName, setPlayerName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isLanMode, setIsLanMode] = useState(false);
  const [hostIp, setHostIp] = useState('');
  
  const setStatus = useGameStore((state) => state.setStatus);
  const setLocalPlayerId = useGameStore((state) => state.setLocalPlayerId);
  const setLobbyId = useGameStore((state) => state.setLobbyId);
  const updatePlayers = useGameStore((state) => state.updatePlayers);
  const setStorePlayerName = useGameStore((state) => state.setPlayerName);
  const setIsHost = useGameStore((state) => state.setIsHost);
  const resetSession = useGameStore((state) => state.resetSession);
  const lobbyId = useGameStore((state) => state.lobbyId);
  const localPlayerId = useGameStore((state) => state.localPlayerId);

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

  const handleHost = async () => {
    if (!playerName.trim()) return alert('Please enter a name');
    
    if (isLanMode) {
      try {
        const { LocalServerManager } = await import('../lib/LocalServerManager');
        await LocalServerManager.startServer(8081);
        webRTCManager.setCustomServerUrl('ws://localhost:8081');
      } catch (e: any) {
        alert("Failed to start local server. Are you on a native device? Error: " + e.message);
        return;
      }
    } else {
      webRTCManager.setCustomServerUrl(null);
    }

    const id = localPlayerId || uuidv4();
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
    if (isLanMode && !hostIp.trim()) return alert('Please enter the Host IP for LAN mode');
    
    if (isLanMode) {
      webRTCManager.setCustomServerUrl(`ws://${hostIp.trim()}:8081`);
    } else {
      webRTCManager.setCustomServerUrl(null);
    }

    setIsHost(false); // Immediate Reset
    const id = localPlayerId || uuidv4();
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

        <div className="flex items-center justify-between bg-slate-800 p-3 rounded-lg border border-slate-700">
          <span className="text-slate-300 text-sm font-semibold uppercase tracking-wider">Local Hotspot (LAN)</span>
          <button 
            onClick={() => setIsLanMode(!isLanMode)}
            className={`w-12 h-6 rounded-full transition-colors relative ${isLanMode ? 'bg-amber-500' : 'bg-slate-600'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${isLanMode ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>

        {isLanMode && (
          <div className="bg-amber-900/20 border border-amber-500/30 p-3 rounded-lg animate-in fade-in zoom-in-95 duration-200">
             <p className="text-amber-200/70 text-xs mb-2 uppercase tracking-wide font-bold">Joining? Enter Host's IP (e.g. 192.168.43.1):</p>
             <input
               type="text"
               placeholder="Host IP Address"
               className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all font-mono"
               value={hostIp}
               onChange={(e) => setHostIp(e.target.value)}
             />
          </div>
        )}

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
