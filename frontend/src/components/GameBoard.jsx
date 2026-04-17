import React, { useState, useEffect } from 'react';
import SearchAnime from './SearchAnime';
import SeiyuuSearcher from './SeiyuuSearcher';
import { Timer, AlertTriangle, ArrowUp, X, LogOut, FastForward, Clock, Eye, Crosshair, Search, RefreshCw } from 'lucide-react';
import TimerDisplay from './game/TimerDisplay';
import AnimeChainItem from './game/AnimeChainItem';
import { getAnimeWithSeiyuusLocal } from '../api/localDb';
import ChatBox from './ChatBox';

export default function GameBoard({ roomData, playerId, socket, onPlayTurn, onLeaveRoom }) {
  const [penaltyMessage, setPenaltyMessage] = useState(null);
  const [notification, setNotification] = useState(null);
  
  const isSpectator = roomData.spectators?.some(s => s.id === playerId);
  const isMyTurn = !isSpectator && roomData.players[roomData.currentTurnIndex]?.id === playerId;
  
  const [isSniping, setIsSniping] = useState(false);
  const [snipeSeiyuuId, setSnipeSeiyuuId] = useState('');

  useEffect(() => {
    if (!socket) return;
    
    socket.on('play_penalty', ({ message }) => {
      setPenaltyMessage(message);
      setTimeout(() => setPenaltyMessage(null), 3000);
    });
    socket.on('notification', ({ message }) => {
      setNotification(message);
      setTimeout(() => setNotification(null), 4000);
    });

    return () => {
      socket.off('play_penalty');
      socket.off('notification');
    };
  }, [socket]);

  const me = (roomData.players.find(p => p.id === playerId) || roomData.spectators?.find(s => s.id === playerId));
  const opponent = roomData.players.find(p => p.id !== playerId);
  const myLifelines = roomData.lifelines?.[playerId] || {};

  const useLifeline = (type) => {
    if (type === 'snipe') {
      setIsSniping(true);
      setSnipeSeiyuuId('');
    } else {
      socket.emit('use_lifeline', { roomId: roomData.id, type });
    }
  };

  const handleSnipePlay = (anime) => {
    let playSeiyuuId = snipeSeiyuuId;
    if (!playSeiyuuId && currentAnimeSeiyuus.length > 0) {
      playSeiyuuId = currentAnimeSeiyuus[0].id.toString();
    }
    
    if (!playSeiyuuId) {
      setPenaltyMessage('Please select a seiyuu first!');
      setTimeout(() => setPenaltyMessage(null), 3000);
      return;
    }
    
    socket.emit('play_turn', { roomId: roomData.id, animeId: anime.id, isSnipe: true, snipeSeiyuuId: playSeiyuuId });
    setIsSniping(false);
    setSnipeSeiyuuId('');
  };

  // Hydrate current anime seiyuus for the snipe dropdown
  const currentItem = roomData.chain.length > 0 ? roomData.chain[roomData.chain.length - 1] : null;
  const currentAnimeData = currentItem ? getAnimeWithSeiyuusLocal(currentItem.animeId) : null;
  const currentAnimeSeiyuus = currentAnimeData ? currentAnimeData.seiyuus : [];

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      
    <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      
      <div style={{ maxWidth: '800px', width: '100%', margin: '0 auto' }}>
      {/* Header / StatusBar */}
      <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', marginBottom: '24px' }}>
        <div>
          <h2 className="title-gradient">Room: {roomData.id}</h2>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            {roomData.status === 'waiting' ? 'Waiting for players' : 'Match in progress'}
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ textAlign: 'center', color: roomData.players[0] ? (roomData.currentTurnIndex === 0 ? 'var(--primary)' : 'var(--text-dim)') : 'var(--text-dim)' }}>
            <div style={{ fontWeight: roomData.currentTurnIndex === 0 ? 800 : 400, fontSize: roomData.currentTurnIndex === 0 ? '1.1rem' : '0.9rem' }}>
              {roomData.players[0]?.name || 'Player 1'} {roomData.players[0]?.id === playerId ? '(You)' : ''}
            </div>
          </div>
          
          <TimerDisplay socket={socket} initialTimer={roomData.timer} />

          <div style={{ textAlign: 'center', color: roomData.players[1] ? (roomData.currentTurnIndex === 1 ? 'var(--secondary)' : 'var(--text-dim)') : 'var(--text-dim)' }}>
             <div style={{ fontWeight: roomData.currentTurnIndex === 1 ? 800 : 400, fontSize: roomData.currentTurnIndex === 1 ? '1.1rem' : '0.9rem' }}>
              {roomData.players[1]?.name || 'Player 2'} {roomData.players[1]?.id === playerId ? '(You)' : ''}
            </div>
          </div>
        </div>
          
          {/* Role Swap Button removed for ongoing matches */}

          <button 
            className="btn btn-secondary" 
            onClick={onLeaveRoom}
            style={{ padding: '8px 16px', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <LogOut size={18} /> Leave
          </button>
      </header>

      {/* Lifelines */}
      {roomData.status === 'playing' && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '24px' }}>
          <button 
            className="btn btn-secondary" 
            title={roomData.skipUsedThisTurn ? "Opponent skipped, you must play!" : ""}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '8px', 
              opacity: myLifelines.skip && isMyTurn && !roomData.skipUsedThisTurn ? 1 : 0.5, 
              borderColor: roomData.skipUsedThisTurn && myLifelines.skip && isMyTurn ? 'var(--warning, #f59e0b)' : (myLifelines.skip ? 'var(--primary)' : 'var(--glass-border)') 
            }}
            disabled={!myLifelines.skip || !isMyTurn || roomData.skipUsedThisTurn}
            onClick={() => useLifeline('skip')}
          >
            <FastForward size={18} /> Skip
          </button>
          <button 
            className="btn btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: myLifelines.addTime && isMyTurn ? 1 : 0.5, borderColor: myLifelines.addTime ? 'var(--primary)' : 'var(--glass-border)' }}
            disabled={!myLifelines.addTime || !isMyTurn}
            onClick={() => useLifeline('addTime')}
          >
            <Clock size={18} /> +30s
          </button>
          <button 
            className="btn btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: myLifelines.revealCast && isMyTurn && roomData.chain.length > 1 ? 1 : 0.5, borderColor: myLifelines.revealCast ? 'var(--primary)' : 'var(--glass-border)' }}
            disabled={!myLifelines.revealCast || !isMyTurn || roomData.chain.length <= 1}
            onClick={() => useLifeline('revealCast')}
          >
            <Eye size={18} /> Reveal Cast
          </button>
          <button 
            className="btn btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: myLifelines.snipe && isMyTurn && roomData.chain.length > 0 ? 1 : 0.5, borderColor: myLifelines.snipe ? 'var(--primary)' : 'var(--glass-border)' }}
            disabled={!myLifelines.snipe || !isMyTurn || roomData.chain.length === 0}
            onClick={() => useLifeline('snipe')}
          >
            <Crosshair size={18} /> Snipe
          </button>
        </div>
      )}

      {/* Input Area */}
      {!isSpectator && (
        <div style={{ marginBottom: '24px', position: 'relative', zIndex: 100 }}>
          {penaltyMessage && (
          <div className="glass-panel animate-fade-in" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', borderColor: 'var(--danger)', padding: '12px 24px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>
            {penaltyMessage}
          </div>
        )}
        
        {notification && (
          <div className="glass-panel animate-fade-in" style={{ backgroundColor: 'rgba(56, 189, 248, 0.2)', borderColor: '#38bdf8', padding: '12px 24px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold', color: 'white' }}>
            {notification}
          </div>
        )}
          
          <div className="glass-panel" style={{ padding: '16px' }}>
            {roomData.status === 'waiting' ? (
              <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-dim)' }}>
                Waiting...
              </div>
            ) : isMyTurn ? (
              isSniping ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, color: 'var(--primary)' }}><Crosshair size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }}/> Sniping Mode (Active)</h3>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <SeiyuuSearcher 
                      seiyuus={currentAnimeSeiyuus} 
                      onSelect={setSnipeSeiyuuId} 
                    />
                  </div>
                  <div>
                    <SearchAnime onSelect={handleSnipePlay} />
                  </div>
                </div>
              ) : (
                <SearchAnime onSelect={(anime) => socket.emit('play_turn', { roomId: roomData.id, animeId: anime.id })} />
              )
            ) : (
              <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-dim)' }}>
                Waiting for opponent's move...
              </div>
            )}
          </div>
        </div>
      )}

      {isSpectator && (
        <div className="glass-panel" style={{ padding: '16px', marginBottom: '24px', textAlign: 'center', color: 'var(--primary)', fontWeight: 600 }}>
          <Eye size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          You are currently spectating this match.
        </div>
      )}

      {/* Chain Area */}
      <div className="glass-panel" style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {roomData.status === 'waiting' ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-dim)' }}>
            <h2>Waiting for opponent to join...</h2>
            <p>Share the room name: <strong>{roomData.id}</strong></p>
          </div>
        ) : (
          roomData.chain.slice().reverse().map((item, i, arr) => {
            const originalIndex = roomData.chain.length - 1 - i;
            const isFirst = originalIndex === 0;
            
            return (
              <div key={originalIndex} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px' }}>
                <AnimeChainItem 
                  item={item} 
                  index={originalIndex} 
                  roomData={roomData} 
                  isFirst={isFirst} 
                />
                
                {/* Arrow Up bridge EXCEPT for the first logical anime (last in reverse array) */}
                {i < arr.length - 1 && (
                   <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-dim)', margin: '-16px 0' }}>
                    <div style={{ width: '2px', height: '30px', background: 'var(--glass-border)' }}></div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-darker)', width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--text-dim)', zIndex: 1 }}>
                      <ArrowUp size={20} color="var(--primary)" />
                    </div>
                    <div style={{ width: '2px', height: '30px', background: 'var(--glass-border)' }}></div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
    </div>

    {/* Chat Sidebar */}
    <ChatBox roomData={roomData} socket={socket} playerId={playerId} />
    </div>
  );
}
