import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { matchRoomWithPlayers } from './MatchRoom';
import { AutoBattlerRoom } from './autoBattler/AutoBattlerRoom';
import express from 'express';
import { catalogStore } from './catalog';
import { validateAutoBattlerCopy, validateAutoBattlerHero, validateAutoBattlerMinion, validateCard, validatePlayerLeveling } from '@kartishki/shared';
import { openDatabase, migratePlayers } from './database';
import { PlayerStore } from './players';
import { playerApi } from './playerApi';
import { portraitAssets } from './portraitAssets';
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
app.use('/api/portraits', portraitAssets());
app.get('/api/catalog', (_req, res) => res.json(catalogStore.snapshot()));
app.put('/api/catalog', express.json({ limit: '7mb' }), (req, res) => {
  if (!validateCard(req.body?.card) || !Number.isInteger(req.body?.version)) { res.status(400).json({ error: 'invalidCard' }); return; }
  try { res.json(catalogStore.publish(req.body.card, req.body.version)); }
  catch (error) { const reason = error instanceof Error ? error.message : ''; res.status(reason === 'catalogConflict' ? 409 : 500).json({ error: reason === 'catalogConflict' ? reason : 'publishError' }); }
});
app.put('/api/heroes', express.json({ limit: '3mb' }), (req, res) => {
  if (!Number.isInteger(req.body?.version)) { res.status(400).json({ error: 'invalidHero' }); return; }
  try { res.json(catalogStore.publishHero(req.body.hero, req.body.version)); }
  catch (error) { const reason = error instanceof Error ? error.message : 'publishError'; res.status(reason === 'catalogConflict' ? 409 : 400).json({ error: reason }); }
});
app.put('/api/auto-battler', express.json({ limit: '7mb' }), (req, res) => {
  if (!Number.isInteger(req.body?.version) || !validateAutoBattlerMinion(req.body?.minion)) { res.status(400).json({ error: 'invalidCard' }); return; }
  try { res.json(catalogStore.publishAutoBattlerMinion(req.body.minion, req.body.version)); }
  catch (error) { const reason = error instanceof Error ? error.message : 'publishError'; res.status(reason === 'catalogConflict' ? 409 : 400).json({ error: reason }); }
});
app.put('/api/auto-battler-heroes', express.json({ limit: '7mb' }), (req, res) => {
  if (!Number.isInteger(req.body?.version) || !validateAutoBattlerHero(req.body?.hero)) { res.status(400).json({ error: 'invalidHero' }); return; }
  try { res.json(catalogStore.publishAutoBattlerHero(req.body.hero, req.body.version)); }
  catch (error) { const reason = error instanceof Error ? error.message : 'publishError'; res.status(reason === 'catalogConflict' ? 409 : 400).json({ error: reason }); }
});
app.put('/api/player-leveling', express.json({ limit: '64kb' }), (req, res) => {
  if (!Number.isInteger(req.body?.version) || !validatePlayerLeveling(req.body?.leveling)) { res.status(400).json({ error: 'invalidLeveling' }); return; }
  try { res.json(catalogStore.publishPlayerLeveling(req.body.leveling, req.body.version)); }
  catch (error) { const reason = error instanceof Error ? error.message : 'publishError'; res.status(reason === 'catalogConflict' ? 409 : 400).json({ error: reason }); }
});
app.put('/api/auto-battler-copy', express.json({ limit: '1mb' }), (req, res) => {
  if (!Number.isInteger(req.body?.version) || !validateAutoBattlerCopy(req.body?.copy)) { res.status(400).json({ error: 'invalidCard' }); return; }
  try { res.json(catalogStore.publishAutoBattlerCopy(req.body.copy, req.body.version)); }
  catch (error) { const reason = error instanceof Error ? error.message : 'publishError'; res.status(reason === 'catalogConflict' ? 409 : 400).json({ error: reason }); }
});
const server = new Server({ transport });
server.define('match', matchRoomWithPlayers(players));
server.define('autoBattler', AutoBattlerRoom).filterBy(['table']);
server.onShutdown(() => db.close());
await server.listen(Number(process.env.PORT ?? 2567), '127.0.0.1');
console.log('Colyseus listening on http://127.0.0.1:2567');
