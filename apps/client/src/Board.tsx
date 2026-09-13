import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { useTranslation } from 'react-i18next';
import i18n from '@kartishki/i18n';
import { starterCards, type CardDefinition } from '@kartishki/shared';
import { renderPhoto } from '@kartishki/shared/photo';
import { session, type Minion } from './session';
import { deskTexture, ink, paper } from './ink';
import { CardInspect } from './ui/CardInspect';
import { cardRules } from './ui/cardText';
import { CARD_WIDTH, PORTRAIT_HEIGHT } from './ui/cardLayout';
import { audioManager } from './AudioManager';
import {
  BOARD_H, BOARD_W, CARD_H, CARD_W,
  handPos, heroPos, hitHero, hitMinionIndex, inPlayZone, minionPos,
} from './boardLayout';

type Inspect = { id: string; card: CardDefinition; x: number; minion?: Minion };
type Drag = {
  id: string; kind: 'hand' | 'minion'; node: Container;
  grabX: number; grabY: number; homeX: number; homeY: number; homeRot: number;
  originX: number; originY: number;
  enabled: boolean; moved: boolean; cursorX: number; cursorY: number;
};

export function Board() {
  const host = useRef<HTMLDivElement>(null); const [failed, setFailed] = useState(false); const [inspected, setInspected] = useState<Inspect>(); const { t } = useTranslation();
  useEffect(() => {
    const app = new Application(); let cancelled = false; let dispose = () => {};
    void (async () => {
      await Promise.all(['Neucha', 'PT Mono', 'Russo One'].map(font => document.fonts.load(`16px "${font}"`, 'Картишки Ready 123')));
      if (cancelled) return;
      const zoom = () => {
        const el = host.current; if (!el || !el.clientWidth) return 1;
        return el.getBoundingClientRect().width / el.clientWidth;
      };
      await app.init({
        resizeTo: host.current!, background: '#241f1c', antialias: true, preference: 'webgl',
        resolution: Math.min(3, Math.max(2, devicePixelRatio * zoom() * 1.5)), autoDensity: true, roundPixels: false,
      });
      if (cancelled) { app.destroy(true, { children: true }); return; }
      host.current!.appendChild(app.canvas);
      app.canvas.style.touchAction = 'none';
      const board = new Container(); board.sortableChildren = true; app.stage.addChild(board);
      app.stage.eventMode = 'static'; app.stage.hitArea = app.screen;
      const desk = deskTexture();
      const textures = new Map<string, Texture>(); const pending = new Set<string>();
      const textureKey = (c: Pick<CardDefinition, 'art'>) => JSON.stringify(c.art);
      let selected = ''; let shake = 0; let lastRevision = -1; let lastZoom = zoom();
      const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      let previousHealth = new Map<string, number>();
      const bursts: { x: number; y: number; label: string; color: number; born: number }[] = [];
      const poses = new Map<string, { x: number; y: number; rot: number }>();
      const arrivals = new Map<string, number>();
      let animated: { node: Container; x: number; y: number; rot: number; hover: boolean; start: number; id: string }[] = [];
      let positions = new Map<string, { x: number; y: number }>();
      let strike: { x: number; y: number; tx: number; ty: number; life: number } | undefined;
      let deaths: { x: number; y: number; life: number; texture?: Texture }[] = [];
      const ashes: { x: number; y: number }[] = [];
      // Aim arrows and impact debris must never intercept clicks on their targets.
      const scraps = new Container(); scraps.eventMode = 'none'; app.stage.addChild(scraps);
      const strokes = new Graphics(); strokes.eventMode = 'none'; app.stage.addChild(strokes);
      let drag: Drag | undefined; let suppressTap = false; let cursorX = 0; let cursorY = 0;
      const text = (label: string, x: number, y: number, size = 22, color = ink) => {
        const node = new Text({ text: label, style: { fontFamily: 'Neucha, Arial', fontSize: size, fill: color, wordWrap: true, wordWrapWidth: CARD_W - 20 } });
        node.position.set(x, y); node.roundPixels = false; node.resolution = 2; return node;
      };
      const ensureTexture = (c: Pick<CardDefinition, 'art'>) => {
        const key = textureKey(c);
        if (!textures.has(key) && !pending.has(key)) {
          pending.add(key);
          void renderPhoto(c.art, 768).then(canvas => { if (!cancelled) { textures.set(key, Texture.from(canvas)); if (!drag) draw(); } }).catch(() => {}).finally(() => pending.delete(key));
        }
      };
      function drop(localX: number, localY: number) {
        const d = drag; drag = undefined; if (!d) return;
        suppressTap = d.moved;
        if (!d.moved) { d.node.zIndex = 0; d.node.cursor = 'grab'; return; }
        const s = session.getSnapshot();
        if (d.kind === 'hand') {
          if (d.enabled && inPlayZone(localX, localY)) session.play(d.id);
        } else if (d.enabled) {
          const foes = s.minions.filter(m => m.owner !== s.sessionId);
          const idx = hitMinionIndex(localX, localY, foes.length, false);
          if (idx >= 0) session.attack(d.id, foes[idx]!.id);
          else {
            const enemy = s.players.find(p => p.id !== s.sessionId);
            if (enemy && foes.length === 0 && hitHero(localX, localY, false)) session.attack(d.id, enemy.id);
          }
        }
        draw();
      }
      function card(c: CardDefinition, x: number, y: number, rot: number, id: string, action: () => void, minion?: Minion, enabled = true, draggable = false) {
        ensureTexture(c);
        const cx = x + CARD_W / 2, cy = y + CARD_H / 2;
        const previous = poses.get(id);
        const node = new Container({ x: previous?.x ?? cx, y: previous?.y ?? cy + (motion.matches ? 0 : 34), rotation: previous?.rot ?? rot }); node.pivot.set(CARD_W / 2, CARD_H / 2);
        node.eventMode = 'static'; node.cursor = draggable ? 'grab' : enabled ? 'pointer' : 'default';
        const rarity = ({ common: 0x4B5563, rare: 0x2563EB, epic: 0x9333EA, legendary: 0xEAB308, ultimate: 0x06B6D4 })[c.rarity];
        if (enabled) node.addChild(new Graphics().roundRect(-4, -4, CARD_W + 8, CARD_H + 8, 12).fill({ color: selected === id ? 0xf1d28b : 0x86ba96, alpha: .2 }).stroke({ color: selected === id ? 0xf1d28b : 0x86ba96, width: 2 }));
        const frame = new Graphics()
          .roundRect(6, 8, CARD_W, CARD_H, 8).fill({ color: ink, alpha: .2 })
          .roundRect(0, 0, CARD_W, CARD_H, minion ? 10 : 6).fill(minion ? 0x1c1914 : paper).stroke({ color: selected === id ? 0xf1d28b : 0x817665, width: selected === id ? 5 : 3 });
        if (minion?.shield) frame.roundRect(-7, -7, CARD_W + 14, CARD_H + 14, 8).stroke({ color: 0xebcd83, width: 4 });
        node.addChild(frame);
        const artH = minion ? CARD_H - 8 : Math.round(PORTRAIT_HEIGHT * CARD_W / CARD_WIDTH);
        const tex = textures.get(textureKey(c));
        if (tex) {
          const image = new Sprite(tex);
          if (minion) { image.width = image.height = CARD_W - 8; image.position.set(4, 4 - (CARD_W - 8 - artH) / 2); }
          else { image.position.set(10, 10 - (CARD_W - 20 - artH) / 2); image.width = image.height = CARD_W - 20; }
          const mask = new Graphics().roundRect(minion ? 4 : 10, minion ? 4 : 10, minion ? CARD_W - 8 : CARD_W - 20, artH, minion ? 8 : 5).fill(0xffffff);
          node.addChild(image, mask); image.mask = mask;
        }
        if (minion) {
          node.addChild(new Graphics().poly([CARD_W / 2, 6, CARD_W / 2 + 9, 16, CARD_W / 2, 26, CARD_W / 2 - 9, 16]).fill(rarity).stroke({ color: 0xf3ead4, width: 1.5 }));
        } else {
          node.addChild(new Graphics().roundRect(10, 10 + artH, CARD_W - 20, 3, 1).fill(rarity)
            .poly([CARD_W / 2, 5 + artH, CARD_W / 2 + 7, 12 + artH, CARD_W / 2, 19 + artH, CARD_W / 2 - 7, 12 + artH]).fill(rarity));
          const name = text(c.name[i18n.language] || c.name.ru, 12, 22 + artH, 17);
          name.style.wordWrapWidth = CARD_W - 24; name.style.wordWrap = false; name.style.fontWeight = 'bold';
          if (name.width > CARD_W - 24) name.scale.x = (CARD_W - 24) / name.width;
          node.addChild(name);
          const rules = text(cardRules(c, i18n.t.bind(i18n), i18n.language, session.getSnapshot().cards), 12, 44 + artH, 11.5);
          rules.style.wordWrapWidth = CARD_W - 24; rules.style.lineHeight = 14;
          const rulesMask = new Graphics().rect(12, 44 + artH, CARD_W - 24, CARD_H - artH - 77).fill(0xffffff);
          node.addChild(rules, rulesMask); rules.mask = rulesMask;
        }
        const badge = (value: number, bx: number, by: number, color: number) => {
          node.addChild(new Graphics().roundRect(bx, by, 36, 36, 8).fill(color).stroke({ color: 0xf3ead4, width: 2 }));
          const label = text(String(value), bx + 8, by + 4, 22, paper); label.style.fontFamily = 'Russo One'; node.addChild(label);
        };
        if (!minion) badge(c.cost, -6, -6, 0x356858);
        badge(minion?.attack ?? c.attack, -6, CARD_H - 30, ink); badge(minion?.health ?? c.health, CARD_W - 30, CARD_H - 30, 0x9e4540);
        if (!minion) { const rarityLabel = text(i18n.t(c.rarity), 34, CARD_H - 18, 10, rarity); rarityLabel.style.wordWrapWidth = CARD_W - 68; rarityLabel.style.align = 'center'; node.addChild(rarityLabel); }
        if (minion && !minion.ready) node.addChild(text('zZ', CARD_W - 24, 16, 15, 0xece6d7));
        if (!arrivals.has(id)) arrivals.set(id, performance.now());
        const item = { node, x: cx, y: cy, rot, hover: false, start: arrivals.get(id)!, id }; animated.push(item);
        node.on('pointerover', () => { if (drag) return; item.hover = true; node.zIndex = 10; setInspected({ id, card: c, x, minion }); });
        node.on('pointerout', () => { item.hover = false; if (!drag) node.zIndex = 0; setInspected(prev => prev?.id === id ? undefined : prev); });
        node.on('pointertap', () => {
          if (suppressTap) { suppressTap = false; return; }
          setInspected({ id, card: c, x, minion });
          if (enabled) action();
        });
        if (draggable) {
          node.on('pointerdown', e => {
            if (e.button !== 0) return;
            const local = e.getLocalPosition(node); const boardP = e.getLocalPosition(board);
            drag = { id, kind: minion ? 'minion' : 'hand', node, grabX: local.x, grabY: local.y, homeX: cx, homeY: cy, homeRot: rot, originX: boardP.x, originY: boardP.y, enabled, moved: false, cursorX: boardP.x, cursorY: boardP.y };
            node.zIndex = 40; node.cursor = 'grabbing'; setInspected(undefined);
          });
        }
        board.addChild(node); positions.set(id, { x: cx, y: cy });
      }
      function draw() {
        if (cancelled) return;
        for (const item of animated) poses.set(item.id, { x: item.node.x, y: item.node.y, rot: item.node.rotation });
        drag = undefined;
        board.removeChildren().forEach(n => n.destroy({ children: true })); animated = []; positions = new Map();
        const s = session.getSnapshot();
        if (s.status === 'offline') { deaths = []; ashes.length = 0; previousHealth.clear(); bursts.length = 0; }
        const live = new Set([...s.hand.map(h => h.instanceId), ...s.minions.map(m => m.id), 'sample', 'sample-2', 'sample-3']);
        for (const id of arrivals.keys()) if (!live.has(id)) { arrivals.delete(id); poses.delete(id); }
        if (s.revision !== lastRevision) { selected = ''; lastRevision = s.revision; setInspected(undefined); }
        const bg = new Sprite(desk); bg.width = BOARD_W; bg.height = BOARD_H; board.addChild(bg);

        const active = s.status === 'active' && s.activePlayer === s.sessionId;
        const definitions = new Map(s.cards.map(c => [c.id, c]));
        for (const p of s.players) {
          const own = p.id === s.sessionId, h = heroPos(own);
          const hero = new Container({ x: h.x, y: h.y });
          const definition = s.heroes.find(h => h.id === p.heroId);
          const protectedHero = s.minions.some(m => m.owner === p.id);
          hero.addChild(new Graphics().roundRect(0, 0, h.w, h.h, 18).fill(0x1b2924).stroke({ color: s.activePlayer === p.id ? 0xdcc58a : 0x817665, width: 3 }));
          if (definition) {
            ensureTexture(definition); const texture = textures.get(textureKey(definition));
            if (texture) { const picture = new Sprite(texture); const size = own ? 100 : 54; picture.width = picture.height = size; picture.position.set(own ? 62 : 8, 7);
              const mask = new Graphics().roundRect(picture.x, picture.y, size, size, 12).fill(0xffffff); hero.addChild(picture, mask); picture.mask = mask; }
          }
          const label = text(definition?.name ?? i18n.t(own ? 'you' : 'opponent'), own ? 12 : 76, own ? 108 : 8, own ? 24 : 24, paper);
          label.style.wordWrapWidth = own ? h.w - 24 : 200; hero.addChild(label);
          const hpBox = new Graphics().roundRect(own ? 118 : 268, own ? 128 : 6, own ? 98 : 140, own ? 36 : 32, 10).fill(0x8d2f2c).stroke({ color: 0xf3ead4, width: 2 });
          hero.addChild(hpBox);
          const hp = text(`${p.health}`, own ? 128 : 278, own ? 130 : 6, own ? 30 : 26, 0xffe7c8); hp.style.fontFamily = 'Russo One'; hp.style.wordWrapWidth = 80; hero.addChild(hp);
          const hpMax = text(`/${p.maxHealth}`, own ? 168 : 328, own ? 140 : 14, 16, 0xf1b4a5); hpMax.style.fontFamily = 'Russo One'; hero.addChild(hpMax);
          const healthBar = new Graphics().roundRect(own ? 12 : 76, own ? 154 : 48, own ? 102 : 320, 10, 4).fill(0x492f2b);
          const healthWidth = (own ? 102 : 320) * Math.max(0, p.health / p.maxHealth);
          if (healthWidth > 0) healthBar.roundRect(own ? 12 : 76, own ? 154 : 48, healthWidth, 10, 4).fill(0xe07068); hero.addChild(healthBar);
          if (!own && protectedHero) hero.addChild(text('ЩИТ СУЩЕСТВ', 285, 38, 12, 0xb8c8b9));
          hero.eventMode = 'static'; hero.cursor = !own && selected && !protectedHero ? 'crosshair' : 'default';
          hero.on('pointertap', () => { if (!own && selected && !protectedHero) { if (selected === 'hero-power') session.power(p.id); else session.attack(selected, p.id); } });
          board.addChild(hero);
          const manaX = own ? 54 : h.x + h.w + 18, manaY = own ? 848 : 36;
          const crystals = new Graphics();
          for (let n = 0; n < 10; n++) { const mx = manaX + n * 26; crystals.poly([mx, manaY - 13, mx + 11, manaY, mx, manaY + 13, mx - 11, manaY]).fill(n < p.mana ? 0x6ec8f0 : 0x1c2c28).stroke({ color: 0xd7c89a, width: 1.5 }); }
          board.addChild(new Graphics().roundRect(manaX + 250, manaY - 22, 92, 42, 10).fill(0x16323c).stroke({ color: 0xd7c89a, width: 2 }));
          const manaLabel = text(`${p.mana}/10`, manaX + 260, manaY - 16, 26, 0xe8f6ff); manaLabel.style.fontFamily = 'Russo One';
          board.addChild(crystals, manaLabel);
          const pile = new Graphics();
          for (let n = 3; n >= 0; n--) pile.roundRect(BOARD_W - 125 + n * 3, (own ? 460 : 154) - n * 3, 64, 90, 7).fill(0x283b33).stroke({ color: 0xa88e5e, width: 2 });
          board.addChild(pile, text(String(p.deckCount), BOARD_W - 104, own ? 490 : 184, 22, paper));
          if (!own) for (let n = 0; n < p.handCount; n++) board.addChild(new Graphics().roundRect(100 + n * 22, -28 + Math.abs(n - (p.handCount - 1) / 2) * 2, 38, 76, 5).fill(0x293e34).stroke({ color: 0xab9165, width: 2 }));
          positions.set(p.id, { x: h.x + h.w / 2, y: h.y + h.h / 2 });
          const row = s.minions.filter(m => m.owner === p.id);
          row.forEach((m, n) => {
            const c = definitions.get(m.cardId); if (!c) return;
            const pose = minionPos(row.length, n, own);
            const canAttack = own && active && m.ready && m.attack > 0;
            card(c, pose.x, pose.y, 0, m.id, () => {
              if (canAttack) { selected = m.id; draw(); }
              else if (!own && selected) { if (selected === 'hero-power') session.power(m.id); else session.attack(selected, m.id); }
            }, m, canAttack || (!own && !!selected), canAttack);
          });
        }
        s.hand.forEach((h, n) => {
          const c = definitions.get(h.cardId); if (!c) return;
          const pose = handPos(s.hand.length, n);
          const canPlay = active && (s.players.find(p => p.id === s.sessionId)?.mana ?? 0) >= c.cost
            && s.minions.filter(m => m.owner === s.sessionId).length < 7;
          card(c, pose.x, pose.y, pose.rotation, h.instanceId, () => session.play(h.instanceId), undefined, canPlay, active);
        });
        if (!s.players.length) {
          const title = text(i18n.t('connectHint'), BOARD_W / 2 - 280, 120, 36); title.style.wordWrapWidth = 560; title.style.align = 'center'; board.addChild(title);
          card(starterCards[1], BOARD_W / 2 - CARD_W / 2 - 220, 270, -.08, 'sample-2', () => {}, undefined, false);
          card(starterCards[0], BOARD_W / 2 - CARD_W / 2, 248, 0, 'sample', () => {}, undefined, false);
          card(starterCards[4], BOARD_W / 2 - CARD_W / 2 + 220, 276, .07, 'sample-3', () => {}, undefined, false);
          const note = text(i18n.t('sampleNote'), BOARD_W / 2 - 160, 540, 26); note.style.wordWrapWidth = 320; note.rotation = -.04; board.addChild(note);
        }
        const healthNow = new Map([...s.players, ...s.minions].map(entity => [entity.id, entity.health]));
        for (const [id, hp] of healthNow) {
          const before = previousHealth.get(id), point = positions.get(id);
          if (before !== undefined && hp !== before && point) bursts.push({ ...point, label: `${hp > before ? '+' : ''}${hp - before}`, color: hp > before ? 0xa1dca8 : 0xffd493, born: performance.now() });
        }
        previousHealth = healthNow;
      }
      app.stage.on('globalpointermove', e => {
        const p = e.getLocalPosition(board);
        cursorX = p.x; cursorY = p.y;
        if (!drag) return;
        drag.cursorX = p.x; drag.cursorY = p.y;
        if (!drag.moved && Math.hypot(p.x - drag.originX, p.y - drag.originY) > 10) drag.moved = true;
        if (drag.moved && drag.kind === 'hand') {
          drag.node.position.set(p.x - drag.grabX + CARD_W / 2, p.y - drag.grabY + CARD_H / 2);
          drag.node.rotation = 0; drag.node.zIndex = 40;
        }
      });
      app.stage.on('pointerup', e => { if (drag) drop(e.getLocalPosition(board).x, e.getLocalPosition(board).y); });
      app.stage.on('pointerupoutside', e => { if (drag) drop(e.getLocalPosition(board).x, e.getLocalPosition(board).y); });
      const armPower = () => { selected = selected === 'hero-power' ? '' : 'hero-power'; draw(); };
      const cancelPower = (e: KeyboardEvent) => { if (e.key === 'Escape') { selected = ''; draw(); } };
      window.addEventListener('hero-power-target', armPower); window.addEventListener('keydown', cancelPower);
      const unsubscribe = session.subscribe(draw); i18n.on('languageChanged', draw);
      const stopEvents = session.onEvent(event => {
        audioManager.play(event.kind === 'attack' ? 'reel_stop' : event.kind === 'death' ? 'card_remove' : event.kind === 'draw' ? 'card_flip' : 'card_place');
        if (event.kind === 'attack' || event.kind === 'power') {
          shake = motion.matches ? 0 : 10;
          const from = positions.get(event.source), to = positions.get(event.target ?? '');
          if (from && to && !motion.matches) strike = { x: from.x, y: from.y, tx: to.x, ty: to.y, life: 1 };
        }
        if (event.kind === 'death') {
          const p = positions.get(event.source);
          if (p) { ashes.push(p); if (ashes.length > 24) ashes.shift();
            if (!motion.matches) { const c = session.getSnapshot().cards.find(c => c.id === event.cardId); deaths.push({ ...p, life: 1, texture: c ? textures.get(textureKey(c)) : undefined }); }
          }
        }
        const url = session.getSnapshot().cards.find(c => c.id === event.cardId)?.audio[event.kind as 'spawn'|'attack'|'death'];
        if (url && localStorage.getItem('sound') !== 'off') { const audio = new Audio(url); audio.volume = .45 * audioManager.sfxVolume; void audio.play().catch(() => {}); }
      });
      draw();
      app.ticker.add(ticker => {
        if (motion.matches) { strike = undefined; deaths = []; shake = 0; }
        const z = zoom();
        if (Math.abs(z - lastZoom) > 0.02) {
          lastZoom = z;
          app.renderer.resolution = Math.min(3, Math.max(2, devicePixelRatio * z * 1.5));
          app.queueResize();
        }
        const scale = Math.min(app.screen.width / BOARD_W, app.screen.height / BOARD_H), now = performance.now();
        board.scale.set(scale); board.position.set((app.screen.width - BOARD_W * scale) / 2 + Math.sin(now * .1) * shake, (app.screen.height - BOARD_H * scale) / 2);
        shake *= Math.exp(-ticker.deltaMS / 75);
        const cx = CARD_W / 2, cy = CARD_H / 2;
        for (const a of animated) {
          if (drag && a.id === drag.id) continue;
          const age = Math.min(1, (now - a.start) / 420);
          const hover = a.hover && !motion.matches;
          let tx = a.x, ty = a.y - (hover ? 35 : 0);
          if (strike && !motion.matches && Math.abs(a.x - strike.x) < 1 && Math.abs(a.y - strike.y) < 1) {
            const lunge = Math.sin((1 - strike.life) * Math.PI) * .82;
            tx += (strike.tx - strike.x) * lunge; ty += (strike.ty - strike.y) * lunge;
          }
          const blend = motion.matches ? 1 : 1 - Math.exp(-Math.min(ticker.deltaMS, 50) / 70);
          a.node.x += (tx - a.node.x) * blend; a.node.y += (ty - a.node.y) * blend;
          a.node.rotation += (a.rot - (hover ? .015 : 0) - a.node.rotation) * blend;
          a.node.alpha = motion.matches ? 1 : Math.min(1, .55 + age);

        }
        strokes.clear(); strokes.position.copyFrom(board.position); strokes.scale.set(scale);
        scraps.position.copyFrom(board.position); scraps.scale.set(scale);
        scraps.removeChildren().forEach(n => n.destroy({ children: true }));
        for (let n = bursts.length - 1; n >= 0; n--) {
          const effect = bursts[n], age = (now - effect.born) / 1100;
          if (age >= 1) { bursts.splice(n, 1); continue; }
          const label = text(effect.label, effect.x - 20, effect.y - 20 - (motion.matches ? 0 : age * 60), 42, effect.color);
          label.style.fontWeight = 'bold'; label.style.stroke = { color: 0x28221b, width: 5 }; label.alpha = Math.min(1, (1 - age) * 3); scraps.addChild(label);
        }
        if (selected === 'hero-power') { const hint = text('Выберите цель способности · Esc — отмена', BOARD_W / 2 - 220, 610, 22, 0xf0d69d); hint.style.wordWrapWidth = 600; scraps.addChild(hint); }
        if (drag?.moved && drag.kind === 'hand' && drag.enabled) strokes.roundRect(55, 334, BOARD_W - 110, 260, 30).stroke({ color: 0xa8dab2, width: 3, alpha: .7 });
        const aimFrom = drag?.kind === 'minion' ? { x: drag.homeX, y: drag.homeY } : selected && selected !== 'hero-power' ? positions.get(selected) : undefined;
        if (aimFrom) {
          strokes.roundRect(aimFrom.x - CARD_W / 2 - 8, aimFrom.y - CARD_H / 2 - 8, CARD_W + 16, CARD_H + 16, 14).stroke({ color: 0xf1d28b, width: 5, alpha: .95 });
          const tx = cursorX, ty = cursorY, angle = Math.atan2(ty - aimFrom.y, tx - aimFrom.x);
          if (Math.hypot(tx - aimFrom.x, ty - aimFrom.y) > 28) {
            strokes.moveTo(aimFrom.x, aimFrom.y).quadraticCurveTo(aimFrom.x, ty + 80, tx, ty).stroke({ color: 0xf3b23c, width: 8, alpha: .96 });
            strokes.poly([tx, ty, tx - Math.cos(angle - .55) * 34, ty - Math.sin(angle - .55) * 34, tx - Math.cos(angle + .55) * 34, ty - Math.sin(angle + .55) * 34]).fill(0xf3b23c);
            strokes.circle(tx, ty, 26).stroke({ color: 0xf3b23c, width: 3 });
          }
        }
        for (const p of ashes) for (let n = 0; n < 12; n++) strokes.circle(p.x + (n * 17 % 65) - 32, p.y + 45 + (n * 13 % 18), n % 4 + 1).fill({ color: ink, alpha: .3 });
        deaths = deaths.filter(d => d.life > 0);
        for (const d of deaths) {
          d.life -= ticker.deltaMS / 650; const step = 1 - d.life;
          for (const side of [-1, 1] as const) {
            const piece = new Container({ x: d.x + side * step * 65, y: d.y + step * 100, rotation: side * step * .8, alpha: Math.max(0, d.life) });
            const shape = side < 0 ? [-cx, -cy, 0, -cy, -8, -36, 6, -10, -7, 28, 0, cy, -cx, cy] : [0, -cy, cx, -cy, cx, cy, 0, cy, -7, 28, 6, -10, -8, -36];
            piece.addChild(new Graphics().poly(shape).fill(paper).stroke({ color: ink, width: 2 }));
            if (d.texture) {
              const photo = new Sprite(d.texture); photo.position.set(10 - cx, 14 - cy); photo.width = CARD_W - 20; photo.height = Math.round((CARD_W - 20) * 0.86);
              const mask = new Graphics().poly(shape).fill(0xffffff); piece.addChild(photo, mask); photo.mask = mask;
            }
            scraps.addChild(piece);
          }
        }
        if (strike) {
          strike.life -= ticker.deltaMS / 480;
          if (strike.life <= 0) strike = undefined;
          else {
            const stepped = strike.life;
            for (let n = 0; n < 9; n++) {
              const angle = n * 2.4, radius = 25 + (1 - stepped) * 55;
              strokes.moveTo(strike.tx + Math.cos(angle) * 10, strike.ty + Math.sin(angle) * 10).lineTo(strike.tx + Math.cos(angle) * radius, strike.ty + Math.sin(angle) * radius).stroke({ color: n % 3 ? 0xf7d491 : 0xffffff, width: stepped * 5, alpha: strike.life });
            }
            strokes.moveTo(strike.tx - 22, strike.ty + 25).lineTo(strike.tx + 17, strike.ty - 27).moveTo(strike.tx - 9, strike.ty + 28).lineTo(strike.tx + 30, strike.ty - 21).stroke({ color: 0xf3c876, width: 5 * stepped, alpha: strike.life });
          }
        }
      });
      dispose = () => { window.removeEventListener('hero-power-target', armPower); window.removeEventListener('keydown', cancelPower); unsubscribe(); stopEvents(); i18n.off('languageChanged', draw); app.destroy(true, { children: true }); desk.destroy(true); textures.forEach(texture => texture.destroy(true)); };
    })().catch(() => { dispose(); dispose = () => {}; if (!cancelled) setFailed(true); });
    return () => { cancelled = true; dispose(); };
  }, []);
  return <div className="board-wrap"><div className="board" ref={host}>{failed && <p role="alert">{t('renderError')}</p>}</div>
    {inspected && <div className="inspect-overlay"><CardInspect card={inspected.card} catalog={session.getSnapshot().cards} attack={inspected.minion?.attack} health={inspected.minion?.health} /></div>}
  </div>;
}
