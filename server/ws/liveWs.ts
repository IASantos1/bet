import type http from 'http';
import type { Duplex } from 'stream';

export function createLiveWs() {
  return {
    handleUpgrade(_req: http.IncomingMessage, socket: Duplex, _head: Buffer) {
      try {
        socket.destroy();
      } catch {
        void 0;
      }
    },
  };
}
