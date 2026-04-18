import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { webRTCManager } from '../lib/WebRTCManager';
import { v4 as uuidv4 } from 'uuid';
import { DownloadAppButton } from './DownloadAppButton';

export const MainMenu: React.FC = () => {
  const [playerName, setPlayerName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isLanMode, setIsLanMode] = useState(false);
  const [hostIp, setHostIp] = useState('');
  const [discoveredHosts, setDiscoveredHosts] = useState<{ ip: string, port: number, name: string, code: string }[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const isNative = !!((window as any).cordova && (window as any).cordova.plugins);

  const setStatus = useGameStore((state) => state.setStatus);
  const setLocalPlayerId = useGameStore((state) => state.setLocalPlayerId);
  const setHotseatMode = useGameStore((state) => state.setHotseatMode);
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
    // We only do this ONCE on mount to avoid killing a session we just started.
    if (lobbyId) {
      console.log("[IDENTITY] Deep Scour: Clearing leftover tactical metadata.");
      webRTCManager.close();
      resetSession();
    }
  }, []); // Run ONLY on component mount

  React.useEffect(() => {
    let zc: any = null;
    if (isLanMode) {
      // @ts-ignore
      if (window.cordova && window.cordova.plugins && window.cordova.plugins.zeroconf) {
        setIsScanning(true);
        // @ts-ignore
        zc = window.cordova.plugins.zeroconf;
        
        // DEEP RESET: Force-reset the native discovery engine to clear stale NsdManager caches.
        // This resolves the "Added but not Resolved" hang in Android discovery.
        zc.reInit(() => {
          console.log("[DISCOVERY] Native engine re-initialized.");
          // Small grace period for the OS to cycle the multicast listeners
          setTimeout(() => {
            zc.unwatch('_plassey._tcp.', 'local.');
        
            zc.watch('_plassey._tcp.', 'local.', (result: any) => {
          const action = result.action;
          const service = result.service;
          
          if (action === 'added' || action === 'resolved') {
            const ips = service.ipv4Addresses || [];
            // Extraction: Try metadata roomId, then regex-based fallback from service name
            const metaCode = service.txt && service.txt.roomId;
            const nameMatch = service.name.match(/PlasseyHost_([A-Z]{4})/i);
            const namePart = nameMatch ? nameMatch[1] : '';
            const code = (metaCode || namePart || '').toUpperCase();

            console.log(`[DISCOVERY] ${action.toUpperCase()}: ${service.name} (Code: ${code}) Port: ${service.port} IPs:`, ips);

            // TACTICAL GUARD: If port is 0, the service is 'added' but not yet 'resolved'.
            // Do not add to list yet to avoid 'Ghost' entries (defaulting to 8081).
            if (service.port === 0 && action === 'added') {
              console.log(`[DISCOVERY] Delaying display of ${service.name} until port resolution...`);
              return;
            }

            if (ips.length > 0 && service.port > 0) {
              setDiscoveredHosts(prev => {
                let updated = [...prev];
                const servicePort = service.port;
                ips.forEach((ip: string) => {
                  // Key by IP + Port to allow multiple sessions from one host
                  const existingIndex = updated.findIndex(h => h.ip === ip && h.port === servicePort);
                  if (existingIndex !== -1) {
                    updated[existingIndex] = { ip, port: servicePort, name: service.name, code };
                  } else {
                    updated.push({ ip, port: servicePort, name: service.name, code });
                  }
                });
                return updated;
              });
            } else {
              // Service found but either no IP or port 0 (unresolved)
              console.log(`[DISCOVERY] Pending resolution for ${service.name} (Port: ${service.port}, IPs: ${ips.length})`);
            }
          } else if (action === 'removed') {
            setDiscoveredHosts(prev => prev.filter(h => h.name !== service.name));
          }
            });
          }, 150);
        }, (err: any) => console.error("[DISCOVERY] Native reset failed:", err));
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

  const handleToggleLan = () => {
    const nextMode = !isLanMode;
    setIsLanMode(nextMode);
    
    // PROACTIVE SCOUR: If transitioning to LAN mode, proactively clear any latent native servers.
    // This gives the OS a head start on releasing the port before the user clicks "Host".
    if (nextMode) {
      console.log("[LAN] Toggle Activated: Proactively clearing native signaling layer...");
      webRTCManager.close();
    }
  };
  const handleHost = async () => {
    if (!playerName.trim()) return alert('Please enter a name');

    const id = localPlayerId || uuidv4();
    const code = generateRoomCode();
    let localAddr: string | undefined;

    if (isLanMode) {
      try {
        const { LocalServerManager } = await import('../lib/LocalServerManager');
        const { address: boundAddr, port: boundPort } = await LocalServerManager.startServer(8081, code);
        localAddr = boundAddr;
        
        console.log(`[LAN] Host Success on port ${boundPort}. Local Addr: ${boundAddr}`);
        
        const loopbackAddr = '127.0.0.1';
        webRTCManager.setCustomServerUrl(`ws://${loopbackAddr}:${boundPort}`);
        setLanMode(true, loopbackAddr);
      } catch (e: any) {
        console.error("[LAN] Host initiation failed:", e);
        alert("Failed to start local server. Are you on a native device? Error: " + e.message);
        setLanMode(false, '');
        webRTCManager.setCustomServerUrl(null);
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
    webRTCManager.initializeAsHost(code, localAddr);

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

    const proceedWithJoin = () => {
      setIsHost(false);
      const id = localPlayerId || uuidv4();

      setLocalPlayerId(id);
      setLobbyId(finalCode);
      setStorePlayerName(finalName);

      // Initialize WebRTC as Client
      webRTCManager.initializeAsClient(finalCode, finalName);
      setStatus('lobby');
    };

    if (isLanMode) {
      // PROBING LOGIC
      const startJoin = async () => {
        let targetIp = finalIp;
        let targetPort = "8081";

        // If the user provided ip:port, parse it
        if (finalIp.includes(':')) {
            const parts = finalIp.split(':');
            targetIp = parts[0];
            targetPort = parts[1];
        } else {
            // Check if we have this IP in discovered hosts to get its port
            const discovered = discoveredHosts.find(h => h.ip === finalIp);
            if (discovered) {
                targetPort = String(discovered.port);
            } else {
                // BRUTE FORCE SCAN FALLBACK (User typed manual IP without port)
                console.log(`[JOIN] No port specified for ${finalIp}. Commencing tactical port probe (8081-8089)...`);
                for (let p = 8081; p <= 8089; p++) {
                    const success = await new Promise((resolve) => {
                        const testWs = new WebSocket(`ws://${finalIp}:${p}`);
                        const timer = setTimeout(() => { testWs.close(); resolve(false); }, 400); // 400ms per port
                        testWs.onopen = () => { clearTimeout(timer); testWs.close(); resolve(true); };
                        testWs.onerror = () => { clearTimeout(timer); resolve(false); };
                    });
                    if (success) {
                        console.log(`[JOIN] Tactical link discovered on port ${p}!`);
                        targetPort = String(p);
                        break;
                    }
                }
            }
        }

        webRTCManager.setCustomServerUrl(`ws://${targetIp}:${targetPort}`);
        setLanMode(true, targetIp);
        proceedWithJoin();
      };

      startJoin();
    } else {
      webRTCManager.setCustomServerUrl(null);
      setLanMode(false, '');
      proceedWithJoin();
    }
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
              onClick={handleToggleLan}
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
                      setHostIp(host.port === 8081 ? host.ip : `${host.ip}:${host.port}`);
                      if (host.code) setRoomCodeInput(host.code.toUpperCase());
                    }}
                    className={`w-full text-left bg-slate-900 border ${(hostIp === host.ip || hostIp === `${host.ip}:${host.port}`) ? 'border-amber-500 bg-amber-900/40 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'border-slate-600 hover:border-slate-500'} rounded-lg py-3 px-4 text-white text-sm focus:outline-none transition-all flex flex-col group relative overflow-hidden`}
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

                    {(hostIp === host.ip || hostIp === `${host.ip}:${host.port}`) && (
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

        <div className="relative flex items-center py-2">
          <div className="flex-grow border-t border-slate-800"></div>
          <span className="flex-shrink mx-4 text-slate-700 text-[10px] font-black uppercase tracking-widest">Offline</span>
          <div className="flex-grow border-t border-slate-800"></div>
        </div>

        <button
          onClick={() => {
            setHotseatMode(true);
            setStatus('hotseat_setup');
          }}
          className="w-full bg-slate-900/50 hover:bg-slate-800 border border-slate-800 hover:border-amber-600/50 text-slate-400 hover:text-amber-500 font-bold py-3 px-6 rounded-lg shadow-lg transform active:scale-95 transition-all flex items-center justify-center gap-2 group"
        >
          <span>Initiate Pass & Play</span>
        </button>

        <DownloadAppButton />
      </div>

      <p className="mt-8 text-slate-500 text-[10px] uppercase tracking-widest text-center">Battle of Plassey 1757 • P2P Deduction</p>
    </div>
  );
};
