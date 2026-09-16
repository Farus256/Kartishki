import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { starterCards, validateCard, starterHeroes, validateHero, starterAutoBattlerMinions, starterAutoBattlerHeroes, starterLeveling, validateAutoBattlerMinion, validateAutoBattlerHero, validateAutoBattlerCopy, resolveAutoBattlerCatalog, cardSetFromCatalog, setFairness, type CardDefinition } from '@kartishki/shared';
import { processPhoto } from '@kartishki/shared/photo';
import { CatalogStore } from '../src/catalog';
import { simulateEffect } from '../src/autoBattler/simulate';

function art(preset: CardDefinition['art']['preset'], extra: Partial<CardDefinition['art']> = {}): CardDefinition['art'] {
  return { url: '', crop: { x: 0, y: 0, size: 1 }, threshold: .5, contrast: 1, preset, saturation: 1, intensity: .55, ...extra };
}
function colorBlock(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data[i] = x < width / 2 ? 220 : 40; data[i + 1] = y < height / 2 ? 50 : 200; data[i + 2] = 110; data[i + 3] = 255;
  }
  return data;
}
function chroma(data: Uint8ClampedArray) {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
  return sum / (data.length / 4);
}

test('catalog validates, persists and isolates already pinned snapshots',()=>{
  const dir=mkdtempSync(join(tmpdir(),'kartishki-test-')); const file=join(dir,'catalog.json');
  try { const store=new CatalogStore(file), pinned=store.snapshot(), card=structuredClone(starterCards[0]); card.name.ru='Обновлено';
    assert.ok(starterCards.every(validateCard)); assert.equal(store.publish(card,1).version,2);
    assert.notEqual(pinned.cards[0].name.ru,card.name.ru); assert.equal(new CatalogStore(file).snapshot().cards.at(-1)!.name.ru,card.name.ru);
    assert.throws(()=>store.publish(card,1),/catalogConflict/);
    for(const patch of [{cost:NaN},{attack:-1},{health:0},{id:'../bad'},{properties:['unknown']},{abilities:[{trigger:'battlecry',effectId:'eval',params:{target:'self',amount:1}}]}]) assert.equal(validateCard({...card,...patch}),false);
  } finally { rmSync(file,{force:true}); rmdirSync(dir); }
});

test('color photo presets stay chromatic, skip none, and stay deterministic', () => {
  const source = colorBlock(16, 16);
  const none = source.slice(); processPhoto(none, 16, art('none')); assert.deepEqual(none, source);
  for (const preset of ['offset', 'flash', 'toon', 'gif', 'xerox'] as const) {
    const data = source.slice(), copy = source.slice();
    processPhoto(data, 16, art(preset)); processPhoto(copy, 16, art(preset));
    assert.deepEqual(data, copy);
    assert.ok(chroma(data) > 12, preset);
    assert.equal(data[3], 255);
  }
  const gif = source.slice(); processPhoto(gif, 16, art('gif', { intensity: 1 }));
  const colors = new Set(Array.from({ length: 256 }, (_, p) => `${gif[p*4]},${gif[p*4+1]},${gif[p*4+2]}`));
  assert.ok(colors.size <= 64);
  const loud = source.slice(), quiet = source.slice();
  processPhoto(loud, 16, art('offset', { intensity: 1 })); processPhoto(quiet, 16, art('offset', { intensity: 0.1 }));
  assert.notDeepEqual(loud, quiet);
  const hot = source.slice(), mild = source.slice();
  processPhoto(hot, 16, art('flash', { saturation: 2 })); processPhoto(mild, 16, art('flash', { saturation: 0.2 }));
  assert.notDeepEqual(hot, mild);
});

test('photo settings survive validation and reject invalid controls', () => {
  const card = structuredClone(starterCards[0]);
  card.art = { ...card.art, preset: 'toon', saturation: 1.2, intensity: .7 };
  assert.ok(validateCard(JSON.parse(JSON.stringify(card))));
  card.art = { ...card.art, preset: 'comic', edgeWidth: 3, rasterIntensity: .7 };
  assert.ok(validateCard(JSON.parse(JSON.stringify(card))));
  for (const patch of [{ preset: 'unknown' }, { saturation: 3 }, { intensity: NaN }, { edgeWidth: 5 }, { rasterIntensity: NaN }]) {
    assert.equal(validateCard({ ...card, art: { ...card.art, ...patch } }), false);
  }
});

