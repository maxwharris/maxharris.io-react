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

const app = express();
const server = createServer(app);

const allowedOrigins = [
  'https://maxharris.io',
  'https://www.maxharris.io',
  'http://localhost:5173',
];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'DELETE', 'PATCH'],
  },
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/contact', contactRoutes);
app.use('/api', contentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Socket.io
setupShareSocket(io);

const PORT = process.env.PORT || 3001;

async function start() {
  await loadState();
  server.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
  });
}

start();
