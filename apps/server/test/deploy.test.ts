import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CatalogStore } from '../src/catalog';
import { catalogFile } from '../src/catalogFile';
import { allowedOrigins, colyseusOriginHeaders, corsAllowOrigin, tightenColyseusCors } from '../src/cors';
import { postgresPoolConfig } from '../src/database';
import { listenBind } from '../src/listenBind';

test('listen defaults to all interfaces and PORT 2567', () => {
  assert.deepEqual(listenBind({}), { port: 2567, host: '0.0.0.0' });
  assert.deepEqual(listenBind({ PORT: '10000', HOST: '127.0.0.1' }), { port: 10000, host: '127.0.0.1' });
});

test('CORS keeps Vite localhost and adds CORS_ORIGIN list', () => {
  const allowed = allowedOrigins('https://example.pages.dev, https://other.pages.dev/');
  assert.ok(allowed.includes('http://127.0.0.1:5173'));
  assert.ok(allowed.includes('https://example.pages.dev'));
  assert.equal(corsAllowOrigin('https://example.pages.dev', allowed), 'https://example.pages.dev');
  assert.equal(corsAllowOrigin('https://evil.example', allowed), undefined);
  assert.equal(colyseusOriginHeaders('https://evil.example', allowed)['Access-Control-Allow-Origin'], undefined);
  assert.equal(colyseusOriginHeaders('https://example.pages.dev', allowed)['Access-Control-Allow-Origin'], 'https://example.pages.dev');
});

test('Colyseus default * origin is removed so credentials stay safe', () => {
  const controller: { DEFAULT_CORS_HEADERS: Record<string, string>; getCorsHeaders: (headers: Headers) => Record<string, string> } = {
    DEFAULT_CORS_HEADERS: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': 'true' },
    getCorsHeaders: () => ({ 'Access-Control-Allow-Origin': 'https://evil.example' }),
  };
  tightenColyseusCors(controller);
  assert.equal(controller.DEFAULT_CORS_HEADERS['Access-Control-Allow-Origin'], undefined);
  const header = (origin: string) => ({ get: (name: string) => name.toLowerCase() === 'origin' ? origin : null }) as Headers;
  assert.equal(controller.getCorsHeaders(header('https://evil.example'))['Access-Control-Allow-Origin'], undefined);
  assert.equal(controller.getCorsHeaders(header('http://127.0.0.1:5173'))['Access-Control-Allow-Origin'], 'http://127.0.0.1:5173');
});

test('Neon-style URLs enable TLS; local postgres does not', () => {
  const neon = postgresPoolConfig('postgresql://USER:PASSWORD@ep-example.neon.tech/neondb?sslmode=require');
  assert.equal(neon.ssl && typeof neon.ssl === 'object' && 'rejectUnauthorized' in neon.ssl && neon.ssl.rejectUnauthorized, true);
  const local = postgresPoolConfig('postgres://localhost:5432/kartishki');
  assert.equal(local.ssl, undefined);
});

test('shipped catalog is the current local game content', () => {
  const file = catalogFile(undefined);
  assert.match(file.replaceAll('\\', '/'), /apps\/server\/data\/catalog\.json$/);
  const snap = new CatalogStore(file).snapshot();
  assert.ok(Number.isInteger(snap.version) && snap.version >= 1);
  assert.ok(snap.cards.length >= 1 && snap.cards.length <= 30);
  const root = dirname(file);
  for (const track of snap.menuMusic?.tracks ?? []) {
    assert.ok(existsSync(join(root, 'music', track.url.slice('/api/music/'.length))), track.url);
  }
  const portraits = new Set<string>();
  const walk = (value: unknown) => {
    if (typeof value === 'string') {
      const match = value.match(/\/api\/portraits\/([a-f0-9]{64}\.(?:png|jpeg|webp))/i);
      if (match) portraits.add(match[1]!);
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(snap);
  for (const name of portraits) assert.ok(existsSync(join(root, 'portraits', name)), name);
});
