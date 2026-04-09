export class LocalServerManager {
  private static isRunning = false;
  private static port = 8081;
  private static clients: Map<string, any> = new Map(); // UUID to connection object
  private static peerToConn: Map<string, string> = new Map(); // PeerID to Connection UUID
  private static hostPeerId: string | null = null;
  private static zeroconfServiceName: string | null = null;

  public static async startServer(port: number = 8081, roomCode?: string): Promise<string> {
    if (this.isRunning) return '0.0.0.0';
    this.port = port;

    return new Promise((resolve, reject) => {
      // @ts-ignore - Cordova plugin injected by Capacitor at runtime
      if (!window.cordova || !window.cordova.plugins || !window.cordova.plugins.wsserver) {
        console.warn("cordova-plugin-websocket-server not found. You might not be on a native device.");
        reject(new Error("Native WebSocket Server plugin not available"));
        return;
      }

      // Register Zeroconf (mDNS) so clients on LAN can discover the server automatically
      // @ts-ignore
      if (window.cordova && window.cordova.plugins && window.cordova.plugins.zeroconf) {
        // @ts-ignore
        const zc = window.cordova.plugins.zeroconf;
        const serviceName = "PlasseyHost_" + (roomCode || Math.random().toString(36).substring(2, 6));
        zc.register('_plassey._tcp.', 'local.', serviceName, this.port, {
           'roomId': roomCode || 'HOST'
        }, () => console.log('[LOCAL SERVER] Zeroconf (mDNS) registered:', serviceName),
        (err: any) => console.error('[LOCAL SERVER] Zeroconf registration failed:', err));
        
        this.zeroconfServiceName = serviceName;
      }

      // @ts-ignore
      const wsserver = window.cordova.plugins.wsserver;

      wsserver.start(this.port, {
        onFailure: (addr: string, port: number, reason: string) => {
          console.error('[LOCAL SERVER] Stopped unexpectedly', addr, port, reason);
          this.isRunning = false;
        },
        onMessage: (conn: any, msg: string) => {
          this.handleMessage(conn, msg);
        },
        onOpen: (conn: any) => {
          console.log(`[LOCAL SERVER] Connection opened: ${conn.uuid}`);
          this.clients.set(conn.uuid, conn);
        },
        onClose: (conn: any, _code: number, _reason: string, _wasClean: boolean) => {
          console.log(`[LOCAL SERVER] Connection closed: ${conn.uuid}`);
          this.clients.delete(conn.uuid);
          // Cleanup mappings
          for (const [peerId, connId] of this.peerToConn.entries()) {
            if (connId === conn.uuid) {
              this.peerToConn.delete(peerId);
              console.log(`[LOCAL SERVER] Removed dead peer mapping: ${peerId}`);
            }
          }
        }
      }, (addr: string, port: number) => {
        console.log(`[LOCAL SERVER] Listening on ${addr}:${port}`);
        this.isRunning = true;
        resolve(addr);
      }, (reason: string) => {
        console.error(`[LOCAL SERVER] Failed to start: ${reason}`);
        reject(new Error(reason));
      });
    });
  }

  public static stopServer() {
    if (!this.isRunning) return;
    
    // Unregister Zeroconf
    // @ts-ignore
    if (window.cordova && window.cordova.plugins && window.cordova.plugins.zeroconf && this.zeroconfServiceName) {
      // @ts-ignore
      window.cordova.plugins.zeroconf.unregister('_plassey._tcp.', 'local.', this.zeroconfServiceName);
      this.zeroconfServiceName = null;
      console.log('[LOCAL SERVER] Zeroconf unregistered.');
    }

    // @ts-ignore
    if (window.cordova && window.cordova.plugins && window.cordova.plugins.wsserver) {
      // @ts-ignore
      window.cordova.plugins.wsserver.stop((addr: string, port: number) => {
        console.log(`[LOCAL SERVER] Stopped on ${addr}:${port}`);
        this.isRunning = false;
        this.clients.clear();
        this.peerToConn.clear();
        this.hostPeerId = null;
      });
    }
  }

  private static handleMessage(conn: any, messageAsString: string) {
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
       
       if (this.hostPeerId && this.hostPeerId !== hId) {
           console.warn(`[LOCAL SERVER] Host collision! Existing: ${this.hostPeerId}, New: ${hId}`);
           this.sendToConn(conn, { type: 'error', message: 'Room already hosted.' });
           return;
       }

       this.hostPeerId = hId;
       this.peerToConn.set(hId, conn.uuid);
       console.log(`[LOCAL SERVER] Host registered room: ${rId} (ID: ${hId}) on connection: ${conn.uuid}`);
    } else if (type === 'join_room') {
       const actualSender = sender || senderId;
       const actualRoom = room || roomCode;
       this.peerToConn.set(actualSender, conn.uuid);
       console.log(`[LOCAL SERVER] Client ${actualSender} joining room: ${actualRoom} using connection: ${conn.uuid}`);
       
       const hostConnUuid = this.hostPeerId ? this.peerToConn.get(this.hostPeerId) : null;
       if (hostConnUuid) {
           this.sendToConnId(hostConnUuid, { type: 'client_join', sender: actualSender });
           console.log(`[LOCAL SERVER] Notified Host (${this.hostPeerId}) of client join.`);
       } else {
           console.warn(`[LOCAL SERVER] Host NOT FOUND for room ${actualRoom}. Handshake will stall.`);
       }
    } else if (type === 'offer' || type === 'answer' || type === 'ice_candidate') {
       // From host to client (isHost here means message is sent by Host, wait, actually we can just rely on IDs)
       if (this.hostPeerId === (sender || senderId)) {
           // Routing from Host -> Client
           const targetIdActual = target || targetId;
           const targetConnId = this.peerToConn.get(targetIdActual);
           if (targetConnId) {
               console.log(`[LOCAL SERVER] Routing ${type} from Host to Client: ${targetIdActual}`);
               this.sendToConnId(targetConnId, msg);
           } else {
               console.warn(`[LOCAL SERVER] Failed to route ${type}: Client ${targetIdActual} not found.`);
           }
       } else {
           // Routing from Client -> Host
           const hostConnUuid = this.hostPeerId ? this.peerToConn.get(this.hostPeerId) : null;
           if (hostConnUuid) {
               console.log(`[LOCAL SERVER] Routing ${type} from Client (${sender || senderId}) to Host`);
               this.sendToConnId(hostConnUuid, msg);
           } else {
               console.warn(`[LOCAL SERVER] Failed to route ${type}: Host not found.`);
           }
       }
    }
  }

  private static sendToConn(conn: any, payload: any) {
    // @ts-ignore
    window.cordova.plugins.wsserver.send({ uuid: conn.uuid }, JSON.stringify(payload));
  }
  
  private static sendToConnId(uuid: string, payload: any) {
    // @ts-ignore
    window.cordova.plugins.wsserver.send({ uuid }, JSON.stringify(payload));
  }
}
