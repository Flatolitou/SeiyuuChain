const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // allow all in dev
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Serve Static Frontend (for Render/Production)
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Load Anime Database
let anilistData = { anime: {}, seiyuus: {} };
const dbPath = path.join(__dirname, 'anilist_data.json');
if (fs.existsSync(dbPath)) {
  anilistData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  console.log(`Server loaded DB: ${Object.keys(anilistData.anime).length} anime`);
} else {
  console.error("CRITICAL: anilist_data.json not found!");
}

// Loads DB once at startup. Automatic reload disabled to prevent hangs on Render.

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

const emitRoomUpdate = (rid) => {
  const r = rooms[rid];
  if (!r) return;
  const sanitizedChain = r.chain.map((item, index) => {
    // We send only the ABSOLUTE MINIMUM needed for the card
    // The client will hydrate the title/image/all_seiyuus using its local copy
    return {
      animeId: item.animeId,
      linkingSeiyuuIds: item.linkingSeiyuuIds, // null for first
      seiyuuUsageCountSnapshot: item.seiyuuUsageCountSnapshot,
      revealCast: !!item.revealCast
    };
  });
  io.to(rid).emit('room_state_update', {
    ...r,
    chain: sanitizedChain,
    usedAnimeIds: Array.from(r.usedAnimeIds),
    timerInterval: undefined
  });
};

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

  socket.on('play_turn', ({ roomId, animeId, isSnipe, snipeSeiyuuId }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const anime = anilistData.anime[animeId];
    if (!anime) {
      return socket.emit('turn_error', { message: 'Anime not found in database!' });
    }

    // Verify it's this player's turn
    if (room.players[room.currentTurnIndex].id !== socket.id) {
      return socket.emit('turn_error', { message: 'Not your turn' });
    }

    let isValid = true;
    let linkingSeiyuuIds = null;
    let turnErrorMsg = '';

    // RULE 1: Has it been played?
    if (room.usedAnimeIds.has(animeId)) {
      isValid = false;
      turnErrorMsg = 'Anime already played!';
    } else {
      if (isSnipe) {
        // Snipe Logic
        if (!room.lifelines[socket.id] || !room.lifelines[socket.id].snipe) {
          isValid = false;
          turnErrorMsg = 'Snipe lifeline already used or unavailable!';
        } else {
          const hasSeiyuu = !!anime.s[snipeSeiyuuId];
          if (hasSeiyuu) {
            isValid = true;
            linkingSeiyuuIds = [parseInt(snipeSeiyuuId)];
            room.lifelines[socket.id].snipe = false;
            const playerName = room.players.find(p => p.id === socket.id)?.name;
            const seiyuuName = anilistData.seiyuus[snipeSeiyuuId] || 'Someone';
            io.to(roomId).emit('notification', { message: `${playerName} sniped ${seiyuuName}!` });
          } else {
            isValid = false;
            turnErrorMsg = 'The sniped seiyuu is not in this anime!';
          }
        }
      } else {
        // RULE 2: Does it connect appropriately?
        if (room.chain.length > 0) {
          isValid = false; // assume false until connection found
          const prevAnimeId = room.chain[room.chain.length - 1].animeId;
          const prevAnime = anilistData.anime[prevAnimeId];
          
          // Find intersection of seiyuus
          const prevSeiyuusIds = new Set(Object.keys(prevAnime.s || {}));
          const currentSeiyuuIds = Object.keys(anime.s || {});
          
          console.log(`Debug Connection: prevAnime=${prevAnimeId}, currentAnime=${animeId}`);
          console.log(`Prev Seiyuu IDs:`, Array.from(prevSeiyuusIds));
          console.log(`Current Seiyuu IDs:`, currentSeiyuuIds);
          
          let intersecting = currentSeiyuuIds.filter(id => prevSeiyuusIds.has(id));
          console.log(`Intersecting IDs:`, intersecting);
          
          if (intersecting.length > 0) {
            let hasMaxedSeiyuu = intersecting.find(id => (room.seiyuuUsageCount[id] || 0) >= 3);
            if (hasMaxedSeiyuu) {
                isValid = false;
                const seiyuuName = anilistData.seiyuus[hasMaxedSeiyuu];
                turnErrorMsg = `${seiyuuName} has 3X`;
            } else {
                isValid = true;
                linkingSeiyuuIds = intersecting.map(id => parseInt(id));
                console.log(`Connection Valid! Linking IDs:`, linkingSeiyuuIds);
            }
          } else {
            isValid = false;
            turnErrorMsg = 'No valid connecting seiyuu found.';
            console.log(`Connection Failed: No intersection`);
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
      
      let rescued = false;
      if (room.timer <= 0) {
        rescued = checkAutoLifelines(roomId);
        if (!rescued) {
          room.timer = 0;
          gameOver(roomId, (room.currentTurnIndex + 1) % 2); // other player wins
          return;
        }
      }
      
      // Send penalty message (even if rescued, so user knows move was invalid)
      io.to(roomId).emit('play_penalty', { playerId: socket.id, message: `${turnErrorMsg} (-3s)`, newTimer: room.timer });
      emitRoomUpdate(roomId);
    } else {
      // Valid move!
      room.usedAnimeIds.add(animeId);
      if (linkingSeiyuuIds) {
        linkingSeiyuuIds.forEach(id => {
          room.seiyuuUsageCount[id] = Math.min((room.seiyuuUsageCount[id] || 0) + 1, 3);
        });
      }
      
      room.skipUsedThisTurn = false;

      // Create a filtered snapshot of usage counts for ONLY the seiyuus in this anime
      const snapshot = {};
      Object.keys(anime.s || {}).forEach(id => {
        if (room.seiyuuUsageCount[id]) {
          snapshot[id] = room.seiyuuUsageCount[id];
        }
      });

      room.chain.push({
        animeId: animeId,
        linkingSeiyuuIds: linkingSeiyuuIds, // null for first
        seiyuuUsageCountSnapshot: snapshot
      });

      // Reset timer and rotate turn
      room.timer = 45;
      room.currentTurnIndex = (room.currentTurnIndex + 1) % 2;

      io.to(roomId).emit('play_success', { 
        animeId: animeId, 
        linkingSeiyuuIds,
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

function checkAutoLifelines(roomId) {
  const room = rooms[roomId];
  if (!room) return false;
  
  const currentPlayerId = room.players[room.currentTurnIndex]?.id;
  const lifelines = room.lifelines[currentPlayerId];

  if (lifelines?.addTime) {
    lifelines.addTime = false;
    room.timer = 30;
    io.to(roomId).emit('notification', { message: `Almost out of time! ${room.players[room.currentTurnIndex].name}'s +30s lifeline was used automatically.` });
    io.to(roomId).emit('timer_tick', room.timer);
    emitRoomUpdate(roomId);
    return true;
  } else if (lifelines?.skip && !room.skipUsedThisTurn) {
    lifelines.skip = false;
    room.skipUsedThisTurn = true;
    const pIndex = room.currentTurnIndex;
    room.currentTurnIndex = (room.currentTurnIndex + 1) % 2;
    room.timer = 45;
    io.to(roomId).emit('notification', { message: `Out of time! ${room.players[pIndex].name} automatically used skip.` });
    io.to(roomId).emit('timer_tick', room.timer);
    emitRoomUpdate(roomId);
    return true;
  }
  return false;
}

function startTurnTimer(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.timerInterval) clearInterval(room.timerInterval);

  room.timerInterval = setInterval(() => {
    room.timer -= 1;
    io.to(roomId).emit('timer_tick', room.timer);
    if (room.timer <= 0) {
      if (!checkAutoLifelines(roomId)) {
        // Game over by timeout
        const winningIndex = (room.currentTurnIndex + 1) % 2;
        gameOver(roomId, winningIndex);
      }
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

// Catch-all for SPA (fallback)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', database: Object.keys(anilistData.anime).length });
});

app.get('/*path', (req, res) => {
  const indexPath = path.join(__dirname, '../frontend/dist/index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send("SeiyuuChain Server is running. (Frontend not bundled)");
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
