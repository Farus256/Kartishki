import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { matchRoomWithPlayers } from './MatchRoom';
import express from 'express';
import { catalogStore } from './catalog';
import { validateCard } from '@kartishki/shared';
import { openDatabase, migratePlayers } from './database';
import { PlayerStore } from './players';
import { playerApi } from './playerApi';
const db = await openDatabase(process.env.DATABASE_URL, process.env.PLAYER_DATA_DIR);
await migratePlayers(db);
const players = new PlayerStore(db);
const transport = new WebSocketTransport({ maxPayload: 4096 });
const app = transport.getExpressApp();
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ['http://127.0.0.1:5174', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://localhost:5173'].includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});
app.use('/api/players', playerApi(players,catalogStore));
app.get('/api/catalog', (_req, res) => res.json(catalogStore.snapshot()));
app.put('/api/catalog', (req, res, next) => {
  if (!process.env.ADMIN_TOKEN || req.headers.authorization !== `Bearer ${process.env.ADMIN_TOKEN}`) { res.status(401).json({ error: 'unauthorized' }); return; }
  next();
}, express.json({ limit: '7mb' }), (req, res) => {
  if (!validateCard(req.body?.card) || !Number.isInteger(req.body?.version)) { res.status(400).json({ error: 'invalidCard' }); return; }
  try { res.json(catalogStore.publish(req.body.card, req.body.version)); }
  catch (error) { const reason = error instanceof Error ? error.message : ''; res.status(reason === 'catalogConflict' ? 409 : 500).json({ error: reason === 'catalogConflict' ? reason : 'publishError' }); }
});
const server = new Server({ transport });
server.define('match', matchRoomWithPlayers(players));
server.onShutdown(() => db.close());
await server.listen(Number(process.env.PORT ?? 2567), '127.0.0.1');
console.log('Colyseus listening on http://127.0.0.1:2567');
