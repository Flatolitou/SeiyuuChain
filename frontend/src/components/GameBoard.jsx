import React, { useState, useEffect } from 'react';
import SearchAnime from './SearchAnime';
import { Timer, AlertTriangle, ArrowUp, X, LogOut, FastForward, Clock, Eye, Crosshair } from 'lucide-react';

export default function GameBoard({ roomData, playerId, socket, onPlayTurn, onLeaveRoom }) {
  const [timer, setTimer] = useState(roomData.timer);
  const [penaltyMessage, setPenaltyMessage] = useState(null);
  const [notification, setNotification] = useState(null);
  const [isSniping, setIsSniping] = useState(false);
  const [snipeSeiyuuId, setSnipeSeiyuuId] = useState('');
  useEffect(() => {
    if (!socket) return;
    socket.on('timer_tick', (t) => setTimer(t));
    socket.on('play_penalty', ({ message, newTimer }) => {
      setPenaltyMessage(message);
      setTimer(newTimer);
      setTimeout(() => setPenaltyMessage(null), 3000);
    });
    socket.on('notification', ({ message }) => {
      setNotification(message);
      setTimeout(() => setNotification(null), 4000);
    });

    return () => {
      socket.off('timer_tick');
      socket.off('play_penalty');
      socket.off('notification');
    };
  }, [socket]);

  const isMyTurn = roomData.players[roomData.currentTurnIndex]?.id === playerId;
  const me = roomData.players.find(p => p.id === playerId);
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
    
    socket.emit('play_turn', { roomId: roomData.id, anime, isSnipe: true, snipeSeiyuuId: playSeiyuuId });
    setIsSniping(false);
    setSnipeSeiyuuId('');
  };

  // Safe fallback if the chain is empty but sniping is active (shouldn't happen realistically on turn 1)
  const currentAnimeSeiyuus = roomData.chain.length > 0 ? roomData.chain[roomData.chain.length - 1].anime.seiyuus : [];

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header / StatusBar */}
      <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', marginBottom: '24px' }}>
        <div>
          <h2 className="title-gradient">Room: {roomData.id}</h2>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            {roomData.status === 'waiting' ? 'Waiting for players' : 'Match in progress'}
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ textAlign: 'center', color: isMyTurn ? 'var(--primary)' : 'var(--text-dim)' }}>
            <div style={{ fontWeight: isMyTurn ? 800 : 400 }}>{me?.name} (You)</div>
          </div>
          
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

          <div style={{ textAlign: 'center', color: !isMyTurn ? 'var(--secondary)' : 'var(--text-dim)' }}>
            <div style={{ fontWeight: !isMyTurn ? 800 : 400, marginBottom: '4px' }}>{opponent?.name || 'Waiting...'}</div>
            {opponent && roomData.lifelines?.[opponent.id] && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                <FastForward size={14} opacity={roomData.lifelines[opponent.id].skip ? 1 : 0.2} />
                <Clock size={14} opacity={roomData.lifelines[opponent.id].addTime ? 1 : 0.2} />
                <Eye size={14} opacity={roomData.lifelines[opponent.id].revealCast ? 1 : 0.2} />
                <Crosshair size={14} opacity={roomData.lifelines[opponent.id].snipe ? 1 : 0.2} />
              </div>
            )}
          </div>
          
          <button 
            className="btn btn-secondary" 
            onClick={onLeaveRoom}
            style={{ padding: '8px 16px', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <LogOut size={18} /> Leave
          </button>
        </div>
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
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <select 
                      className="input-field" 
                      style={{ width: '100%', backgroundColor: 'var(--bg-dark)', color: 'white', border: '1px solid var(--glass-border)', cursor: 'pointer', appearance: 'none', paddingRight: '40px' }} 
                      value={snipeSeiyuuId} 
                      onChange={e => setSnipeSeiyuuId(e.target.value)}
                    >
                      <option value="" disabled hidden>Select a Seiyuu...</option>
                      {currentAnimeSeiyuus.map(s => (
                        <option key={s.id} value={s.id}>{s.name?.full}</option>
                      ))}
                    </select>
                    {/* Custom SVG arrow to keep styling fully unified and positioned safely away from the box edge */}
                    <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-dim)' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                  </div>
                </div>
                <div>
                  <SearchAnime onSelect={handleSnipePlay} />
                </div>
              </div>
            ) : (
              <SearchAnime onSelect={(anime) => socket.emit('play_turn', { roomId: roomData.id, anime })} />
            )
          ) : (
            <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-dim)' }}>
              Waiting for opponent's move...
            </div>
          )}
        </div>
      </div>

      {/* Chain Area */}
      <div className="glass-panel" style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {roomData.status === 'waiting' ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-dim)' }}>
            <h2>Waiting for opponent to join...</h2>
            <p>Share the room name: <strong>{roomData.id}</strong></p>
          </div>
        ) : roomData.chain.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-dim)' }}>
            <h3>The chain is empty</h3>
            {isMyTurn ? <p>You go first! Pick any anime to start.</p> : <p>Waiting for opponent to start...</p>}
          </div>
        ) : (
          roomData.chain.slice().reverse().map((item, i) => {
            const isFirst = i === roomData.chain.length - 1; // It's reversed
            const turnNumber = roomData.chain.length - i;
            
            return (
            <div key={i} className="animate-chain" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              
              {/* Anime Card */}
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column',
                background: 'rgba(255,255,255,0.02)', 
                border: '1px solid var(--glass-border)',
                borderRadius: '16px',
                padding: '24px',
                width: '100%',
                maxWidth: '700px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
              }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '-8px', left: '-8px', fontWeight: 900, fontSize: '1.4rem', color: 'var(--primary)', opacity: 0.8 }}>
                    #{turnNumber}
                  </div>
                  <h3 style={{ textAlign: 'center', fontSize: '1.6rem', padding: '0 40px 12px 40px', marginBottom: '16px', borderBottom: '1px solid var(--glass-border)', wordBreak: 'break-word' }}>
                    {item.anime.title.romaji || item.anime.title.english}
                  </h3>
                </div>

                <div style={{ display: 'flex', gap: '20px', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  
                  {/* Left Side: Seiyuu Info */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {isFirst || item.revealCast ? (
                      <div className="custom-scroll" style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '12px' }}>
                        {item.anime.seiyuus?.map(s => {
                          const usageCount = item.seiyuuUsageCountSnapshot?.[s.id] || roomData.seiyuuUsageCount[s.id] || 0;
                          return (
                          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--glass-border)', alignItems: 'flex-start', gap: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                {[1, 2, 3].map(n => (
                                  <div key={n} style={{ 
                                    width: '12px', height: '12px', borderRadius: '50%', 
                                    border: `1px solid ${usageCount >= n ? 'var(--danger)' : 'var(--text-dim)'}`,
                                    background: usageCount >= n ? 'var(--danger)' : 'transparent'
                                  }} />
                                ))}
                              </div>
                              <span style={{ fontSize: '1.1rem', whiteSpace: 'nowrap', flexShrink: 0 }}>{s.name?.full}</span>
                            </div>
                            <span style={{ fontSize: '1rem', color: 'var(--text-dim)', textAlign: 'right', wordBreak: 'break-word' }}>
                              {s.characterNames ? s.characterNames.join(', ') : s.characterName}
                            </span>
                          </div>
                        )})}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
                        {item.linkingSeiyuus && item.linkingSeiyuus.map(lSeiyuu => {
                          const usageCount = item.seiyuuUsageCountSnapshot?.[lSeiyuu.id] || roomData.seiyuuUsageCount[lSeiyuu.id] || 1;
                          return (
                            <div key={lSeiyuu.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                              {/* 3 Lives Circles */}
                              <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginTop: '2px' }}>
                                {[1, 2, 3].map(n => (
                                  <div key={n} style={{ 
                                    width: '24px', height: '24px', borderRadius: '50%', 
                                    border: `2px solid ${usageCount >= n ? 'var(--danger)' : 'var(--text-dim)'}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: usageCount >= n ? 'rgba(239, 68, 68, 0.2)' : 'transparent'
                                  }}>
                                    {usageCount >= n && <X size={16} color="var(--danger)" />}
                                  </div>
                                ))}
                              </div>
                              
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {/* Seiyuu Name */}
                                <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                                  {lSeiyuu.name?.full}
                                </div>

                                {/* Character Name */}
                                <div style={{ fontStyle: 'italic', color: 'var(--primary)', fontSize: '1.1rem', wordBreak: 'break-word', lineHeight: '1.4' }}>
                                  as {lSeiyuu.characterNames ? lSeiyuu.characterNames.join(', ') : lSeiyuu.characterName}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Right Side: Anime Cover */}
                  <img src={item.anime.coverImage?.large || item.anime.coverImage?.medium} alt="" style={{ width: '100px', height: '140px', objectFit: 'cover', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} />
                </div>
              </div>

              {/* Arrow Up bridge to the previous anime (not rendered for the first anime at bottom) */}
              {!isFirst && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-dim)', margin: '-16px 0' }}>
                  <div style={{ width: '2px', height: '30px', background: 'var(--glass-border)' }}></div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-darker)', width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--text-dim)', zIndex: 1 }}>
                    <ArrowUp size={20} color="var(--primary)" />
                  </div>
                  <div style={{ width: '2px', height: '30px', background: 'var(--glass-border)' }}></div>
                </div>
              )}

            </div>
          )})
        )}
      </div>

    </div>
  );
}
