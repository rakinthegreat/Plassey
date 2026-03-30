import { v4 as uuidv4 } from 'uuid';
import type { NetworkPayload } from "../types/game";
import { useGameStore } from "../store/gameStore";
import { GameEngine } from "./GameEngine";

// Remove static ICE_SERVERS handled via dynamic injection

export class WebRTCManager {
  private ws: WebSocket | null = null;
  private isHost: boolean = false;
  private roomCode: string | null = null;
  private localPlayerId: string | null = null;
  private customWsUrl: string | null = null;

  public close() {
    console.log("[WEBRTC] Incinerating all tactical links...");
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.dataChannels.clear();
    if (this.clientPeerConnection) this.clientPeerConnection.close();
    this.clientPeerConnection = null;
    this.clientDataChannel = null;
    
    if (this.ws) {
      // Remove listeners to prevent close firing logic
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    useGameStore.getState().setNetworkStatus('none');
  }

  // Host state
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();

  // Client state
  private clientPeerConnection: RTCPeerConnection | null = null;
  private clientDataChannel: RTCDataChannel | null = null;
  // Buffering early ICE candidates
  private pendingCandidates: Record<string, RTCIceCandidateInit[]> = {};
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:74.125.143.127:19302' } // IP Fallback
  ];

  private chatHandlers: ((msg: { sender: string; senderName?: string; text: string; time: string }) => void)[] = [];

  constructor() {
    console.log("WebRTCManager initialized with native WebRTC");
  }

  public onChatMessage(handler: (msg: { sender: string; senderName?: string; text: string; time: string }) => void) {
    this.chatHandlers.push(handler);
    return () => {
      this.chatHandlers = this.chatHandlers.filter(h => h !== handler);
    };
  }

  public setCustomServerUrl(url: string | null) {
    this.customWsUrl = url;
  }
  
