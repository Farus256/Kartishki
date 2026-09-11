import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { starterCards, validateCard } from '@kartishki/shared';
import { inkPixels } from '@kartishki/shared/photo';
import { CatalogStore } from '../src/catalog';
test('catalog validates, persists and isolates already pinned snapshots',()=>{
  const dir=mkdtempSync(join(tmpdir(),'kartishki-test-')); const file=join(dir,'catalog.json');
  try { const store=new CatalogStore(file), pinned=store.snapshot(), card=structuredClone(starterCards[0]); card.name.ru='Обновлено';
    assert.ok(starterCards.every(validateCard)); assert.equal(store.publish(card,1).version,2);
    assert.notEqual(pinned.cards[0].name.ru,card.name.ru); assert.equal(new CatalogStore(file).snapshot().cards.at(-1)!.name.ru,card.name.ru);
    assert.throws(()=>store.publish(card,1),/catalogConflict/);
    for(const patch of [{cost:NaN},{attack:-1},{health:0},{id:'../bad'},{properties:['unknown']},{abilities:[{trigger:'battlecry',effectId:'eval',params:{target:'self',amount:1}}]}]) assert.equal(validateCard({...card,...patch}),false);
  } finally { rmSync(file,{force:true}); rmdirSync(dir); }
});
test('ink filter is deterministic, opaque and preserves dark/light ordering',()=>{
  const input=new Uint8ClampedArray([0,0,0,255,255,255,255,255,0,0,0,0]); const copy=input.slice();
  inkPixels(input,3,1.5,.5); inkPixels(copy,3,1.5,.5); assert.deepEqual(input,copy);
  assert.deepEqual([...input],[26,26,26,255,239,236,228,255,239,236,228,255]);
});

test('photo presets keep the paper palette, three comic tones and adjustable raster', () => {
  const source = new Uint8ClampedArray(Array.from({ length: 64 }, (_, p) => [p * 4, p * 4, p * 4, 255]).flat());
  for (const preset of ['xerox', 'comic', 'stencil'] as const) {
    const data = source.slice(); inkPixels(data, 8, 1, .5, preset, 0, .8);
    const colors = new Set(Array.from({ length: 64 }, (_, p) => [...data.slice(p*4,p*4+4)].join(',')));
    assert.equal(colors.size, preset === 'comic' ? 3 : 2);
    assert.ok(colors.has('26,26,26,255')); assert.ok(colors.has('239,236,228,255'));
  }
  const raster = source.slice(), plain = source.slice();
  inkPixels(raster, 8, 1, .5, 'xerox', 1, 1); inkPixels(plain, 8, 1, .5, 'xerox', 1, 0);
  assert.notDeepEqual(raster, plain);
  const edgeSource = new Uint8ClampedArray(Array.from({ length: 512 * 8 }, (_, p) => p%512<256 ? [90,90,90,255] : [240,240,240,255]).flat());
  const thin = edgeSource.slice(), thick = edgeSource.slice();
  inkPixels(thin,512,1,.3,'comic',1); inkPixels(thick,512,1,.3,'comic',4);
  const dark = (data: Uint8ClampedArray) => data.filter((v,i) => i%4===0 && v===26).length;
  assert.ok(dark(thick) > dark(thin));
});

test('photo settings survive validation and reject invalid controls', () => {
  const card = structuredClone(starterCards[0]);
  card.art = { ...card.art, preset: 'comic', edgeWidth: 3, rasterIntensity: .7 };
  assert.ok(validateCard(JSON.parse(JSON.stringify(card))));
  for (const patch of [{ preset: 'unknown' }, { edgeWidth: 5 }, { rasterIntensity: NaN }]) {
    assert.equal(validateCard({ ...card, art: { ...card.art, ...patch } }), false);
  }
});