test('heroes and summon settings validate, persist and leave pinned matches unchanged', () => {
  const dir=mkdtempSync(join(tmpdir(),'kartishki-heroes-')), file=join(dir,'catalog.json');
  try {
    const store=new CatalogStore(file), pinned=store.snapshot(), hero=structuredClone(starterHeroes[0]);
    hero.health=42; hero.ability={name:'Подмога',cost:2,effectId:'summon',amount:2,cardId:'paper-imp'};
    assert.ok(validateHero(hero)); const next=store.publishHero(hero,pinned.version); assert.equal(next.version,pinned.version+1);
    assert.equal(new CatalogStore(file).snapshot().heroes!.find(h=>h.id===hero.id)!.health,42);
    assert.equal(pinned.heroes!.find(h=>h.id===hero.id)!.health,30);
    assert.throws(()=>store.publishHero(hero,pinned.version),/catalogConflict/);
    assert.equal(validateHero({...hero,health:0}),false); assert.equal(validateHero({...hero,ability:{...hero.ability,amount:8}}),false);
    assert.throws(()=>store.publishHero({...hero,ability:{...hero.ability,cardId:'missing'}},next.version),/invalidHero/);
    const card=structuredClone(starterCards[0]); card.abilities=[{name:'Позови друзей',trigger:'deathrattle',effectId:'summon',params:{cardId:card.id,amount:2}}];
    assert.ok(validateCard(card)); assert.ok(store.publish(card,next.version));
    assert.equal(validateCard({...card,abilities:[{...card.abilities[0],params:{cardId:'../bad',amount:2}}]}),false);
  } finally { rmSync(file,{force:true}); rmdirSync(dir); }
});

test('auto-battler minions validate, persist and reach new rooms', () => {
  const dir=mkdtempSync(join(tmpdir(),'kartishki-ab-')), file=join(dir,'catalog.json');
  try {
    const store=new CatalogStore(file), pinned=store.snapshot(), minion=structuredClone(starterAutoBattlerMinions.find(m=>m.id==='ab-whelp')!);
    minion.attack=7; minion.health=4;
    assert.ok(validateAutoBattlerMinion(minion));
    const next=store.publishAutoBattlerMinion(minion,pinned.version);
    assert.equal(next.version,pinned.version+1);
    assert.equal(next.autoBattlerMinions!.find(m=>m.id==='ab-whelp')!.attack,7);
    assert.equal(pinned.autoBattlerMinions!.find(m=>m.id==='ab-whelp')!.attack,2);
    assert.equal(new CatalogStore(file).snapshot().autoBattlerMinions!.find(m=>m.id==='ab-whelp')!.attack,7);
    assert.throws(()=>store.publishAutoBattlerMinion(minion,pinned.version),/catalogConflict/);
    assert.equal(validateAutoBattlerMinion({...minion,tavernTier:8}),false);
    assert.throws(()=>store.publishAutoBattlerMinion({...minion,deathrattle:{summonId:'missing',count:1}},next.version),/invalidCard/);
    const resolved=resolveAutoBattlerCatalog(next);
    assert.equal(resolved.minions.find(m=>m.id==='ab-whelp')!.attack,7);
    assert.equal(resolved.minions.find(m=>m.id==='ab-whelp')!.health,4);
  } finally { rmSync(file,{force:true}); rmdirSync(dir); }
});

