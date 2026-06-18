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
      status: r.status, // waiting, playing, finished
      teamsMode: r.settings?.teamsMode || false
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
  socket.on('join_room', ({ roomId, password, playerName, playerId, settings }) => {
    // If room doesn't exist, create it
    if (!rooms[roomId]) {
      const gameMode = (settings && (settings.gameMode === 'standard' || settings.gameMode === 'decay')) ? settings.gameMode : 'standard';
      const turnTimer = (settings && typeof settings.turnTimer === 'number') ? Math.max(5, Math.min(60, settings.turnTimer)) : 45;
      const lifelineSeconds = (settings && typeof settings.lifelineSeconds === 'number') ? Math.max(15, Math.min(45, settings.lifelineSeconds)) : 30;
      const decayInterval = (settings && typeof settings.decayInterval === 'number') ? Math.max(2, Math.min(10, settings.decayInterval)) : 5;
      const minTimerCap = (settings && typeof settings.minTimerCap === 'number') ? Math.max(5, Math.min(30, settings.minTimerCap)) : 10;
      const revealAllCast = (settings && typeof settings.revealAllCast === 'boolean') ? settings.revealAllCast : false;
      const teamsMode = (settings && typeof settings.teamsMode === 'boolean') ? settings.teamsMode : false;
      const teamsModeThreshold = (settings && typeof settings.teamsModeThreshold === 'number') ? Math.max(1, Math.min(10, settings.teamsModeThreshold)) : 2;

      rooms[roomId] = {
        id: roomId,
        password: password || '',
        status: 'waiting',
        players: [],
        timerInterval: null,
        timer: turnTimer,
        currentTurnIndex: 0,
        currentTurnTeam: 1, // Alternates between 1 and 2 in teams mode
        chain: [],
        usedAnimeIds: new Set(),
        seiyuuUsageCount: {},
        readyPlayers: {},
        lifelines: {},
        teamLifelines: {
          1: { skip: true, addTime: true, revealCast: true, snipe: true },
          2: { skip: true, addTime: true, revealCast: true, snipe: true }
        },
        skipUsedThisTurn: false,
        spectators: [],
        messages: [],
        settings: {
          gameMode,
          turnTimer,
          lifelineSeconds,
          decayInterval,
          minTimerCap,
          revealAllCast,
          teamsMode,
          teamsModeThreshold
        }
      };
      console.log(`[ROOM CREATED] ID: ${roomId} | Password: ${password || '(None)'} | Settings:`, rooms[roomId].settings);
    }

    const room = rooms[roomId];

    // Check password
    if (room.password !== password) {
      return socket.emit('room_error', { message: 'Incorrect password' });
    }

    // Check if player/spectator is already in the room (reconnection)
    const existingPlayer = room.players.find(p => p.id === playerId);
    if (existingPlayer) {
      if (existingPlayer.disconnectTimeout) {
        clearTimeout(existingPlayer.disconnectTimeout);
        delete existingPlayer.disconnectTimeout;
      }
      existingPlayer.socketId = socket.id;
      existingPlayer.disconnected = false;

      socket.join(roomId);
      addSystemMessage(roomId, `${existingPlayer.name} reconnected.`);
      socket.emit('chat_history', room.messages);
      emitRoomUpdate(roomId);
      return;
    }

    const existingSpectator = room.spectators.find(s => s.id === playerId);
    if (existingSpectator) {
      existingSpectator.socketId = socket.id;
      socket.join(roomId);
      socket.emit('chat_history', room.messages);
      emitRoomUpdate(roomId);
      return;
    }

    if (room.status === 'waiting') {
      if (room.settings.teamsMode) {
        // Join as player in the team with fewer players
        const t1Count = room.players.filter(p => p.team === 1).length;
        const t2Count = room.players.filter(p => p.team === 2).length;
        const assignedTeam = t1Count <= t2Count ? 1 : 2;
        room.players.push({ 
          id: playerId, 
          socketId: socket.id,
          name: playerName || `Player ${room.players.length + 1}`,
          team: assignedTeam,
          answerCount: 0 
        });
        addSystemMessage(roomId, `${playerName || 'A player'} joined Team ${assignedTeam}.`);
      } else {
        // 1v1 Mode
        if (room.players.length < 2) {
          const assignedTeam = room.players.length === 0 ? 1 : 2;
          room.players.push({ 
            id: playerId, 
            socketId: socket.id,
            name: playerName || `Player ${room.players.length + 1}`,
            team: assignedTeam,
            answerCount: 0 
          });
          room.lifelines[playerId] = { skip: true, addTime: true, revealCast: true, snipe: true };
          addSystemMessage(roomId, `${playerName || 'A player'} joined the room.`);
        } else {
          room.spectators.push({ id: playerId, socketId: socket.id, name: playerName || `Spectator ${room.spectators.length + 1}` });
          addSystemMessage(roomId, `${playerName || 'A spectator'} joined to watch.`);
        }
      }
      socket.join(roomId);
    } else {
      // Game in progress
      room.spectators.push({ id: playerId, socketId: socket.id, name: playerName || `Spectator ${room.spectators.length + 1}` });
      addSystemMessage(roomId, `${playerName || 'A spectator'} joined to watch.`);
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
    const isHost = room.players[0]?.socketId === socket.id;
    if (!isHost) {
      return socket.emit('room_error', { message: 'Only the host can modify room settings!' });
    }

    // Only allow modification in 'waiting' status
    if (room.status !== 'waiting') {
      return socket.emit('room_error', { message: 'Cannot modify settings while game is in progress!' });
    }

    if (settings) {
      const prevTeamsMode = room.settings.teamsMode;

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
      if (typeof settings.teamsMode === 'boolean') {
        room.settings.teamsMode = settings.teamsMode;
      }
      if (typeof settings.teamsModeThreshold === 'number') {
        room.settings.teamsModeThreshold = Math.max(1, Math.min(10, settings.teamsModeThreshold));
      }

      // Sync active wait timer
      room.timer = room.settings.turnTimer;

      // Handle transitions between modes
      if (prevTeamsMode && !room.settings.teamsMode) {
        // Teams Mode turned off: sanitize players list to max 2 players, rest become spectators
        if (room.players.length > 0) room.players[0].team = 1;
        if (room.players.length > 1) room.players[1].team = 2;
        
        if (room.players.length > 2) {
          const extraPlayers = room.players.splice(2);
          extraPlayers.forEach(p => {
            delete room.readyPlayers[p.id];
            room.spectators.push(p);
            addSystemMessage(roomId, `${p.name} was moved to spectators because Teams Mode was disabled.`);
          });
        }

        // Initialize individual lifelines
        room.lifelines = {};
        room.players.forEach(p => {
          room.lifelines[p.id] = { skip: true, addTime: true, revealCast: true, snipe: true };
        });
      } else if (!prevTeamsMode && room.settings.teamsMode) {
        // Teams Mode turned on: initialize shared lifelines
        room.teamLifelines = {
          1: { skip: true, addTime: true, revealCast: true, snipe: true },
          2: { skip: true, addTime: true, revealCast: true, snipe: true }
        };
      }

      let modeDesc = room.settings.gameMode === 'standard' ? 'Standard Mode' : `Decay Mode (degrades by 1s every ${room.settings.decayInterval} shows, floor cap of ${room.settings.minTimerCap}s)`;
      let revealDesc = room.settings.revealAllCast ? 'Reveal All Cast (Infinite Reveal)' : 'Standard Reveal Cast Lifeline';
      let teamsModeDesc = room.settings.teamsMode ? `Enabled (Threshold: ${room.settings.teamsModeThreshold})` : 'Disabled';
      addSystemMessage(roomId, `Settings updated: Mode is ${modeDesc}, Turn Timer is ${room.settings.turnTimer}s, Lifeline adds +${room.settings.lifelineSeconds}s, Cast Display is ${revealDesc}, Teams Mode is ${teamsModeDesc}.`);
      emitRoomUpdate(roomId);
    }
  });

  socket.on('toggle_ready', ({ roomId }) => {
    const room = rooms[roomId];
    if (room && room.status === 'waiting') {
      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        room.readyPlayers[player.id] = !room.readyPlayers[player.id];
        emitRoomUpdate(roomId);
      }
    }
  });

  socket.on('start_game', ({ roomId }) => {
    const room = rooms[roomId];
    if (room && room.status === 'waiting' && room.players.length >= 1) { // Allow starting even with 1 player
      if (room.players[0]?.socketId === socket.id) { // Host
        const t1Players = room.players.filter(p => p.team === 1);
        const t2Players = room.players.filter(p => p.team === 2);
        
        const hostPlayer = room.players.find(p => p.socketId === socket.id);
        const otherPlayersReady = room.players.every(p => p.id === hostPlayer?.id || room.readyPlayers[p.id]);

        let startAllowed = false;
        if (room.settings.teamsMode) {
          startAllowed = t1Players.length >= 1 && t2Players.length >= 1 && otherPlayersReady;
          if (!startAllowed && (t1Players.length === 0 || t2Players.length === 0)) {
            return socket.emit('room_error', { message: 'Each team must have at least 1 player to start!' });
          }
          if (!startAllowed && !otherPlayersReady) {
            return socket.emit('room_error', { message: 'All players must be ready!' });
          }
        } else {
          // Standard 1v1
          const p2 = room.players.find(p => p.id !== hostPlayer?.id);
          startAllowed = !p2 || room.readyPlayers[p2.id];
        }

        if (startAllowed) {
          room.status = 'playing';
          if (room.settings.teamsMode) {
            room.currentTurnTeam = Math.random() < 0.5 ? 1 : 2; 
            // Reset answer counts for all players
            room.players.forEach(p => {
              p.answerCount = 0;
            });
            // Reset shared lifelines
            room.teamLifelines = {
              1: { skip: true, addTime: true, revealCast: true, snipe: true },
              2: { skip: true, addTime: true, revealCast: true, snipe: true }
            };
          } else {
            room.currentTurnIndex = (room.players.length > 1 && Math.random() < 0.5) ? 1 : 0;
            room.lifelines = {};
            room.players.forEach(p => {
              room.lifelines[p.id] = { skip: true, addTime: true, revealCast: true, snipe: true };
            });
          }
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
    
    const player = room.players.find(p => p.socketId === socket.id) || room.spectators.find(p => p.socketId === socket.id);
    if (!player) return;

    const msg = { type: 'user', sender: player.name, text, timestamp: Date.now() };
    room.messages.push(msg);
    if (room.messages.length > 200) room.messages.shift();
    
    io.to(roomId).emit('chat_message', msg);
  });

  socket.on('switch_role', ({ roomId, to }) => {
    const room = rooms[roomId];
    if (!room) return;

    const pIndex = room.players.findIndex(p => p.socketId === socket.id);
    const sIndex = room.spectators.findIndex(s => s.socketId === socket.id);
    
    let playerObj = null;
    if (pIndex !== -1) {
      playerObj = room.players[pIndex];
    } else if (sIndex !== -1) {
      playerObj = room.spectators[sIndex];
    }

    if (!playerObj) return;

    if (to === 'spectator') {
      if (pIndex !== -1) {
        room.players.splice(pIndex, 1);
        room.spectators.push(playerObj);
        delete room.readyPlayers[playerObj.id];
        addSystemMessage(roomId, `${playerObj.name} moved to spectators.`);
        
        if (room.status === 'playing') {
          if (room.settings.teamsMode) {
            const t1Players = room.players.filter(p => p.team === 1);
            const t2Players = room.players.filter(p => p.team === 2);
            if (t1Players.length === 0 || t2Players.length === 0) {
              const winningTeam = t1Players.length > 0 ? 1 : (t2Players.length > 0 ? 2 : -1);
              gameOver(roomId, winningTeam);
            }
          } else {
            if (room.players.length === 1) {
              gameOver(roomId, 0); // remaining player wins (index 0)
            } else if (room.players.length === 0) {
              gameOver(roomId, -1);
            }
          }
        }
        
        emitRoomUpdate(roomId);
        broadcastLobbies();
      }
    } else if (to === 'team1' || to === 'team2' || to === 'player') {
      let targetTeam = 1;
      if (to === 'team2') {
        targetTeam = 2;
      } else if (to === 'player') {
        const t1Count = room.players.filter(p => p.team === 1).length;
        const t2Count = room.players.filter(p => p.team === 2).length;
        targetTeam = t1Count <= t2Count ? 1 : 2;
      }

      // Enforce 1v1 limit if teamsMode is disabled
      if (!room.settings.teamsMode) {
        const teamOccupied = room.players.some(p => p.team === targetTeam && p.id !== playerObj.id);
        if (teamOccupied) {
          const otherTeam = targetTeam === 1 ? 2 : 1;
          const otherOccupied = room.players.some(p => p.team === otherTeam && p.id !== playerObj.id);
          if (!otherOccupied) {
            targetTeam = otherTeam;
          } else {
            return socket.emit('room_error', { message: 'Room is full!' });
          }
        }
      }

      playerObj.team = targetTeam;
      playerObj.answerCount = playerObj.answerCount || 0;

      if (sIndex !== -1) {
        room.spectators.splice(sIndex, 1);
        room.players.push(playerObj);
        room.readyPlayers[playerObj.id] = false;
        
        if (!room.settings.teamsMode) {
          room.lifelines[playerObj.id] = room.lifelines[playerObj.id] || { skip: true, addTime: true, revealCast: true, snipe: true };
        }
        addSystemMessage(roomId, `${playerObj.name} is now playing on Team ${targetTeam}.`);
      } else {
        addSystemMessage(roomId, `${playerObj.name} switched to Team ${targetTeam}.`);
      }
      
      emitRoomUpdate(roomId);
      broadcastLobbies();
    }
  });

  socket.on('use_lifeline', ({ roomId, type }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    let myTurn = false;
    let lifelines = null;

    if (room.settings.teamsMode) {
      myTurn = (player.team === room.currentTurnTeam);
      lifelines = room.teamLifelines?.[player.team];
    } else {
      myTurn = room.players[room.currentTurnIndex]?.socketId === socket.id;
      lifelines = room.lifelines[player.id];
    }

    if (!lifelines || !lifelines[type]) {
      return socket.emit('turn_error', { message: 'Lifeline already used or unavailable!' });
    }

    if (type === 'skip') {
      if (!myTurn) return socket.emit('turn_error', { message: 'Not your turn' });
      if (room.skipUsedThisTurn) {
        return socket.emit('turn_error', { message: 'Opponent just used skip, you must play!' });
      }
      lifelines.skip = false;
      room.skipUsedThisTurn = true;
      if (room.settings.teamsMode) {
        room.currentTurnTeam = room.currentTurnTeam === 1 ? 2 : 1;
      } else {
        room.currentTurnIndex = (room.currentTurnIndex + 1) % 2;
      }
      room.timer = getActiveBaseTimer(room);
      io.to(roomId).emit('notification', { message: `${player.name} passed their turn!` });
      emitRoomUpdate(roomId);
    } else if (type === 'addTime') {
      if (!myTurn) return socket.emit('turn_error', { message: 'Not your turn' });
      lifelines.addTime = false;
      const timeToAdd = room.settings?.lifelineSeconds || 30;
      room.timer += timeToAdd;
      io.to(roomId).emit('notification', { message: `${player.name} added +${timeToAdd}s to the clock!` });
      io.to(roomId).emit('timer_tick', room.timer);
      emitRoomUpdate(roomId);
    } else if (type === 'revealCast') {
      if (room.settings?.revealAllCast) {
        return socket.emit('turn_error', { message: 'Reveal Cast lifeline is disabled because Reveal All Cast is active!' });
      }
      lifelines.revealCast = false;
      if (room.chain.length > 0) {
        room.chain[room.chain.length - 1].revealCast = true;
      }
      io.to(roomId).emit('notification', { message: `${player.name} revealed the cast!` });
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

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    // Verify it's this player's turn/team's turn
    let isMyTurn = false;
    if (room.settings.teamsMode) {
      isMyTurn = (player.team === room.currentTurnTeam);
    } else {
      isMyTurn = (room.players[room.currentTurnIndex]?.socketId === socket.id);
    }

    if (!isMyTurn) {
      return socket.emit('turn_error', { message: 'Not your turn' });
    }

    // Verify player is not blocked by count threshold
    if (room.settings.teamsMode) {
      const teamPlayers = room.players.filter(p => p.team === player.team);
      if (teamPlayers.length > 1) {
        const nextCount = (player.answerCount || 0) + 1;
        const tempCounts = teamPlayers.map(p => p.id === player.id ? nextCount : (p.answerCount || 0));
        const maxCount = Math.max(...tempCounts);
        const minCount = Math.min(...tempCounts);
        const threshold = room.settings.teamsModeThreshold || 2;
        if (maxCount - minCount > threshold) {
          return socket.emit('turn_error', { message: `Count difference would exceed threshold (${threshold}). Wait for teammate to answer!` });
        }
      }
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
        const lifelines = room.settings.teamsMode ? room.teamLifelines?.[player.team] : room.lifelines[player.id];
        if (!lifelines || !lifelines.snipe) {
          isValid = false;
          turnErrorMsg = 'Snipe lifeline already used or unavailable!';
        } else {
          const hasSeiyuu = !!anime.s[snipeSeiyuuId];
          if (hasSeiyuu) {
            isValid = true;
            linkingSeiyuuIds = [parseInt(snipeSeiyuuId)];
            lifelines.snipe = false;
            const seiyuuName = anilistData.seiyuus[snipeSeiyuuId] || 'Someone';
            io.to(roomId).emit('notification', { message: `${player.name} sniped ${seiyuuName}!` });
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
          if (room.settings.teamsMode) {
            gameOver(roomId, player.team === 1 ? 2 : 1);
          } else {
            gameOver(roomId, (room.currentTurnIndex + 1) % 2); // other player wins
          }
          return;
        }
      }
      
      // Send penalty message (even if rescued, so user knows move was invalid)
      io.to(roomId).emit('play_penalty', { playerId: player.id, message: `${turnErrorMsg} (-3s)`, newTimer: room.timer });
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
        seiyuuUsageCountSnapshot: snapshot,
        playedBy: player.name
      });

      // Increment player count
      player.answerCount = (player.answerCount || 0) + 1;

      // Reset timer and rotate turn
      room.timer = getActiveBaseTimer(room);
      if (room.settings.teamsMode) {
        room.currentTurnTeam = room.currentTurnTeam === 1 ? 2 : 1;
      } else {
        room.currentTurnIndex = (room.currentTurnIndex + 1) % 2;
      }

      io.to(roomId).emit('play_success', { 
        animeId: animeId, 
        linkingSeiyuuIds,
        playerId: player.id 
      });
      emitRoomUpdate(roomId);
    }
  });

  const handlePlayerLeave = (socketId, roomId, isExplicitLeave = false) => {
    const room = rooms[roomId];
    if (!room) return;
    
    const player = room.players.find(p => p.socketId === socketId);
    if (!player) {
      const sIndex = room.spectators.findIndex(s => s.socketId === socketId);
      if (sIndex !== -1) {
        room.spectators.splice(sIndex, 1);
        emitRoomUpdate(roomId);
        broadcastLobbies();
      }
      return;
    }

    if (isExplicitLeave) {
      const pIndex = room.players.findIndex(p => p.id === player.id);
      if (pIndex !== -1) {
        room.players.splice(pIndex, 1);
        delete room.readyPlayers[player.id];
        addSystemMessage(roomId, `${player.name} left the room.`);
        handleGameLeaveCleanups(room, roomId);
      }
      return;
    }

    // Temporary disconnect (grace period)
    player.disconnected = true;
    addSystemMessage(roomId, `${player.name} disconnected. Waiting 15s to reconnect...`);
    emitRoomUpdate(roomId);

    player.disconnectTimeout = setTimeout(() => {
      const pIndex = room.players.findIndex(p => p.id === player.id);
      if (pIndex !== -1) {
        const leaverName = room.players[pIndex].name;
        room.players.splice(pIndex, 1);
        delete room.readyPlayers[player.id];
        addSystemMessage(roomId, `${leaverName} failed to reconnect and was removed.`);
        handleGameLeaveCleanups(room, roomId);
      }
    }, 15000);
  };

  const handleGameLeaveCleanups = (room, roomId) => {
    if (room.players.length === 0 && room.spectators.length === 0) {
      clearInterval(room.timerInterval);
      delete rooms[roomId];
    } else if (room.status === 'playing') {
      if (room.settings.teamsMode) {
        const t1Players = room.players.filter(p => p.team === 1);
        const t2Players = room.players.filter(p => p.team === 2);
        if (t1Players.length === 0 || t2Players.length === 0) {
          const winningTeam = t1Players.length > 0 ? 1 : (t2Players.length > 0 ? 2 : -1);
          gameOver(roomId, winningTeam);
        } else {
          emitRoomUpdate(roomId);
        }
      } else {
        if (room.players.length === 1) {
          gameOver(roomId, 0); // last remaining player wins
        } else if (room.players.length === 0) {
          gameOver(roomId, -1);
        } else {
          emitRoomUpdate(roomId);
        }
      }
    } else {
      emitRoomUpdate(roomId);
    }
    broadcastLobbies();
  };

  socket.on('leave_room', ({ roomId }) => {
    socket.leave(roomId);
    handlePlayerLeave(socket.id, roomId, true);
  });


  socket.on('disconnect', () => {
    // Basic disconnect handling
    console.log('User disconnected', socket.id);
    for (const roomId in rooms) {
      handlePlayerLeave(socket.id, roomId, false);
    }
  });
});

