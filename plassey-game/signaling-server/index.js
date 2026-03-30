const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8081;

// Create HTTP server for health checks
const server = http.createServer((req, res) => {
  if ((req.method === 'GET' || req.method === 'HEAD') && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    if (req.method === 'GET') {
      res.end('Plassey Server is awake and ready for battle!');
    } else {
      res.end(); // HEAD requests must not return a body
    }
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocket.Server({ server });

const hosts = new Map(); // roomCode -> { ws, hostId }
const clients = new Map(); // clientId -> ws
const roomTimeouts = new Map(); // roomCode -> setTimeoutId

wss.on('connection', (ws) => {
  let isHost = false;
  let roomId = null;
  let clientId = null;

  ws.on('message', (messageAsString) => {
    let msg;
    try {
      msg = JSON.parse(messageAsString);
    } catch (e) {
      return;
    }

    const { type, room, sender, target, roomCode, senderId, targetId } = msg;

    if (type === 'host_room') {
      const rId = room || roomCode;
      const hId = senderId || sender;
      
      const existing = hosts.get(rId);
      if (existing && existing.hostId && hId && existing.hostId !== hId) {
        console.log(`[REJECT] Attempt to hijack room ${rId} by ${hId} (Official Host: ${existing.hostId})`);
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'This tactical front already has a commanding officer. Please join as a subordinate.' 
        }));
        return;
      }

      // If there was a pending dissolution for this room, cancel it
      if (roomTimeouts.has(rId)) {
        console.log(`[RECOVERY] Commanding Officer re-established connection for room ${rId}. Dissolution cancelled.`);
        clearTimeout(roomTimeouts.get(rId));
        roomTimeouts.delete(rId);
      }

      ws.roomId = rId;
      hosts.set(rId, { ws, hostId: hId });
      isHost = true;
      roomId = rId;
      console.log(`Host registered room: ${roomId} (ID: ${hId})`);
    } 
    else if (type === 'join_room') {
      const actualSender = sender || senderId;
      const actualRoom = room || roomCode;
      clients.set(actualSender, ws);
      ws.roomId = actualRoom;
      clientId = actualSender;
      roomId = actualRoom;
      
      const hostEntry = hosts.get(actualRoom);
      
      // HOST RECLAMATION: If this user was the original host, promote them back!
      if (hostEntry && hostEntry.hostId === actualSender) {
        console.log(`[PROMOTION] Original Host ${actualSender} re-joined room ${actualRoom}. Restoring command.`);
        isHost = true;
        hosts.set(actualRoom, { ws, hostId: actualSender });
        ws.send(JSON.stringify({ type: 'promote_to_host', roomCode: actualRoom }));
      } else if (hostEntry && hostEntry.ws.readyState === WebSocket.OPEN) {
        hostEntry.ws.send(JSON.stringify({ type: 'client_join', sender: actualSender }));
        console.log(`Client ${actualSender} joined room ${actualRoom}`);
      }
    } 
    else if (type === 'offer' || type === 'answer' || type === 'ice_candidate') {
      // Route between host and client
      if (isHost) {
        // Host routing to target client
        const clientWs = clients.get(target || targetId);
        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify(msg));
        }
      } else {
        // Client routing to host
        const hostEntry = hosts.get(room || roomCode || roomId);
        if (hostEntry && hostEntry.ws.readyState === WebSocket.OPEN) {
          hostEntry.ws.send(JSON.stringify(msg));
        }
      }
    }
  });

  ws.on('close', () => {
    if (isHost && roomId) {
      const existing = hosts.get(roomId);
      if (existing && existing.ws === ws) {
        // Start Reconnection Window (15 seconds)
        console.log(`[TIMEOUT] Host left room: ${roomId}. Starting 15s reconnection window...`);
        const timeoutId = setTimeout(() => {
          console.log(`[DISSOLUTION] 15s expired. Dissolving room ${roomId}.`);
          // Notify ALL clients in this room
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client.roomId === roomId && client !== ws) {
              client.send(JSON.stringify({ type: 'host_leave', roomCode: roomId }));
            }
          });
          hosts.delete(roomId);
          roomTimeouts.delete(roomId);
        }, 15000);
        roomTimeouts.set(roomId, timeoutId);
      }
    } else if (clientId && roomId) {
      clients.delete(clientId);
      console.log(`Client disconnected: ${clientId}`);
      const hostEntry = hosts.get(roomId);
      if (hostEntry && hostEntry.ws.readyState === WebSocket.OPEN) {
        hostEntry.ws.send(JSON.stringify({ type: 'client_leave', sender: clientId }));
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
