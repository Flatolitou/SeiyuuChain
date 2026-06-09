import React, { useState, useEffect } from 'react';
import { Gamepad2, Users, Lock, ChevronRight, PlusCircle, X } from 'lucide-react';

export default function LobbyBrowser({ playerName, socket, onJoinRoom }) {
  const [lobbies, setLobbies] = useState([]);
  
  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newRoomId, setNewRoomId] = useState('');
  const [newRoomPassword, setNewRoomPassword] = useState('');
  const [turnTimer, setTurnTimer] = useState(45);
  const [gameMode, setGameMode] = useState('standard');
  const [lifelineSeconds, setLifelineSeconds] = useState(30);
  const [decayInterval, setDecayInterval] = useState(5);
  const [minTimerCap, setMinTimerCap] = useState(10);
  const [revealAllCast, setRevealAllCast] = useState(false);
  const [teamsMode, setTeamsMode] = useState(false);
  const [teamsModeThreshold, setTeamsModeThreshold] = useState(2);
  
  const [joinRoomId, setJoinRoomId] = useState(null);
  const [joinPassword, setJoinPassword] = useState('');

  useEffect(() => {
    socket.emit('fetch_lobbies');

    socket.on('lobbies_update', (data) => {
      setLobbies(data);
    });

    return () => {
      socket.off('lobbies_update');
    };
  }, [socket]);

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (newRoomId.trim() === '') return;
    onJoinRoom(newRoomId, newRoomPassword, playerName, { 
      gameMode, 
      turnTimer, 
      lifelineSeconds, 
      decayInterval, 
      minTimerCap,
      revealAllCast,
      teamsMode,
      teamsModeThreshold
    });
  };

  const handleJoinSelectedRoom = (e) => {
    e.preventDefault();
    if (!joinRoomId) return;
    onJoinRoom(joinRoomId, joinPassword, playerName);
  };

  const openJoinModal = (roomId) => {
    setJoinRoomId(roomId);
    setJoinPassword('');
    setShowJoinModal(true);
  };

  // Shared Modal Backdrop Style
  const modalBackdropStyle = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px', minHeight: '100vh' }}>
      
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <h1 className="title-gradient" style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '2.5rem' }}>
            <Gamepad2 size={36} color="var(--primary)" />
            Seiyuu Chain
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '1.1rem', marginTop: '4px' }}>Welcome, <strong style={{ color: 'white' }}>{playerName}</strong>!</p>
        </div>
        
        <button className="btn" onClick={() => setShowCreateModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <PlusCircle size={20} /> Create Room
        </button>
      </header>

      <div className="glass-panel" style={{ padding: '24px' }}>
        <h2 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={24} color="var(--secondary)" /> Public Lobbies
        </h2>
        
        {lobbies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
            <div style={{ fontSize: '1.2rem', marginBottom: '8px' }}>No active rooms waiting for players.</div>
            <div>Be the first to create one!</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {lobbies.map(room => (
              <div 
                key={room.id}
                style={{ 
                  background: 'rgba(255,255,255,0.03)', 
                  border: '1px solid var(--glass-border)',
                  borderRadius: '12px',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'background 0.2s, transform 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.transform = 'translateY(0)' }}
                onClick={() => {
                  if (room.hasPassword) {
                    openJoinModal(room.id);
                  } else {
                    onJoinRoom(room.id, '', playerName);
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <h3 style={{ fontSize: '1.3rem', wordBreak: 'break-all', margin: 0 }}>{room.id}</h3>
                    <div className="badge" style={{ 
                      alignSelf: 'flex-start', 
                      background: room.status === 'playing' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                      color: room.status === 'playing' ? 'var(--primary)' : 'var(--success)',
                      borderColor: room.status === 'playing' ? 'var(--primary)' : 'var(--success)',
                      fontSize: '0.7rem'
                    }}>
                      {room.status === 'playing' ? 'ONGOING' : 'WAITING'}
                    </div>
                  </div>
                  {room.hasPassword && <Lock size={18} color="var(--text-dim)" />}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Users size={16} color={room.teamsMode ? 'var(--primary)' : (room.playerCount >= 2 ? 'var(--text-dim)' : 'var(--success)')} /> 
                      {room.teamsMode ? `${room.playerCount} (Teams)` : `${room.playerCount} / 2`}
                    </div>
                    {room.spectatorCount > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.7 }}>
                        <Gamepad2 size={16} />
                        {room.spectatorCount} Watching
                      </div>
                    )}
                  </div>
                  <ChevronRight size={20} color="var(--primary)" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CREATE ROOM MODAL */}
      {showCreateModal && (
        <div style={modalBackdropStyle} onClick={() => setShowCreateModal(false)}>
          <div className="glass-panel animate-fade-in" style={{ padding: '32px', width: '90%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2>Create New Room</h2>
              <X size={24} style={{ cursor: 'pointer', color: 'var(--text-dim)' }} onClick={() => setShowCreateModal(false)} />
            </div>
            <form onSubmit={handleCreateRoom} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input
                type="text"
                placeholder="Room Name"
                className="input-field"
                value={newRoomId}
                onChange={(e) => setNewRoomId(e.target.value)}
                required
                autoFocus
              />
              <input
                type="password"
                placeholder="Password (Optional)"
                className="input-field"
                value={newRoomPassword}
                onChange={(e) => setNewRoomPassword(e.target.value)}
              />
              
              {/* Game Mode */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>Game Mode</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setGameMode('standard')}
                    className={`btn ${gameMode === 'standard' ? '' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '8px 12px', fontSize: '0.9rem', background: gameMode === 'standard' ? 'var(--primary)' : 'rgba(255,255,255,0.05)', borderColor: gameMode === 'standard' ? 'var(--primary)' : 'var(--glass-border)' }}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    onClick={() => setGameMode('decay')}
                    className={`btn ${gameMode === 'decay' ? '' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '8px 12px', fontSize: '0.9rem', background: gameMode === 'decay' ? 'var(--primary)' : 'rgba(255,255,255,0.05)', borderColor: gameMode === 'decay' ? 'var(--primary)' : 'var(--glass-border)' }}
                  >
                    Timer Decay
                  </button>
                </div>
              </div>

              {/* Turn Timer Slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '4px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>Turn Timer</label>
                  <span style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--primary)' }}>{turnTimer}s</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="60"
                  value={turnTimer}
                  onChange={(e) => setTurnTimer(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    accentColor: 'var(--primary)',
                    cursor: 'pointer',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    height: '6px',
                    outline: 'none'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  <span>5s</span>
                  <span>30s</span>
                  <span>60s</span>
                </div>
              </div>

              {/* Lifeline Clock Slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '4px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>Lifeline Added Time</label>
                  <span style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--primary)' }}>+{lifelineSeconds}s</span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="45"
                  value={lifelineSeconds}
                  onChange={(e) => setLifelineSeconds(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    accentColor: 'var(--primary)',
                    cursor: 'pointer',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    height: '6px',
                    outline: 'none'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  <span>15s</span>
                  <span>30s</span>
                  <span>45s</span>
                </div>
              </div>

              {/* Reveal All Cast Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)', margin: '4px 0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignSelf: 'flex-start', textAlign: 'left' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-light)' }}>Reveal All Cast</label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Show all cast members & remove lifeline</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRevealAllCast(!revealAllCast)}
                  style={{
                    width: '48px',
                    height: '26px',
                    borderRadius: '13px',
                    background: revealAllCast ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                    border: '1px solid var(--glass-border)',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'background 0.2s ease',
                    padding: 0,
                    outline: 'none'
                  }}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'white',
                    position: 'absolute',
                    top: '2px',
                    left: revealAllCast ? '24px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                  }} />
                </button>
              </div>

              {/* Teams Mode Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)', margin: '4px 0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignSelf: 'flex-start', textAlign: 'left' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-light)' }}>Teams Mode</label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Enable cooperative team play</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTeamsMode(!teamsMode)}
                  style={{
                    width: '48px',
                    height: '26px',
                    borderRadius: '13px',
                    background: teamsMode ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                    border: '1px solid var(--glass-border)',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'background 0.2s ease',
                    padding: 0,
                    outline: 'none'
                  }}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'white',
                    position: 'absolute',
                    top: '2px',
                    left: teamsMode ? '24px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                  }} />
                </button>
              </div>

              {/* Teams Mode Threshold Slider */}
              {teamsMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '4px 0' }} className="animate-fade-in">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>Teammate Count Threshold</label>
                    <span style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--primary)' }}>{teamsModeThreshold} answers</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={teamsModeThreshold}
                    onChange={(e) => setTeamsModeThreshold(parseInt(e.target.value))}
                    style={{
                      width: '100%',
                      accentColor: 'var(--primary)',
                      cursor: 'pointer',
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      height: '6px',
                      outline: 'none'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    <span>1</span>
                    <span>5</span>
                    <span>10</span>
                  </div>
                </div>
              )}

              {/* Decay mode sub-settings */}
              {gameMode === 'decay' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }} className="animate-fade-in">
                  {/* Shows per decay */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Decay Every (guesses)</label>
                      <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--secondary)' }}>{decayInterval} guesses</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="10"
                      value={decayInterval}
                      onChange={(e) => setDecayInterval(parseInt(e.target.value))}
                      style={{
                        width: '100%',
                        accentColor: 'var(--secondary)',
                        cursor: 'pointer',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        height: '5px',
                        outline: 'none'
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                      <span>2</span>
                      <span>6</span>
                      <span>10</span>
                    </div>
                  </div>

                  {/* Min Timer Cap */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Minimum Timer Cap</label>
                      <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--secondary)' }}>{minTimerCap}s</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="30"
                      value={minTimerCap}
                      onChange={(e) => setMinTimerCap(parseInt(e.target.value))}
                      style={{
                        width: '100%',
                        accentColor: 'var(--secondary)',
                        cursor: 'pointer',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        height: '5px',
                        outline: 'none'
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                      <span>5s</span>
                      <span>15s</span>
                      <span>30s</span>
                    </div>
                  </div>
                </div>
              )}

              <button type="submit" className="btn" style={{ marginTop: '8px' }}>Create & Join</button>
            </form>
          </div>
        </div>
      )}

      {/* JOIN ROOM MODAL */}
      {showJoinModal && joinRoomId && (
        <div style={modalBackdropStyle} onClick={() => setShowJoinModal(false)}>
          <div className="glass-panel animate-fade-in" style={{ padding: '32px', width: '90%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2>Join: <span style={{ color: 'var(--primary)' }}>{joinRoomId}</span></h2>
              <X size={24} style={{ cursor: 'pointer', color: 'var(--text-dim)' }} onClick={() => setShowJoinModal(false)} />
            </div>
            <form onSubmit={handleJoinSelectedRoom} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ position: 'relative' }}>
                <Lock size={20} color="var(--text-dim)" style={{ position: 'absolute', left: '16px', top: '14px' }} />
                <input
                  type="password"
                  placeholder="Enter Room Password"
                  className="input-field"
                  style={{ paddingLeft: '48px' }}
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  autoFocus
                />
              </div>
              <button type="submit" className="btn" style={{ marginTop: '8px' }}>Connect</button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
