import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Player, GameState } from '../types/game';

interface GameStore extends GameState {
  localPlayerId: string | null;
  playerName: string | null;
  isHost: boolean;
  setLobbyId: (id: string) => void;
  setStatus: (status: 'menu' | 'lobby' | 'in_progress') => void;
  setPhase: (phase: GameState['phase']) => void;
  updatePlayers: (players: Player[]) => void;
  isLanMode: boolean;
  lanHostIp: string;
  setLanMode: (isLan: boolean, hostIp: string) => void;
  isAdvancedMode: boolean;
  toggleAdvancedMode: () => void;
  returnToQuarters: () => void;
  setLocalPlayerId: (id: string) => void;
  setPlayerName: (name: string) => void;
  setIsHost: (isHost: boolean) => void;
  setLeaderId: (id: string | null) => void;
  setCurrentRound: (round: number) => void;
  setProposedTeam: (team: string[]) => void;
  networkStatus: 'none' | 'signaling' | 'stun' | 'turn';
  setNetworkStatus: (status: 'none' | 'signaling' | 'stun' | 'turn') => void;
  // Allows setting the full master state
  setMasterState: (state: Partial<GameState>) => void;
  resetSession: () => void;
  isMuted: boolean;
  volume: number;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
}

const initialState = {
  lobbyId: '',
  status: 'menu' as const,
  phase: 'lobby' as const,
  players: [],
  localPlayerId: null,
  playerName: null,
  isHost: false,
  currentRound: 1,
  failedProposals: 0,
  leaderId: null,
  proposedTeam: [],
  teamVotes: {},
  missionVotes: [],
  roundHistory: ['pending', 'pending', 'pending', 'pending', 'pending'] as any[],
  pendingVoters: [],
  lastTeamVoteResult: null,
  lastMissionVoteResult: null,
  networkStatus: 'none' as const,
  isLanMode: false,
  lanHostIp: '',
  isMuted: false,
  volume: 0.5,
  isAdvancedMode: false,
};

export const useGameStore = create<GameStore>()(
  persist(
    (set) => ({
      ...initialState,

      setNetworkStatus: (status) => set({ networkStatus: status }),
      setLobbyId: (id: string) => set({ lobbyId: id }),
      setStatus: (status) => set({ status }),
      setPhase: (phase: GameState['phase']) => set({ phase }),
      updatePlayers: (players: Player[]) => set({ players }),
      setLanMode: (isLanMode, lanHostIp) => set({ isLanMode, lanHostIp }),
      setLocalPlayerId: (id: string) => set({ localPlayerId: id }),
      setPlayerName: (playerName: string) => set({ playerName }),
      setIsHost: (isHost: boolean) => set({ isHost }),
      setLeaderId: (id: string | null) => set({ leaderId: id }),
      setCurrentRound: (round: number) => set({ currentRound: round }),
      setProposedTeam: (team: string[]) => set({ proposedTeam: team }),
      toggleAdvancedMode: () => set((state) => ({ isAdvancedMode: !state.isAdvancedMode })),
      returnToQuarters: () => set((state) => ({
        ...state,
        phase: 'lobby',
        currentRound: 1,
        failedProposals: 0,
        leaderId: state.players[0]?.id || null,
        proposedTeam: [],
        teamVotes: {},
        missionVotes: [],
        roundHistory: ['pending', 'pending', 'pending', 'pending', 'pending'],
        pendingVoters: [],
        lastTeamVoteResult: null,
        lastMissionVoteResult: null,
        winner: undefined,
        winReason: undefined,
        players: state.players.map(p => ({ ...p, role: undefined, faction: undefined }))
      })),
      setMasterState: (state: Partial<GameState>) => set((prev) => {
        const { localPlayerId, ...safeState } = state as any;
        return { ...prev, ...safeState };
      }),
      resetSession: () => set((state) => ({ 
        ...initialState, 
        isMuted: state.isMuted, 
        volume: state.volume 
      })),
      setMuted: (isMuted) => set({ isMuted }),
      setVolume: (volume) => set({ volume }),
    }),
    {
      name: 'plassey-game-session',
      storage: createJSONStorage(() => {
        // Use localStorage for native apps (Android/iOS) to persist sound/settings
        // Use sessionStorage for browsers to keep sessions tab-specific
        const isNative = !!(window as any).cordova || !!(window as any).Capacitor;
        return isNative ? localStorage : sessionStorage;
      }),
      // Only persist critical info for rejoining
      partialize: (state) => ({
        localPlayerId: state.localPlayerId,
        playerName: state.playerName,
        lobbyId: state.lobbyId,
        isHost: state.isHost,
        status: state.status,
        phase: state.phase,
        players: state.players,
        currentRound: state.currentRound,
        failedProposals: state.failedProposals,
        leaderId: state.leaderId,
        proposedTeam: state.proposedTeam,
        roundHistory: state.roundHistory,
        pendingVoters: state.pendingVoters,
        teamVotes: state.teamVotes,
        missionVotes: state.missionVotes,
        winner: state.winner,
        winReason: state.winReason,
        isLanMode: state.isLanMode,
        lanHostIp: state.lanHostIp,
        isMuted: state.isMuted,
        volume: state.volume,
        isAdvancedMode: state.isAdvancedMode,
      }),
    }
  )
);
