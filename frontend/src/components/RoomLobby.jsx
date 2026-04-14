import { Users, CheckCircle, ShieldCheck, LogOut } from 'lucide-react';

export default function RoomLobby({ roomData, playerId, onToggleReady, onStartGame, onLeaveRoom }) {
  const isHost = roomData.players[0]?.id === playerId;
  const me = roomData.players.find(p => p.id === playerId);
  const p1 = roomData.players[0];
  const p2 = roomData.players[1];

  const p1Ready = roomData.readyPlayers[p1?.id];
  const p2Ready = p2 ? roomData.readyPlayers[p2.id] : false;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      width: '100vw'
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
          <h1 className="title-gradient" style={{ fontSize: '2.5rem', marginBottom: '8px' }}>Room: {roomData.id}</h1>
          <p style={{ color: 'var(--text-dim)' }}>Waiting to start...</p>
        </div>

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

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {isHost ? (
            <button 
              className="btn" 
              disabled={!p2Ready || !p2}
              onClick={onStartGame}
              style={{ padding: '16px', fontSize: '1.2rem', opacity: (!p2Ready || !p2) ? 0.5 : 1 }}
            >
              Start Game
            </button>
          ) : (
            <button 
              className={`btn ${p2Ready ? 'btn-secondary' : ''}`} 
              onClick={onToggleReady}
              style={{ padding: '16px', fontSize: '1.2rem', background: p2Ready ? 'transparent' : 'var(--success)' }}
            >
              {p2Ready ? 'Unready' : 'Ready Up'}
            </button>
          )}

          <button 
            className="btn btn-secondary" 
            onClick={onLeaveRoom}
            style={{ padding: '12px', fontSize: '1rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <LogOut size={18} /> Leave Room
          </button>
        </div>

      </div>
    </div>
  );
}
