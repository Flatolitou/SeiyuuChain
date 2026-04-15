const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // allow all in dev
    methods: ["GET", "POST"]
  }
});

const PORT = 3001;

// Stores current active rooms
const rooms = {};

// Helper to get room data
function getRoom(roomId) {
  return rooms[roomId];
}

function getPublicRooms() {
  return Object.values(rooms)
    .filter(r => r.status === 'waiting')
    .map(r => ({
      id: r.id,
      playerCount: r.players.length,
      hasPassword: r.password !== ''
    }));
}

function broadcastLobbies() {
  io.emit('lobbies_update', getPublicRooms());
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('fetch_lobbies', () => {
    socket.emit('lobbies_update', getPublicRooms());
  });

  // Join or Create Room
  socket.on('join_room', ({ roomId, password, playerName }) => {
    // If room doesn't exist, create it
    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        password: password || '',
        status: 'waiting', // waiting, playing, finished
        players: [], // array of { id: socket.id, name: playerName }
        timerInterval: null,
        timer: 45,
        currentTurnIndex: 0,
        chain: [],
        usedAnimeIds: new Set(),
        seiyuuUsageCount: {},
        readyPlayers: {},
        lifelines: {},
        skipUsedThisTurn: false
      };
    }

    const emitRoomUpdate = (rid) => {
      const r = rooms[rid];
      if (!r) return;
      const sanitizedChain = r.chain.map((item, index) => {
        if (index === r.chain.length - 1 || item.revealCast) return item;
        return {
          ...item,
          anime: { ...item.anime, seiyuus: [] } // Strip massive historical payloads
        };
      });
      io.to(rid).emit('room_state_update', {
        ...r,
        chain: sanitizedChain,
        usedAnimeIds: Array.from(r.usedAnimeIds),
        timerInterval: undefined
      });
    };

    const room = rooms[roomId];

    // Check password
    if (room.password !== password) {
      return socket.emit('room_error', { message: 'Incorrect password' });
    }

    // Check capacity
    if (room.players.length >= 2 && !room.players.find(p => p.id === socket.id)) {
      return socket.emit('room_error', { message: 'Room is full' });
    }

    // Add player if not already in
    if (!room.players.find(p => p.id === socket.id)) {
      room.players.push({ id: socket.id, name: playerName || `Player ${room.players.length + 1}` });
      room.lifelines[socket.id] = { skip: true, addTime: true, revealCast: true, snipe: true };
      socket.join(roomId);
    }

    // Send room state back
    emitRoomUpdate(roomId);

    broadcastLobbies();
  });

  socket.on('toggle_ready', ({ roomId }) => {
    const room = rooms[roomId];
    if (room && room.status === 'waiting') {
      room.readyPlayers[socket.id] = !room.readyPlayers[socket.id];
      emitRoomUpdate(roomId);
    }
  });

  socket.on('start_game', ({ roomId }) => {
    const room = rooms[roomId];
    if (room && room.status === 'waiting' && room.players.length === 2) {
      if (room.players[0].id === socket.id) { // Host
        const p2Id = room.players[1].id;
        if (room.readyPlayers[p2Id]) {
          room.status = 'playing';
          room.currentTurnIndex = Math.random() < 0.5 ? 0 : 1; 
          room.timer = 45;
          startTurnTimer(roomId);
          io.to(roomId).emit('game_started');
          emitRoomUpdate(roomId);
          broadcastLobbies();
        }
      }
    }
  });

  socket.on('use_lifeline', ({ roomId, type }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const myTurn = room.players[room.currentTurnIndex]?.id === socket.id;

    if (!room.lifelines[socket.id] || !room.lifelines[socket.id][type]) {
      return socket.emit('turn_error', { message: 'Lifeline already used or unavailable!' });
    }

    if (type === 'skip') {
      if (!myTurn) return socket.emit('turn_error', { message: 'Not your turn' });
      if (room.skipUsedThisTurn) {
        return socket.emit('turn_error', { message: 'Opponent just used skip, you must play!' });
      }
      room.lifelines[socket.id].skip = false;
      room.skipUsedThisTurn = true;
      room.currentTurnIndex = (room.currentTurnIndex + 1) % 2;
      room.timer = 45;
      const playerName = room.players.find(p => p.id === socket.id)?.name;
      io.to(roomId).emit('notification', { message: `${playerName} passed their turn!` });
      emitRoomUpdate(roomId);
    } else if (type === 'addTime') {
      if (!myTurn) return socket.emit('turn_error', { message: 'Not your turn' });
      room.lifelines[socket.id].addTime = false;
      room.timer += 30;
      const playerName = room.players.find(p => p.id === socket.id)?.name;
      io.to(roomId).emit('notification', { message: `${playerName} added +30s to the clock!` });
      io.to(roomId).emit('timer_tick', room.timer);
      emitRoomUpdate(roomId);
    } else if (type === 'revealCast') {
      room.lifelines[socket.id].revealCast = false;
      if (room.chain.length > 0) {
        room.chain[room.chain.length - 1].revealCast = true;
      }
      const playerName = room.players.find(p => p.id === socket.id)?.name;
      io.to(roomId).emit('notification', { message: `${playerName} revealed the cast!` });
      emitRoomUpdate(roomId);
    }
  });

  socket.on('play_turn', ({ roomId, anime, isSnipe, snipeSeiyuuId }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    // Verify anime data is valid
    if (!anime || !anime.seiyuus || !Array.isArray(anime.seiyuus)) {
      return socket.emit('turn_error', { message: 'Invalid anime data received.' });
    }

    // Check if anime has absolutely no voice actors
    if (anime.seiyuus.length === 0) {
      return io.to(roomId).emit('play_penalty', { 
        playerId: socket.id, 
        message: 'Warning: This anime has no voice actors registered!', 
        newTimer: room.timer 
      });
    }

    // Verify it's this player's turn
    if (room.players[room.currentTurnIndex].id !== socket.id) {
      return socket.emit('turn_error', { message: 'Not your turn' });
    }

    let isValid = true;
    let linkingSeiyuus = null;
    let turnErrorMsg = '';

    // RULE 1: Has it been played?
    if (room.usedAnimeIds.has(anime.id)) {
      isValid = false;
      turnErrorMsg = 'Anime already played!';
    } else {
      if (isSnipe) {
        // Snipe Logic
        if (!room.lifelines[socket.id] || !room.lifelines[socket.id].snipe) {
          isValid = false;
          turnErrorMsg = 'Snipe lifeline already used or unavailable!';
        } else {
          const matchedSeiyuu = anime.seiyuus.find(s => s.id === parseInt(snipeSeiyuuId));
          if (matchedSeiyuu) {
            isValid = true;
            linkingSeiyuus = [matchedSeiyuu];
            room.lifelines[socket.id].snipe = false;
            const playerName = room.players.find(p => p.id === socket.id)?.name;
            io.to(roomId).emit('notification', { message: `${playerName} sniped ${matchedSeiyuu.name.full}!` });
          } else {
            isValid = false;
            turnErrorMsg = 'The sniped seiyuu is not in this anime!';
          }
        }
      } else {
        // RULE 2: Does it connect appropriately?
        if (room.chain.length > 0) {
          isValid = false; // assume false until connection found
          const prevAnime = room.chain[room.chain.length - 1].anime;
          
          // Find intersection of seiyuus
          const prevSeiyuusIds = new Set((prevAnime.seiyuus || []).map(s => s.id));
          const currentSeiyuus = anime.seiyuus || [];
          
          let intersecting = currentSeiyuus.filter(s => prevSeiyuusIds.has(s.id));
          
          if (intersecting.length > 0) {
            let hasMaxedSeiyuu = intersecting.find(s => (room.seiyuuUsageCount[s.id] || 0) >= 3);
            if (hasMaxedSeiyuu) {
                isValid = false;
                turnErrorMsg = `${hasMaxedSeiyuu.name.full} has 3X`;
            } else {
                isValid = true;
                linkingSeiyuus = intersecting;
            }
          } else {
            isValid = false;
            turnErrorMsg = 'No valid connecting seiyuu found.';
          }
        } else {
            // First turn is always valid as long as it wasn't played (checked above)
            isValid = true;
        }
      }
    }

    if (!isValid) {
      // Penalty: Reduce timer by 3s
      room.timer -= 3;
      if (room.timer <= 0) {
        room.timer = 0;
        gameOver(roomId, (room.currentTurnIndex + 1) % 2); // other player wins
      } else {
        io.to(roomId).emit('play_penalty', { playerId: socket.id, message: `${turnErrorMsg} (-3s)`, newTimer: room.timer });
        emitRoomUpdate(roomId);
      }
    } else {
      // Valid move!
      room.usedAnimeIds.add(anime.id);
      if (linkingSeiyuus) {
        linkingSeiyuus.forEach(seiyuu => {
          room.seiyuuUsageCount[seiyuu.id] = Math.min((room.seiyuuUsageCount[seiyuu.id] || 0) + 1, 3);
        });
      }
      
      room.skipUsedThisTurn = false;

      room.chain.push({
        anime: anime,
        linkingSeiyuus: linkingSeiyuus, // null for first
        seiyuuUsageCountSnapshot: { ...room.seiyuuUsageCount }
      });

      // Reset timer and rotate turn
      room.timer = 45;
      room.currentTurnIndex = (room.currentTurnIndex + 1) % 2;

      io.to(roomId).emit('play_success', { 
        anime: anime, 
        linkingSeiyuus,
        playerId: socket.id 
      });
      emitRoomUpdate(roomId);
    }
  });

  const handlePlayerLeave = (socketId, roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    const pIndex = room.players.findIndex(p => p.id === socketId);
    if (pIndex !== -1) {
      room.players.splice(pIndex, 1);
      if (room.players.length === 0) {
        clearInterval(room.timerInterval);
        delete rooms[roomId];
      } else {
        if (room.status === 'playing') {
          gameOver(roomId, 0); // remaining player wins
        } else {
          // If in lobby, push update natively to reflect new host
          emitRoomUpdate(roomId);
        }
      }
      broadcastLobbies();
    }
  };

  socket.on('leave_room', ({ roomId }) => {
    socket.leave(roomId);
    handlePlayerLeave(socket.id, roomId);
  });

  socket.on('play_again', ({ roomId }) => {
    const room = rooms[roomId];
    if (room && room.status === 'finished') {
      room.status = 'waiting';
      room.chain = [];
      room.usedAnimeIds = new Set();
      room.seiyuuUsageCount = {};
      room.readyPlayers = {};
      room.currentTurnIndex = 0;
      room.skipUsedThisTurn = false;
      Object.keys(room.lifelines).forEach(id => {
        room.lifelines[id] = { skip: true, addTime: true, revealCast: true, snipe: true };
      });
      
      emitRoomUpdate(roomId);
      broadcastLobbies();
    }
  });

  socket.on('disconnect', () => {
    // Basic disconnect handling
    console.log('User disconnected', socket.id);
    for (const roomId in rooms) {
      handlePlayerLeave(socket.id, roomId);
    }
  });
});

function startTurnTimer(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.timerInterval) clearInterval(room.timerInterval);

  room.timerInterval = setInterval(() => {
    room.timer -= 1;
    io.to(roomId).emit('timer_tick', room.timer);
    if (room.timer <= 0) {
      // Game over by timeout
      const winningIndex = (room.currentTurnIndex + 1) % 2;
      gameOver(roomId, winningIndex);
    }
  }, 1000);
}

function gameOver(roomId, winningPlayerIndex) {
  const room = rooms[roomId];
  if (!room) return;
  clearInterval(room.timerInterval);
  room.status = 'finished';
  room.timer = 0;
  
  const winner = room.players[winningPlayerIndex];

  io.to(roomId).emit('game_over', { winner: winner });
  io.to(roomId).emit('room_state_update', { ...room, usedAnimeIds: Array.from(room.usedAnimeIds), timerInterval: undefined });
}

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
