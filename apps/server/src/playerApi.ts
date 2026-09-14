import express from 'express';
import { resolveShop } from '@kartishki/shared';
import { PlayerError, type PlayerStore } from './players';
import type { CatalogStore } from './catalog';

export function playerApi(store: PlayerStore, catalog: CatalogStore) {
  const router = express.Router();
  router.use(express.json({ limit: '16kb' }));
  const attempts = new Map<string, { count: number; expires: number }>();
  router.get('/ladder', async (_req, res) => { res.json(await store.ladder()); });
  for (const action of ['register','login'] as const) router.post(`/${action}`, async (req,res) => {
    const now = Date.now(), key = req.ip ?? 'unknown';
    for (const [ip, entry] of attempts) if (entry.expires <= now) attempts.delete(ip);
    const entry = attempts.get(key) ?? { count: 0, expires: now + 60_000 };
    attempts.set(key,entry);
    if (++entry.count > 20) { res.status(429).json({ error: 'tooManyAttempts' }); return; }
    res.status(action === 'register' ? 201 : 200).json(await store[action](req.body?.username,req.body?.password));
  });
  router.use(async (req,res,next) => {
    const token = req.headers.authorization?.replace(/^Bearer /,'');
    res.locals.playerId = await store.authenticate(token); res.locals.token = token; next();
  });
  router.get('/me', async (_req,res) => { res.json(await store.library(res.locals.playerId)); });
  router.post('/logout', async (_req,res) => { await store.logout(res.locals.token); res.sendStatus(204); });
  router.post('/daily', async (_req,res) => { res.json(await store.claimDaily(res.locals.playerId)); });
  router.post('/wallet', async (req,res) => { res.json(await store.changeCurrency(res.locals.playerId, req.body?.delta)); });
  router.post('/settings', async (req,res) => { res.json(await store.saveSettings(res.locals.playerId, req.body)); });
  router.post('/packs', async (_req,res) => {
    const snap = catalog.snapshot();
    res.json(await store.openPack(res.locals.playerId, snap.cards, resolveShop(snap.shop).sellPrices));
  });
  router.post('/cases', async (_req,res) => {
    const snap = catalog.snapshot();
    res.json(await store.openCase(res.locals.playerId, snap.cards, resolveShop(snap.shop).sellPrices));
  });
  router.post('/shop', async (req,res) => {
    const snap = catalog.snapshot();
    res.json(await store.shop(res.locals.playerId, snap.cards, resolveShop(snap.shop), req.body));
  });
  router.post('/xp', async (req,res) => { res.json(await store.addXp(res.locals.playerId, req.body?.amount)); });
  router.put('/decks', async (req,res) => { res.json(await store.saveDeck(res.locals.playerId,req.body,catalog.snapshot().cards)); });
  router.delete('/decks/:id', async (req,res) => { await store.deleteDeck(res.locals.playerId,req.params.id,req.body?.version); res.sendStatus(204); });
  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof PlayerError) { res.status(error.status).json({ error: error.code }); return; }
    const status = (error as { status?: number }).status;
    if (status === 400 || status === 413) { res.status(status).json({ error: 'invalidRequest' }); return; }
    console.error('Player API request failed', error); res.status(500).json({ error: 'playerServerError' });
  });
  return router;
}