test('auto-battler heroes validate, persist and reach new rooms', () => {
  const dir=mkdtempSync(join(tmpdir(),'kartishki-abh-')), file=join(dir,'catalog.json');
  try {
    const store=new CatalogStore(file), pinned=store.snapshot(), hero=structuredClone(starterAutoBattlerHeroes.find(h=>h.id==='ab-hero-captain')!);
    hero.health=35; hero.name={ru:'Капитан',en:'Skipper'};
    assert.ok(validateAutoBattlerHero(hero));
    const next=store.publishAutoBattlerHero(hero,pinned.version);
    assert.equal(next.version,pinned.version+1);
    assert.equal(next.autoBattlerHeroes!.find(h=>h.id==='ab-hero-captain')!.health,35);
    assert.equal(pinned.autoBattlerHeroes!.find(h=>h.id==='ab-hero-captain')!.health,40);
    assert.equal(new CatalogStore(file).snapshot().autoBattlerHeroes!.find(h=>h.id==='ab-hero-captain')!.health,35);
    assert.throws(()=>store.publishAutoBattlerHero(hero,pinned.version),/catalogConflict/);
    assert.equal(validateAutoBattlerHero({...hero,health:0}),false);
    assert.equal(validateAutoBattlerHero({...hero,power:{...hero.power,id:'ab-power-missing'}}),false);
    assert.equal(validateAutoBattlerHero({...hero,power:{...hero.power,targeted:true,targetDomain:'board'}}),false);
    const resolved=resolveAutoBattlerCatalog(next);
    assert.equal(resolved.heroes.find(h=>h.id==='ab-hero-captain')!.health,35);
    assert.equal(resolved.heroes.find(h=>h.id==='ab-hero-captain')!.name.en,'Skipper');
  } finally { rmSync(file,{force:true}); rmdirSync(dir); }
});

test('auto-battler copy and minion descriptions persist', () => {
  const dir=mkdtempSync(join(tmpdir(),'kartishki-abc-')), file=join(dir,'catalog.json');
  try {
    const store=new CatalogStore(file), pinned=store.snapshot();
    const minion=structuredClone(starterAutoBattlerMinions.find(m=>m.id==='ab-whelp')!);
    minion.description={ru:'Маленький зверёк с огнём.',en:'A tiny fire beast.'};
    const afterMinion=store.publishAutoBattlerMinion(minion,pinned.version);
    assert.equal(afterMinion.autoBattlerMinions!.find(m=>m.id==='ab-whelp')!.description?.ru,'Маленький зверёк с огнём.');
    const copy={tribes:{beast:{name:{ru:'Зверьки',en:'Critters'},description:{ru:'Мохнатые.',en:'Furred.'}}}};
    const next=store.publishAutoBattlerCopy(copy,afterMinion.version);
    assert.equal(next.autoBattlerCopy!.tribes!.beast!.name.ru,'Зверьки');
    assert.equal(new CatalogStore(file).snapshot().autoBattlerCopy!.tribes!.beast!.name.ru,'Зверьки');
    assert.equal(resolveAutoBattlerCatalog(next).copy!.tribes!.beast!.name.ru,'Зверьки');
    assert.equal(validateAutoBattlerCopy({keywords:{taunt:{name:{ru:'',en:''}}}}),false);
  } finally { rmSync(file,{force:true}); rmdirSync(dir); }
});

test('player leveling names and xp persist for new clients', () => {
  const dir=mkdtempSync(join(tmpdir(),'kartishki-lvl-')), file=join(dir,'catalog.json');
  try {
    const store=new CatalogStore(file), pinned=store.snapshot();
    assert.equal(pinned.playerLeveling!.levels.length,100);
    const leveling=structuredClone(starterLeveling);
    leveling.levels[0] = { ru: 'Чернильный птенец', en: 'Ink chick', xp: 12 };
    leveling.battlegroundsElo = 48;
    const next=store.publishPlayerLeveling(leveling,pinned.version);
    assert.equal(next.version,pinned.version+1);
    assert.equal(next.playerLeveling!.battlegroundsElo,48);
    assert.equal(next.playerLeveling!.levels[0]!.ru,'Чернильный птенец');
    assert.equal(next.playerLeveling!.levels[0]!.xp,12);
    assert.equal(pinned.playerLeveling!.levels[0]!.xp,starterLeveling.levels[0]!.xp);
    assert.equal(new CatalogStore(file).snapshot().playerLeveling!.levels[0]!.ru,'Чернильный птенец');
    assert.throws(()=>store.publishPlayerLeveling(leveling,pinned.version),/catalogConflict/);
    assert.throws(()=>store.publishPlayerLeveling({levels:leveling.levels.slice(0,10)},next.version),/invalidLeveling/);
  } finally { rmSync(file,{force:true}); rmdirSync(dir); }
});

