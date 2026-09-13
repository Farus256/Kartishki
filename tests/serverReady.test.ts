import assert from 'node:assert/strict';
import test from 'node:test';
import { healthUrl, probeServerHealth } from '../apps/client/src/serverReady';

test('health probe accepts only HTTP 200 with status ok and hides network failures', async () => {
  assert.equal(healthUrl('https://api.example/'), 'https://api.example/health');
  const ok = await probeServerHealth('http://127.0.0.1:2567', async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
  assert.equal(ok, true);
  const wrong = await probeServerHealth('http://127.0.0.1:2567', async () => new Response(JSON.stringify({ status: 'starting' }), { status: 200 }));
  assert.equal(wrong, false);
  const down = await probeServerHealth('http://127.0.0.1:2567', async () => new Response('starting', { status: 503 }));
  assert.equal(down, false);
  const offline = await probeServerHealth('http://127.0.0.1:2567', async () => { throw new TypeError('Failed to fetch'); });
  assert.equal(offline, false);
});
