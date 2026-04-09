import type { Player } from "../types/game";

export const GameEngine = {
  /**
   * Assigns roles and factions to players based on the player count.
   * নবাব (Nawab) = Green (Loyalists)
   * ইইসি (EIC) = Red (Spies/Traitors)
   */
  assignRoles: (players: Player[], isAdvancedMode: boolean, isHouseRulesEnabled: boolean = false): Player[] => {
    const count = players.length;

    // HOUSE RULES 4-PLAYER OVERRIDE
    if (count === 4 && isHouseRulesEnabled) {
      const fixedRoster = [
        { role: 'Nawab Siraj-ud-Dawlah', faction: 'nawab' as const },
        { role: 'Lutfunnisa Begum', faction: 'nawab' as const },
        { role: 'Mir Madan', faction: 'nawab' as const },
        { role: 'Mir Jafar', faction: 'eic' as const }
      ];
      
      const shuffle = <T>(array: T[]): T[] => array.sort(() => Math.random() - 0.5);
      const shuffledRoster = shuffle([...fixedRoster]);
      
      return players.map((player, index) => ({
        ...player,
        role: shuffledRoster[index].role,
        faction: shuffledRoster[index].faction
      }));
    }

    let redCount = 2;
    if (count < 5) redCount = 1; // Testing mode
    else if (count >= 7) redCount = 3;
    else if (count >= 10) redCount = 4;
    
    const greenCount = count - redCount;

    // Helper to shuffle array
    const shuffle = <T>(array: T[]): T[] => {
      return array.sort(() => Math.random() - 0.5);
    };

    let selectedReds: { role: string, faction: 'eic' }[] = [];
    let selectedGreens: { role: string, faction: 'nawab' }[] = [];

    if (isAdvancedMode) {
      // Advanced Role Distribution
      const redPotential = [
        { role: 'Mir Jafar', faction: 'eic' as const },
        { role: 'Ghaseti Begum', faction: 'eic' as const },
        { role: 'Ray Durlabh', faction: 'eic' as const },
        { role: 'Omichand', faction: 'eic' as const }
      ];
      const greenPotential = [
        { role: 'Mir Madan', faction: 'nawab' as const },
        { role: 'Mohonlal', faction: 'nawab' as const },
        { role: 'Nawab Siraj-ud-Dawlah', faction: 'nawab' as const },
        { role: 'Lutfunnisa Begum', faction: 'nawab' as const },
        { role: 'St. Frais', faction: 'nawab' as const }
      ];

      // Greedily take priority roles for Advanced Mode
      selectedReds = redPotential.slice(0, redCount);
      selectedGreens = greenPotential.slice(0, greenCount);
      
      // Fallback for more players than potential roles
      while (selectedGreens.length < greenCount) {
        selectedGreens.push({ role: 'Loyal Commander', faction: 'nawab' as const });
      }
    } else {
      // Standard Mode
      const mandatoryGreens = [
        { role: 'Mir Madan', faction: 'nawab' as const },
        { role: 'Nawab Siraj-ud-Dawlah', faction: 'nawab' as const }
      ];
      const mandatoryRed = { role: 'Mir Jafar', faction: 'eic' as const };

      const greenPool = ['Lutfunnisa Begum', 'Mohonlal', 'St. Frais', 'Khwaja Hadi Khan'];
      const redPool = ['Ray Durlabh', 'Ghaseti Begum', 'Omichand'];

      const shuffledGreen = shuffle(greenPool);
      const shuffledRed = shuffle(redPool);

      selectedGreens = [...mandatoryGreens, ...shuffledGreen.map(r => ({ role: r, faction: 'nawab' as const }))].slice(0, greenCount);
      selectedReds = [mandatoryRed, ...shuffledRed.map(r => ({ role: r, faction: 'eic' as const }))].slice(0, redCount);
    }

    const finalRoster = shuffle([...selectedGreens, ...selectedReds]);

    // Assign to players
    return players.map((player, index) => ({
      ...player,
      role: finalRoster[index].role,
      faction: finalRoster[index].faction
    }));
  },

  getTeamSize: (playerCount: number, round: number): number => {
    const matrix: Record<number, number[]> = {
      5: [2, 3, 2, 3, 3],
      6: [2, 3, 3, 3, 4],
      7: [2, 3, 3, 4, 4],
      8: [3, 4, 4, 5, 5],
      9: [3, 4, 4, 5, 5],
      10: [3, 4, 4, 5, 5],
      4: [2, 2, 2, 3, 2] // House Rules Variant
    };
    
    const sizes = matrix[playerCount] || matrix[5];
    return sizes[round - 1];
  },

  /**
   * Tally votes for a team proposal.
   */
  tallyTeamVotes(players: Player[], teamVotes: Record<string, 'approve' | 'reject'>) {
    const approves = Object.values(teamVotes).filter(v => v === 'approve').length;
    const rejects = Object.values(teamVotes).filter(v => v === 'reject').length;
    const isApproved = approves > players.length / 2;

    return { approve: approves, reject: rejects, passed: isApproved };
  },

  /**
   * Tally secret mission votes.
   */
  tallyMissionVotes(missionVotes: ('support' | 'sabotage')[], currentRound: number, playerCount: number) {
    const sabotageCount = missionVotes.filter(v => v === 'sabotage').length;
    
    // Round 4 Exception: if 7 or more players, Round 4 requires 2 sabotages to fail.
    let sabotagesRequired = 1;
    if (currentRound === 4 && playerCount >= 7) {
      sabotagesRequired = 2;
    }

    const passed = sabotageCount < sabotagesRequired;

    return { support: missionVotes.length - sabotageCount, sabotage: sabotageCount, passed };
  },

  /**
   * Checks if either team has won 3 rounds.
   */
  checkEndgame(roundHistory: ('nawab' | 'eic' | 'pending')[], playerCount?: number, isHouseRulesEnabled?: boolean) {
    const eicWins = roundHistory.filter(w => w === 'eic').length;
    const nawabWins = roundHistory.filter(w => w === 'nawab').length;

    // Sudden Death: EIC only needs 2 sabotages to win in 4-player House Rules
    const eicWinsNeeded = (playerCount === 4 && isHouseRulesEnabled) ? 2 : 3;

    if (eicWins >= eicWinsNeeded) return 'eic' as const;
    if (nawabWins >= 3) return 'nawab' as const;
    return null;
  },

  /**
   * Resolves the EIC guess for Mir Madan.
   */
  tallyMirMadanGuess(players: Player[], targetId: string) {
    const target = players.find(p => p.id === targetId);
    if (target?.role === 'Mir Madan') {
      return { winner: 'eic' as const, winReason: 'mir_madan_assassinated' };
    }
    return { winner: 'nawab' as const, winReason: '3_missions_won_mir_madan_safe' };
  },

  /**
   * Helper to find the next leader in rotation
   */
  getNextLeader(players: Player[], currentLeaderId: string) {
    const currentIndex = players.findIndex(p => p.id === currentLeaderId);
    const nextIndex = (currentIndex + 1) % players.length;
    return players[nextIndex].id;
  }
};
