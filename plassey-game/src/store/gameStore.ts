import { create } from 'zustand';
import type { Player, GameState } from '../types/game';

interface GameStore extends GameState {
  localPlayerId: string | null;
  setLobbyId: (id: string) => void;
  setStatus: (status: 'menu' | 'lobby' | 'in_progress') => void;
  setPhase: (phase: GameState['phase']) => void;
  updatePlayers: (players: Player[]) => void;
  setLocalPlayerId: (id: string) => void;
  setLeaderId: (id: string | null) => void;
  setCurrentRound: (round: number) => void;
  setProposedTeam: (team: string[]) => void;
  // Allows setting the full master state
  setMasterState: (state: Partial<GameState>) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  lobbyId: '',
  status: 'menu',
  phase: 'lobby',
  players: [],
  localPlayerId: null,
  currentRound: 1,
  failedProposals: 0,
  leaderId: null,
  proposedTeam: [],
  teamVotes: {},
  missionVotes: [],
  roundHistory: ['pending', 'pending', 'pending', 'pending', 'pending'],
  pendingVoters: [],
  lastTeamVoteResult: null,
  lastMissionVoteResult: null,

  setLobbyId: (id: string) => set({ lobbyId: id }),
  setStatus: (status: 'menu' | 'lobby' | 'in_progress') => set({ status }),
  setPhase: (phase: GameState['phase']) => set({ phase }),
  updatePlayers: (players: Player[]) => set({ players }),
  setLocalPlayerId: (id: string) => set({ localPlayerId: id }),
  setLeaderId: (id: string | null) => set({ leaderId: id }),
  setCurrentRound: (round: number) => set({ currentRound: round }),
  setProposedTeam: (team: string[]) => set({ proposedTeam: team }),
  setMasterState: (state: Partial<GameState>) => set((prev) => {
    const { localPlayerId, ...safeState } = state as any;
    return { ...prev, ...safeState };
  }),
}));
