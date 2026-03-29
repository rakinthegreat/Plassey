const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8081;

// Create HTTP server for health checks
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Polashi Server is awake and ready for battle!');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocket.Server({ server });

const hosts = new Map(); // roomCode -> ws
const clients = new Map(); // clientId -> ws

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

      hosts.set(rId, { ws, hostId: hId });
      isHost = true;
      roomId = rId;
      console.log(`Host registered room: ${roomId} (ID: ${hId})`);
    } 
    else if (type === 'join_room') {
      const actualSender = sender || senderId;
      const actualRoom = room || roomCode;
      clients.set(actualSender, ws);
      clientId = actualSender;
      roomId = actualRoom;
      
      const hostEntry = hosts.get(actualRoom);
      if (hostEntry && hostEntry.ws.readyState === WebSocket.OPEN) {
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
      // Only delete if THIS socket is the one registered
      if (existing && existing.ws === ws) {
        hosts.delete(roomId);
        console.log(`Host disconnected from room: ${roomId}`);
      }
    } else if (clientId) {
      clients.delete(clientId);
      console.log(`Client disconnected: ${clientId}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
