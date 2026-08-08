import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { config } from 'dotenv';
import { createApp } from './app';
import { handleCollabClose, handleCollabMessage } from './collab';

config();

const PORT = Number(process.env.PORT ?? 8787);
const app = createApp({ collab: true });
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.get(
  '/ws',
  upgradeWebSocket(() => ({
    onMessage(event, ws) {
      const data = typeof event.data === 'string' ? event.data : '';
      if (data) handleCollabMessage(ws, data);
    },
    onClose(_event, ws) {
      handleCollabClose(ws);
    },
  })),
);

console.log(`Chadsound API listening on http://localhost:${PORT}`);
const server = serve({ fetch: app.fetch, port: PORT });
injectWebSocket(server);
