import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { logger } from './utils/logger.js';
import { connectDb } from './db/client.js';
import { authRouter } from './api/routes/auth.js';
import { documentsRouter } from './api/routes/documents.js';
import { changeRequestsRouter } from './api/routes/changeRequests.js';
import { chatRouter } from './api/routes/chat.js';
import { migrationRouter } from './api/routes/migration.js';
import { categoriesRouter } from './api/routes/categories.js';
import { usersRouter } from './api/routes/users.js';
import { searchRouter } from './api/routes/search.js';
import { webhooksRouter } from './api/routes/webhooks.js';
import { errorHandler } from './api/middleware/errorHandler.js';
import { authenticate } from './api/middleware/authenticate.js';
import { setupWebSocket } from './services/realtime/websocket.js';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 4000;

// ── Middleware ────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ── Health ────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0', time: new Date() }));

// ── Public routes ─────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/webhooks', webhooksRouter);  // MS Forms webhook

// ── Protected routes ──────────────────────────────────────
app.use('/api/documents', authenticate, documentsRouter);
app.use('/api/change-requests', authenticate, changeRequestsRouter);
app.use('/api/chat', authenticate, chatRouter);
app.use('/api/migration', authenticate, migrationRouter);
app.use('/api/categories', authenticate, categoriesRouter);
app.use('/api/users', authenticate, usersRouter);
app.use('/api/search', authenticate, searchRouter);

// ── Error handler ─────────────────────────────────────────
app.use(errorHandler);

// ── WebSocket (live notifications) ────────────────────────
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
setupWebSocket(wss);

// ── Start ─────────────────────────────────────────────────
async function start() {
  await connectDb();
  httpServer.listen(PORT, () => {
    logger.info(`OperWiki API running on port ${PORT}`);
    logger.info(`Auth mode: ${process.env.AUTH_MODE || 'local'}`);
  });
}

start().catch((err) => {
  logger.error('Startup failed', err);
  process.exit(1);
});
