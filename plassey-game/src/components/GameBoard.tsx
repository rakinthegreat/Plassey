import React, { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { ChatBox } from './ChatBox';
import { GameEngine } from '../lib/GameEngine';
import { webRTCManager } from '../lib/WebRTCManager';
import type { Player } from '../types/game';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const GameBoard: React.FC = () => {
  const {
    players,
    localPlayerId,
    phase,
    leaderId,
    lobbyId,
    currentRound,
    setPhase,
    proposedTeam,
    teamVotes,
    missionVotes,
    roundHistory,
    winner,
    winReason,
    pendingVoters,
    lastTeamVoteResult,
    lastMissionVoteResult,
    isAdvancedMode,
    returnToQuarters,
    setStatus,
    isHotseatMode,
    hotseatActivePlayerIndex,
    showTransitionScreen,
    setHotseatActivePlayerIndex,
    setTransitionScreen,
    setProposedTeam,
    setPendingVoters,
    setWinner,
    resetSession,
    setMasterState,
    isHouseRulesEnabled
  } = useGameStore();

  // In Hotseat mode, "activePlayer" is whoever the device is passed to
  const activePlayer = isHotseatMode && players.length > 0 ? players[hotseatActivePlayerIndex] : players.find(p => p.id === localPlayerId);
  const localPlayer = players.find(p => p.id === localPlayerId);
  const leader = players.find(p => p.id === leaderId);

  const isHost = isHotseatMode ? activePlayer?.isHost : localPlayer?.isHost;
  const teamSize = GameEngine.getTeamSize(players.length, currentRound, isHouseRulesEnabled);
  const isOnTeam = activePlayer ? proposedTeam.includes(activePlayer.id) : false;
  const isLeader = activePlayer?.id === leaderId;

  const hasVotedTeam = isHotseatMode
    ? !!teamVotes[activePlayer?.id || '']
    : (localPlayerId ? !!teamVotes[localPlayerId] : false);

  const [selectedTeam, setSelectedTeam] = useState<string[]>([]);
  const [revealCountdown, setRevealCountdown] = useState(10);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    if (isHotseatMode && (phase === 'team_proposal' || phase === 'team_voting' || phase === 'mission_voting' || phase === 'identify_mir_madan')) {
      if (!showTransitionScreen && hotseatActivePlayerIndex === 0 && !hasVotedTeam) {
        // This might be too aggressive, need to be careful with initialization
      }
    }

    if (phase === 'team_vote_reveal' || phase === 'mission_vote_reveal') {
      setRevealCountdown(10);
      const timer = setInterval(() => {
        setRevealCountdown((prev: number) => {
          if (prev <= 1) {
            clearInterval(timer);
            if (localPlayer?.isHost || isHotseatMode) {
              handleContinuePhase();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [phase, localPlayer?.isHost]);

  // Sync active player to first team member when mission starts in Hotseat
  useEffect(() => {
    if (isHotseatMode && phase === 'mission_voting' && missionVotes.length === 0) {
      const firstMissionPlayerIndex = players.findIndex(p => proposedTeam.includes(p.id));
      if (firstMissionPlayerIndex !== -1 && hotseatActivePlayerIndex !== firstMissionPlayerIndex) {
        setHotseatActivePlayerIndex(firstMissionPlayerIndex);
        setTransitionScreen(true);
      }
    }
  }, [phase, proposedTeam, isHotseatMode, missionVotes.length]);

  // Sync active player to leader when proposal starts in Hotseat
  useEffect(() => {
    if (isHotseatMode && phase === 'team_proposal') {
      const leaderIndex = players.findIndex(p => p.id === leaderId);
      if (leaderIndex !== -1 && hotseatActivePlayerIndex !== leaderIndex) {
        setHotseatActivePlayerIndex(leaderIndex);
        setTransitionScreen(true);
      }
    }
  }, [phase, leaderId, isHotseatMode, players.length]);

  // Sync active player to Mir Jafar when identification starts in Hotseat
  useEffect(() => {
    if (isHotseatMode && phase === 'identify_mir_madan') {
      const mirJafarIndex = players.findIndex(p => p.role === 'Mir Jafar');
      if (mirJafarIndex !== -1 && hotseatActivePlayerIndex !== mirJafarIndex) {
        setHotseatActivePlayerIndex(mirJafarIndex);
        setTransitionScreen(true);
      }
    }
  }, [phase, isHotseatMode, players.length]);

  // Mission Voting Safety Net - Force transition if list is empty
  useEffect(() => {
    if (isHotseatMode && phase === 'mission_voting' && pendingVoters.length === 0) {
      // Only trigger if we actually have votes to reveal
      if (missionVotes.length > 0) {
        const currentRoundVotes = missionVotes;
        const sabotages = currentRoundVotes.filter(v => v === 'sabotage').length;
        const required = (players.length >= 7 && currentRound === 4) ? 2 : 1;

        setMasterState({
          lastMissionVoteResult: {
            support: currentRoundVotes.length - sabotages,
            sabotage: sabotages,
            passed: sabotages < required
          },
          phase: 'mission_vote_reveal',
          hotseatActivePlayerIndex: 0,
          showTransitionScreen: false
        });
      }
    }
  }, [phase, pendingVoters.length, isHotseatMode, missionVotes.length]);

  const getVisibleIdentity = (viewer: Player | undefined, target: Player) => {
    if (!viewer) return undefined;
    if (viewer.id === target.id) return { faction: target.faction, role: target.role };
    if (phase === 'game_over') return { faction: target.faction, role: target.role };

    const isHouseRules = players.length === 4 && useGameStore.getState().isHouseRulesEnabled;

    if (phase === 'role_reveal') {
      // HOUSE RULES 4-PLAYER: BLIND START (No vision of others)
      if (isHouseRules) {
        return undefined;
      }

      if (isAdvancedMode) {
        // 1. EIC Vision: All EIC members see each other, EXCEPT Omichand.
        // Omichand is hidden from the rest of the EIC, but he sees them.
        if (viewer.faction === 'eic') {
          if (target.faction === 'eic') {
            if (target.role === 'Omichand') return undefined; // Hidden from others
            return { faction: 'eic' };
          }
        }
        if (viewer.role === 'Omichand' && target.faction === 'eic') {
          return { faction: 'eic' };
        }

        // 2. Mir Madan Vision: Sees all EIC members, EXCEPT Ray Durlabh.
        if (viewer.role === 'Mir Madan' && target.faction === 'eic' && target.role !== 'Ray Durlabh') {
          return { faction: 'eic' };
        }

        // 3. Mohonlal Vision: Sees exactly two people: Mir Madan and Ghaseti Begam. 
        // BOTH must be presented to Mohonlal simply as "Mir Madan".
        if (viewer.role === 'Mohonlal') {
          if (target.role === 'Mir Madan' || target.role === 'Ghaseti Begum') {
            return { role: 'Mir Madan', faction: 'nawab' }; // Masked as friendly commander
          }
        }
      } else {
        // Standard Mode Vision
        if (viewer.faction === 'eic' && target.faction === 'eic') return { faction: 'eic' };
        if (viewer.role === 'Mir Madan' && target.faction === 'eic') return { faction: 'eic' };
      }
    }

    return undefined;
  };

  const togglePlayerSelection = (id: string) => {
    setSelectedTeam((prev: string[]) =>
      prev.includes(id) ? prev.filter((pid: string) => pid !== id) : [...prev, id]
    );
  };

  const handleSubmitTeam = () => {
    if (selectedTeam.length !== teamSize) return;
    hapticImpact();

    if (isHotseatMode) {
      setProposedTeam(selectedTeam);
      setPhase('team_voting');
      setPendingVoters(players.map(p => p.id));
      setHotseatActivePlayerIndex(0);
      setTransitionScreen(true);
    } else {
      webRTCManager.sendActionToHost({
        type: 'propose_team',
        senderId: localPlayerId || '',
        data: { team: selectedTeam }
      });
    }
  };

  const handleVoteTeam = (vote: 'approve' | 'reject') => {
    hapticImpact();
    if (isHotseatMode) {
      const currentVotes = { ...teamVotes, [activePlayer!.id]: vote };
      const nextPending = pendingVoters.filter(id => id !== activePlayer?.id);

      if (nextPending.length > 0) {
        const nextVoterId = nextPending[0];
        const nextIdx = players.findIndex(p => p.id === nextVoterId);
        setMasterState({
          teamVotes: currentVotes,
          pendingVoters: nextPending,
          hotseatActivePlayerIndex: nextIdx,
          showTransitionScreen: true
        });
      } else {
        const approvals = Object.values(currentVotes).filter(v => v === 'approve').length;
        const rejections = players.length - approvals;
        const passed = approvals > rejections;

        setMasterState({
          teamVotes: currentVotes,
          pendingVoters: [],
          lastTeamVoteResult: { approve: approvals, reject: rejections, passed },
          phase: 'team_vote_reveal',
          hotseatActivePlayerIndex: 0,
          showTransitionScreen: false // No airlock needed for reveal here? Usually yes.
        });
      }
    } else {
      webRTCManager.sendActionToHost({
        type: 'vote_team',
        senderId: localPlayerId || '',
        data: { vote }
      });
    }
  };

  const handleVoteMission = (vote: 'support' | 'sabotage') => {
    hapticImpact(ImpactStyle.Heavy);
    if (isHotseatMode) {
      const currentVotes = [...(missionVotes as any), vote];
      const nextPendingIdentities = pendingVoters.filter(id => id !== activePlayer?.id);

      if (nextPendingIdentities.length > 0) {
        const nextVoterId = nextPendingIdentities[0];
        const nextIdx = players.findIndex(p => p.id === nextVoterId);
        setMasterState({
          pendingVoters: nextPendingIdentities,
          missionVotes: currentVotes as any,
          hotseatActivePlayerIndex: nextIdx,
          showTransitionScreen: true
        });
      } else {
        const sabotages = currentVotes.filter(v => v === 'sabotage').length;
        const requiredSabotages = (players.length >= 7 && currentRound === 4) ? 2 : 1;
        const passed = sabotages < requiredSabotages;

        setMasterState({
          pendingVoters: [],
          missionVotes: currentVotes as any,
          lastMissionVoteResult: { support: currentVotes.length - sabotages, sabotage: sabotages, passed },
          phase: 'mission_vote_reveal',
          hotseatActivePlayerIndex: 0,
          showTransitionScreen: false
        });
      }
    } else {
      webRTCManager.sendActionToHost({
        type: 'vote_mission',
        senderId: localPlayerId || '',
        data: { vote }
      });
    }
  };

  const handleGuessMirMadan = (targetId: string) => {
    hapticImpact(ImpactStyle.Heavy);
    if (isHotseatMode) {
      const target = players.find(p => p.id === targetId);
      if (target?.role === 'Mir Madan') {
        setWinner('eic', 'mir_madan_assassinated');
      } else {
        setWinner('nawab', '3_missions_won_mir_madan_safe');
      }
    } else {
      if (localPlayer?.faction !== 'eic') return;
      webRTCManager.sendActionToHost({
        type: 'guess_mir_madan',
        senderId: localPlayerId || '',
        data: { targetId }
      });
    }
  };

  const handleReturnToLobby = () => {
    if (isHotseatMode) {
      returnToQuarters();
      setStatus('lobby');
    } else {
      webRTCManager.sendActionToHost({
        type: 'return_to_lobby',
        senderId: localPlayerId || '',
        data: {}
      });
    }
  };

  const handleExitToMenu = () => {
    resetSession();
    webRTCManager.close(); // Critical: Kill all WebRTC ghosts
    window.location.reload(); // Perform hard-reset like a refresh
  };

  const hapticImpact = async (style: ImpactStyle = ImpactStyle.Medium) => {
    try { await Haptics.impact({ style }); } catch (e) { }
  };

  const handleConfirmReset = () => {
    if (!isHost && !isHotseatMode) return;

    // GRACEFUL SYNC: Re-verify all players' connectivity via Tactical Link
    const actualPlayers = players.map(p => {
      if (p.isHost) return p; // Host is always connected locally
      const dc = webRTCManager.getDataChannel(p.id);
      return { ...p, connected: dc?.readyState === 'open' || p.connected };
    });

    returnToQuarters();

    if (!isHotseatMode) {
      webRTCManager.broadcastState({
        phase: 'lobby',
        status: 'lobby',
        players: actualPlayers.map(p => ({ ...p, role: undefined, faction: undefined })),
        currentRound: 1,
        failedProposals: 0,
        leaderId: players[0]?.id || null,
        proposedTeam: [],
        teamVotes: {},
        missionVotes: [],
        roundHistory: ['pending', 'pending', 'pending', 'pending', 'pending'],
        pendingVoters: [],
        lastTeamVoteResult: null,
        lastMissionVoteResult: null,
        winner: undefined,
        winReason: undefined
      });
    }
    setShowResetConfirm(false);
  };

  const handleContinuePhase = () => {
    if (isHotseatMode) {
      if (phase === 'team_vote_reveal') {
        const nextLeaderIndex = (players.findIndex(p => p.id === leaderId) + 1) % players.length;
        if (lastTeamVoteResult?.passed) {
          const firstOnMission = players.findIndex(p => proposedTeam.includes(p.id));
          setMasterState({
            phase: 'mission_voting',
            pendingVoters: [...proposedTeam],
            hotseatActivePlayerIndex: firstOnMission,
            showTransitionScreen: true,
            teamVotes: {}
          });
        } else {
          setMasterState({
            phase: 'team_proposal',
            leaderId: players[nextLeaderIndex].id,
            hotseatActivePlayerIndex: nextLeaderIndex,
            showTransitionScreen: true,
            teamVotes: {}
          });
        }
      } else if (phase === 'mission_vote_reveal') {
        const outcome = lastMissionVoteResult?.passed ? 'nawab' : 'eic';
        const newHistory = [...roundHistory];
        newHistory[currentRound - 1] = outcome;

        const nawabWins = newHistory.filter(r => r === 'nawab').length;
        const eicWins = newHistory.filter(r => r === 'eic').length;

        const eicWinsNeeded = (players.length === 4 && useGameStore.getState().isHouseRulesEnabled) ? 2 : 3;

        if (nawabWins === 3) {
          // House Rules (4P): Instant victory, no Assassin
          if (players.length === 4 && useGameStore.getState().isHouseRulesEnabled) {
             setWinner('nawab', '3_missions_won');
          } else {
             const mirJafar = players.find(p => p.role === 'Mir Jafar');
             setMasterState({
                phase: 'identify_mir_madan',
                roundHistory: newHistory,
                hotseatActivePlayerIndex: players.findIndex(p => p.id === mirJafar?.id),
                showTransitionScreen: true,
                missionVotes: []
             });
          }
        } else if (eicWins >= eicWinsNeeded) {
          setWinner('eic', eicWinsNeeded === 2 ? 'sudden_death_eic_victory' : '3_missions_failed');
        } else {
          const nextLeaderIndex = (players.findIndex(p => p.id === leaderId) + 1) % players.length;
          setMasterState({
            phase: 'team_proposal',
            leaderId: players[nextLeaderIndex].id,
            currentRound: currentRound + 1,
            hotseatActivePlayerIndex: nextLeaderIndex,
            roundHistory: newHistory,
            missionVotes: [],
            showTransitionScreen: true
          });
        }
      }
    } else {
      webRTCManager.sendActionToHost({
        type: 'continue_phase',
        senderId: localPlayerId || '',
        data: {}
      });
    }
  };

  const renderHotseatAirlock = () => {
    const nextPlayer = players[hotseatActivePlayerIndex];
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-full animate-in fade-in duration-300">
        <div className="w-20 h-20 bg-amber-600/10 rounded-full flex items-center justify-center mb-6 animate-pulse">
          <span className="text-4xl text-amber-500">🛡️</span>
        </div>
        <h2 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Tactical Airlock Activated</h2>
        <h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-6">
          Pass Device to: <span className="text-amber-500">{nextPlayer?.name}</span>
        </h3>
        <p className="text-slate-400 text-sm italic max-w-xs mb-8">
          Please ensure you are the only one viewing this terminal before proceeding with the next maneuver.
        </p>
        <button
          onClick={() => {
            hapticImpact(ImpactStyle.Heavy);
            setTransitionScreen(false);
          }}
          className="px-12 py-4 bg-amber-600 text-white font-black rounded-xl uppercase tracking-widest shadow-lg hover:shadow-amber-500/20 active:scale-95 transition-all"
        >
          I am in Command
        </button>
      </div>
    );
  };

  const renderMainStage = () => {
    switch (phase) {
      case 'role_reveal':
        return (
          <div className="flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-700 h-full overflow-y-auto scrollbar-hide">
            <div className={`w-28 h-28 shrink-0 rounded-full flex items-center justify-center mb-6 border-4 ${localPlayer?.faction === 'nawab' ? 'bg-emerald-600/20 border-emerald-500/50' : 'bg-rose-600/20 border-rose-500/50'
              }`}>
              <span className="text-4xl">{localPlayer?.faction === 'nawab' ? '🛡️' : '⚔️'}</span>
            </div>

            <h3 className="text-slate-500 uppercase tracking-[0.4em] text-xs font-black mb-1">Identified As</h3>
            <h2 className={`text-3xl font-black mb-4 uppercase tracking-tighter ${localPlayer?.faction === 'nawab' ? 'text-emerald-500' : 'text-rose-500'
              }`}>
              {localPlayer?.role}
            </h2>

            <div className="bg-slate-950/80 border border-slate-800 p-5 rounded-xl max-w-md mb-6 shadow-2xl shrink-0">
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed italic">
                {localPlayer?.faction === 'nawab'
                  ? "Loyalist to Bengal. Your objective is to ensure the Nawab's forces succeed in three campaigns. Watch out for traitors in the General Staff."
                  : "Collaborator with the EIC. Your objective is to sabotage three campaigns without being exposed. Work with your fellow traitors secretly."}
              </p>
            </div>

            <button
              onClick={() => setPhase('team_proposal')}
              className="px-10 py-3 bg-amber-600 hover:bg-amber-500 text-white font-black rounded-lg uppercase tracking-widest transition-all shadow-lg active:scale-95 shrink-0"
            >
              Continue to Front
            </button>
          </div>
        );

      case 'team_proposal':
        return (
          <div className="flex flex-col h-full items-center justify-center p-8 animate-in fade-in slide-in-from-right-8 duration-500">
            <div className="mb-8 text-center flex flex-col items-center gap-2">
              {players.length === 4 && useGameStore.getState().isHouseRulesEnabled && (
                <div className="bg-rose-600/20 border border-rose-500/50 px-4 py-1 rounded-full animate-pulse mb-2">
                   <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-400">Sudden Death: EIC Needs 2 Wins</span>
                </div>
              )}
              <h3 className="text-slate-500 uppercase tracking-[0.4em] text-xs font-black">Phase: Team Proposal</h3>
              <h2 className="text-3xl font-black text-white uppercase tracking-tight">
                {isLeader ? "Select Your Expeditionary Force" : `Waiting for ${leader?.name}`}
              </h2>
              <div className="mt-1 text-amber-500 font-bold bg-amber-500/10 inline-block px-3 py-1 rounded text-xs border border-amber-500/20">
                Required Strength: {teamSize} Commanders
              </div>
            </div>

            {isLeader ? (
              <div className="w-full max-w-lg">
                <div className="grid grid-cols-2 gap-3 mb-8">
                  {players.map(p => (
                    <button
                      key={p.id}
                      onClick={() => togglePlayerSelection(p.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${selectedTeam.includes(p.id)
                        ? 'bg-amber-600 border-amber-400 text-white'
                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500'
                        }`}
                    >
                      <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black ${selectedTeam.includes(p.id) ? 'bg-white text-amber-600' : 'bg-slate-700'
                        }`}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-bold truncate">{p.name} {p.id === localPlayerId && "(You)"}</span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleSubmitTeam}
                  disabled={selectedTeam.length !== teamSize}
                  className={`w-full py-4 rounded-xl font-black tracking-widest uppercase transition-all shadow-xl ${selectedTeam.length === teamSize
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'
                    }`}
                >
                  Submit Proposal
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center opacity-40 py-12">
                <div className="w-16 h-16 border-4 border-slate-700 border-t-amber-500 rounded-full animate-spin mb-6"></div>
                <p className="text-slate-500 text-sm font-bold tracking-widest uppercase italic">Awaiting Dispatch from High Command...</p>
              </div>
            )}
          </div>
        );

      case 'team_voting':
        return (
          <div className="flex flex-col h-full items-center justify-start pt-16 p-8 animate-in fade-in slide-in-from-bottom-8 duration-700 overflow-y-auto scrollbar-hide">
            <h3 className="text-slate-500 uppercase tracking-[0.4em] text-xs font-black mb-2">Phase: Team Approval</h3>
            <h2 className="text-3xl font-black text-white mb-6 uppercase tracking-tight">The Leader Proposes:</h2>

            <div className="flex flex-wrap justify-center gap-4 mb-10">
              {proposedTeam.map((pid: string) => {
                const p = players.find(player => player.id === pid);
                return (
                  <div key={pid} className="flex items-center gap-3 px-6 py-3 bg-slate-800 rounded-xl border border-slate-700 shadow-xl">
                    <div className="w-8 h-8 rounded bg-amber-600 flex items-center justify-center text-xs font-black text-white">
                      {p?.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-bold text-slate-200">{p?.name}</span>
                  </div>
                );
              })}
            </div>

            {!hasVotedTeam ? (
              <div className="flex gap-4 w-full max-w-sm mb-12">
                <button
                  onClick={() => handleVoteTeam('approve')}
                  className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl uppercase tracking-widest transition-all shadow-lg active:scale-95"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleVoteTeam('reject')}
                  className="flex-1 py-4 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl uppercase tracking-widest transition-all shadow-lg active:scale-95"
                >
                  Reject
                </button>
              </div>
            ) : (
              <div className="opacity-60 mb-12">
                <div className="w-12 h-12 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-400 text-sm font-bold tracking-[0.2em] uppercase italic">Vote Recorded...</p>
              </div>
            )}

            {/* Pending Voters Tracking */}
            <div className="w-full max-w-lg bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-3 text-left">Awaiting Dispatches ({pendingVoters.length})</h4>
              <div className="flex flex-wrap gap-2">
                {pendingVoters.map((id: string) => {
                  const p = players.find(p => p.id === id);
                  return (
                    <div key={id} className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700/50">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_5px_rgba(245,158,11,0.5)]"></div>
                      <span className="text-xs font-bold text-slate-300">{p?.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'team_vote_reveal':
        return (
          <div className="flex flex-col h-full items-center justify-start pt-16 p-8 text-center animate-in zoom-in-95 duration-500 overflow-y-auto scrollbar-hide">
            <h3 className="text-slate-500 uppercase tracking-[0.4em] text-xs font-black mb-4">Command Decision</h3>
            <h2 className={`text-5xl font-black mb-8 uppercase tracking-tighter ${lastTeamVoteResult?.passed ? 'text-emerald-500' : 'text-rose-500'}`}>
              {lastTeamVoteResult?.passed ? 'Proposal Approved' : 'Proposal Rejected'}
            </h2>

            <div className="flex gap-8 mb-12">
              <div className="flex flex-col items-center">
                <div className="text-6xl font-black text-emerald-500 mb-2">{lastTeamVoteResult?.approve}</div>
                <div className="text-xs font-bold uppercase tracking-widest text-emerald-500/50">Approvals</div>
              </div>
              <div className="w-px bg-slate-800 h-24"></div>
              <div className="flex flex-col items-center">
                <div className="text-6xl font-black text-rose-500 mb-2">{lastTeamVoteResult?.reject}</div>
                <div className="text-xs font-bold uppercase tracking-widest text-rose-500/50">Rejections</div>
              </div>
            </div>

            {/* Auto-advance timer */}
            <div className="flex flex-col items-center animate-pulse">
              <div className="text-4xl font-black text-slate-500 mb-2">{revealCountdown}</div>
              <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest">Resuming Operations</p>
            </div>
          </div>
        );

      case 'mission_voting':
        return (
          <div className="flex flex-col h-full items-center justify-start pt-16 p-8 text-center animate-in fade-in slide-in-from-bottom-8 duration-700 overflow-y-auto scrollbar-hide">
            {isOnTeam ? (
              <div className="w-full max-w-lg mb-8">
                <h3 className="text-slate-500 uppercase tracking-[0.4em] text-xs font-black mb-4">Phase: Mission Execution</h3>
                <h2 className="text-3xl font-black text-white mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-500 uppercase tracking-tighter">Your Secret Decision</h2>
                {pendingVoters.includes(activePlayer?.id || '') ? (
                  <div className="flex gap-4 w-full">
                    <button
                      onClick={() => handleVoteMission('support')}
                      className="flex-1 aspect-square bg-emerald-600/10 border-2 border-emerald-500 hover:bg-emerald-500 hover:text-white text-emerald-500 rounded-2xl flex flex-col items-center justify-center gap-4 transition-all group shadow-2xl"
                    >
                      <span className="text-5xl group-hover:scale-125 transition-transform duration-500">🛡️</span>
                      <span className="font-black uppercase tracking-widest text-sm">Support</span>
                    </button>
                    <button
                      onClick={() => handleVoteMission('sabotage')}
                      className="flex-1 aspect-square bg-rose-600/10 border-2 border-rose-500 hover:bg-rose-500 hover:text-white text-rose-500 rounded-2xl flex flex-col items-center justify-center gap-4 transition-all group shadow-2xl"
                    >
                      <span className="text-5xl group-hover:scale-125 transition-transform duration-500">⚔️</span>
                      <span className="font-black uppercase tracking-widest text-sm">Sabotage</span>
                    </button>
                  </div>
                ) : (
                  <div className="opacity-60">
                    <div className="w-12 h-12 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-400 text-sm font-bold tracking-widest uppercase italic">Vote Recorded...</p>
                  </div>
                )}
                <p className="mt-8 text-[10px] text-slate-500 uppercase tracking-[0.3em] font-bold italic">This vote is strictly confidential.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center mb-12">
                <div className="w-20 h-20 bg-amber-600/10 rounded-full flex items-center justify-center mb-6 animate-pulse border border-amber-500/20">
                  <span className="text-3xl text-amber-500">⏳</span>
                </div>
                <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">Mission in Progress...</h2>
                <p className="text-slate-500 max-w-xs italic text-sm">The task force is deep behind enemy lines. Awaiting the smoke signal of their secret maneuvers.</p>
              </div>
            )}

            {/* Pending Voters Tracking */}
            <div className="w-full max-w-lg bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-3 text-left">Awaiting Dispatches ({pendingVoters.length})</h4>
              <div className="flex flex-wrap gap-2">
                {pendingVoters.map((id: string) => {
                  const p = players.find(p => p.id === id);
                  return (
                    <div key={id} className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700/50">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_5px_rgba(245,158,11,0.5)]"></div>
                      <span className="text-xs font-bold text-slate-300">{p?.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'mission_vote_reveal':
        return (
          <div className="flex flex-col h-full items-center justify-start pt-16 p-8 text-center animate-in zoom-in-95 duration-1000 overflow-y-auto scrollbar-hide">
            <h3 className="text-slate-500 uppercase tracking-[0.4em] text-xs font-black mb-4">Mission Debrief</h3>
            <h2 className={`text-6xl font-black mb-12 uppercase tracking-tighter ${lastMissionVoteResult?.passed ? 'text-emerald-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'text-rose-500 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]'}`}>
              {lastMissionVoteResult?.passed ? 'Mission Success' : 'Mission Sabotaged'}
            </h2>

            <div className="flex gap-12 mb-16 bg-slate-900/80 p-8 rounded-2xl border border-slate-800 shadow-2xl">
              <div className="flex flex-col items-center min-w-[120px]">
                <div className="text-8xl font-black text-emerald-500 mb-2">{lastMissionVoteResult?.support}</div>
                <div className="text-xs font-bold uppercase tracking-widest text-emerald-500/50">Support</div>
              </div>
              <div className="w-px bg-slate-800 h-32"></div>
              <div className="flex flex-col items-center min-w-[120px]">
                <div className="text-8xl font-black text-rose-500 mb-2">{lastMissionVoteResult?.sabotage}</div>
                <div className="text-xs font-bold uppercase tracking-widest text-rose-500/50">Sabotage</div>
              </div>
            </div>

            {/* Auto-advance timer */}
            <div className="flex flex-col items-center animate-pulse">
              <div className="text-4xl font-black text-slate-500 mb-2">{revealCountdown}</div>
              <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest">Resuming Operations</p>
            </div>
          </div>
        );

      case 'identify_mir_madan':
        const isMirJafar = activePlayer?.role === 'Mir Jafar';
        const validTargets = players.filter(p => p.id !== activePlayer?.id);

        return (
          <div className="flex flex-col h-full items-center justify-center p-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <h3 className="text-rose-500 uppercase tracking-[0.4em] text-xs font-black mb-4 animate-pulse">Phase: The Hunt for Mir Madan</h3>
            <h2 className="text-4xl font-black text-white mb-6 text-center">The Nawab Is Close To Victory But His Forces Are Broken.</h2>

            {isMirJafar ? (
              <div className="w-full max-w-lg text-center">
                <p className="text-slate-400 mb-8">
                  Nawab's side has secured three victories. As <strong className="text-rose-500 mx-1">Mir Jafar</strong>, you must assassinate the loyalist general
                  <strong className="text-amber-500 mx-1">Mir Madan</strong>
                  to shatter the Nawab's army and win the game. Select your target.
                </p>

                <div className="grid grid-cols-2 gap-3 mb-8">
                  {validTargets.map((p: Player) => (
                    <button
                      key={p.id}
                      onClick={() => handleGuessMirMadan(p.id)}
                      className="p-4 bg-slate-800/50 hover:bg-rose-600/20 border border-slate-700 hover:border-rose-500 rounded-xl transition-all group flex items-center gap-3 shadow-xl"
                    >
                      <div className="w-8 h-8 rounded bg-slate-700 text-slate-400 group-hover:bg-rose-500 group-hover:text-white flex items-center justify-center font-bold transition-colors">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-bold text-slate-300 group-hover:text-rose-400">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center opacity-70">
                <div className="text-6xl mb-6 animate-pulse drop-shadow-2xl">🗡️</div>
                <h3 className="text-xl font-bold text-rose-500 uppercase tracking-widest mb-2">The Traitors Are Plotting</h3>
                <p className="text-slate-400 max-w-sm text-center italic">
                  The Nawab's side won 3 campaigns. The EIC are now hunting for Mir Madan. Remain silent and pray they aim poorly.
                </p>
              </div>
            )}
          </div>
        );

      case 'game_over':
        return (
          <div className="flex flex-col h-full items-center justify-start pt-16 p-8 animate-in fade-in zoom-in-95 duration-1000 scrollbar-hide overflow-y-auto">
            <h3 className="text-slate-500 uppercase tracking-[0.4em] text-sm font-black mb-2 mt-4">Aftermath of Plassey</h3>

            <h1 className={`text-6xl font-black uppercase tracking-tighter mb-4 text-center ${winner === 'nawab' ? 'text-emerald-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'text-rose-500 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]'
              }`}>
              {winner === 'nawab' ? 'Bengal Prevails' : 'The Company Wins'}
            </h1>

            <p className="text-xl text-slate-300 italic mb-10 max-w-lg text-center font-serif">
              {winReason === '3_missions_failed' && "Three campaigns fell to the East India Company's sabotage."}
              {winReason === 'mir_madan_assassinated' && "The loyalist general Mir Madan fell to an assassin's blade, shattering the army's morale."}
              {winReason === '3_missions_won_mir_madan_safe' && "The traitors failed to identify Mir Madan. The Bengal army holds the line."}
            </p>

            <div className="w-full max-w-2xl bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl mb-8">
              <h4 className="text-slate-500 uppercase tracking-widest text-xs font-bold mb-6 text-center border-b border-slate-800 pb-4">Full Roster Debrief</h4>
              <div className="grid gap-3">
                {players.map((p: Player) => (
                  <div key={p.id} className={`flex items-center justify-between p-4 rounded-xl border ${p.faction === 'nawab' ? 'bg-emerald-900/10 border-emerald-500/20' : 'bg-rose-900/10 border-rose-500/20'
                    }`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-black shadow-inner ${p.faction === 'nawab' ? 'bg-emerald-600/30 text-emerald-400' : 'bg-rose-600/30 text-rose-400'
                        }`}>
                        {p.faction === 'nawab' ? '🛡️' : '⚔️'}
                      </div>
                      <div>
                        <p className="font-bold text-slate-200 text-lg">{p.name}</p>
                        <p className={`text-xs uppercase tracking-widest font-black ${p.faction === 'nawab' ? 'text-emerald-500' : 'text-rose-500'
                          }`}>{p.role}</p>
                      </div>
                    </div>
                    {p.id === localPlayerId && (
                      <span className="text-xs bg-slate-800 text-slate-400 px-3 py-1 rounded-full border border-slate-700 font-bold uppercase">You</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {localPlayer?.isHost && !isHotseatMode && (
              <button
                onClick={handleReturnToLobby}
                className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-xl uppercase tracking-widest transition-all shadow-xl border border-slate-700 hover:border-slate-500 active:scale-95 mb-8"
              >
                Return to Quarters
              </button>
            )}
          </div>
        );

      default:
        return (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-600 uppercase tracking-widest font-black italic">Transitioning to next tactical phase...</p>
          </div>
        );
    }
  };

  return (
    <div className={`flex flex-col lg:flex-row h-auto lg:h-[calc(100vh-160px)] w-full max-w-7xl gap-6 animate-in fade-in slide-in-from-bottom-8 duration-1000 pb-12 lg:pb-0 ${isHotseatMode ? 'justify-center' : ''}`}>

      {/* Sidebar: Players & Chat - Hidden in Hotseat */}
      {!isHotseatMode && (
        <aside className="w-full lg:w-1/3 flex flex-col gap-6 order-2 lg:order-1 h-[70vh] lg:h-full shrink-0 min-h-0 overflow-hidden">

          {/* Compact Player List - Capped at 40% to preserve chat space */}
          <div className={`bg-slate-900/60 border border-slate-800 rounded-xl p-4 shadow-xl shrink-0 overflow-y-auto custom-scrollbar ${isHotseatMode ? 'h-full' : 'max-h-[40%]'}`}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">The General Staff</h4>
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_: any, i: number) => (
                  <div key={i} className={`w-2 h-2 rounded-sm ${i < currentRound ? 'bg-amber-600' : 'bg-slate-800'}`}></div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {players.map((p: Player) => {
                const identity = getVisibleIdentity(localPlayer, p);
                const isEIC = identity?.faction === 'eic';
                const isMaskedCommander = identity?.role === 'Mir Madan' && p.id !== localPlayerId && localPlayer?.role === 'Mohonlal';

                return (
                  <div key={p.id} className={`flex items-center gap-3 p-2 rounded-lg transition-colors border ${p.id === leaderId ? 'border-amber-500/40 bg-amber-500/5' : 'border-transparent bg-slate-800/30'
                    }`}>
                    <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black ${isEIC ? 'bg-rose-600 text-white' :
                      isMaskedCommander ? 'bg-emerald-600 text-white animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.4)]' :
                        identity?.faction === 'nawab' && p.id === localPlayerId ? 'bg-emerald-600 text-white' :
                          p.id === leaderId ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-400'
                      }`}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-[11px] font-bold leading-none ${isEIC ? 'text-rose-400' :
                        isMaskedCommander ? 'text-emerald-400' :
                          identity?.faction === 'nawab' && p.id === localPlayerId ? 'text-emerald-400' :
                            p.id === localPlayerId ? 'text-amber-500' : 'text-slate-300'
                        }`}>
                        {p.name} {p.id === localPlayerId && <span className="text-[8px] ml-1 opacity-50 underline">(YOU)</span>}
                      </span>
                      {p.id === leaderId && <span className="text-[8px] text-amber-500/70 font-black uppercase tracking-tighter">Current Leader</span>}
                      {isEIC && p.id !== localPlayerId && <span className="text-[8px] text-rose-500 font-black uppercase tracking-tighter animate-pulse mt-0.5">Known Traitor</span>}
                      {isMaskedCommander && <span className="text-[8px] text-emerald-500 font-black uppercase tracking-tighter mt-0.5">Mir Madan</span>}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      {p.id === leaderId && <span className="text-amber-500 animate-pulse">⭐</span>}
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]"></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chat System - Locked to remaining space */}
          {!isHotseatMode && (
            <div className="flex-grow min-h-0 overflow-hidden">
              <ChatBox />
            </div>
          )}
        </aside>
      )}

      {/* Main Stage */}
      <main className={`w-full order-1 lg:order-2 h-[80vh] lg:h-full shrink-0 flex flex-col gap-6 ${isHotseatMode ? 'max-w-3xl' : 'lg:w-2/3'}`}>
        <div className="flex-grow bg-slate-900/40 border border-slate-800 rounded-2xl shadow-inner relative overflow-hidden group">
          {/* Subtle noise/texture overlay */}
          <div className="absolute inset-0 opacity-5 pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]"></div>

          {/* Content Area */}
          <div className="absolute inset-0">
            {showTransitionScreen ? renderHotseatAirlock() : renderMainStage()}
          </div>

          {/* Corner accents */}
          <div className="absolute top-4 left-4 w-4 h-4 border-t border-l border-slate-700"></div>
          <div className="absolute top-4 right-4 w-4 h-4 border-t border-r border-slate-700"></div>
          <div className="absolute bottom-4 left-4 w-4 h-4 border-b border-l border-slate-700"></div>
          <div className="absolute bottom-4 right-4 w-4 h-4 border-b border-r border-slate-700"></div>
        </div>

        <div className="h-24 bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-xl">
          {/* Left: Player Identity */}
          <div className="flex items-center gap-4">
            {!isHotseatMode ? (
              <>
                <div className={`w-12 h-12 rounded-lg border flex items-center justify-center ${localPlayer?.faction === 'nawab' ? 'bg-emerald-600/20 border-emerald-500/20' : 'bg-rose-600/20 border-rose-500/20'}`}>
                  <span className="text-lg">{localPlayer?.faction === 'nawab' ? '🛡️' : '⚔️'}</span>
                </div>
                <div>
                  <h5 className="text-white text-sm font-bold uppercase tracking-tight">{localPlayer?.role}</h5>
                  <p className={`text-[10px] uppercase tracking-wider font-black ${localPlayer?.faction === 'nawab' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {localPlayer?.faction === 'nawab' ? 'Loyalist Agent' : 'Company Saboteur'}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <span className="text-lg">👤</span>
                </div>
                <div>
                  <h5 className="text-white text-sm font-bold uppercase tracking-tight">{activePlayer?.name}</h5>
                  <p className="text-[10px] uppercase tracking-wider font-black text-slate-500">Active Commander</p>
                </div>
              </div>
            )}
          </div>

          {/* Center: Tactical Actions (Equidistant) */}
          {isHost && !isHotseatMode && phase !== 'game_over' && (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-4 py-2 bg-slate-800 hover:bg-rose-900/40 text-slate-500 hover:text-rose-400 border border-slate-700 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-3 shadow-lg"
            >
              <span className="text-xs">☢️</span> <span>Reset to Lobby</span>
            </button>
          )}

          {/* Right: Mission Intelligence */}
          <div className="text-right mr-2">
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none mb-1">
              {lobbyId && <span className="text-amber-500/60 mr-2">[{lobbyId.toUpperCase()}]</span>} Mission Progress
            </p>
            <div className="flex gap-1 justify-end">
              {GameEngine.getMissionMatrix(players.length, isHouseRulesEnabled).map((_, i) => {
                const result = roundHistory[i] || 'pending';
                return (
                  <div key={i} className={`w-3 h-1.5 rounded-full border ${result === 'pending' ? 'bg-slate-800 border-slate-700' :
                    result === 'nawab' ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                      'bg-rose-500 border-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                    }`}></div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center animate-in zoom-in-95 duration-500">
            <div className="w-16 h-16 bg-rose-600/20 border-2 border-rose-500 text-rose-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">
              ⚠️
            </div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-4">Tactical Reset?</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-8">
              Are you sure you want to end this campaign early and return to the lobby? All current progress will be lost, but players will remain connected.
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex gap-4">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 font-bold rounded-xl uppercase tracking-widest text-xs hover:bg-slate-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReset}
                  className="flex-1 py-3 bg-rose-600 text-white font-black rounded-xl uppercase tracking-widest text-xs hover:bg-rose-500 transition-all shadow-lg"
                >
                  Return to Quarters
                </button>
              </div>
              <button
                onClick={handleExitToMenu}
                className="w-full py-3 bg-slate-950 border border-slate-700 text-rose-500 font-black rounded-xl uppercase tracking-widest text-xs hover:bg-rose-900/20 transition-all shadow-lg"
              >
                Abandon Full Campaign (Exit)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
