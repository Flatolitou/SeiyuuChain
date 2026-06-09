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

// Render Keep-Alive / Health Check
app.get('/ping', (req, res) => {
  console.log(`[${new Date().toISOString()}] Heartbeat received`);
  res.status(200).send('pong');
});

// Load Anime Database
let anilistData = { anime: {}, seiyuus: {} };
const dbPath = path.join(__dirname, '../frontend/public/anilist_data.json');
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

function getActiveBaseTimer(room) {
  if (!room || !room.settings) return 45;
  if (room.settings.gameMode !== 'decay') {
    return room.settings.turnTimer || 45;
  }
  const interval = room.settings.decayInterval || 5;
  const minCap = room.settings.minTimerCap || 10;
  const decayCount = Math.floor(room.chain.length / interval);
  return Math.max(minCap, (room.settings.turnTimer || 45) - decayCount);
}

function getPublicRooms() {
  return Object.values(rooms)
    .map(r => ({
      id: r.id,
      playerCount: r.players.length,
      spectatorCount: (r.spectators || []).length,
      hasPassword: r.password !== '',
      status: r.status // waiting, playing, finished
    }));
}

function broadcastLobbies() {
  io.emit('lobbies_update', getPublicRooms());
}

const addSystemMessage = (roomId, text) => {
  const r = rooms[roomId];
  if (!r) return;
  const msg = { type: 'system', text, timestamp: Date.now() };
  r.messages.push(msg);
  if (r.messages.length > 200) r.messages.shift();
  io.to(roomId).emit('chat_message', msg);
};

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
  socket.on('join_room', ({ roomId, password, playerName, settings }) => {
    // If room doesn't exist, create it
    if (!rooms[roomId]) {
      const gameMode = (settings && (settings.gameMode === 'standard' || settings.gameMode === 'decay')) ? settings.gameMode : 'standard';
      const turnTimer = (settings && typeof settings.turnTimer === 'number') ? Math.max(5, Math.min(60, settings.turnTimer)) : 45;
      const lifelineSeconds = (settings && typeof settings.lifelineSeconds === 'number') ? Math.max(15, Math.min(45, settings.lifelineSeconds)) : 30;
      const decayInterval = (settings && typeof settings.decayInterval === 'number') ? Math.max(2, Math.min(10, settings.decayInterval)) : 5;
      const minTimerCap = (settings && typeof settings.minTimerCap === 'number') ? Math.max(5, Math.min(30, settings.minTimerCap)) : 10;
      const revealAllCast = (settings && typeof settings.revealAllCast === 'boolean') ? settings.revealAllCast : false;

      rooms[roomId] = {
        id: roomId,
        password: password || '',
        status: 'waiting',
        players: [],
        timerInterval: null,
        timer: turnTimer,
        currentTurnIndex: 0,
        chain: [],
        usedAnimeIds: new Set(),
        seiyuuUsageCount: {},
        readyPlayers: {},
        lifelines: {},
        skipUsedThisTurn: false,
        spectators: [],
        messages: [],
        settings: {
          gameMode,
          turnTimer,
          lifelineSeconds,
          decayInterval,
          minTimerCap,
          revealAllCast
        }
      };
      console.log(`[ROOM CREATED] ID: ${roomId} | Password: ${password || '(None)'} | Settings:`, rooms[roomId].settings);
    }

    const room = rooms[roomId];

    // Check password
    if (room.password !== password) {
      return socket.emit('room_error', { message: 'Incorrect password' });
    }

    // Add player or spectator
    const isReturningPlayer = room.players.find(p => p.id === socket.id);
    const isReturningSpectator = room.spectators.find(p => p.id === socket.id);

    if (!isReturningPlayer && !isReturningSpectator) {
      if (room.players.length < 2 && room.status === 'waiting') {
        room.players.push({ id: socket.id, name: playerName || `Player ${room.players.length + 1}` });
        room.lifelines[socket.id] = { skip: true, addTime: true, revealCast: true, snipe: true };
        addSystemMessage(roomId, `${playerName || 'A player'} joined the room.`);
      } else {
        room.spectators.push({ id: socket.id, name: playerName || `Spectator ${room.spectators.length + 1}` });
        addSystemMessage(roomId, `${playerName || 'A spectator'} joined to watch.`);
      }
      socket.join(roomId);
    } else {
      socket.join(roomId);
    }

    // Send history to user
    socket.emit('chat_history', room.messages);
    
    // Send room state back
    emitRoomUpdate(roomId);

    broadcastLobbies();
  });

  socket.on('update_settings', ({ roomId, settings }) => {
    const room = rooms[roomId];
    if (!room) return;

    // Only host can modify settings
    const isHost = room.players[0]?.id === socket.id;
    if (!isHost) {
      return socket.emit('room_error', { message: 'Only the host can modify room settings!' });
    }

    // Only allow modification in 'waiting' status
    if (room.status !== 'waiting') {
      return socket.emit('room_error', { message: 'Cannot modify settings while game is in progress!' });
    }

    if (settings) {
      if (settings.gameMode === 'standard' || settings.gameMode === 'decay') {
        room.settings.gameMode = settings.gameMode;
      }
      if (typeof settings.turnTimer === 'number') {
        room.settings.turnTimer = Math.max(5, Math.min(60, settings.turnTimer));
      }
      if (typeof settings.lifelineSeconds === 'number') {
        room.settings.lifelineSeconds = Math.max(15, Math.min(45, settings.lifelineSeconds));
      }
      if (typeof settings.decayInterval === 'number') {
        room.settings.decayInterval = Math.max(2, Math.min(10, settings.decayInterval));
      }
      if (typeof settings.minTimerCap === 'number') {
        room.settings.minTimerCap = Math.max(5, Math.min(30, settings.minTimerCap));
      }
      if (typeof settings.revealAllCast === 'boolean') {
        room.settings.revealAllCast = settings.revealAllCast;
      }

      // Sync active wait timer
      room.timer = room.settings.turnTimer;

      let modeDesc = room.settings.gameMode === 'standard' ? 'Standard Mode' : `Decay Mode (degrades by 1s every ${room.settings.decayInterval} shows, floor cap of ${room.settings.minTimerCap}s)`;
      let revealDesc = room.settings.revealAllCast ? 'Reveal All Cast (Infinite Reveal)' : 'Standard Reveal Cast Lifeline';
      addSystemMessage(roomId, `Settings updated: Mode is ${modeDesc}, Turn Timer is ${room.settings.turnTimer}s, Lifeline adds +${room.settings.lifelineSeconds}s, Cast Display is ${revealDesc}.`);
      emitRoomUpdate(roomId);
    }
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
    if (room && room.status === 'waiting' && room.players.length >= 1) { // Allow starting even with 1 player
      if (room.players[0].id === socket.id) { // Host
        const p2 = room.players[1];
        // If there's a P2, they must be ready. If not, host can start alone (practice/spectated mode)
        if (!p2 || room.readyPlayers[p2.id]) {
          room.status = 'playing';
          room.currentTurnIndex = (p2 && Math.random() < 0.5) ? 1 : 0; 
          room.timer = getActiveBaseTimer(room);
          startTurnTimer(roomId);
          io.to(roomId).emit('game_started');
          addSystemMessage(roomId, "The match has started!");
          emitRoomUpdate(roomId);
          broadcastLobbies();
        }
      }
    }
  });

  socket.on('send_message', ({ roomId, text }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id) || room.spectators.find(p => p.id === socket.id);
    if (!player) return;

    const msg = { type: 'user', sender: player.name, text, timestamp: Date.now() };
    room.messages.push(msg);
    if (room.messages.length > 200) room.messages.shift();
    
    io.to(roomId).emit('chat_message', msg);
  });

  socket.on('switch_role', ({ roomId, to }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (to === 'spectator') {
      const pIndex = room.players.findIndex(p => p.id === socket.id);
      if (pIndex !== -1) {
        const player = room.players.splice(pIndex, 1)[0];
        room.spectators.push(player);
        delete room.readyPlayers[socket.id];
        addSystemMessage(roomId, `${player.name} moved to spectators.`);
        
        // If game is playing and only 1 player left or 0, handle it
        if (room.status === 'playing' && room.players.length < 2) {
          // In this simple version, if a player leaves/switches during play, it might end the game
          // But user said "switch ... even in middle of round", so we'll let it stay if at least 1 player
          if (room.players.length === 0) {
            gameOver(roomId, -1); // No winner
          }
        }
        
        emitRoomUpdate(roomId);
        broadcastLobbies();
      }
    } else if (to === 'player') {
      if (room.players.length < 2) {
        const sIndex = room.spectators.findIndex(s => s.id === socket.id);
        if (sIndex !== -1) {
          const spec = room.spectators.splice(sIndex, 1)[0];
          room.players.push(spec);
          room.readyPlayers[socket.id] = false;
          room.lifelines[spec.id] = room.lifelines[spec.id] || { skip: true, addTime: true, revealCast: true, snipe: true };
          addSystemMessage(roomId, `${spec.name} is now a player.`);
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
      room.timer = getActiveBaseTimer(room);
      const playerName = room.players.find(p => p.id === socket.id)?.name;
      io.to(roomId).emit('notification', { message: `${playerName} passed their turn!` });
      emitRoomUpdate(roomId);
    } else if (type === 'addTime') {
      if (!myTurn) return socket.emit('turn_error', { message: 'Not your turn' });
      room.lifelines[socket.id].addTime = false;
      const timeToAdd = room.settings?.lifelineSeconds || 30;
      room.timer += timeToAdd;
      const playerName = room.players.find(p => p.id === socket.id)?.name;
      io.to(roomId).emit('notification', { message: `${playerName} added +${timeToAdd}s to the clock!` });
      io.to(roomId).emit('timer_tick', room.timer);
      emitRoomUpdate(roomId);
    } else if (type === 'revealCast') {
      if (room.settings?.revealAllCast) {
        return socket.emit('turn_error', { message: 'Reveal Cast lifeline is disabled because Reveal All Cast is active!' });
      }
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
      room.timer = getActiveBaseTimer(room);
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
    
    let leaverName = '';
    const pIndex = room.players.findIndex(p => p.id === socketId);
    if (pIndex !== -1) {
      leaverName = room.players[pIndex].name;
      room.players.splice(pIndex, 1);
    } else {
      const sIndex = room.spectators.findIndex(s => s.id === socketId);
      if (sIndex !== -1) {
        leaverName = room.spectators[sIndex].name;
        room.spectators.splice(sIndex, 1);
      }
    }

    if (room.players.length === 0 && room.spectators.length === 0) {
      clearInterval(room.timerInterval);
      delete rooms[roomId];
    } else {
      if (room.status === 'playing' && room.players.length === 1) {
        gameOver(roomId, 0); // last remaining player wins
      } else if (room.status === 'playing' && room.players.length === 0) {
        gameOver(roomId, -1);
      } else {
        emitRoomUpdate(roomId);
      }
    }
    broadcastLobbies();
  };

  socket.on('leave_room', ({ roomId }) => {
    socket.leave(roomId);
    handlePlayerLeave(socket.id, roomId);
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
    const rescueTimer = room.settings?.lifelineSeconds || 30;
    room.timer = rescueTimer;
    io.to(roomId).emit('notification', { message: `Almost out of time! ${room.players[room.currentTurnIndex].name}'s +${rescueTimer}s lifeline was used automatically.` });
    io.to(roomId).emit('timer_tick', room.timer);
    emitRoomUpdate(roomId);
    return true;
  } else if (lifelines?.skip && !room.skipUsedThisTurn) {
    lifelines.skip = false;
    room.skipUsedThisTurn = true;
    const pIndex = room.currentTurnIndex;
    room.currentTurnIndex = (room.currentTurnIndex + 1) % 2;
    room.timer = getActiveBaseTimer(room);
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
  
  // Try to find the winner in players
  let winner = null;
  if (winningPlayerIndex !== -1) {
    winner = room.players[winningPlayerIndex];
  }

  room.lastMatchResult = { 
    winnerId: winner ? winner.id : null, 
    winnerName: winner ? winner.name : 'Nobody (Draw)',
    timestamp: Date.now()
  };

  if (winner) {
    addSystemMessage(roomId, `Game Over! ${winner.name} won the match!`);
  } else {
    addSystemMessage(roomId, `Game Over! The match ended.`);
  }

  // Reset room for next game
  room.status = 'waiting';
  room.timer = room.settings?.turnTimer || 45;
  room.chain = [];
  room.usedAnimeIds = new Set();
  room.seiyuuUsageCount = {};
  room.readyPlayers = {};
  room.skipUsedThisTurn = false;
  
  // Reset lifelines for all players for the next game
  Object.keys(room.lifelines).forEach(id => {
    room.lifelines[id] = { skip: true, addTime: true, revealCast: true, snipe: true };
  });

  io.to(roomId).emit('game_over', { winner: winner });
  emitRoomUpdate(roomId);
}

// Catch-all for SPA
app.get('/*path', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
