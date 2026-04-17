import { Users, CheckCircle, ShieldCheck, LogOut, RefreshCw, Eye } from 'lucide-react';
import ChatBox from './ChatBox';

export default function RoomLobby({ roomData, playerId, socket, onToggleReady, onStartGame, onLeaveRoom }) {
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
          <h1 className="title-gradient" style={{ fontSize: '2.5rem', marginBottom: '8px' }}>Room: {roomData.id}</h1>
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

        {/* Actions - Only for Players */}
        {!isSpectator && (
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
          </div>
        )}

        {/* Global Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
          <button 
            className="btn btn-secondary" 
            onClick={onLeaveRoom}
            style={{ padding: '12px', fontSize: '1rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <LogOut size={18} /> Leave Room
          </button>

          {/* Role Swap Button */}
          <button 
            className="btn btn-secondary" 
            onClick={() => socket.emit('switch_role', { roomId: roomData.id, to: isSpectator ? 'player' : 'spectator' })}
            style={{ padding: '12px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: (isSpectator && roomData.players.length >= 2) ? 0.5 : 1 }}
            disabled={isSpectator && roomData.players.length >= 2} 
          >
            {isSpectator ? <RefreshCw size={18} /> : <Eye size={18} />}
            {isSpectator ? (roomData.players.length >= 2 ? 'Room Full' : 'Become Player') : 'Become Spectator'}
          </button>
        </div>

      </div>
      </div>

      {/* Chat Sidebar */}
      <ChatBox roomData={roomData} socket={socket} playerId={playerId} />
    </div>
  );
}