function checkAutoLifelines(roomId) {
  const room = rooms[roomId];
  if (!room) return false;
  
  if (room.settings.teamsMode) {
    const activeTeam = room.currentTurnTeam;
    const lifelines = room.teamLifelines?.[activeTeam];

    if (lifelines?.addTime) {
      lifelines.addTime = false;
      const rescueTimer = room.settings?.lifelineSeconds || 30;
      room.timer = rescueTimer;
      io.to(roomId).emit('notification', { message: `Almost out of time! Team ${activeTeam}'s +${rescueTimer}s lifeline was used automatically.` });
      io.to(roomId).emit('timer_tick', room.timer);
      emitRoomUpdate(roomId);
      return true;
    } else if (lifelines?.skip && !room.skipUsedThisTurn) {
      lifelines.skip = false;
      room.skipUsedThisTurn = true;
      const prevTeam = activeTeam;
      room.currentTurnTeam = activeTeam === 1 ? 2 : 1;
      room.timer = getActiveBaseTimer(room);
      io.to(roomId).emit('notification', { message: `Out of time! Team ${prevTeam} automatically used skip.` });
      io.to(roomId).emit('timer_tick', room.timer);
      emitRoomUpdate(roomId);
      return true;
    }
  } else {
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
        if (room.settings.teamsMode) {
          const winningTeam = room.currentTurnTeam === 1 ? 2 : 1;
          gameOver(roomId, winningTeam);
        } else {
          const winningIndex = (room.currentTurnIndex + 1) % 2;
          gameOver(roomId, winningIndex);
        }
      }
    }
  }, 1000);
}

