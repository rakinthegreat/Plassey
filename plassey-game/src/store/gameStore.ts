import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Player, GameState } from '../types/game';

interface GameStore extends GameState {
  localPlayerId: string | null;
  playerName: string | null;
  isHost: boolean;
  setLobbyId: (id: string) => void;
  setStatus: (status: GameState['status']) => void;
  setPhase: (phase: GameState['phase']) => void;
  updatePlayers: (players: Player[]) => void;
  isLanMode: boolean;
  lanHostIp: string;
  setLanMode: (isLan: boolean, hostIp: string) => void;
  isAdvancedMode: boolean;
  isHotseatMode: boolean;
  hotseatActivePlayerIndex: number;
  showTransitionScreen: boolean;
  toggleAdvancedMode: () => void;
  setHotseatMode: (active: boolean) => void;
  setHotseatActivePlayerIndex: (index: number) => void;
  setTransitionScreen: (show: boolean) => void;
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
  setTeamVotes: (votes: Record<string, 'approve' | 'reject'>) => void;
  setMissionVotes: (votes: ('support' | 'sabotage')[]) => void;
  setPendingVoters: (ids: string[]) => void;
  setRoundHistory: (history: GameState['roundHistory']) => void;
  setLastTeamVoteResult: (result: GameState['lastTeamVoteResult']) => void;
  setLastMissionVoteResult: (result: GameState['lastMissionVoteResult']) => void;
  setWinner: (winner: GameState['winner'], reason: GameState['winReason']) => void;
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
  isHotseatMode: false,
  hotseatActivePlayerIndex: 0,
  showTransitionScreen: false,
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
      setHotseatMode: (active) => set({ isHotseatMode: active }),
      setHotseatActivePlayerIndex: (index) => set({ hotseatActivePlayerIndex: index }),
      setTransitionScreen: (show) => set({ showTransitionScreen: show }),
      returnToQuarters: () => set((state) => ({
        ...state,
        status: 'lobby',
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
      setTeamVotes: (teamVotes) => set({ teamVotes }),
      setMissionVotes: (missionVotes) => set({ missionVotes }),
      setPendingVoters: (pendingVoters) => set({ pendingVoters }),
      setRoundHistory: (roundHistory) => set({ roundHistory }),
      setLastTeamVoteResult: (lastTeamVoteResult) => set({ lastTeamVoteResult }),
      setLastMissionVoteResult: (lastMissionVoteResult) => set({ lastMissionVoteResult }),
      setWinner: (winner, winReason) => set({ winner, winReason, phase: 'game_over' }),
    }),
    {
      name: 'plassey-game-session',
      storage: createJSONStorage(() => {
        // Use localStorage for native apps (Android/iOS) to persist sound/settings
        // Use localStorage for native apps (Android/iOS) to persist sound/settings
        // Use sessionStorage for browsers to keep sessions tab-specific
        const isNative = (window as any).Capacitor?.isNativePlatform === true || !!(window as any).cordova;
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
        isHotseatMode: state.isHotseatMode,
        hotseatActivePlayerIndex: state.hotseatActivePlayerIndex,
        showTransitionScreen: state.showTransitionScreen,
      }),
    }
  )
);
