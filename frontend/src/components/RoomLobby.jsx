import React, { useState, useEffect } from 'react';
import { Users, CheckCircle, ShieldCheck, LogOut, RefreshCw, Eye, Settings, X } from 'lucide-react';
import ChatBox from './ChatBox';

export default function RoomLobby({ roomData, playerId, socket, onToggleReady, onStartGame, onLeaveRoom }) {
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [gameMode, setGameMode] = useState(roomData.settings?.gameMode || 'standard');
  const [localTimerSetting, setLocalTimerSetting] = useState(roomData.settings?.turnTimer || 45);
  const [localLifelineSetting, setLocalLifelineSetting] = useState(roomData.settings?.lifelineSeconds || 30);
  const [localDecayInterval, setLocalDecayInterval] = useState(roomData.settings?.decayInterval || 5);
  const [localMinTimerCap, setLocalMinTimerCap] = useState(roomData.settings?.minTimerCap || 10);
  const [localRevealAllCast, setLocalRevealAllCast] = useState(roomData.settings?.revealAllCast || false);
  const [localTeamsMode, setLocalTeamsMode] = useState(roomData.settings?.teamsMode || false);
  const [localTeamsModeThreshold, setLocalTeamsModeThreshold] = useState(roomData.settings?.teamsModeThreshold || 2);

  useEffect(() => {
    if (roomData.settings) {
      if (roomData.settings.gameMode) setGameMode(roomData.settings.gameMode);
      if (roomData.settings.turnTimer) setLocalTimerSetting(roomData.settings.turnTimer);
      if (roomData.settings.lifelineSeconds) setLocalLifelineSetting(roomData.settings.lifelineSeconds);
      if (roomData.settings.decayInterval) setLocalDecayInterval(roomData.settings.decayInterval);
      if (roomData.settings.minTimerCap) setLocalMinTimerCap(roomData.settings.minTimerCap);
      if (typeof roomData.settings.revealAllCast === 'boolean') setLocalRevealAllCast(roomData.settings.revealAllCast);
      if (typeof roomData.settings.teamsMode === 'boolean') setLocalTeamsMode(roomData.settings.teamsMode);
      if (typeof roomData.settings.teamsModeThreshold === 'number') setLocalTeamsModeThreshold(roomData.settings.teamsModeThreshold);
    }
  }, [roomData.settings]);

  const handleSaveSettings = () => {
    socket.emit('update_settings', {
      roomId: roomData.id,
      settings: {
        gameMode,
        turnTimer: localTimerSetting,
        lifelineSeconds: localLifelineSetting,
        decayInterval: localDecayInterval,
        minTimerCap: localMinTimerCap,
        revealAllCast: localRevealAllCast,
        teamsMode: localTeamsMode,
        teamsModeThreshold: localTeamsModeThreshold
      }
    });
    setShowSettingsModal(false);
  };

  const isSpectator = roomData.spectators?.some(s => s.id === playerId);
  const isHost = !isSpectator && roomData.players[0]?.id === playerId;
  const me = (roomData.players.find(p => p.id === playerId) || roomData.spectators?.find(s => s.id === playerId));
  
  const p1 = roomData.players[0];
  const p2 = roomData.players[1];

  const p1Ready = roomData.readyPlayers[p1?.id];
  const p2Ready = p2 ? roomData.readyPlayers[p2.id] : false;

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden'
    }}>
      {/* Main Lobby Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}>
      <div className="glass-panel animate-fade-in" style={{
        padding: '40px',
        width: '100%',
        maxWidth: '500px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        textAlign: 'center'
      }}>
        
        <div>
          <h1 className="title-gradient" style={{ fontSize: '2.5rem', marginBottom: '4px' }}>Room: {roomData.id}</h1>
          {roomData.password && (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '12px' }}>
              <ShieldCheck size={14} color="var(--primary)" /> 
              Password: <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{roomData.password}</span>
            </div>
          )}
          {roomData.lastMatchResult ? (
            <div className="glass-panel animate-fade-in" style={{ 
              padding: '12px 24px', 
              background: 'rgba(139, 92, 246, 0.1)', 
              borderColor: 'var(--primary)',
              color: 'var(--primary)',
              fontWeight: 700,
              fontSize: '1.1rem',
              borderRadius: '12px',
              marginBottom: '16px',
              borderStyle: 'dashed'
            }}>
              🏆 LAST WINNER: {roomData.lastMatchResult.winnerName}
            </div>
          ) : (
            <p style={{ color: 'var(--text-dim)' }}>Waiting to start...</p>
          )}
        </div>

        {roomData.settings?.teamsMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '20px 0', textAlign: 'left' }}>
            {/* Team 1 Panel */}
            <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid var(--primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.2rem', fontWeight: 800 }}>Team 1 ({roomData.players.filter(p => p.team === 1).length})</h3>
                {(isSpectator || me?.team !== 1) && (
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => socket.emit('switch_role', { roomId: roomData.id, to: 'team1' })}
                    style={{ padding: '4px 12px', fontSize: '0.85rem' }}
                  >
                    Join Team 1
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {roomData.players.filter(p => p.team === 1).length === 0 ? (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', fontStyle: 'italic' }}>No players yet</div>
                ) : (
                  roomData.players.filter(p => p.team === 1).map(p => {
                    const isPlayerHost = roomData.players[0]?.id === p.id;
                    const isPlayerReady = roomData.readyPlayers[p.id];
                    return (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                        <span style={{ fontWeight: p.id === playerId ? 800 : 400 }}>
                          {p.name} {p.id === playerId ? '(You)' : ''} {isPlayerHost ? '👑' : ''}
                        </span>
                        {isPlayerHost ? (
                          <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>Host</span>
                        ) : (
                          <span style={{ color: isPlayerReady ? 'var(--success)' : 'var(--text-dim)', fontSize: '0.85rem', fontWeight: 600 }}>
                            {isPlayerReady ? 'Ready' : 'Not Ready'}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Team 2 Panel */}
            <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid var(--secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, color: 'var(--secondary)', fontSize: '1.2rem', fontWeight: 800 }}>Team 2 ({roomData.players.filter(p => p.team === 2).length})</h3>
                {(isSpectator || me?.team !== 2) && (
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => socket.emit('switch_role', { roomId: roomData.id, to: 'team2' })}
                    style={{ padding: '4px 12px', fontSize: '0.85rem' }}
                  >
                    Join Team 2
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {roomData.players.filter(p => p.team === 2).length === 0 ? (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', fontStyle: 'italic' }}>No players yet</div>
                ) : (
                  roomData.players.filter(p => p.team === 2).map(p => {
                    const isPlayerHost = roomData.players[0]?.id === p.id;
                    const isPlayerReady = roomData.readyPlayers[p.id];
                    return (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                        <span style={{ fontWeight: p.id === playerId ? 800 : 400 }}>
                          {p.name} {p.id === playerId ? '(You)' : ''} {isPlayerHost ? '👑' : ''}
                        </span>
                        {isPlayerHost ? (
                          <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>Host</span>
                        ) : (
                          <span style={{ color: isPlayerReady ? 'var(--success)' : 'var(--text-dim)', fontSize: '0.85rem', fontWeight: 600 }}>
                            {isPlayerReady ? 'Ready' : 'Not Ready'}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '20px 0' }}>
            {/* Player 1 (Host) */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 24px',
              background: 'var(--bg-darker)',
              border: '1px solid var(--glass-border)',
              borderRadius: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ShieldCheck size={24} color="var(--primary)" />
                <span style={{ fontSize: '1.2rem', fontWeight: 600 }}>{p1?.name} {p1?.id === playerId ? '(You)' : ''}</span>
              </div>
              <div style={{ color: 'var(--primary)', fontWeight: 600 }}>Host</div>
            </div>

            {/* Player 2 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 24px',
              background: 'var(--bg-darker)',
              border: '1px solid var(--glass-border)',
              borderRadius: '12px'
            }}>
              {p2 ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Users size={24} color="var(--secondary)" />
                    <span style={{ fontSize: '1.2rem', fontWeight: 600 }}>{p2.name} {p2.id === playerId ? '(You)' : ''}</span>
                  </div>
                  {p2Ready ? (
                    <div style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                      <CheckCircle size={20} /> Ready
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-dim)' }}>Not ready</div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-dim)', margin: 'auto' }}>
                  <Users size={24} />
                  <span style={{ fontSize: '1.2rem' }}>Waiting for Player 2...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Spectators display */}
        {roomData.spectators && roomData.spectators.length > 0 && (
          <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '12px' }}>
            👁️ Spectators ({roomData.spectators.length}): {roomData.spectators.map(s => s.name).join(', ')}
          </div>
        )}

        {/* Actions - Only for Players */}
        {!isSpectator && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {isHost ? (
              <button 
                className="btn" 
                disabled={roomData.settings?.teamsMode 
                  ? (roomData.players.filter(p => p.team === 1).length === 0 || 
                     roomData.players.filter(p => p.team === 2).length === 0 || 
                     !roomData.players.every(p => p.id === roomData.players[0]?.id || roomData.readyPlayers[p.id]))
                  : (!p2Ready || !p2)
                }
                onClick={onStartGame}
                style={{ 
                  padding: '16px', 
                  fontSize: '1.2rem', 
                  opacity: (roomData.settings?.teamsMode 
                    ? (roomData.players.filter(p => p.team === 1).length === 0 || 
                       roomData.players.filter(p => p.team === 2).length === 0 || 
                       !roomData.players.every(p => p.id === roomData.players[0]?.id || roomData.readyPlayers[p.id]))
                    : (!p2Ready || !p2)) ? 0.5 : 1 
                }}
              >
                Start Game
              </button>
            ) : (
              <button 
                className={`btn ${roomData.readyPlayers[playerId] ? 'btn-secondary' : ''}`} 
                onClick={onToggleReady}
                style={{ padding: '16px', fontSize: '1.2rem', background: roomData.readyPlayers[playerId] ? 'transparent' : 'var(--success)' }}
              >
                {roomData.readyPlayers[playerId] ? 'Unready' : 'Ready Up'}
              </button>
            )}
          </div>
        )}

        {/* Global Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
          {/* Settings Button */}
          <button 
            className="btn btn-secondary" 
            onClick={() => setShowSettingsModal(true)}
            style={{ padding: '12px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Settings size={18} /> Room Settings
          </button>

          <button 
            className="btn btn-secondary" 
            onClick={onLeaveRoom}
            style={{ padding: '12px', fontSize: '1rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <LogOut size={18} /> Leave Room
          </button>

          {/* Role Swap Button */}
          {(!roomData.settings?.teamsMode || !isSpectator) && (
            <button 
              className="btn btn-secondary" 
              onClick={() => socket.emit('switch_role', { roomId: roomData.id, to: isSpectator ? 'player' : 'spectator' })}
              style={{ padding: '12px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: (isSpectator && roomData.players.length >= 2) ? 0.5 : 1 }}
              disabled={isSpectator && roomData.players.length >= 2} 
            >
              {isSpectator ? <RefreshCw size={18} /> : <Eye size={18} />}
              {isSpectator ? (roomData.players.length >= 2 ? 'Room Full' : 'Become Player') : 'Become Spectator'}
            </button>
          )}
        </div>

      </div>
      </div>

      {/* Chat Sidebar */}
      <ChatBox roomData={roomData} socket={socket} playerId={playerId} />

      {/* SETTINGS MODAL */}
      {showSettingsModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setShowSettingsModal(false)}>
          <div className="glass-panel animate-fade-in" style={{ padding: '32px', width: '90%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Settings size={22} color="var(--primary)" />
                Room Settings
              </h2>
              <X size={24} style={{ cursor: 'pointer', color: 'var(--text-dim)' }} onClick={() => setShowSettingsModal(false)} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Game Mode Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>Game Mode</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    disabled={!isHost}
                    onClick={() => setGameMode('standard')}
                    className={`btn ${gameMode === 'standard' ? '' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '6px 10px', fontSize: '0.85rem', cursor: isHost ? 'pointer' : 'not-allowed', background: gameMode === 'standard' ? 'var(--primary)' : 'rgba(255,255,255,0.05)', borderColor: gameMode === 'standard' ? 'var(--primary)' : 'var(--glass-border)', opacity: isHost ? 1 : 0.6 }}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    disabled={!isHost}
                    onClick={() => setGameMode('decay')}
                    className={`btn ${gameMode === 'decay' ? '' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '6px 10px', fontSize: '0.85rem', cursor: isHost ? 'pointer' : 'not-allowed', background: gameMode === 'decay' ? 'var(--primary)' : 'rgba(255,255,255,0.05)', borderColor: gameMode === 'decay' ? 'var(--primary)' : 'var(--glass-border)', opacity: isHost ? 1 : 0.6 }}
                  >
                    Timer Decay
                  </button>
                </div>
              </div>

              {/* Turn Timer Slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>Turn Timer</label>
                  <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--primary)' }}>{localTimerSetting}s</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="60"
                  value={localTimerSetting}
                  onChange={(e) => setLocalTimerSetting(parseInt(e.target.value))}
                  disabled={!isHost}
                  style={{
                    width: '100%',
                    accentColor: 'var(--primary)',
                    cursor: isHost ? 'pointer' : 'not-allowed',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    height: '5px',
                    outline: 'none',
                    opacity: isHost ? 1 : 0.6
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                  <span>5s</span>
                  <span>30s</span>
                  <span>60s</span>
                </div>
              </div>

              {/* Lifeline Clock Slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>Lifeline Added Time</label>
                  <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--primary)' }}>+{localLifelineSetting}s</span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="45"
                  value={localLifelineSetting}
                  onChange={(e) => setLocalLifelineSetting(parseInt(e.target.value))}
                  disabled={!isHost}
                  style={{
                    width: '100%',
                    accentColor: 'var(--primary)',
                    cursor: isHost ? 'pointer' : 'not-allowed',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    height: '5px',
                    outline: 'none',
                    opacity: isHost ? 1 : 0.6
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                  <span>15s</span>
                  <span>30s</span>
                  <span>45s</span>
                </div>
              </div>

              {/* Reveal All Cast Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignSelf: 'flex-start', textAlign: 'left' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-light)' }}>Reveal All Cast</label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Show all cast members & remove lifeline</span>
                </div>
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => setLocalRevealAllCast(!localRevealAllCast)}
                  style={{
                    width: '48px',
                    height: '26px',
                    borderRadius: '13px',
                    background: localRevealAllCast ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                    border: '1px solid var(--glass-border)',
                    position: 'relative',
                    cursor: isHost ? 'pointer' : 'not-allowed',
                    transition: 'background 0.2s ease',
                    padding: 0,
                    outline: 'none',
                    opacity: isHost ? 1 : 0.6
                  }}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'white',
                    position: 'absolute',
                    top: '2px',
                    left: localRevealAllCast ? '24px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                  }} />
                </button>
              </div>

              {/* Teams Mode Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignSelf: 'flex-start', textAlign: 'left' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-light)' }}>Teams Mode</label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Enable cooperative team play</span>
                </div>
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => setLocalTeamsMode(!localTeamsMode)}
                  style={{
                    width: '48px',
                    height: '26px',
                    borderRadius: '13px',
                    background: localTeamsMode ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                    border: '1px solid var(--glass-border)',
                    position: 'relative',
                    cursor: isHost ? 'pointer' : 'not-allowed',
                    transition: 'background 0.2s ease',
                    padding: 0,
                    outline: 'none',
                    opacity: isHost ? 1 : 0.6
                  }}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'white',
                    position: 'absolute',
                    top: '2px',
                    left: localTeamsMode ? '24px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                  }} />
                </button>
              </div>

              {/* Teams Mode Threshold Slider */}
              {localTeamsMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }} className="animate-fade-in">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>Teammate Count Threshold</label>
                    <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--primary)' }}>{localTeamsModeThreshold} answers</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={localTeamsModeThreshold}
                    onChange={(e) => setLocalTeamsModeThreshold(parseInt(e.target.value))}
                    disabled={!isHost}
                    style={{
                      width: '100%',
                      accentColor: 'var(--primary)',
                      cursor: isHost ? 'pointer' : 'not-allowed',
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      height: '5px',
                      outline: 'none',
                      opacity: isHost ? 1 : 0.6
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                    <span>1</span>
                    <span>5</span>
                    <span>10</span>
                  </div>
                </div>
              )}

              {/* Decay mode sub-settings */}
              {gameMode === 'decay' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }} className="animate-fade-in">
                  {/* Shows per decay */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Decay Every (guesses)</label>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--secondary)' }}>{localDecayInterval} guesses</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="10"
                      value={localDecayInterval}
                      onChange={(e) => setLocalDecayInterval(parseInt(e.target.value))}
                      disabled={!isHost}
                      style={{
                        width: '100%',
                        accentColor: 'var(--secondary)',
                        cursor: isHost ? 'pointer' : 'not-allowed',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        height: '4px',
                        outline: 'none',
                        opacity: isHost ? 1 : 0.6
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                      <span>2</span>
                      <span>6</span>
                      <span>10</span>
                    </div>
                  </div>

                  {/* Min Timer Cap */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Minimum Timer Cap</label>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--secondary)' }}>{localMinTimerCap}s</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="30"
                      value={localMinTimerCap}
                      onChange={(e) => setLocalMinTimerCap(parseInt(e.target.value))}
                      disabled={!isHost}
                      style={{
                        width: '100%',
                        accentColor: 'var(--secondary)',
                        cursor: isHost ? 'pointer' : 'not-allowed',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        height: '4px',
                        outline: 'none',
                        opacity: isHost ? 1 : 0.6
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                      <span>5s</span>
                      <span>15s</span>
                      <span>30s</span>
                    </div>
                  </div>
                </div>
              )}

              {!isHost && (
                <div style={{ 
                  fontSize: '0.85rem', 
                  color: 'var(--text-dim)', 
                  textAlign: 'center',
                  background: 'rgba(255,255,255,0.03)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--glass-border)'
                }}>
                  🔒 Only the host ({p1?.name}) can modify settings.
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ flex: 1, padding: '12px' }} 
                  onClick={() => setShowSettingsModal(false)}
                >
                  {isHost ? 'Cancel' : 'Close'}
                </button>
                {isHost && (
                  <button 
                    className="btn" 
                    style={{ flex: 1, padding: '12px' }} 
                    onClick={handleSaveSettings}
                  >
                    Save Settings
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
