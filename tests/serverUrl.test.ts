import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveServerOrigin, serverGateRequired } from '../apps/client/src/serverUrl';

test('server origin defaults to local Colyseus and upgrades WSS on HTTPS pages', () => {
  assert.equal(resolveServerOrigin(undefined, 'http:'), 'http://127.0.0.1:2567');
  assert.equal(resolveServerOrigin('https://example.onrender.com/', 'https:'), 'https://example.onrender.com');
  assert.equal(resolveServerOrigin('wss://example.onrender.com', 'https:'), 'https://example.onrender.com');
  assert.equal(resolveServerOrigin('http://example.onrender.com', 'https:'), 'https://example.onrender.com');
  assert.equal(resolveServerOrigin('http://127.0.0.1:2567', 'https:'), 'http://127.0.0.1:2567');
});

test('loopback servers skip the wake gate', () => {
  assert.equal(serverGateRequired('http://127.0.0.1:2567'), false);
  assert.equal(serverGateRequired('http://localhost:2567'), false);
  assert.equal(serverGateRequired('https://kartishki.example'), true);
});
