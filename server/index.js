import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import contactRoutes from './routes/contact.js';
import contentRoutes from './routes/content.js';
import analyticsRoutes from './routes/analytics.js';
import shareRoutes from './routes/share.js';
import uploadRoutes from './routes/upload.js';
import { setupShareSocket } from './socket/shareSocket.js';
import { loadState } from './services/shareStore.js';

// The share board (/share) is switched off for now (Max, 2026-10-16): its API, its upload links
// and its socket are not served. Set to true, together with SHARE_ON in src/App.jsx, to bring it back.
const SHARE_ON = false;

const app = express();
const server = createServer(app);

const allowedOrigins = [
  'https://maxharris.io',
  'https://www.maxharris.io',
  'http://localhost:5173',
];

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/contact', contactRoutes);
app.use('/api', contentRoutes);
app.use('/api/analytics', analyticsRoutes);
if (SHARE_ON) {
  app.use('/api/share', shareRoutes);
  app.use('/api/upload', uploadRoutes);
}

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Socket.io: only the share board's live canvas uses it
if (SHARE_ON) {
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'DELETE', 'PATCH'],
    },
  });
  setupShareSocket(io);
}

const PORT = process.env.PORT || 3001;

async function start() {
  if (SHARE_ON) await loadState();
  server.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
  });
}

start();
