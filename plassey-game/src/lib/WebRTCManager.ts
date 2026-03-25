import type { NetworkPayload } from "../types/game";
import { useGameStore } from "../store/gameStore";
import { GameEngine } from "./GameEngine";
import Peer from "peerjs";
import type { DataConnection } from "peerjs";

export class WebRTCManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private isHost: boolean = false;
  private chatHandlers: ((msg: { sender: string; text: string; time: string }) => void)[] = [];
  private localPlayerId: string | null = null;

  constructor() {
    console.log("WebRTCManager initialized");
  }

  public onChatMessage(handler: (msg: { sender: string; text: string; time: string }) => void) {
    this.chatHandlers.push(handler);
    return () => {
      this.chatHandlers = this.chatHandlers.filter(h => h !== handler);
    };
  }

  public async initializeAsHost(roomCode: string) {
    this.isHost = true;
    this.localPlayerId = "HOST";

    if (this.peer) this.peer.destroy();
    
    this.peer = new Peer(`plassey-host-${roomCode}`);

    this.peer.on('open', (id) => {
        console.log(`Host peer globally initialized: ${id}`);
        useGameStore.getState().setLobbyId(roomCode);
    });

    this.peer.on('connection', (conn) => {
        console.log(`Incoming connection from client: ${conn.peer}`);
        
        conn.on('open', () => {
            this.connections.set(conn.peer, conn);
            
            // Immediately send current state to the joining peer so they don't see a blank lobby
            const currentState = useGameStore.getState();
            conn.send(JSON.stringify({
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
                    roundHistory: currentState.roundHistory
                }
            }));
        });

        conn.on('data', (data) => {
            this.handleIncomingMessage(data as string);
        });

        conn.on('close', () => {
            console.log(`Client disconnected: ${conn.peer}`);
            this.connections.delete(conn.peer);
            // We could trigger a connect loss update here if we want
        });

        conn.on('error', (err) => {
            console.error(`Connection error from ${conn.peer}:`, err);
        });
    });

    this.peer.on('error', (err) => {
        console.error('Host peer error:', err);
        if (err.type === 'unavailable-id') {
            alert('This room code is already active!');
        }
    });
  }

  public async initializeAsClient(roomCode: string, playerName: string) {
    this.isHost = false;
    this.localPlayerId = useGameStore.getState().localPlayerId;

    if (this.peer) this.peer.destroy();
    
    this.peer = new Peer();

    this.peer.on('open', (id) => {
        console.log(`Client peer globally initialized: ${id}`);
        useGameStore.getState().setLobbyId(roomCode);
        
        const conn = this.peer!.connect(`plassey-host-${roomCode}`, {
            reliable: true
        });

        conn.on('open', () => {
            console.log('Connected to Host data channel');
            this.connections.set('HOST', conn);
            
            this.sendActionToHost({
              type: "join_lobby",
              senderId: this.localPlayerId || "",
              data: { name: playerName }
            });

            this.sendActionToHost({
              type: "chat",
              senderId: this.localPlayerId || "",
              data: { text: `SYSTEM: ${playerName || 'A commander'} has arrived.` }
            });
        });

        conn.on('data', (data) => {
            this.handleIncomingMessage(data as string);
        });

        conn.on('close', () => {
            console.warn('Connection to host closed');
            this.connections.delete('HOST');
        });

        conn.on('error', (err) => {
            console.error('Connection to host error:', err);
        });
    });

    this.peer.on('error', (err) => {
        console.error('Client peer error:', err);
        if (err.type === 'peer-unavailable') {
            alert('Host not found. Check the room code.');
        }
    });
  }

  public broadcastState(state: any) {
    if (!this.isHost) return;
    const message = JSON.stringify({ type: "STATE_UPDATE", senderId: "HOST", data: state });
    this.sendToPeers(message);
  }

  public sendActionToHost(payload: NetworkPayload) {
    const message = JSON.stringify(payload);
    if (this.isHost) {
      this.handleIncomingMessage(message);
    } else {
      const channel = this.connections.get("HOST");
      if (channel && channel.open) {
        channel.send(message);
      }
    }
  }

  private sendToPeers(message: string) {
    this.connections.forEach((channel) => {
      if (channel.open) {
        channel.send(message);
      }
    });
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
          const newPending = store.pendingVoters.filter(id => id !== payload.senderId);
          const newVotes = { ...store.teamVotes, [payload.senderId]: payload.data.vote };
          
          if (newPending.length > 0) {
            store.setMasterState({ teamVotes: newVotes, pendingVoters: newPending });
            this.broadcastState({ ...store, teamVotes: newVotes, pendingVoters: newPending });
          } else {
            const result = GameEngine.tallyTeamVotes(store.players, newVotes);
            const newState = {
              teamVotes: newVotes,
              pendingVoters: [],
              lastTeamVoteResult: result,
              phase: 'team_vote_reveal' as const
            };
            store.setMasterState(newState);
            this.broadcastState({ ...store, ...newState });
          }
        }

        if (payload.type === "vote_mission") {
          const newPending = store.pendingVoters.filter(id => id !== payload.senderId);
          const newMissionVotes = [...store.missionVotes, payload.data.vote];
          
          if (newPending.length > 0) {
            store.setMasterState({ missionVotes: newMissionVotes, pendingVoters: newPending });
            this.broadcastState({ ...store, missionVotes: newMissionVotes, pendingVoters: newPending });
          } else {
            const result = GameEngine.tallyMissionVotes(newMissionVotes, store.currentRound, store.players.length);
            const newHistory = [...store.roundHistory];
            newHistory[store.currentRound - 1] = result.passed ? 'nawab' : 'eic';

            const newState = {
              missionVotes: newMissionVotes,
              pendingVoters: [],
              lastMissionVoteResult: result,
              roundHistory: newHistory,
              phase: 'mission_vote_reveal' as const
            };
            store.setMasterState(newState);
            this.broadcastState({ ...store, ...newState });
          }
        }

        if (payload.type === "continue_phase") {
          if (store.phase === 'team_vote_reveal') {
            if (store.lastTeamVoteResult?.passed) {
              const newState = {
                phase: 'mission_voting' as const,
                failedProposals: 0,
                pendingVoters: store.proposedTeam
              };
              store.setMasterState(newState);
              this.broadcastState({ ...store, ...newState });
            } else {
              const nextFailedCount = store.failedProposals + 1;
              const nextLeaderId = GameEngine.getNextLeader(store.players, store.leaderId!);

              if (nextFailedCount >= 5) {
                // EIC auto-wins the round due to 5 failed proposals
                const newHistory = [...store.roundHistory];
                newHistory[store.currentRound - 1] = 'eic';
                
                // Immediately check endgame from 5-fails...
                const endgame = GameEngine.checkEndgame(newHistory);
                
                if (endgame === 'eic') {
                  const finalState = {
                    phase: 'game_over' as const,
                    winner: 'eic' as const,
                    winReason: '3_missions_failed',
                    roundHistory: newHistory
                  };
                  store.setMasterState(finalState);
                  this.broadcastState({ ...store, ...finalState });
                } else if (endgame === 'nawab') {
                  const finalState = {
                    phase: 'identify_mir_madan' as const,
                    roundHistory: newHistory
                  };
                  store.setMasterState(finalState);
                  this.broadcastState({ ...store, ...finalState });
                } else {
                  // EIC won the round but not 3 yet. Move to next round.
                  const nextNextLeaderId = GameEngine.getNextLeader(store.players, nextLeaderId);
                  const resetState = {
                    phase: 'team_proposal' as const,
                    currentRound: store.currentRound + 1,
                    leaderId: nextNextLeaderId,
                    roundHistory: newHistory,
                    proposedTeam: [],
                    teamVotes: {},
                    missionVotes: [],
                    failedProposals: 0,
                    lastTeamVoteResult: null
                  };
                  store.setMasterState(resetState);
                  this.broadcastState({ ...store, ...resetState });
                }
              } else {
                // Team rejected, move to next leader proposal
                const newState = {
                  phase: 'team_proposal' as const,
                  failedProposals: nextFailedCount,
                  leaderId: nextLeaderId,
                  teamVotes: {},
                  lastTeamVoteResult: null
                };
                store.setMasterState(newState);
                this.broadcastState({ ...store, ...newState });
              }
            }
          } else if (store.phase === 'mission_vote_reveal') {
            const endgame = GameEngine.checkEndgame(store.roundHistory);
            
            if (endgame === 'eic') {
              const finalState = {
                phase: 'game_over' as const,
                winner: 'eic' as const,
                winReason: '3_missions_failed'
              };
              store.setMasterState(finalState as any);
              this.broadcastState({ ...store, ...finalState });
            } else if (endgame === 'nawab') {
              const finalState = {
                phase: 'identify_mir_madan' as const
              };
              store.setMasterState(finalState as any);
              this.broadcastState({ ...store, ...finalState });
            } else {
              const nextLeaderId = GameEngine.getNextLeader(store.players, store.leaderId!);
              const resetState = {
                phase: 'team_proposal' as const,
                currentRound: store.currentRound + 1,
                leaderId: nextLeaderId,
                proposedTeam: [],
                teamVotes: {},
                missionVotes: [],
                failedProposals: 0,
                lastMissionVoteResult: null
              };
              store.setMasterState(resetState);
              this.broadcastState({ ...store, ...resetState });
            }
          }
        }

        if (payload.type === "guess_mir_madan") {
            const endgameResult = GameEngine.tallyMirMadanGuess(store.players, payload.data.targetId);
            const finalState = {
                phase: 'game_over' as const,
                ...endgameResult
            };
            store.setMasterState(finalState as any);
            this.broadcastState({ ...store, ...finalState });
        }

        if (payload.type === "return_to_lobby") {
            const resetState = {
                status: 'lobby' as const,
                phase: 'lobby' as const,
                currentRound: 1,
                failedProposals: 0,
                leaderId: null,
                proposedTeam: [],
                teamVotes: {},
                missionVotes: [],
                roundHistory: ['pending', 'pending', 'pending', 'pending', 'pending'],
                winner: undefined,
                winReason: undefined
            };
            const resetPlayers = store.players.map(p => ({ ...p, role: undefined, faction: undefined }));
            store.setMasterState({ ...resetState, players: resetPlayers } as any);
            this.broadcastState({ ...store, ...resetState, players: resetPlayers });
        }
      }

      if (payload.type === "chat") {
        const chatMsg = {
          sender: payload.senderId,
          text: payload.data.text,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        if (this.isHost) {
          const broadcastPayload: NetworkPayload = {
            type: "chat_broadcast",
            senderId: payload.senderId,
            data: chatMsg
          };
          this.sendToPeers(JSON.stringify(broadcastPayload));
          this.notifyChatHandlers(chatMsg);
        }
      }

      if (payload.type === "chat_broadcast") {
        this.notifyChatHandlers(payload.data);
      }
    } catch (error) {
      console.error("Failed to parse incoming message:", error);
    }
  }

  private notifyChatHandlers(msg: { sender: string; text: string; time: string }) {
    this.chatHandlers.forEach(h => h(msg));
  }
}

export const webRTCManager = new WebRTCManager();
