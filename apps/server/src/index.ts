import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { matchRoomWithPlayers } from './MatchRoom';
import { autoBattlerRoomWithPlayers } from './autoBattler/AutoBattlerRoom';
import express from 'express';
import { catalogStore } from './catalog';
import { setFairness, validateAutoBattlerCopy, validateAutoBattlerHero, validateAutoBattlerMinion, validateCard, validateCardSet, validateMenuMusic, validatePlayerLeveling, validateShopConfig } from '@kartishki/shared';
import { simulateEffect } from './autoBattler/simulate';
import { musicAssets } from './musicAssets';
import { openDatabase, migratePlayers } from './database';
import { PlayerStore } from './players';
import { playerApi } from './playerApi';
import { portraitAssets } from './portraitAssets';
import { corsAllowOrigin, tightenColyseusCors } from './cors';
import { listenBind } from './listenBind';
tightenColyseusCors(matchMaker.controller);
const db = await openDatabase(process.env.DATABASE_URL, process.env.PLAYER_DATA_DIR);
await migratePlayers(db);
const players = new PlayerStore(db);
const transport = new WebSocketTransport({ maxPayload: 4096 });
const app = transport.getExpressApp();
app.set('trust proxy', 1);
app.use((req, res, next) => {
  const allow = corsAllowOrigin(req.headers.origin);
  if (allow) {
    res.setHeader('Access-Control-Allow-Origin', allow);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});
app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
app.use('/api/players', playerApi(players,catalogStore));
app.use('/api/portraits', portraitAssets());
app.use('/api/music', musicAssets());
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
app.put('/api/shop', express.json({ limit: '64kb' }), (req, res) => {
  if (!Number.isInteger(req.body?.version) || !validateShopConfig(req.body?.shop)) { res.status(400).json({ error: 'invalidShop' }); return; }
  try { res.json(catalogStore.publishShop(req.body.shop, req.body.version)); }
  catch (error) { const reason = error instanceof Error ? error.message : 'publishError'; res.status(reason === 'catalogConflict' ? 409 : 400).json({ error: reason }); }
});
app.put('/api/menu-music', express.json({ limit: '32kb' }), (req, res) => {
  if (!Number.isInteger(req.body?.version) || !validateMenuMusic(req.body?.menuMusic)) { res.status(400).json({ error: 'invalidAudio' }); return; }
  try { res.json(catalogStore.publishMenuMusic(req.body.menuMusic, req.body.version)); }
  catch (error) { const reason = error instanceof Error ? error.message : 'publishError'; res.status(reason === 'catalogConflict' ? 409 : 400).json({ error: reason }); }
});
// Workshop card sets: the list the lobby shows, one full set for the editor, publish (fairness-gated) and remove.
app.get('/api/card-sets', (_req, res) => res.json(catalogStore.cardSetSummaries()));
app.get('/api/card-sets/:id', (req, res) => {
  const set = catalogStore.cardSet(req.params.id);
  if (!set) { res.status(404).json({ error: 'invalidSet' }); return; }
  res.json({ set, fairness: setFairness(set.minions) });
});
app.put('/api/card-sets', express.json({ limit: '4mb' }), (req, res) => {
  if (!Number.isInteger(req.body?.version) || !validateCardSet(req.body?.set)) { res.status(400).json({ error: 'invalidSet' }); return; }
  try { res.json(catalogStore.publishCardSet(req.body.set, req.body.version)); }
  catch (error) { const reason = error instanceof Error ? error.message : 'publishError'; res.status(reason === 'catalogConflict' ? 409 : reason === 'unfairSet' ? 422 : 400).json({ error: reason, ...(reason === 'unfairSet' ? { fairness: setFairness(req.body.set.minions) } : {}) }); }
});
app.delete('/api/card-sets/:id', express.json({ limit: '4kb' }), (req, res) => {
  if (!Number.isInteger(req.body?.version)) { res.status(400).json({ error: 'invalidSet' }); return; }
  try { res.json(catalogStore.removeCardSet(req.params.id, req.body.version)); }
  catch (error) { const reason = error instanceof Error ? error.message : 'publishError'; res.status(reason === 'catalogConflict' ? 409 : 400).json({ error: reason }); }
});
// Deck fairness verdict for a draft set (the editor asks before publishing).
app.post('/api/fairness', express.json({ limit: '4mb' }), (req, res) => {
  const minions = Array.isArray(req.body?.minions) ? req.body.minions : [];
  if (!minions.every(validateAutoBattlerMinion)) { res.status(400).json({ error: 'invalidCard' }); return; }
  res.json(setFairness(minions));
});
// Scenario step-through: runs one card's trigger on a sample board with the real interpreter and returns every step.
app.post('/api/simulate-effect', express.json({ limit: '256kb' }), (req, res) => {
  try { res.json(simulateEffect(catalogStore.snapshot(), req.body)); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'invalidRequest' }); }
});
app.put('/api/auto-battler-copy', express.json({ limit: '1mb' }), (req, res) => {
  if (!Number.isInteger(req.body?.version) || !validateAutoBattlerCopy(req.body?.copy)) { res.status(400).json({ error: 'invalidCard' }); return; }
  try { res.json(catalogStore.publishAutoBattlerCopy(req.body.copy, req.body.version)); }
  catch (error) { const reason = error instanceof Error ? error.message : 'publishError'; res.status(reason === 'catalogConflict' ? 409 : 400).json({ error: reason }); }
});
const server = new Server({ transport });
server.define('match', matchRoomWithPlayers(players));
server.define('autoBattler', autoBattlerRoomWithPlayers(players)).filterBy(['table', 'set']);
server.onShutdown(() => db.close());
const { port, host } = listenBind();
await server.listen(port, host);
console.log(`Colyseus listening on http://${host}:${port}`);
