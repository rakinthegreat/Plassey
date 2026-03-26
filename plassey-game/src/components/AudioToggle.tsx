import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';

export const AudioToggle: React.FC = () => {
  const { isMuted, volume, setMuted, setVolume } = useGameStore();
  const [showSlider, setShowSlider] = useState(false);

  return (
    <div 
      className={`fixed bottom-6 right-6 z-50 flex items-center bg-slate-900/80 backdrop-blur-md rounded-full border border-slate-700 shadow-2xl transition-all duration-500 ease-in-out h-12 ${showSlider ? 'w-48 px-4' : 'w-12 justify-center'}`}
      onMouseEnter={() => setShowSlider(true)}
      onMouseLeave={() => setShowSlider(false)}
    >
      {showSlider && (
        <div className="flex-1 mr-3 animate-in fade-in slide-in-from-right-2 duration-300">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
        </div>
      )}

      <button
        onClick={() => setMuted(!isMuted)}
        className={`flex-shrink-0 p-2 rounded-full transition-all ${isMuted ? 'text-slate-500 bg-slate-800' : 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'}`}
        title={isMuted ? "Unmute Tactical Comm-Link" : "Mute Background Intel"}
      >
        {isMuted ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 14.828a1 1 0 01-1.414-1.414 5 5 0 000-7.072 1 1 0 011.414-1.414 7 7 0 010 9.9z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M11.293 12.707a1 1 0 01-1.414-1.414 2 2 0 000-2.828 1 1 0 111.414-1.414 4 4 0 010 5.656 1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </button>
    </div>
  );
};
