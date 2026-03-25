const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8081 });

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

    const { type, room, sender, target } = msg;

    if (type === 'host_room') {
      hosts.set(room, ws);
      isHost = true;
      roomId = room;
      console.log(`Host registered room: ${room}`);
    } 
    else if (type === 'join_room') {
      clients.set(sender, ws);
      clientId = sender;
      roomId = room;
      const hostWs = hosts.get(room);
      if (hostWs && hostWs.readyState === WebSocket.OPEN) {
        hostWs.send(JSON.stringify({ type: 'client_join', sender }));
        console.log(`Client ${sender} joined room ${room}`);
      }
    } 
    else if (type === 'offer' || type === 'answer' || type === 'ice_candidate') {
      // Route between host and client
      if (isHost) {
        // Host routing to target client
        const clientWs = clients.get(target);
        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify(msg));
        }
      } else {
        // Client routing to host
        const hostWs = hosts.get(room || roomId);
        if (hostWs && hostWs.readyState === WebSocket.OPEN) {
          hostWs.send(JSON.stringify(msg));
        }
      }
    }
  });

  ws.on('close', () => {
    if (isHost && roomId) {
      hosts.delete(roomId);
      console.log(`Host disconnected from room: ${roomId}`);
    } else if (clientId) {
      clients.delete(clientId);
      console.log(`Client disconnected: ${clientId}`);
    }
  });
});

console.log('Signaling server running on ws://localhost:8081');
