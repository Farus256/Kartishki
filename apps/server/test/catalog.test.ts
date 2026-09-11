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
  assert.deepEqual([...input],[24,24,24,255,224,224,224,255,224,224,224,255]);
});
