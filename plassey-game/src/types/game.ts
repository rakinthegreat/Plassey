export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  role?: string;
  faction?: 'nawab' | 'eic';
}

export interface GameState {
  lobbyId: string;
  status: 'menu' | 'lobby' | 'in_progress' | 'hotseat_setup' | 'hotseat_reveal';
  phase: 'lobby' | 'role_reveal' | 'team_proposal' | 'team_voting' | 'team_vote_reveal' | 'mission_voting' | 'mission_vote_reveal' | 'identify_mir_madan' | 'game_over' | 'hotseat_setup' | 'hotseat_reveal';
  players: Player[];
  currentRound: number;
  failedProposals: number;
  leaderId: string | null;
  proposedTeam: string[];
  teamVotes: Record<string, 'approve' | 'reject'>;
  missionVotes: ('support' | 'sabotage')[];
  roundHistory: ('nawab' | 'eic' | 'pending')[];
  winner?: 'nawab' | 'eic';
  winReason?: string;
  isAdvancedMode: boolean;
  pendingVoters: string[];
  lastTeamVoteResult?: { approve: number; reject: number; passed: boolean } | null;
  lastMissionVoteResult?: { support: number; sabotage: number; passed: boolean } | null;
  isHotseatMode: boolean;
  hotseatActivePlayerIndex: number;
  showTransitionScreen: boolean;
}

export type NetworkPayload = {
  type: string;
  senderId: string;
  data: any;
};
