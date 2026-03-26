import React, { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import bgm from '../assets/bgm.mp3';

export const AudioController: React.FC = () => {
  const isMuted = useGameStore((state) => state.isMuted);
  const volume = useGameStore((state) => state.volume);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [isMuted, volume]);

  useEffect(() => {
    const playAudio = () => {
      audioRef.current?.play().catch(() => {
        // Autoplay likely blocked, wait for user interaction
        console.log('[AUDIO] Autoplay blocked, waiting for interaction...');
      });
    };

    playAudio();

    // Listen for first interaction to resume if blocked
    const handleInteraction = () => {
      audioRef.current?.play();
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };

    document.addEventListener('click', handleInteraction);
    document.addEventListener('keydown', handleInteraction);

    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  return (
    <audio
      ref={audioRef}
      src={bgm}
      loop
      style={{ display: 'none' }}
    />
  );
};
