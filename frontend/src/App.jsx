import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Home from './components/Home';
import LobbyBrowser from './components/LobbyBrowser';
import RoomLobby from './components/RoomLobby';
import GameBoard from './components/GameBoard';
import { initDb } from './api/localDb';

// Connect to the server
// Uses the environment variable if provided (for production), otherwise local dev server
const SERVER_URL = import.meta.env.VITE_SERVER_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001');
const socket = io(SERVER_URL);

function App() {
  const [gameState, setGameState] = useState('home'); // home, lobby_browser, room_lobby, playing, finished
  const [roomData, setRoomData] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState(socket.id);
  const [matchWinner, setMatchWinner] = useState(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  
  // Custom Toast state
  const [toast, setToast] = useState(null); // { message: string, type: 'error' | 'success', persistent?: boolean }

  const showToast = (message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Heartbeat ping to keep Render server awake
  useEffect(() => {
    const keepAlive = () => {
      fetch(`${SERVER_URL}/ping`)
        .catch(err => console.debug('Heartbeat check (expected if offline):', err));
    };

    // Ping every 10 minutes (600,000 ms)
    const interval = setInterval(keepAlive, 600000);
    
    // Initial ping on mount
    keepAlive();

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (socket.id) setPlayerId(socket.id);
    
    socket.on('connect', () => {
      setPlayerId(socket.id);
      setIsConnected(true);
      setToast(null); // Clear connection error toasts
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
      
      // If we are in a game or lobby, this disconnect (likely a server restart) 
      // means the room is gone on the server.
      if (gameState !== 'home' && gameState !== 'lobby_browser') {
        showToast("Connection to server lost. Rooms may have been reset.", 'error');
        setGameState('lobby_browser');
        setRoomData(null);
      } else {
        showToast("Lost connection to server...", 'error');
      }
    });

    socket.on('connect_error', () => {
      showToast("Cannot connect to server. Retrying...", 'error');
    });

    socket.on('room_state_update', (data) => {
      setRoomData(data);
      if (gameState === 'lobby_browser' || gameState === 'home' || data.status === 'waiting') {
        setGameState('room_lobby');
      }
    });

    socket.on('game_started', () => {
      setGameState('playing');
    });

    socket.on('game_over', (data) => {
      setMatchWinner(data.winner);
      setGameState('finished');
    });

    socket.on('room_error', (data) => {
      showToast(data.message, 'error');
    });

    // Initialize Local DB
    initDb();

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('room_state_update');
      socket.off('game_started');
      socket.off('game_over');
      socket.off('room_error');
    };
  }, [gameState]);

  const handleSetNickname = (name) => {
    setPlayerName(name);
    setGameState('lobby_browser');
  };

  const joinRoom = (roomId, password, pName) => {
    socket.emit('join_room', { roomId, password, playerName: pName });
  };

  const playTurn = (anime) => {
    socket.emit('play_turn', { roomId: roomData.id, anime });
  };
  
  const toggleReady = () => {
    socket.emit('toggle_ready', { roomId: roomData.id });
  };
  
  const startGame = () => {
    socket.emit('start_game', { roomId: roomData.id });
  };

  const leaveRoom = () => {
    if (roomData) {
      socket.emit('leave_room', { roomId: roomData.id });
      setGameState('lobby_browser');
      setRoomData(null);
    }
  };

  return (
    <div className="app-container" style={{ position: 'relative' }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: toast.type === 'error' ? 'var(--danger)' : 'var(--success)',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '8px',
          zIndex: 9999,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          animation: 'fadeInDown 0.3s ease forwards'
        }}>
          <strong>{toast.type === 'error' ? 'Oops! ' : ''}</strong>{toast.message}
        </div>
      )}

      {/* States */}
      {gameState === 'home' && (
        <Home onSetNickname={handleSetNickname} />
      )}
      {gameState === 'lobby_browser' && (
        <LobbyBrowser 
          playerName={playerName} 
          socket={socket} 
          onJoinRoom={joinRoom} 
        />
      )}
      {gameState === 'room_lobby' && roomData && (
        <RoomLobby 
          roomData={roomData}
          playerId={playerId}
          onToggleReady={toggleReady}
          onStartGame={startGame}
          onLeaveRoom={leaveRoom}
        />
      )}
      {gameState === 'playing' && roomData && (
        <GameBoard 
          roomData={roomData} 
          playerId={playerId} 
          socket={socket}
          onPlayTurn={playTurn} 
          onLeaveRoom={leaveRoom}
        />
      )}
      {gameState === 'finished' && roomData && (
        <div className="glass-panel" style={{ padding: '60px 40px', margin: 'Auto', textAlign: 'center', marginTop: '15vh', maxWidth: '500px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {matchWinner?.id === playerId ? (
            <>
              <h1 style={{ fontSize: '4rem', fontWeight: 900, color: 'var(--success)', textShadow: '0 0 20px rgba(16, 185, 129, 0.4)' }}>VICTORY</h1>
              <p style={{ marginTop: '16px', fontSize: '1.2rem', color: 'var(--text-light)' }}>You crushed {roomData.players.find(p => p.id !== playerId)?.name}!</p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: '4rem', fontWeight: 900, color: 'var(--danger)', textShadow: '0 0 20px rgba(239, 68, 68, 0.4)' }}>DEFEAT</h1>
              <p style={{ marginTop: '16px', fontSize: '1.2rem', color: 'var(--text-light)' }}>{matchWinner?.name} beat you!</p>
            </>
          )}

          <button 
            className="btn" 
            style={{ marginTop: '40px', padding: '16px 32px', fontSize: '1.2rem' }}
            onClick={() => socket.emit('play_again', { roomId: roomData.id })}
          >
            Return to Lobby
          </button>
        </div>
      )}

      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}

export default App;
