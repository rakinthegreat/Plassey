export class LocalServerManager {
  private static isRunning = false;
  private static port = 8081;
  private static peerToConn: Map<string, string> = new Map(); // PeerID to Connection UUID
  private static hostPeerId: string | null = null;
  private static pendingJoins: Map<string, string[]> = new Map(); // RoomCode -> Array of Pending SenderIDs
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
        },
        onClose: (conn: any, _code: number, _reason: string, _wasClean: boolean) => {
          console.log(`[LOCAL SERVER] Connection closed: ${conn.uuid}`);
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
        this.peerToConn.clear();
        this.hostPeerId = null;
      });
    }
  }
  
  private static nativeLog(level: 'i'|'d'|'e'|'w', msg: string) {
    // @ts-ignore
    if (window.NativeLog && window.NativeLog[level]) {
        // @ts-ignore
        window.NativeLog[level]("PLASSEY_TACTICAL", msg);
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
       
       this.hostPeerId = hId;
       this.peerToConn.set(hId, conn.uuid);
       console.log(`[LOCAL SERVER] %cHost registered%c room: ${rId} (ID: ${hId})`, 'color: #10b981; font-weight: bold', '');
       this.nativeLog('i', `Host Registered: ${rId} (ID: ${hId})`);

       // FLUSH PENDING JOINS: If clients joined before host was ready, notify host now.
       const pending = this.pendingJoins.get(rId);
       if (pending && pending.length > 0) {
           console.log(`[LOCAL SERVER] Flushing ${pending.length} pending joins for host.`);
           pending.forEach(senderId => {
               this.sendToConnId(conn.uuid, { type: 'client_join', sender: senderId });
           });
           this.pendingJoins.delete(rId);
       }
    } else if (type === 'join_room') {
       const actualSender = sender || senderId;
       const actualRoom = room || roomCode;
       this.peerToConn.set(actualSender, conn.uuid);
       console.log(`[LOCAL SERVER] %cClient Joining%c: ${actualSender} -> ${actualRoom}`, 'color: #3b82f6; font-weight: bold', '');
       this.nativeLog('i', `Client Joined: ${actualSender} -> ${actualRoom}`);
       
       if (this.hostPeerId) {
           const hostConnUuid = this.peerToConn.get(this.hostPeerId);
           if (hostConnUuid) {
               this.sendToConnId(hostConnUuid, { type: 'client_join', sender: actualSender });
               console.log(`[LOCAL SERVER] Notified Host (${this.hostPeerId}) of client join.`);
           }
       } else {
           console.warn(`[LOCAL SERVER] %cHandshake Stalled%c: Host not yet registered for ${actualRoom}`, 'color: #f43f5e; font-weight: bold', '');
           this.nativeLog('w', `HANDSHAKE STALLED: Host missing for ${actualRoom}`);
           
           // BUFFER JOIN: Save the join request to flush when host arrives
           const pending = this.pendingJoins.get(actualRoom) || [];
           if (!pending.includes(actualSender)) {
               pending.push(actualSender);
               this.pendingJoins.set(actualRoom, pending);
           }
       }
    } else if (type === 'offer' || type === 'answer' || type === 'ice_candidate') {
       const sId = (sender || senderId);
       const tId = (target || targetId);
       console.log(`[LOCAL SERVER] Routing %c${type}%c: ${sId} -> ${tId}`, 'color: #f59e0b', '');

       if (this.hostPeerId === sId) {
           // Routing from Host -> Client
           const targetConnId = this.peerToConn.get(tId);
           if (targetConnId) {
               this.sendToConnId(targetConnId, msg);
           } else {
               console.warn(`[LOCAL SERVER] Routing Failed: Client ${tId} not found.`);
           }
       } else {
           // Routing from Client -> Host
           const hostConnUuid = this.hostPeerId ? this.peerToConn.get(this.hostPeerId) : null;
           if (hostConnUuid) {
               this.sendToConnId(hostConnUuid, msg);
           } else {
               console.warn(`[LOCAL SERVER] Routing Failed: Host not found for client ${sId}.`);
           }
       }
    }
  }

  private static sendToConnId(uuid: string, payload: any) {
    // @ts-ignore
    if (window.cordova && window.cordova.plugins && window.cordova.plugins.wsserver) {
      // @ts-ignore
      window.cordova.plugins.wsserver.send({ uuid }, JSON.stringify(payload));
    }
  }
}