function gameOver(roomId, winningPlayerIndexOrTeam) {
  const room = rooms[roomId];
  if (!room) return;
  clearInterval(room.timerInterval);
  
  let winnerName = 'Nobody (Draw)';
  let winnerId = null;

  if (room.settings.teamsMode) {
    if (winningPlayerIndexOrTeam === 1 || winningPlayerIndexOrTeam === 2) {
      winnerName = `Team ${winningPlayerIndexOrTeam}`;
      winnerId = winningPlayerIndexOrTeam;
      addSystemMessage(roomId, `Game Over! Team ${winningPlayerIndexOrTeam} won the match!`);
    } else {
      addSystemMessage(roomId, `Game Over! The match ended.`);
    }
  } else {
    // Standard 1v1
    let winner = null;
    if (winningPlayerIndexOrTeam !== -1) {
      winner = room.players[winningPlayerIndexOrTeam];
    }
    if (winner) {
      winnerName = winner.name;
      winnerId = winner.id;
      addSystemMessage(roomId, `Game Over! ${winner.name} won the match!`);
    } else {
      addSystemMessage(roomId, `Game Over! The match ended.`);
    }
  }

  room.lastMatchResult = { 
    winnerId: winnerId, 
    winnerName: winnerName,
    timestamp: Date.now()
  };

  // Reset room for next game
  room.status = 'waiting';
  room.timer = room.settings?.turnTimer || 45;
  room.chain = [];
  room.usedAnimeIds = new Set();
  room.seiyuuUsageCount = {};
  room.readyPlayers = {};
  room.skipUsedThisTurn = false;
  
  // Reset lifelines and counts for the next game
  if (room.settings.teamsMode) {
    room.teamLifelines = {
      1: { skip: true, addTime: true, revealCast: true, snipe: true },
      2: { skip: true, addTime: true, revealCast: true, snipe: true }
    };
    room.players.forEach(p => {
      p.answerCount = 0;
    });
  } else {
    room.lifelines = {};
    room.players.forEach(p => {
      room.lifelines[p.id] = { skip: true, addTime: true, revealCast: true, snipe: true };
    });
  }

  io.to(roomId).emit('game_over', { winner: { name: winnerName, id: winnerId } });
  emitRoomUpdate(roomId);
}

// Catch-all for SPA
app.get('/*path', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
