import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server });

  // Create a separate Redis connection for Pub/Sub
  const redisSub = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

  // Clients mapped by submissionId they are listening to
  const clients = new Map<number, Set<WebSocket>>();

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // Expecting ws://localhost:3000/?submissionId=123
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const submissionIdParam = url.searchParams.get('submissionId');

    if (submissionIdParam) {
      const submissionId = parseInt(submissionIdParam, 10);
      if (!isNaN(submissionId)) {
        if (!clients.has(submissionId)) {
          clients.set(submissionId, new Set());
        }
        clients.get(submissionId)!.add(ws);

        ws.on('close', () => {
          const subs = clients.get(submissionId);
          if (subs) {
            subs.delete(ws);
            if (subs.size === 0) {
              clients.delete(submissionId);
            }
          }
        });
      }
    }
  });

  // Listen for updates from workers via Redis Pub/Sub
  redisSub.subscribe('submission-updates', (err) => {
    if (err) {
      console.error('Failed to subscribe to submission-updates:', err);
    }
  });

  redisSub.on('message', (channel, message) => {
    if (channel === 'submission-updates') {
      try {
        const update = JSON.parse(message);
        const { submissionId } = update;

        const subs = clients.get(submissionId);
        if (subs) {
          subs.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(message);
            }
          });
        }
      } catch (err) {
        console.error('Failed to parse WS message:', err);
      }
    }
  });
}
