import React, { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

export default function TimerDisplay({ socket, initialTimer }) {
  const [timer, setTimer] = useState(initialTimer);

  useEffect(() => {
    if (!socket) return;
    
    const handleTick = (t) => setTimer(t);
    const handlePenalty = ({ newTimer }) => setTimer(newTimer);

    socket.on('timer_tick', handleTick);
    socket.on('play_penalty', handlePenalty);

    return () => {
      socket.off('timer_tick', handleTick);
      socket.off('play_penalty', handlePenalty);
    };
  }, [socket]);

  return (
    <div style={{ 
      background: 'var(--bg-dark)', 
      padding: '12px 24px', 
      borderRadius: '24px', 
      display: 'flex', 
      alignItems: 'center', 
      gap: '8px', 
      fontSize: '1.5rem', 
      fontWeight: 800, 
      color: timer <= 10 ? 'var(--danger)' : 'white', 
      border: `2px solid ${timer <= 10 ? 'var(--danger)' : 'var(--glass-border)'}` 
    }}>
      <Timer size={24} /> {Math.floor(timer / 60).toString().padStart(2, '0')}:{(timer % 60).toString().padStart(2, '0')}
    </div>
  );
}
