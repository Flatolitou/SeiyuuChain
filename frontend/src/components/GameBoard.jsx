import React, { useState, useEffect } from 'react';
import SearchAnime from './SearchAnime';
import SeiyuuSearcher from './SeiyuuSearcher';
import { Timer, AlertTriangle, ArrowUp, X, LogOut, FastForward, Clock, Eye, Crosshair, Search, RefreshCw, Users, ShieldCheck, MessageSquare } from 'lucide-react';
import TimerDisplay from './game/TimerDisplay';
import AnimeChainItem from './game/AnimeChainItem';
import { getAnimeWithSeiyuusLocal } from '../api/localDb';
import ChatBox from './ChatBox';

export default function GameBoard({ roomData, playerId, socket, onPlayTurn, onLeaveRoom }) {
  const [penaltyMessage, setPenaltyMessage] = useState(null);
  const [notification, setNotification] = useState(null);
  const [showChat, setShowChat] = useState(true);

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

  // Sidebar Standard (1v1) Players Panel
  const renderSidebarStandard = () => {
    const p1 = roomData.players[0];
    const p2 = roomData.players[1];
    const isP1Turn = roomData.currentTurnIndex === 0;
    const isP2Turn = roomData.currentTurnIndex === 1;

    const renderPlayerItem = (p, isTurn, color, label) => {
      if (!p) {
        return (
          <div style={{
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px dashed var(--glass-border)',
            color: 'var(--text-dim)',
            fontSize: '0.8rem',
            fontStyle: 'italic',
            textAlign: 'center'
          }}>
            Waiting for player...
          </div>
        );
      }

      const isMe = p.id === playerId;
      const bgActive = color === 'var(--primary)' ? 'rgba(139,92,246,0.08)' : 'rgba(6,182,212,0.08)';

      return (
        <div style={{
          padding: '12px',
          borderRadius: '12px',
          border: `2px solid ${isTurn ? color : 'var(--glass-border)'}`,
          background: isTurn ? bgActive : 'rgba(255,255,255,0.02)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'all 0.3s ease',
          opacity: p.disconnected ? 0.5 : 1
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {label}
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: isMe ? 700 : 500, color: isTurn ? 'white' : 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
              {p.name}{isMe ? ' (You)' : ''} {p.disconnected ? ' (Offline)' : ''}
            </span>
          </div>
          {isTurn && (
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color, background: `${color}22`, border: `1px solid ${color}55`, padding: '2px 8px', borderRadius: '12px', flexShrink: 0 }}>
              PLAYING
            </span>
          )}
        </div>
      );
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {renderPlayerItem(p1, isP1Turn, 'var(--primary)', 'Player 1')}
        {renderPlayerItem(p2, isP2Turn, 'var(--secondary)', 'Player 2')}
      </div>
    );
  };

  // Sidebar Teams Panel
  const renderSidebarTeams = () => {
    const team1Players = roomData.players.filter(p => p.team === 1);
    const team2Players = roomData.players.filter(p => p.team === 2);
    const isTeam1Turn = roomData.currentTurnTeam === 1;
    const isTeam2Turn = roomData.currentTurnTeam === 2;

    const renderTeamPanel = (players, teamNum, isTurn) => {
      const color = teamNum === 1 ? 'var(--primary)' : 'var(--secondary)';
      const bgActive = teamNum === 1 ? 'rgba(139,92,246,0.08)' : 'rgba(6,182,212,0.08)';
      return (
        <div style={{
          padding: '12px 14px',
          borderRadius: '12px',
          border: `2px solid ${isTurn ? color : 'var(--glass-border)'}`,
          background: isTurn ? bgActive : 'rgba(255,255,255,0.02)',
          transition: 'all 0.3s ease',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {isTurn && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              height: '2px',
              background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
              animation: 'pulse 1.5s ease-in-out infinite'
            }} />
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '0.85rem', color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Team {teamNum}
            </span>
            {isTurn && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color, background: `${color}22`, border: `1px solid ${color}55`, padding: '1px 6px', borderRadius: '20px' }}>
                PLAYING
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
                  padding: '4px 6px',
                  borderRadius: '6px',
                  background: isMe ? `${color}11` : 'transparent',
                  border: isMe ? `1px solid ${color}23` : '1px solid transparent',
                  opacity: p.disconnected ? 0.5 : 1
                }}>
                  <span style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px', fontWeight: isMe ? 700 : 400, color: isBlocked ? 'var(--danger)' : (p.disconnected ? 'var(--text-dim)' : (isMe ? 'white' : 'var(--text-dim)')) }}>
                    {p.name}{isMe ? ' (You)' : ''} {p.disconnected ? ' (Offline)' : ''}
                    {isBlocked && isTurn && <span style={{ fontSize: '0.7rem', marginLeft: '4px' }}>🚫</span>}
                  </span>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: isBlocked ? 'var(--danger)' : color,
                    background: `${color}15`,
                    padding: '1px 6px',
                    borderRadius: '8px',
                    minWidth: '20px',
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {renderTeamPanel(team1Players, 1, isTeam1Turn)}
        {renderTeamPanel(team2Players, 2, isTeam2Turn)}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>

      {/* Left Sidebar (Players, Room Info, Timer) */}
      <div className="glass-panel" style={{
        width: '300px',
        minWidth: '300px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        padding: '24px',
        borderRight: '1px solid var(--glass-border)',
        background: 'rgba(10, 10, 15, 0.4)',
        borderRadius: '16px 0 0 16px',
        overflowY: 'auto'
      }}>
        {/* Room Info */}
        <div>
          <h2 className="title-gradient" style={{ margin: '0 0 4px 0', fontSize: '1.5rem' }}>Room: {roomData.id}</h2>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '8px' }}>
            {roomData.status === 'waiting' ? 'Waiting for players' : 'Match in progress'}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span className="badge" style={{
              background: roomData.settings?.gameMode === 'decay' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
              color: roomData.settings?.gameMode === 'decay' ? 'var(--danger)' : 'var(--success)',
              borderColor: roomData.settings?.gameMode === 'decay' ? 'var(--danger)' : 'var(--success)',
              fontSize: '0.7rem',
              padding: '1px 6px'
            }}>
              {roomData.settings?.gameMode === 'decay' ? 'DECAY' : 'STANDARD'}
            </span>
            {teamsMode && (
              <span className="badge" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--primary)', borderColor: 'var(--primary)', fontSize: '0.7rem', padding: '1px 6px' }}>
                TEAMS
              </span>
            )}
          </div>
          {roomData.settings?.gameMode === 'decay' && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '6px' }}>
              Limit: <strong style={{ color: 'white' }}>{activeBase}s</strong> (floor {roomData.settings.minTimerCap}s)
            </div>
          )}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '0' }} />

        {/* Timer Section (Centered / Fixed Box) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>Turn Timer</span>
          <TimerDisplay socket={socket} initialTimer={roomData.timer} />
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '0' }} />

        {/* Players / Teams List Section */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>Players</span>
          {teamsMode ? renderSidebarTeams() : renderSidebarStandard()}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '0' }} />

        {/* Controls Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowChat(!showChat)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
          >
            <MessageSquare size={18} /> {showChat ? 'Hide Chat' : 'Show Chat'}
          </button>
          
          <button
            className="btn btn-secondary"
            onClick={onLeaveRoom}
            style={{ width: '100%', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
          >
            <LogOut size={18} /> Leave Room
          </button>
        </div>

      </div>

      {/* Main Game Area */}
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ maxWidth: '800px', width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Answer Box / Input Area at the top */}
          {!isSpectator ? (
            <div style={{ position: 'relative', zIndex: 100 }}>
              <div className="glass-panel" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Your Move</span>
                    {isMyTurn && !isThresholdBlocked && (
                      <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success)', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                        YOUR TURN TO PLAY
                      </span>
                    )}
                  </div>
                  {roomData.status === 'waiting' ? (
                    <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-dim)' }}>
                      Waiting for players to join...
                    </div>
                  ) : canInput ? (
                    isSniping ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1rem' }}><Crosshair size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> Sniping Mode (Active)</h3>
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
                  ) : (
                    <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-dim)' }}>
                      {teamsMode
                        ? `Waiting for Team ${roomData.currentTurnTeam === 1 ? 2 : 1}'s move...`
                        : "Waiting for opponent's move..."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-panel" style={{ padding: '16px', textAlign: 'center', color: 'var(--primary)', fontWeight: 600 }}>
              <Eye size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
              You are currently spectating this match.
            </div>
          )}

          {/* Lifelines bar just below input */}
          {roomData.status === 'playing' && !isSpectator && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
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
            <div className="glass-panel animate-fade-in" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', borderColor: 'var(--danger)', padding: '12px 24px', textAlign: 'center', fontWeight: 'bold' }}>
              {penaltyMessage}
            </div>
          )}
          {notification && (
            <div className="glass-panel animate-fade-in" style={{ backgroundColor: 'rgba(56, 189, 248, 0.2)', borderColor: '#38bdf8', padding: '12px 24px', textAlign: 'center', fontWeight: 'bold', color: 'white' }}>
              {notification}
            </div>
          )}

          {/* Threshold blocked warning */}
          {isThresholdBlocked && isTeamsTurn && (
            <div className="glass-panel animate-fade-in" style={{ backgroundColor: 'rgba(245,158,11,0.15)', borderColor: '#f59e0b', padding: '12px 24px', textAlign: 'center', fontWeight: 'bold', color: '#fbbf24' }}>
              🚫 You've answered too many times! Wait for a teammate to answer before you can go again.
            </div>
          )}

          {/* Chain Area */}
          <div className="glass-panel" style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '32px', minHeight: '300px' }}>
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

                    {/* Arrow Up bridge */}
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

      {/* Chat Sidebar (Right) */}
      {showChat && (
        <ChatBox roomData={roomData} socket={socket} playerId={playerId} />
      )}

      {/* Floating Toggle Chat Button if Hidden */}
      {!showChat && (
        <button
          onClick={() => setShowChat(true)}
          style={{
            position: 'fixed',
            right: '24px',
            bottom: '24px',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'var(--primary)',
            border: 'none',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
            zIndex: 999
          }}
          title="Show Chat"
        >
          <MessageSquare size={22} />
        </button>
      )}

    </div>
  );
}
