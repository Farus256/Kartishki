import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { COSMETICS, HERO_SLAMS, NAME_FX, PORTRAIT_FX, cosmeticTier, portraitFxOwned, resolveSettings, validateSettingsPatch } from '@kartishki/shared';
import { HIT_EFFECTS } from '../apps/client/src/cosmetics/hitEffects';

test('every hero slam on sale has a hit-effect config, and every config is on sale', () => {
  for (const slam of HERO_SLAMS) assert.ok(HIT_EFFECTS[slam.id], `${slam.id} has no renderer config`);
  for (const id of Object.keys(HIT_EFFECTS)) assert.ok(HERO_SLAMS.some(s => s.id === id), `${id} is not sold`);
  for (const [id, cfg] of Object.entries(HIT_EFFECTS)) {
    assert.ok(cfg.duration >= 700 && cfg.duration <= 1300, `${id}: a hit must stay short`);
    assert.ok(cfg.particle.count <= 30, `${id}: particle budget`);
  }
});

test('cosmetic ids are unique across kinds and tiers follow price', () => {
  assert.equal(new Set(COSMETICS.map(c => c.id)).size, COSMETICS.length);
  assert.ok(PORTRAIT_FX.length >= 4 && NAME_FX.length >= 8);
  assert.equal(cosmeticTier(900), 'common');
  assert.equal(cosmeticTier(1500), 'rare');
  assert.equal(cosmeticTier(4500), 'epic');
  assert.equal(cosmeticTier(8000), 'legendary');
});

test('portrait auras persist through settings and need their unlock', () => {
  assert.equal(resolveSettings({ portraitFx: 'aura-halo' }).portraitFx, 'aura-halo');
  assert.deepEqual(validateSettingsPatch({ portraitFx: 'aura-halo' }), { portraitFx: 'aura-halo' });
  assert.equal(validateSettingsPatch({ portraitFx: 'Aura Halo!' }), undefined);
  assert.equal(portraitFxOwned('aura-halo', []), false);
  assert.equal(portraitFxOwned('aura-halo', ['aura-halo']), true);
  assert.equal(portraitFxOwned('', []), true);
});
