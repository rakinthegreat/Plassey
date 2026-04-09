import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const HotseatReveal: React.FC = () => {
    const { 
        players, 
        hotseatActivePlayerIndex: activeIndex, 
        setHotseatActivePlayerIndex, 
        setPhase, 
        setStatus,
        isAdvancedMode,
        isHouseRulesEnabled
    } = useGameStore();

    const [cardVisible, setCardVisible] = useState(false);
    const currentPlayer = players[activeIndex];

    const hapticImpact = async () => {
        try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch (e) {}
    };

    const handleReveal = () => {
        hapticImpact();
        setCardVisible(true);
    };

    const handleNext = () => {
        hapticImpact();
        setCardVisible(false);
        if (activeIndex < players.length - 1) {
            setHotseatActivePlayerIndex(activeIndex + 1);
        } else {
            // End of reveal, start the game
            setHotseatActivePlayerIndex(0);
            const { setTransitionScreen } = useGameStore.getState();
            setTransitionScreen(true);
            setStatus('in_progress');
            setPhase('team_proposal');
        }
    };

    // Derived visibility (eyes open logic)
    const getVisibleFactions = () => {
        if (!currentPlayer) return [];

        // HOUSE RULES 4-PLAYER: BLIND START (No vision of others)
        if (players.length === 4 && isHouseRulesEnabled) {
            return [];
        }

        // Same logic as GameBoard's getVisibleIdentity but simplified for reveal list
        return players.filter(p => {
            if (p.id === currentPlayer.id) return false;
            
            // EIC Vision
            if (currentPlayer.faction === 'eic') {
                if (isAdvancedMode && currentPlayer.role === 'Omichand') return p.faction === 'eic';
                if (isAdvancedMode && p.role === 'Omichand') return false;
                return p.faction === 'eic';
            }
            
            // Nawab Vision (Mir Madan)
            if (currentPlayer.role === 'Mir Madan') {
                if (isAdvancedMode && p.role === 'Ray Durlabh') return false;
                return p.faction === 'eic';
            }

            // Mohonlal Vision
            if (isAdvancedMode && currentPlayer.role === 'Mohonlal') {
                return p.role === 'Mir Madan' || p.role === 'Ghaseti Begum';
            }

            return false;
        });
    };

    const visiblePlayers = getVisibleFactions();

    return (
        <div className="flex flex-col items-center justify-center p-8 bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 max-w-lg w-full mx-auto min-h-[400px]">
            {!cardVisible ? (
                <div className="text-center space-y-8 animate-in fade-in zoom-in-95 duration-300">
                    <div className="w-20 h-20 bg-amber-600/20 rounded-full flex items-center justify-center mx-auto border-4 border-amber-600/40">
                        <span className="text-4xl">🔐</span>
                    </div>
                    <div>
                        <h2 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Secure Pass Required</h2>
                        <h3 className="text-3xl font-black text-white uppercase tracking-tighter">
                            Airlock: <span className="text-amber-500">{currentPlayer?.name}</span>
                        </h3>
                    </div>
                    <p className="text-slate-400 text-sm italic font-medium">Please pass the device to the named commander. Ensure others are looking away.</p>
                    <button 
                        onClick={handleReveal}
                        className="w-full py-4 bg-amber-600 text-white font-black uppercase tracking-widest rounded-xl shadow-lg hover:shadow-amber-500/20 active:scale-95 transition-all"
                    >
                        Tap to Unlock Intelligence
                    </button>
                </div>
            ) : (
                <div className="w-full space-y-8 animate-in slide-in-from-bottom-6 duration-500">
                    <div className="text-center border-b border-slate-800 pb-6">
                        <h2 className="text-amber-500 text-[10px] font-black uppercase tracking-[0.4em] mb-4">Classified Dossier</h2>
                        <div className={`p-6 rounded-2xl border-2 transition-all shadow-2xl ${
                            currentPlayer.faction === 'nawab' 
                            ? 'bg-emerald-900/20 border-emerald-500/40 shadow-emerald-500/10' 
                            : 'bg-rose-900/20 border-rose-500/40 shadow-rose-500/10'
                        }`}>
                            <p className="text-white text-[10px] font-bold uppercase tracking-widest mb-1 opacity-50">{currentPlayer.name}</p>
                            <h3 className={`text-4xl font-black uppercase tracking-tighter mb-2 ${
                                currentPlayer.faction === 'nawab' ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                                {currentPlayer.role}
                            </h3>
                            <div className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.1em] ${
                                currentPlayer.faction === 'nawab' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-rose-500/20 text-rose-500'
                            }`}>
                                {currentPlayer.faction === 'nawab' ? 'Loyalist Order' : 'EIC Saboteur'}
                            </div>
                        </div>
                    </div>

                    {visiblePlayers.length > 0 && (
                        <div className="space-y-4">
                            <h4 className="text-slate-500 text-[10px] font-black uppercase tracking-widest text-center">Infiltrated Knowledge</h4>
                            <div className="grid gap-2">
                                {visiblePlayers.map(p => {
                                    const isMasked = isAdvancedMode && currentPlayer.role === 'Mohonlal';
                                    return (
                                        <div key={p.id} className="flex items-center justify-between bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                                            <span className="text-slate-200 font-bold">{p.name}</span>
                                            <span className={`text-[10px] font-black uppercase tracking-widest p-1.5 rounded ${
                                                isMasked ? 'text-amber-500 bg-amber-500/10' : 'text-rose-500 bg-rose-500/10'
                                            }`}>
                                                {isMasked ? 'Mir Madan?' : 'EIC Agent'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="pt-4">
                        <p className="text-center text-slate-500 text-[11px] mb-6 italic leading-relaxed">
                            {players.length === 4 && isHouseRulesEnabled 
                                ? "Memorize your role. No other intelligence is available in this variant." 
                                : "Memorize your role and contacts. Once you hide this card, intelligence is offline until the campaign ends."}
                        </p>
                        <button 
                            onClick={handleNext}
                            className="w-full py-4 bg-slate-800 text-white font-black uppercase tracking-widest rounded-xl border border-slate-700 hover:bg-slate-750 active:scale-95 transition-all"
                        >
                            Hide & Pass Device
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