  public getSignalingUrl(): string {
     return this.customWsUrl || import.meta.env.VITE_WS_URL || 'wss://plassey-server.herokuapp.com';
  }

  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const wsUrl = this.customWsUrl || import.meta.env.VITE_WS_URL || 'wss://plassey-server.herokuapp.com'; // Defaulting to cloud if env missing
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = async () => {
        console.log('Connected to signaling server');
        // Pre-fetch TURN credentials in background - DO NOT AWAIT on LAN
        this.fetchTurnCredentials();
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            useGameStore.getState().setNetworkStatus('signaling');
            console.log(`[IDENTITY] P2P State: ${this.isHost ? 'COMMANDER (Host)' : 'SUBORDINATE (Client)'}`);
            resolve();
        }
      };

      this.ws.onerror = (err) => {
        console.error('Signaling server error:', err);
        reject(err);
      };

      this.ws.onclose = () => console.log('WebSocket signaling connection closed.');

      this.ws.onmessage = this.handleSignalingMessage.bind(this);
    });
  }

  async fetchTurnCredentials() {
    try {
      console.log("Fetching premium TURN credentials...");
      const response = await fetch("https://plassey.metered.live/api/v1/turn/credentials?apiKey=af0229bc3759ddf9c0db4176fd4ad3b79929");
      const meteredServers = await response.json();
      // Combine the fetched TURN servers with the default STUN servers
      this.iceServers = [...this.iceServers, ...meteredServers];
      console.log("TURN servers loaded successfully:", this.iceServers.length);
    } catch (error) {
      console.error("Failed to fetch TURN credentials, relying on standard STUN:", error);
    }
  }

  private async handleSignalingMessage(event: MessageEvent) {
    const msg = JSON.parse(event.data);
    console.log(`[SIGNALING] RX: ${msg.type} from ${msg.senderId || msg.sender}`);

    if (msg.type === 'error') {
      console.error(`[SIGNALING ERROR] ${msg.message}`);
      // Special case for identity collisions: Force reset state
      if (msg.message.includes('already has a commanding officer')) {
        console.warn("[RESCUE] Identity collision detected. Falling back to Subordinate mode.");
        const currentLobby = useGameStore.getState().lobbyId;
        const currentName = useGameStore.getState().playerName;
        
        useGameStore.getState().setIsHost(false);
        this.isHost = false; // Internal flag too
        
        if (currentLobby && currentName) {
            console.log(`[RESCUE] Attempting auto-join as subordinate for room ${currentLobby}`);
            this.initializeAsClient(currentLobby, currentName);
        } else {
            useGameStore.getState().resetSession();
        }
      } else {
        alert(`Tactical Error: ${msg.message}`);
      }
      return;
    }

    if (msg.type === 'promote_to_host') {
      console.log(`[PROMOTION] Battlefield Command restored for ${msg.roomCode}`);
      this.isHost = true;
      useGameStore.getState().setIsHost(true);
      return;
    }

    if (this.isHost) {
      if (msg.type === 'client_join') {
        await this.handleClientJoin(msg.sender);
      } else if (msg.type === 'answer') {
        const pc = this.peerConnections.get(msg.sender);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
          await this.drainPendingCandidates(msg.sender, pc);
        }
      } else if (msg.type === 'ice_candidate') {
        const peerId = msg.sender || msg.senderId;
        const pc = this.peerConnections.get(peerId);
        const candidate = msg.candidate || msg.payload;
        if (pc && candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error("ICE Add Error:", e));
          } else {
            if (!this.pendingCandidates[peerId]) this.pendingCandidates[peerId] = [];
            this.pendingCandidates[peerId].push(candidate);
          }
        }
      } else if (msg.type === 'client_leave') {
        await this.handleClientLeave(msg.sender);
      }
    } else {
      if (msg.type === 'host_leave') {
        console.log("[DISSOLUTION] The Commanding Officer has retreated. Room dissolved.");
        alert("The Commanding Officer has retreated. Campaign dissolved.");
        useGameStore.getState().resetSession();
        window.location.reload();
      } else if (msg.type === 'offer') {
        await this.handleOffer(msg.payload);
      } else if (msg.type === 'ice_candidate') {
        const pc = this.clientPeerConnection;
        const candidate = msg.candidate || msg.payload;
        const peerId = "HOST";
        if (pc && candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error("ICE Add Error:", e));
          } else {
            if (!this.pendingCandidates[peerId]) this.pendingCandidates[peerId] = [];
            this.pendingCandidates[peerId].push(candidate);
          }
        }
      }
    }
  }

  public async initializeAsHost(roomCode: string) {
    this.isHost = true;
    this.roomCode = roomCode;
    
    // PERSISTENCE: If we are re-joining a LAN session, ensure we use the local loopback
    const store = useGameStore.getState();
    if (store.isLanMode) {
        console.log(`[LAN] Local Host Re-initialization: Binding to 127.0.0.1`);
        this.setCustomServerUrl('ws://127.0.0.1:8081');
    }
    
    // Enforce Local Player ID
    let currentId = useGameStore.getState().localPlayerId;
    if (!currentId) {
        currentId = uuidv4();
        useGameStore.getState().setLocalPlayerId(currentId);
        console.log(`[IDENTITY] Generated new Host ID: ${currentId}`);
    }
    this.localPlayerId = currentId;

    // SELF-RESURRECTION: Ensure Host is in their own players list
    const state = useGameStore.getState();
    const selfInList = state.players.find(p => p.id === this.localPlayerId);
    if (!selfInList) {
        console.log(`[IDENTITY] Host missing from roster, re-inserting...`);
        state.updatePlayers([{
            id: this.localPlayerId,
            name: state.playerName || 'Host',
            isHost: true,
            connected: true
        }]);
    }

    await this.connectWebSocket();

    console.log(`[SIGNALING] Registering as HOST for room: ${roomCode}`);
    this.ws!.send(JSON.stringify({
      type: 'host_room',
      room: roomCode,
      senderId: this.localPlayerId
    }));

    useGameStore.getState().setLobbyId(roomCode);
    console.log(`Host peer globally initialized for room ${roomCode}`);
  }
  
  private async handleClientLeave(clientId: string) {
    if (!this.isHost) return;
    console.log(`[SIGNALING] Client ${clientId} has vacated the field.`);
    
    // Clean up WebRTC resources
    const pc = this.peerConnections.get(clientId);
    if (pc) pc.close();
    this.peerConnections.delete(clientId);
    this.dataChannels.delete(clientId);
    
    const store = useGameStore.getState();
    const existingPlayer = store.players.find(p => p.id === clientId);
    if (!existingPlayer) return;

    let updatedPlayers;
    if (store.status === 'lobby') {
      // Remove player entirely
      updatedPlayers = store.players.filter(p => p.id !== clientId);
    } else {
      // Mark as disconnected
      updatedPlayers = store.players.map(p => 
        p.id === clientId ? { ...p, connected: false } : p
      );
    }
    
    store.setMasterState({ players: updatedPlayers });
    this.broadcastState({ players: updatedPlayers });
  }

  private async handleClientJoin(clientId: string) {
    console.log(`Incoming connection request from client: ${clientId}`);
    
    // Cleanup existing connection for this client if any
    const existingPc = this.peerConnections.get(clientId);
    if (existingPc) {
      console.log(`[WEBRTC] Handshake Resetting for ${clientId}: Incinerating stale peer connection.`);
      try {
        // Stop all tracks and close the connection
        existingPc.getSenders().forEach(sender => existingPc.removeTrack(sender));
        existingPc.close();
      } catch (e) {
        console.warn(`[WEBRTC] Error closing stale connection for ${clientId}:`, e);
      }
      this.peerConnections.delete(clientId);
      this.dataChannels.delete(clientId);
    }
    
    try {
      console.log(`[${clientId}] 1. Creating new RTCPeerConnection...`);
      const pc = new RTCPeerConnection({ 
        iceServers: this.iceServers,
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 10
      });
      this.peerConnections.set(clientId, pc);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const type = event.candidate.candidate.split(' ')[7];
          console.log(`[${clientId}] Local ICE Candidate: ${type}`);
          
          // Update Network Status in Store
          const currentStatus = useGameStore.getState().networkStatus;
          if (type === 'relay') {
            useGameStore.getState().setNetworkStatus('turn');
          } else if (type === 'srflx' && currentStatus !== 'turn') {
            useGameStore.getState().setNetworkStatus('stun');
          }

          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              type: 'ice_candidate',
              roomCode: this.roomCode,
              senderId: this.localPlayerId,
              targetId: clientId,
              candidate: event.candidate
            }));
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[${clientId}] ICE Connection State: ${pc.iceConnectionState}`);
      };

      pc.onconnectionstatechange = () => {
        console.log(`[${clientId}] Peer Connection State: ${pc.connectionState}`);
      };

      pc.onicecandidateerror = (event: any) => {
        console.error(`[${clientId}] ICE ERROR: code ${event.errorCode}, ${event.errorText} (URL: ${event.url})`);
      };

      console.log(`[${clientId}] 2. Creating Data Channel...`);
      const dataChannel = pc.createDataChannel('plassey-channel');
      this.setupDataChannel(dataChannel, clientId);

      console.log(`[${clientId}] 3. Generating Offer...`);
      const offer = await pc.createOffer();
      
      console.log(`[${clientId}] 4. Setting Local Description...`);
      await pc.setLocalDescription(offer);

      console.log(`[${clientId}] 5. Sending Offer to Signaling Server...`);
      this.ws!.send(JSON.stringify({
        type: 'offer',
        room: this.roomCode,
        roomCode: this.roomCode,
        sender: this.localPlayerId,
        senderId: this.localPlayerId,
        target: clientId,
        targetId: clientId,
        payload: offer,
        offer: offer
      }));
      console.log(`[${clientId}] Handshake sequence completed successfully.`);

    } catch (error) {
      console.error(`[CRITICAL ERROR] Failed to initialize connection for ${clientId}:`, error);
    }
  }

  private setupDataChannel(channel: RTCDataChannel, peerId: string) {
    channel.onopen = () => {
      console.log(`Data channel opened with ${peerId}`);
      if (this.isHost) {
        this.dataChannels.set(peerId, channel);
        
        // Push full state to the newly joined client
        const currentState = useGameStore.getState();
        channel.send(JSON.stringify({
            type: 'STATE_UPDATE',
            senderId: 'HOST',
            data: {
                lobbyId: currentState.lobbyId,
                status: currentState.status,
                phase: currentState.phase,
                players: currentState.players,
                currentRound: currentState.currentRound,
                leaderId: currentState.leaderId,
                proposedTeam: currentState.proposedTeam,
                teamVotes: currentState.teamVotes,
                missionVotes: currentState.missionVotes,
                failedProposals: currentState.failedProposals,
                roundHistory: currentState.roundHistory,
                winner: currentState.winner,
                winReason: currentState.winReason,
                pendingVoters: currentState.pendingVoters,
                lastTeamVoteResult: currentState.lastTeamVoteResult,
                lastMissionVoteResult: currentState.lastMissionVoteResult
            }
        }));
      } else {
        this.clientDataChannel = channel;
        // As a client, immediately join the lobby officially
        this.sendActionToHost({
            type: "join_lobby",
            senderId: this.localPlayerId || "",
            data: { name: (this as any)._tempPlayerName || 'Unknown' }
        });
      }
    };

    channel.onmessage = (event) => {
      this.handleIncomingMessage(event.data);
    };

    channel.onclose = () => {
      console.log(`Data channel closed with ${peerId}`);
      if (this.isHost) {
        this.dataChannels.delete(peerId);
        this.peerConnections.delete(peerId);
      }
    };
  }

  public async initializeAsClient(roomCode: string, playerName: string) {
    this.isHost = false;
    this.roomCode = roomCode;
    
    // PERSISTENCE: If we are re-joining a LAN session, ensure we use the persisted Host IP
    const store = useGameStore.getState();
    if (store.isLanMode && store.lanHostIp) {
        console.log(`[LAN] Local Client Re-initialization: Binding to ${store.lanHostIp}`);
        this.setCustomServerUrl(`ws://${store.lanHostIp}:8081`);
    }
    
    // Enforce Local Player ID
    let currentId = useGameStore.getState().localPlayerId;
    if (!currentId) {
        currentId = uuidv4();
        useGameStore.getState().setLocalPlayerId(currentId);
        console.log(`[IDENTITY] Generated new Client ID: ${currentId}`);
    }
    this.localPlayerId = currentId;

    // SELF-RESURRECTION: Ensure Client is in their own players list
    const state = useGameStore.getState();
    const selfInList = state.players.find(p => p.id === this.localPlayerId);
    if (!selfInList) {
        console.log(`[IDENTITY] Client missing from roster, re-inserting...`);
        state.updatePlayers([{
            id: this.localPlayerId,
            name: playerName || 'Client',
            isHost: false,
            connected: true
        }]);
    }

    await this.connectWebSocket();
    useGameStore.getState().setLobbyId(roomCode);

    (this as any)._tempPlayerName = playerName;

    console.log(`[SIGNALING] Joining room ${roomCode} as Client: ${this.localPlayerId}`);
    this.ws!.send(JSON.stringify({
      type: 'join_room',
      room: roomCode,
      roomCode: roomCode,
      senderId: this.localPlayerId,
      sender: this.localPlayerId,
      name: playerName
    }));

    // Proactive network test
    this.testConnectivity();
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    console.log('[CLIENT] 0. Received offer from Host, starting handshake...');
    
    try {
      console.log('[CLIENT] 1. Creating RTCPeerConnection...');
      const pc = new RTCPeerConnection({ 
        iceServers: this.iceServers,
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 10
      });
      this.clientPeerConnection = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const type = event.candidate.candidate.split(' ')[7];
          console.log(`[CLIENT] Local ICE Candidate: ${type}`);
          
          // Update Network Status in Store
          const currentStatus = useGameStore.getState().networkStatus;
          if (type === 'relay') {
            useGameStore.getState().setNetworkStatus('turn');
          } else if (type === 'srflx' && currentStatus !== 'turn') {
            useGameStore.getState().setNetworkStatus('stun');
          }

          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              type: 'ice_candidate',
              roomCode: this.roomCode,
              senderId: this.localPlayerId,
              targetId: "HOST",
              candidate: event.candidate
            }));
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[CLIENT] ICE Connection State: ${pc.iceConnectionState}`);
      };

      pc.onconnectionstatechange = () => {
        console.log(`[CLIENT] Peer Connection State: ${pc.connectionState}`);
      };

      pc.onicecandidateerror = (event: any) => {
        console.error(`[CLIENT] ICE ERROR: code ${event.errorCode}, ${event.errorText} (URL: ${event.url})`);
      };

      pc.ondatachannel = (event) => {
        console.log('[CLIENT] Data Channel received from Host!');
        this.setupDataChannel(event.channel, "HOST");
        const playerName = (this as any)._tempPlayerName || 'A commander';
        this.sendActionToHost({
          type: "chat",
          senderId: this.localPlayerId || "",
          data: { text: `SYSTEM: ${playerName} has arrived.` }
        });
      };

      console.log('[CLIENT] 2. Setting Remote Description (Offer)...');
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      console.log('[CLIENT] 3. Draining pending candidates...');
      await this.drainPendingCandidates("HOST", pc);
      
      console.log('[CLIENT] 4. Generating Answer...');
      const answer = await pc.createAnswer();
      
      console.log('[CLIENT] 5. Setting Local Description (Answer)...');
      await pc.setLocalDescription(answer);

      console.log('[CLIENT] 6. Sending Answer to Signaling Server...');
      this.ws!.send(JSON.stringify({
        type: 'answer',
        room: this.roomCode,
        roomCode: this.roomCode,
        sender: this.localPlayerId,
        senderId: this.localPlayerId,
        target: "HOST",
        targetId: "HOST",
        payload: answer,
        answer: answer
      }));
      console.log('[CLIENT] Handshake sequence (Answer) completed successfully.');

    } catch (error) {
      console.error('[CLIENT CRITICAL ERROR] Failed to process offer/generate answer:', error);
    }
  }

  private async testConnectivity() {
    console.log('[NETWORK TEST] Starting ultimate connectivity check...');
    useGameStore.getState().setNetworkStatus('none');
    const gatheredTypes = new Set<string>();
    const errors: any[] = [];
    
    try {
      const pc = new RTCPeerConnection({ iceServers: this.iceServers });
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const type = event.candidate.candidate.split(' ')[7];
          gatheredTypes.add(type);
          console.log(`[NETWORK TEST] Gathered candidate: ${type}`);
          
          const currentStatus = useGameStore.getState().networkStatus;
          if (type === 'relay') {
            useGameStore.getState().setNetworkStatus('turn');
          } else if (type === 'srflx' && currentStatus !== 'turn') {
            useGameStore.getState().setNetworkStatus('stun');
          }
        }
      };

      pc.onicecandidateerror = (event: any) => {
        errors.push({ code: event.errorCode, text: event.errorText, url: event.url });
        if (event.errorCode >= 600 && event.errorCode <= 799) {
          console.warn(`[NETWORK TEST ERROR] ${event.errorCode}: ${event.errorText} (${event.url})`);
        }
      };

      pc.createDataChannel('dns-bypass-probe');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setTimeout(() => {
        console.group('[NETWORKING HEALTH REPORT]');
        console.log('Gathered Types:', Array.from(gatheredTypes));
        console.log('Result Status:', useGameStore.getState().networkStatus);
        console.log('Total Errors:', errors.length);
        if (errors.length > 0) console.log('Primary Errors:', errors.slice(0, 3));
        
        if (!gatheredTypes.has('relay')) {
          console.warn('ADVICE: No relay candidates found. Symmetric NAT (mobile) connection will likely fail.');
          console.warn('ACTION: Please try a different network or a VPN for the Host player.');
        }
        console.groupEnd();
        
        if (pc.signalingState !== 'closed') pc.close();
      }, 10000);
    } catch (e) {
      console.error('[NETWORK TEST] Critical initialization failure:', e);
    }
  }

  private async drainPendingCandidates(peerId: string, pc: RTCPeerConnection) {
    const pending = this.pendingCandidates[peerId];
    if (pending) {
      console.log(`Draining ${pending.length} pending candidates for ${peerId}`);
      for (const candidate of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error("ICE Drain Error:", e));
      }
      delete this.pendingCandidates[peerId];
    }
  }

  public broadcastState(state: any) {
    if (!this.isHost) return;

    // STRIP LOCAL STATE: Ensure we NEVER broadcast host-only identity/settings to clients.
    // This prevents "Everyone becoming Host" on refresh/sync.
    const { 
      localPlayerId, isHost, playerName, 
      isMuted, volume, networkStatus, 
      ...safeState 
    } = state;

    const message = JSON.stringify({ type: "STATE_UPDATE", senderId: this.localPlayerId, data: safeState });
    this.dataChannels.forEach((channel) => {
      if (channel.readyState === 'open') {
        channel.send(message);
      }
    });
  }

  public sendActionToHost(payload: NetworkPayload) {
    const message = JSON.stringify(payload);
    if (this.isHost) {
      this.handleIncomingMessage(message);
    } else {
      if (this.clientDataChannel && this.clientDataChannel.readyState === 'open') {
        this.clientDataChannel.send(message);
      }
    }
  }

  private handleIncomingMessage(message: string) {
    try {
      const payload: NetworkPayload = JSON.parse(message);
      const store = useGameStore.getState();
      
      if (payload.type === "STATE_UPDATE") {
        store.setMasterState(payload.data);
      }

      if (this.isHost) {
        if (payload.type === "join_lobby") {
          const exists = store.players.find(p => p.id === payload.senderId);
          if (!exists) {
            const newPlayer = {
              id: payload.senderId,
              name: payload.data.name,
              isHost: false,
              connected: true
            };
            const updatedPlayers = [...store.players, newPlayer];
            store.setMasterState({ players: updatedPlayers });
            this.broadcastState({ ...store, players: updatedPlayers });
          }
        }

        if (payload.type === "propose_team") {
          const newState = {
            proposedTeam: payload.data.team,
            phase: 'team_voting' as const,
            teamVotes: {},
            pendingVoters: store.players.map(p => p.id)
          };
          store.setMasterState(newState);
          this.broadcastState({ ...store, ...newState });
        }

        if (payload.type === "vote_team") {
          const currentVotes = { ...store.teamVotes, [payload.senderId]: payload.data.vote as 'approve' | 'reject' };
          const newPending = store.pendingVoters.filter(id => id !== payload.senderId);
          
          store.setMasterState({ 
            teamVotes: currentVotes,
            pendingVoters: newPending
          });

          if (Object.keys(currentVotes).length === store.players.length) {
            const result = GameEngine.tallyTeamVotes(store.players, currentVotes);
            const newState = {
              phase: 'team_vote_reveal' as const,
              lastTeamVoteResult: result,
              pendingVoters: []
            };
            store.setMasterState(newState);
            this.broadcastState({ ...store, ...newState });
          } else {
            this.broadcastState({ ...store, teamVotes: currentVotes, pendingVoters: newPending });
          }
        }

        if (payload.type === "vote_mission") {
          const newMissionVotes = [...store.missionVotes, payload.data.vote as 'support' | 'sabotage'];
          const newPending = store.pendingVoters.filter(id => id !== payload.senderId);
          
          store.setMasterState({ 
            missionVotes: newMissionVotes,
            pendingVoters: newPending
          });

          if (newMissionVotes.length === store.proposedTeam.length) {
            const result = GameEngine.tallyMissionVotes(newMissionVotes, store.currentRound, store.players.length);
            const updatedHistory = [...store.roundHistory];
            updatedHistory[store.currentRound - 1] = result.passed ? 'nawab' : 'eic';
            
            const newState = {
              phase: 'mission_vote_reveal' as const,
              roundHistory: updatedHistory,
              lastMissionVoteResult: result,
              pendingVoters: []
            };
            store.setMasterState(newState);
            this.broadcastState({ ...store, ...newState });
          } else {
            this.broadcastState({ ...store, pendingVoters: newPending });
          }
        }

        if (payload.type === "continue_phase") {
          if (store.phase === 'team_vote_reveal') {
            const result = store.lastTeamVoteResult;
            if (result?.passed) {
              const newState = {
                phase: 'mission_voting' as const,
                missionVotes: [],
                pendingVoters: [...store.proposedTeam]
              };
              store.setMasterState(newState);
              this.broadcastState({ ...store, ...newState });
            } else {
              const nextLeaderIndex = (store.players.findIndex(p => p.id === store.leaderId) + 1) % store.players.length;
              const newState = {
                phase: 'team_proposal' as const,
                leaderId: store.players[nextLeaderIndex].id,
                proposedTeam: [],
                teamVotes: {},
                failedProposals: store.failedProposals + 1
              };
              if (newState.failedProposals >= 5) {
                const gameOverState = {
                  phase: 'game_over' as const,
                  winner: 'eic' as const,
                  winReason: '5_failed_proposals' as const
                };
                store.setMasterState(gameOverState);
                this.broadcastState({ ...store, ...gameOverState });
              } else {
                store.setMasterState(newState);
                this.broadcastState({ ...store, ...newState });
              }
            }
          } else if (store.phase === 'mission_vote_reveal') {
            const eicWins = store.roundHistory.filter(v => v === 'eic').length;
            const nawabWins = store.roundHistory.filter(v => v === 'nawab').length;

            if (eicWins >= 3) {
              const newState = {
                phase: 'game_over' as const,
                winner: 'eic' as const,
                winReason: '3_missions_failed' as const
              };
              store.setMasterState(newState);
              this.broadcastState({ ...store, ...newState });
            } else if (nawabWins >= 3) {
              const newState = { phase: 'identify_mir_madan' as const };
              store.setMasterState(newState);
              this.broadcastState({ ...store, ...newState });
            } else {
              const nextLeaderIndex = (store.players.findIndex(p => p.id === store.leaderId) + 1) % store.players.length;
              const newState = {
                phase: 'team_proposal' as const,
                currentRound: store.currentRound + 1,
                leaderId: store.players[nextLeaderIndex].id,
                proposedTeam: [],
                teamVotes: {},
                missionVotes: [],
                failedProposals: 0
              };
              store.setMasterState(newState);
              this.broadcastState({ ...store, ...newState });
            }
          }
        }

        if (payload.type === "start_game") {
          const playersWithRoles = GameEngine.assignRoles(store.players, store.isAdvancedMode);
          const newState = {
            players: playersWithRoles,
            status: 'in_progress' as const,
            phase: 'role_reveal' as const,
            currentRound: 1,
            leaderId: playersWithRoles[Math.floor(Math.random() * playersWithRoles.length)].id,
            failedProposals: 0,
            roundHistory: Array(5).fill('pending') as any[]
          };
          store.setMasterState(newState);
          this.broadcastState({ ...store, ...newState });
        }

        if (payload.type === "guess_mir_madan") {
          const targetPlayer = store.players.find(p => p.id === payload.data.targetId);
          const newState = {
            phase: 'game_over' as const,
            winner: targetPlayer?.role === 'Mir Madan' ? 'eic' : 'nawab' as 'eic' | 'nawab',
            winReason: targetPlayer?.role === 'Mir Madan' ? 'mir_madan_assassinated' : '3_missions_won_mir_madan_safe' as any
          };
          store.setMasterState(newState);
          this.broadcastState({ ...store, ...newState });
        }

        if (payload.type === "return_to_lobby") {
          const newState = {
            status: 'lobby' as const,
            phase: 'lobby' as const,
            proposedTeam: [],
            teamVotes: {},
            missionVotes: [],
            roundHistory: Array(5).fill('pending'),
             failedProposals: 0,
             currentRound: 1
          };
          store.setMasterState(newState);
          this.broadcastState({ ...store, ...newState });
        }
      }

      if (payload.type === "chat" || (payload as any).action === "chat") {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const p = store.players.find(pl => pl.id === payload.senderId);
        let senderDisplayName = (payload as any).senderName || "Unknown";
        
        if (senderDisplayName === "Unknown") {
            const hostInStore = store.players.find(pl => pl.isHost);
            if (payload.senderId === hostInStore?.id || payload.senderId === "HOST") {
                senderDisplayName = hostInStore?.name || "High Command";
            } else if (p) {
                senderDisplayName = p.name;
            }
        }
        
        let text = payload.data?.text || (payload as any).text || "";
        if (text.startsWith("SYSTEM:")) {
            senderDisplayName = "SYSTEM";
            text = text.replace("SYSTEM: ", "");
        }

        // Only trigger UI handlers for messages from OTHER players
        // (Local messages are handled optimistically in the component)
        if (payload.senderId !== this.localPlayerId) {
          this.chatHandlers.forEach(h => h({
            sender: payload.senderId,
            senderName: senderDisplayName,
            text: text,
            time: timeStr
          }));
        }
        
        if (this.isHost) {
          const chatMsg = JSON.stringify(payload);
          this.dataChannels.forEach((channel, peerId) => {
            if (peerId !== payload.senderId && channel.readyState === 'open') {
              channel.send(chatMsg);
            }
          });
        }
      }

    } catch (e) {
      console.error("Failed to parse incoming message", e);
    }
  }
}

export const webRTCManager = new WebRTCManager();
