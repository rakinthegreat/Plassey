export class LocalServerManager {
  private static port = 8081;
  private static peerToConn: Map<string, string> = new Map(); // PeerID to Connection UUID
  private static hostPeerId: string | null = null;
  private static pendingJoins: Map<string, string[]> = new Map(); // RoomCode -> Array of Pending SenderIDs
  private static zeroconfServiceName: string | null = null;
  private static isTransitioning = false;

  public static async startServer(initialPort: number = 8081, roomCode?: string): Promise<{ address: string, port: number }> {
    if (this.isTransitioning) {
      throw new Error("Strategic deployment already in progress. Please wait.");
    }

    this.isTransitioning = true;
    try {
      // Loop through ports starting from initialPort up to initialPort + 8
      for (let attemptPort = initialPort; attemptPort <= initialPort + 8; attemptPort++) {
        try {
          this.port = attemptPort;
          console.log(`[LOCAL SERVER] Attempting to bind to tactical port ${this.port}...`);
          
          await this.stopServer(); // Clean up any zombie state before new bind
          
          // TACTICAL DELAY: Give the OS 250ms to release the previous socket/MDNS
          if (attemptPort > initialPort) {
            console.log(`[LOCAL SERVER] Settling network (250ms)...`);
            await new Promise(r => setTimeout(r, 250));
          }

          const bindResult = await new Promise<{ address: string, port: number }>((resolve, reject) => {
            let hasResolved = false;

            // @ts-ignore
            if (!window.cordova || !window.cordova.plugins || !window.cordova.plugins.wsserver) {
              reject(new Error("Native WebSocket Server plugin not available"));
              return;
            }

            // @ts-ignore
            const wsserver = window.cordova.plugins.wsserver;

            wsserver.start(this.port, {
              onFailure: (addr: string, port: number, reason: string) => {
                console.error('[LOCAL SERVER] Stopped unexpectedly', addr, port, reason);
                if (!hasResolved) {
                  hasResolved = true;
                  reject(new Error(reason));
                }
              },
              onMessage: (conn: any, msg: string) => {
                this.handleMessage(conn, msg);
              },
              onOpen: (conn: any) => {
                console.log(`[LOCAL SERVER] Connection opened: ${conn.uuid}`);
              },
              onClose: (conn: any, _code: number, _reason: string, _wasClean: boolean) => {
                console.log(`[LOCAL SERVER] Connection closed: ${conn.uuid}`);
                for (const [peerId, connId] of this.peerToConn.entries()) {
                  if (connId === conn.uuid) {
                    this.peerToConn.delete(peerId);
                    console.log(`[LOCAL SERVER] Removed dead peer mapping: ${peerId}`);
                  }
                }
              }
            }, (addr: string, port: number) => {
              console.log(`[LOCAL SERVER] Listening on ${addr}:${port}`);
              
              if ((window as any).cordova && (window as any).cordova.plugins && (window as any).cordova.plugins.zeroconf) {
                // @ts-ignore
                const zc = (window as any).cordova.plugins.zeroconf;
                const serviceName = "PlasseyHost_" + (roomCode || Math.random().toString(36).substring(2, 6));
                
                // PROACTIVE RESET: Ensure the native mDNS engine is re-initialized for this specific port
                zc.reInit(() => {
                  zc.register('_plassey._tcp.', 'local.', serviceName, port, {
                    'roomId': roomCode || 'HOST'
                  }, () => console.log('[LOCAL SERVER] Zeroconf (mDNS) registered:', serviceName, 'on port:', port),
                  (err: any) => console.error('[LOCAL SERVER] Zeroconf registration failed:', err));
                  
                  this.zeroconfServiceName = serviceName;
                }, (err: any) => console.error('[LOCAL SERVER] Zeroconf engine reset failed:', err));
              }

              hasResolved = true;
              resolve({ address: addr, port });
            }, (reason: string) => {
              if (!hasResolved) {
                hasResolved = true;
                reject(new Error(reason));
              }
            });
          });

          return bindResult; // Success!

        } catch (error: any) {
          const reason = error?.message || String(error);
          const isBindError = reason.includes("Address already in use") || reason.includes("EADDRINUSE") || reason.includes("8081");
          
          if (isBindError && attemptPort < initialPort + 8) {
            console.warn(`[LOCAL SERVER] Tactical Port ${attemptPort} occupied (${reason}). Retrying on ${attemptPort + 1}...`);
            continue;
          }
          throw error;
        }
      }
      throw new Error("All tactical ports (8081-8089) are currently occupied.");
    } finally {
      this.isTransitioning = false;
    }
  }

  public static async stopServer(): Promise<void> {
    // Unregister Zeroconf regardless of isRunning flag to clear MDNS entries
    // @ts-ignore
    if (window.cordova && window.cordova.plugins && window.cordova.plugins.zeroconf) {
      // @ts-ignore
      const zc = window.cordova.plugins.zeroconf;
      if (this.zeroconfServiceName) {
          zc.unregister('_plassey._tcp.', 'local.', this.zeroconfServiceName);
          console.log('[LOCAL SERVER] Zeroconf unregistered:', this.zeroconfServiceName);
          this.zeroconfServiceName = null;
      }
    }

    return new Promise((resolve) => {
        // @ts-ignore
        if (window.cordova && window.cordova.plugins && window.cordova.plugins.wsserver) {
          // @ts-ignore
          window.cordova.plugins.wsserver.stop((addr: string, port: number) => {
            console.log(`[LOCAL SERVER] Native stop success: ${addr}:${port}`);
            this.peerToConn.clear();
            this.pendingJoins.clear();
            this.hostPeerId = null;
            resolve();
          }, (err: any) => {
            console.warn(`[LOCAL SERVER] Native stop failure (likely already stopped):`, err);
            this.peerToConn.clear();
            this.pendingJoins.clear();
            this.hostPeerId = null;
            resolve();
          });
        } else {
            resolve();
        }
    });
  }
  
  public static broadcastToClients(payload: any) {
    console.log(`[LOCAL SERVER] Broadcasting ${payload.type} to all clients...`);
    this.peerToConn.forEach((uuid, peerId) => {
      if (this.hostPeerId && peerId !== this.hostPeerId) {
        this.sendToConnId(uuid, payload);
      }
    });
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
