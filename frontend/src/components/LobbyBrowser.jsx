import React, { useState, useEffect } from 'react';
import { Gamepad2, Users, Lock, ChevronRight, PlusCircle, X } from 'lucide-react';

export default function LobbyBrowser({ playerName, socket, onJoinRoom }) {
  const [lobbies, setLobbies] = useState([]);
  
  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  
  const [newRoomId, setNewRoomId] = useState('');
  const [newRoomPassword, setNewRoomPassword] = useState('');
  
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
    onJoinRoom(newRoomId, newRoomPassword, playerName);
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
                      <Users size={16} color={room.playerCount >= 2 ? 'var(--text-dim)' : 'var(--success)'} /> 
                      {room.playerCount} / 2
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
