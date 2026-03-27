import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { GameEngine } from '../lib/GameEngine';
import { v4 as uuidv4 } from 'uuid';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const HotseatSetup: React.FC = () => {
    const [step, setStep] = useState(1);
    const [numPlayers, setNumPlayers] = useState(5);
    const [names, setNames] = useState<string[]>(Array(5).fill(''));
    const {
        setHotseatMode,
        setStatus,
        isAdvancedMode,
        toggleAdvancedMode,
        updatePlayers,
        setPhase,
        setHotseatActivePlayerIndex,
        setLeaderId,
        setCurrentRound
    } = useGameStore();

    const hapticImpact = async () => {
        try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch (e) { }
    };

    const handleNumSelect = (n: number) => {
        hapticImpact();
        setNumPlayers(n);
        setNames(Array(n).fill(''));
        setStep(2);
    };

    const handleNameChange = (index: number, val: string) => {
        const newNames = [...names];
        newNames[index] = val;
        setNames(newNames);
    };

    const handleStart = () => {
        if (names.some(n => !n.trim())) return alert('All commanders must be named.');
        hapticImpact();

        // 1. Create Player objects
        const players = names.map((name, i) => ({
            id: uuidv4(),
            name: name.trim(),
            isHost: i === 0, // First player is "Host" for logic purposes
            connected: true
        }));

        // 2. Assign Roles
        const playersWithRoles = GameEngine.assignRoles(players, isAdvancedMode);

        // 3. Setup Store
        setHotseatMode(true);
        updatePlayers(playersWithRoles);
        setHotseatActivePlayerIndex(0);
        setCurrentRound(1);
        setLeaderId(playersWithRoles[Math.floor(Math.random() * playersWithRoles.length)].id);

        // 4. Transition to Reveal
        setStatus('hotseat_reveal');
        setPhase('role_reveal'); // Use role_reveal as the initial phase for reveal
    };

    return (
        <div className="flex flex-col items-center justify-center p-8 bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 max-w-lg w-full mx-auto animate-in fade-in zoom-in-95 duration-500">
            <div className="w-full mb-8 text-center">
                <div className="flex items-center justify-center gap-3 mb-2">
                    <span className="text-3xl">🤝</span>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Pass & Play</h2>
                </div>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">Offline Strategic Command</p>
            </div>

            {step === 1 && (
                <div className="w-full space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                    <h3 className="text-amber-500 font-black uppercase tracking-widest text-xs text-center">Select Personnel Count</h3>
                    <div className="grid grid-cols-3 gap-3">
                        {[5, 6, 7, 8, 9, 10].map(n => (
                            <button
                                key={n}
                                onClick={() => handleNumSelect(n)}
                                className={`py-4 rounded-xl border-2 font-black text-xl transition-all ${numPlayers === n
                                        ? 'bg-amber-600 border-amber-400 text-white shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                                        : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
                                    }`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setStatus('menu')}
                        className="w-full py-2 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
                    >
                        Return to Quarters
                    </button>
                </div>
            )}

            {step === 2 && (
                <div className="w-full space-y-6 animate-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <h3 className="text-amber-500 font-black uppercase tracking-widest text-xs">Register Commanders</h3>
                        <span className="text-slate-600 text-[10px] font-bold uppercase">{numPlayers} Total</span>
                    </div>

                    <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                        {names.map((name, i) => (
                            <div key={i} className="flex flex-col gap-1">
                                <label className="text-[9px] text-slate-600 font-black uppercase tracking-widest pl-1">Unit {i + 1}</label>
                                <input
                                    type="text"
                                    value={name}
                                    placeholder={`Commander ${i + 1} Name`}
                                    onChange={(e) => handleNameChange(i, e.target.value)}
                                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg py-2.5 px-4 text-white font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all placeholder:text-slate-700"
                                />
                            </div>
                        ))}
                    </div>

                    <div className="pt-4 space-y-4">
                        <div className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                            <div>
                                <h4 className="text-sm font-bold text-slate-200">Advanced Mode</h4>
                                <p className="text-[10px] text-slate-500 font-medium">Historical complex role matrix</p>
                            </div>
                            <button
                                onClick={toggleAdvancedMode}
                                className={`w-12 h-6 rounded-full transition-colors relative ${isAdvancedMode ? 'bg-amber-600' : 'bg-slate-600'}`}
                            >
                                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${isAdvancedMode ? 'translate-x-7' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setStep(1)}
                                className="w-full py-3 bg-slate-800 text-slate-400 font-black uppercase tracking-widest rounded-xl hover:bg-slate-750 transition-all text-xs"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleStart}
                                className="w-full py-3 bg-amber-600 text-white font-black uppercase tracking-widest rounded-xl shadow-lg hover:shadow-amber-500/20 active:scale-95 transition-all text-xs"
                            >
                                Commence
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
