import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { webRTCManager } from '../lib/WebRTCManager';
import { v4 as uuidv4 } from 'uuid';

export const MainMenu: React.FC = () => {
  const [playerName, setPlayerName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isLanMode, setIsLanMode] = useState(false);
  const [hostIp, setHostIp] = useState('');
  const [discoveredHosts, setDiscoveredHosts] = useState<{ip: string, name: string, code: string}[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const isNative = !!((window as any).cordova && (window as any).cordova.plugins);
  
  const setStatus = useGameStore((state) => state.setStatus);
  const setLocalPlayerId = useGameStore((state) => state.setLocalPlayerId);
  const setLobbyId = useGameStore((state) => state.setLobbyId);
  const updatePlayers = useGameStore((state) => state.updatePlayers);
  const setStorePlayerName = useGameStore((state) => state.setPlayerName);
  const setIsHost = useGameStore((state) => state.setIsHost);
  const resetSession = useGameStore((state) => state.resetSession);
  const lobbyId = useGameStore((state) => state.lobbyId);
  const localPlayerId = useGameStore((state) => state.localPlayerId);
  const setLanMode = useGameStore((state) => state.setLanMode);

  React.useEffect(() => {
    // If we're on the Main Menu but have leftover lobby state, clean it.
    if (lobbyId) {
      console.log("[IDENTITY] Deep Scour: Clearing leftover tactical metadata.");
      resetSession();
    }
  }, [lobbyId, resetSession]);

  React.useEffect(() => {
    let zc: any = null;
    if (isLanMode) {
      // @ts-ignore
      if (window.cordova && window.cordova.plugins && window.cordova.plugins.zeroconf) {
        setIsScanning(true);
        // @ts-ignore
        zc = window.cordova.plugins.zeroconf;
        zc.watch('_plassey._tcp.', 'local.', (result: any) => {
          const action = result.action;
          const service = result.service;
           if (action === 'added' || action === 'resolved') {
              const ip = service.ipv4Addresses && service.ipv4Addresses[0];
              // Robust extraction: Try metadata first, then service name fallback (PlasseyHost_ABCD)
              const metaCode = service.txt && service.txt.roomId;
              const namePart = service.name.split('_')[1];
              const code = (metaCode || namePart || '').toUpperCase();
              
              if (ip) {
                 setDiscoveredHosts(prev => {
                    const existing = prev.find(h => h.ip === ip);
                    if (existing && existing.code === code) return prev;
                    // Filter out any existing with same IP to update with new code if needed
                    return [...prev.filter(h => h.ip !== ip), { ip, name: service.name, code }];
                 });
              }
          } else if (action === 'removed') {
             setDiscoveredHosts(prev => prev.filter(h => h.name !== service.name));
          }
        });
      }
    } else {
      setDiscoveredHosts([]);
      setIsScanning(false);
    }

    return () => {
       if (zc) {
          zc.unwatch('_plassey._tcp.', 'local.');
       }
    };
  }, [isLanMode]);

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
    
    const id = localPlayerId || uuidv4();
    const code = generateRoomCode();
    
    if (isLanMode) {
      try {
        const { LocalServerManager } = await import('../lib/LocalServerManager');
        const localAddr = await LocalServerManager.startServer(8081, code);
        const loopbackAddr = (localAddr === '0.0.0.0' || !localAddr) ? '127.0.0.1' : localAddr;
        
        console.log(`[LAN] Host Server bound to: ${localAddr}. Loopback using: ${loopbackAddr}`);
        webRTCManager.setCustomServerUrl(`ws://${loopbackAddr}:8081`);
        setLanMode(true, loopbackAddr);
      } catch (e: any) {
        alert("Failed to start local server. Are you on a native device? Error: " + e.message);
        return;
      }
    } else {
      webRTCManager.setCustomServerUrl(null);
    }

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

  const handleJoin = (overrideCode?: string, overrideIp?: string) => {
    const finalName = playerName.trim();
    const finalCode = (overrideCode || roomCodeInput).toUpperCase().trim();
    const finalIp = (overrideIp || hostIp).trim();

    if (!finalName) return alert('Please enter a name');
    if (finalCode.length !== 4) {
       console.error(`[JOIN FAIL] Code: "${finalCode}" is invalid. Length: ${finalCode.length}`);
       return alert(`Tactical Link Error: Room Code "${finalCode || 'EMPTY'}" must be exactly 4 letters. Please ensure the host is fully initialized or enter manually.`);
    }
    if (isLanMode && !finalIp) return alert('Please enter the Host IP for LAN mode');
    
    if (isLanMode) {
      webRTCManager.setCustomServerUrl(`ws://${finalIp}:8081`);
      setLanMode(true, finalIp);
    } else {
      webRTCManager.setCustomServerUrl(null);
      setLanMode(false, '');
    }

    setIsHost(false);
    const id = localPlayerId || uuidv4();
    
    setLocalPlayerId(id);
    setLobbyId(finalCode);
    setStorePlayerName(finalName);
    
    // Initialize WebRTC as Client
    webRTCManager.initializeAsClient(finalCode, finalName);
    
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

        {isNative && (
           <div className="flex items-center justify-between bg-slate-800 p-3 rounded-lg border border-slate-700">
             <span className="text-slate-300 text-sm font-semibold uppercase tracking-wider">Local Hotspot (LAN)</span>
             <button 
               onClick={() => setIsLanMode(!isLanMode)}
               className={`w-12 h-6 rounded-full transition-colors relative ${isLanMode ? 'bg-amber-500' : 'bg-slate-600'}`}
             >
               <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${isLanMode ? 'translate-x-7' : 'translate-x-1'}`} />
             </button>
           </div>
        )}

        {isNative && isLanMode && (
          <div className="bg-amber-900/20 border border-amber-500/30 p-3 rounded-lg animate-in fade-in zoom-in-95 duration-200">
             <div className="flex items-center justify-between mb-2">
               <p className="text-amber-200/70 text-xs uppercase tracking-wide font-bold">
                 {isScanning ? 'Scanning for Hosts...' : 'Joining? Select Host:'}
               </p>
               {isScanning && <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></div>}
             </div>
             
             {discoveredHosts.length > 0 ? (
                 <div className="space-y-2 max-h-32 overflow-y-auto mb-3">
                   {discoveredHosts.map(host => (
                      <button
                        key={host.ip}
                        onClick={() => {
                           setHostIp(host.ip);
                           if (host.code) setRoomCodeInput(host.code.toUpperCase());
                        }}
                        className={`w-full text-left bg-slate-900 border ${hostIp === host.ip ? 'border-amber-500 bg-amber-900/40 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'border-slate-600 hover:border-slate-500'} rounded-lg py-3 px-4 text-white text-sm focus:outline-none transition-all flex flex-col group relative overflow-hidden`}
                      >
                         <div className="flex items-center justify-between w-full">
                           <div className="flex flex-col">
                             <span className="font-bold text-amber-500 group-hover:text-amber-400 transition-colors text-base">
                                {host.name.replace('PlasseyHost_', 'Commander ')}
                             </span>
                             {host.code && (
                               <span className="text-[10px] text-amber-200/50 uppercase font-bold tracking-widest bg-amber-900/40 px-1.5 py-0.5 rounded w-fit mt-1">
                                 Tactical Code: {host.code}
                               </span>
                             )}
                           </div>
                           <div className="text-right">
                              <div className="text-slate-400 text-[10px] font-mono">{host.ip}</div>
                              <div className="text-amber-500/50 text-[9px] uppercase font-bold group-hover:text-amber-500 transition-colors">Select Unit</div>
                           </div>
                         </div>

                         {hostIp === host.ip && (
                           <div
                             onClick={(e) => {
                               e.stopPropagation();
                               handleJoin(host.code, host.ip);
                             }}
                             className="mt-3 w-full bg-amber-600 hover:bg-amber-500 text-white font-black py-2 rounded uppercase tracking-tighter text-xs shadow-lg animate-in slide-in-from-top-2 duration-300 text-center"
                           >
                              Begin Synchronization & Join
                           </div>
                         )}
                      </button>
                   ))}
                 </div>
             ) : (
                <div className="text-center py-2 border border-dashed border-slate-700/50 rounded-lg mb-3 bg-slate-800/20">
                  <p className="text-slate-500 text-xs italic">{isScanning ? 'Searching...' : 'No tactical hosts found on LAN.'}</p>
                </div>
             )}

             <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest whitespace-nowrap">Manual IP:</span>
                <input
                  type="text"
                  placeholder="e.g. 192.168.43.1"
                  className="w-full bg-slate-900 border border-slate-700 rounded-md py-1.5 px-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                  value={hostIp}
                  onChange={(e) => setHostIp(e.target.value)}
                />
             </div>
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
            onClick={() => handleJoin()}
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
