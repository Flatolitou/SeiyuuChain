import React, { useState, useEffect } from 'react';
import SearchAnime from './SearchAnime';
import SeiyuuSearcher from './SeiyuuSearcher';
import { Timer, AlertTriangle, ArrowUp, X, LogOut, FastForward, Clock, Eye, Crosshair, Search, RefreshCw, Users, ShieldCheck } from 'lucide-react';
import TimerDisplay from './game/TimerDisplay';
import AnimeChainItem from './game/AnimeChainItem';
import { getAnimeWithSeiyuusLocal } from '../api/localDb';
import ChatBox from './ChatBox';

export default function GameBoard({ roomData, playerId, socket, onPlayTurn, onLeaveRoom }) {
  const [penaltyMessage, setPenaltyMessage] = useState(null);
  const [notification, setNotification] = useState(null);

  const teamsMode = roomData.settings?.teamsMode || false;

  const getActiveBaseTimer = () => {
    if (!roomData.settings) return 45;
    if (roomData.settings.gameMode !== 'decay') {
      return roomData.settings.turnTimer || 45;
    }
    const interval = roomData.settings.decayInterval || 5;
    const minCap = roomData.settings.minTimerCap || 10;
    const decayCount = Math.floor(roomData.chain.length / interval);
    return Math.max(minCap, (roomData.settings.turnTimer || 45) - decayCount);
  };
  const activeBase = getActiveBaseTimer();

  const isSpectator = roomData.spectators?.some(s => s.id === playerId);
  const me = roomData.players.find(p => p.id === playerId) || roomData.spectators?.find(s => s.id === playerId);

  // Teams mode turn logic
  const myTeam = me?.team;
  const isTeamsTurn = teamsMode && !isSpectator && myTeam === roomData.currentTurnTeam;

  // Standard 1v1 turn logic
  const isMyTurnStandard = !isSpectator && roomData.players[roomData.currentTurnIndex]?.id === playerId;

  const isMyTurn = teamsMode ? isTeamsTurn : isMyTurnStandard;

  // Threshold check – am I blocked from answering?
  let isThresholdBlocked = false;
  if (teamsMode && !isSpectator && isTeamsTurn && me) {
    const teamPlayers = roomData.players.filter(p => p.team === myTeam);
    if (teamPlayers.length > 1) {
      const myCount = me.answerCount || 0;
      const otherCounts = teamPlayers.filter(p => p.id !== playerId).map(p => p.answerCount || 0);
      const minOtherCount = Math.min(...otherCounts);
      const threshold = roomData.settings?.teamsModeThreshold || 2;
      if (myCount - minOtherCount >= threshold) {
        isThresholdBlocked = true;
      }
    }
  }

  const canInput = isMyTurn && !isThresholdBlocked;

  // Lifelines: teams use shared teamLifelines, 1v1 uses per-player lifelines
  const myLifelines = teamsMode
    ? (roomData.teamLifelines?.[myTeam] || {})
    : (roomData.lifelines?.[playerId] || {});

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

  // Teams Mode Header: two panels side by side
  const renderTeamsHeader = () => {
    const team1Players = roomData.players.filter(p => p.team === 1);
    const team2Players = roomData.players.filter(p => p.team === 2);
    const isTeam1Turn = roomData.currentTurnTeam === 1;
    const isTeam2Turn = roomData.currentTurnTeam === 2;

    const renderTeamPanel = (players, teamNum, isTurn) => {
      const color = teamNum === 1 ? 'var(--primary)' : 'var(--secondary)';
      const bgActive = teamNum === 1 ? 'rgba(139,92,246,0.1)' : 'rgba(6,182,212,0.1)';
      return (
        <div style={{
          flex: 1,
          padding: '12px 16px',
          borderRadius: '12px',
          border: `2px solid ${isTurn ? color : 'var(--glass-border)'}`,
          background: isTurn ? bgActive : 'rgba(255,255,255,0.02)',
          transition: 'all 0.3s ease',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {isTurn && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              height: '2px',
              background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
              animation: 'pulse 1.5s ease-in-out infinite'
            }} />
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Team {teamNum}
            </span>
            {isTurn && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color, background: `${color}22`, border: `1px solid ${color}55`, padding: '2px 8px', borderRadius: '20px' }}>
                THEIR TURN
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {players.map(p => {
              const isMe = p.id === playerId;
              const myCurrentCount = p.answerCount || 0;
              const teamCounts = players.map(tp => tp.answerCount || 0);
              const minCount = Math.min(...teamCounts);
              const threshold = roomData.settings?.teamsModeThreshold || 2;
              const isBlocked = players.length > 1 && (myCurrentCount - minCount >= threshold);

              return (
                <div key={p.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: isMe ? `${color}11` : 'transparent',
                  border: isMe ? `1px solid ${color}33` : '1px solid transparent',
                  opacity: p.disconnected ? 0.5 : 1
                }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: isMe ? 700 : 400, color: isBlocked ? 'var(--danger)' : (p.disconnected ? 'var(--text-dim)' : (isMe ? 'white' : 'var(--text-dim)')) }}>
                    {p.name}{isMe ? ' (You)' : ''} {p.disconnected ? '(Offline)' : ''}
                    {isBlocked && isTurn && <span style={{ fontSize: '0.7rem', marginLeft: '4px' }}>🚫</span>}
                  </span>
                  <span style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: isBlocked ? 'var(--danger)' : color,
                    background: `${color}15`,
                    padding: '1px 7px',
                    borderRadius: '10px',
                    minWidth: '24px',
                    textAlign: 'center'
                  }}>
                    {myCurrentCount}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
        {renderTeamPanel(team1Players, 1, isTeam1Turn)}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', minWidth: '80px' }}>
          <TimerDisplay socket={socket} initialTimer={roomData.timer} />
        </div>
        {renderTeamPanel(team2Players, 2, isTeam2Turn)}
      </div>
    );
  };

  // Standard 1v1 Header
  const renderStandardHeader = () => {
    const p1 = roomData.players[0];
    const p2 = roomData.players[1];
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <div style={{ textAlign: 'center', color: p1 ? (roomData.currentTurnIndex === 0 ? 'var(--primary)' : 'var(--text-dim)') : 'var(--text-dim)', opacity: p1?.disconnected ? 0.5 : 1 }}>
          <div style={{ fontWeight: roomData.currentTurnIndex === 0 ? 800 : 400, fontSize: roomData.currentTurnIndex === 0 ? '1.1rem' : '0.9rem' }}>
            {p1?.name || 'Player 1'} {p1?.id === playerId ? '(You)' : ''} {p1?.disconnected ? '(Offline)' : ''}
          </div>
        </div>

        <TimerDisplay socket={socket} initialTimer={roomData.timer} />

        <div style={{ textAlign: 'center', color: p2 ? (roomData.currentTurnIndex === 1 ? 'var(--secondary)' : 'var(--text-dim)') : 'var(--text-dim)', opacity: p2?.disconnected ? 0.5 : 1 }}>
          <div style={{ fontWeight: roomData.currentTurnIndex === 1 ? 800 : 400, fontSize: roomData.currentTurnIndex === 1 ? '1.1rem' : '0.9rem' }}>
            {p2?.name || 'Player 2'} {p2?.id === playerId ? '(You)' : ''} {p2?.disconnected ? '(Offline)' : ''}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>

      <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        <div style={{ maxWidth: '800px', width: '100%', margin: '0 auto' }}>

          {/* Header / StatusBar */}
          <header className="glass-panel" style={{ padding: '16px 24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: teamsMode ? '16px' : '0' }}>
              <div>
                <h2 className="title-gradient">Room: {roomData.id}</h2>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                  {roomData.status === 'waiting' ? 'Waiting for players' : 'Match in progress'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                  <span className="badge" style={{
                    background: roomData.settings?.gameMode === 'decay' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                    color: roomData.settings?.gameMode === 'decay' ? 'var(--danger)' : 'var(--success)',
                    borderColor: roomData.settings?.gameMode === 'decay' ? 'var(--danger)' : 'var(--success)',
                    fontSize: '0.75rem',
                    padding: '2px 8px'
                  }}>
                    {roomData.settings?.gameMode === 'decay' ? 'DECAY MODE' : 'STANDARD MODE'}
                  </span>
                  {teamsMode && (
                    <span className="badge" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--primary)', borderColor: 'var(--primary)', fontSize: '0.75rem', padding: '2px 8px' }}>
                      TEAMS MODE
                    </span>
                  )}
                  {roomData.settings?.gameMode === 'decay' && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                      Clock limit: <strong style={{ color: 'white' }}>{activeBase}s</strong> (floor {roomData.settings.minTimerCap}s)
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {!teamsMode && renderStandardHeader()}
                <button
                  className="btn btn-secondary"
                  onClick={onLeaveRoom}
                  style={{ padding: '8px 16px', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <LogOut size={18} /> Leave
                </button>
              </div>
            </div>

            {/* Teams header below the top row */}
            {teamsMode && renderTeamsHeader()}
          </header>

          {/* Lifelines */}
          {roomData.status === 'playing' && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
              {teamsMode && (
                <div style={{ width: '100%', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '-8px' }}>
                  Team {myTeam} shared lifelines:
                </div>
              )}
              <button
                className="btn btn-secondary"
                title={roomData.skipUsedThisTurn ? 'Opponent skipped, you must play!' : ''}
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
                <Clock size={18} /> +{roomData.settings?.lifelineSeconds || 30}s
              </button>
              {!roomData.settings?.revealAllCast && (
                <button
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: myLifelines.revealCast && isMyTurn && roomData.chain.length > 1 ? 1 : 0.5, borderColor: myLifelines.revealCast ? 'var(--primary)' : 'var(--glass-border)' }}
                  disabled={!myLifelines.revealCast || !isMyTurn || roomData.chain.length <= 1}
                  onClick={() => useLifeline('revealCast')}
                >
                  <Eye size={18} /> Reveal Cast
                </button>
              )}
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

          {/* Penalty / Notification banners */}
          {penaltyMessage && (
            <div className="glass-panel animate-fade-in" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', borderColor: 'var(--danger)', padding: '12px 24px', marginBottom: '16px', textAlign: 'center', fontWeight: 'bold' }}>
              {penaltyMessage}
            </div>
          )}
          {notification && (
            <div className="glass-panel animate-fade-in" style={{ backgroundColor: 'rgba(56, 189, 248, 0.2)', borderColor: '#38bdf8', padding: '12px 24px', marginBottom: '16px', textAlign: 'center', fontWeight: 'bold', color: 'white' }}>
              {notification}
            </div>
          )}

          {/* Threshold blocked warning */}
          {isThresholdBlocked && isTeamsTurn && (
            <div className="glass-panel animate-fade-in" style={{ backgroundColor: 'rgba(245,158,11,0.15)', borderColor: '#f59e0b', padding: '12px 24px', marginBottom: '16px', textAlign: 'center', fontWeight: 'bold', color: '#fbbf24' }}>
              🚫 You've answered too many times! Wait for a teammate to answer before you can go again.
            </div>
          )}

          {/* Input Area */}
          {!isSpectator && (
            <div style={{ marginBottom: '24px', position: 'relative', zIndex: 100 }}>
              <div className="glass-panel" style={{ padding: '16px' }}>
                {roomData.status === 'waiting' ? (
                  <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-dim)' }}>
                    Waiting...
                  </div>
                ) : canInput ? (
                  isSniping ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, color: 'var(--primary)' }}><Crosshair size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> Sniping Mode (Active)</h3>
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
                ) : isThresholdBlocked && isTeamsTurn ? (
                  <div style={{ textAlign: 'center', padding: '12px', color: '#f59e0b' }}>
                    ⏳ Wait for a teammate to answer before you can play again...
                  </div>
                ) : isMyTurn && !canInput ? (
                  // Should not normally happen, but fallback
                  <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-dim)' }}>
                    Waiting...
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-dim)' }}>
                    {teamsMode
                      ? `Waiting for Team ${roomData.currentTurnTeam === 1 ? 2 : 1}'s move...`
                      : "Waiting for opponent's move..."}
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