test('menu music playlist persists for the client menu', () => {
  const dir=mkdtempSync(join(tmpdir(),'kartishki-music-')), file=join(dir,'catalog.json');
  try {
    const store=new CatalogStore(file), pinned=store.snapshot();
    const hash='ab'.repeat(32);
    const music={tracks:[{id:'intro',name:'Интро',url:`/api/music/${hash}.mp3`}]};
    const next=store.publishMenuMusic(music,pinned.version);
    assert.equal(next.menuMusic!.tracks[0]!.name,'Интро');
    assert.equal(new CatalogStore(file).snapshot().menuMusic!.tracks[0]!.url,`/api/music/${hash}.mp3`);
    assert.throws(()=>store.publishMenuMusic({tracks:[{id:'x',name:'bad',url:'http://evil/x.mp3'}]},next.version),/invalidAudio/);
  } finally { rmSync(file,{force:true}); rmdirSync(dir); }
});

test('1v1 shop config persists for the client shop', () => {
  const dir=mkdtempSync(join(tmpdir(),'kartishki-shop-')), file=join(dir,'catalog.json');
  try {
    const store=new CatalogStore(file), pinned=store.snapshot();
    assert.equal(pinned.shop!.products[0]!.id,'wheel');
    const shop=structuredClone(pinned.shop!);
    shop.products[0] = { ...shop.products[0]!, cost: 90 };
    shop.sellPrices = [6, 21, 61, 181, 501];
    const next=store.publishShop(shop,pinned.version);
    assert.equal(next.shop!.products[0]!.cost,90);
    assert.equal(next.shop!.sellPrices[0],6);
    assert.equal(new CatalogStore(file).snapshot().shop!.products[0]!.cost,90);
    assert.throws(()=>store.publishShop(shop,pinned.version),/catalogConflict/);
  } finally { rmSync(file,{force:true}); rmdirSync(dir); }
});

test('workshop card sets publish once fair, are refused when broken, and reach the lobby list', () => {
  const dir=mkdtempSync(join(tmpdir(),'kartishki-test-')); const file=join(dir,'catalog.json');
  try {
    const store=new CatalogStore(file);
    const set=cardSetFromCatalog(resolveAutoBattlerCatalog(store.snapshot()),'my-set',{ru:'Мой набор',en:'My set'},'me');
    const snap=store.publishCardSet(set,store.snapshot().version);
    assert.equal(snap.cardSets?.length,1); assert.equal(snap.cardSets![0]!.version,1);
    assert.equal(new CatalogStore(file).snapshot().cardSets?.[0]?.id,'my-set');
    const again=store.publishCardSet({...set,name:{ru:'Ещё',en:'Again'}},snap.version);
    assert.equal(again.cardSets![0]!.version,2,'republishing bumps the set version');
    const monster={...set.minions.find(m=>!m.token&&!m.spell)!,id:'monster',attack:12,health:12,keywords:['divineShield' as const,'poisonous' as const,'windfury' as const]};
    assert.equal(setFairness([...set.minions,monster]).grade,'broken');
    assert.throws(()=>store.publishCardSet({...set,id:'broken-set',minions:[...set.minions,monster]},again.version),/unfairSet/);
    assert.throws(()=>store.publishCardSet(set,1),/catalogConflict/);
    const gone=store.removeCardSet('my-set',again.version);
    assert.equal(gone.cardSets?.length,0);
  } finally { rmSync(file,{force:true}); rmdirSync(dir); }
});

test('the scenario simulator replays a trigger step by step on a sample board', () => {
  const store=new CatalogStore(join(tmpdir(),'kartishki-missing-catalog.json'));
  const houndmaster=starterAutoBattlerMinions.find(m=>m.id==='ab-houndmaster')!;
  const result=simulateEffect(store.snapshot(),{ minion: houndmaster, board: ['ab-whelp','ab-ward'], trigger: 'battlecry', at: 2 });
  assert.equal(result.fired,true); assert.equal(result.steps.length,1);
  const step=result.steps[0]!;
  assert.equal(step.targets.length,1);
  const buffed=step.board.find(b=>step.targets.includes(b.id))!;
  assert.equal(buffed.cardId,'ab-whelp','the only friendly pig gets the +2/+2');
  assert.equal(buffed.attack,4);
  assert.equal(simulateEffect(store.snapshot(),{ minion: houndmaster, board: ['ab-ward'], trigger: 'endTurn' }).fired,false,'a trigger the card lacks does nothing');
  assert.throws(()=>simulateEffect(store.snapshot(),{ minion: { ...houndmaster, attack: -1 }, trigger: 'battlecry' }),/invalidCard/);
});
