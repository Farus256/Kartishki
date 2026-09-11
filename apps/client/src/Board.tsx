import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { useTranslation } from 'react-i18next';
import i18n from '@kartishki/i18n';
import { starterCards, type CardDefinition } from '@kartishki/shared';
import { renderPhoto } from '@kartishki/shared/photo';
import { session, type Minion } from './session';
import { deskTexture, ink, paper } from './ink';
import { CardInspect } from './ui/CardInspect';

type Inspect = { id: string; card: CardDefinition; x: number; minion?: Minion };

export function Board() {
  const host = useRef<HTMLDivElement>(null); const [failed, setFailed] = useState(false); const [inspected, setInspected] = useState<Inspect>(); const { t } = useTranslation();
  useEffect(() => {
    const app = new Application(); let cancelled = false; let dispose = () => {};
    void (async () => {
      await Promise.all(['Neucha', 'PT Mono', 'Russo One'].map(font => document.fonts.load(`16px "${font}"`, 'Картишки Ready 123')));
      if (cancelled) return;
      await app.init({ resizeTo: host.current!, background: '#EFECE4', antialias: true, preference: 'webgl', resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
      if (cancelled) { app.destroy(true, { children: true }); return; }
      host.current!.appendChild(app.canvas); dispose = () => app.destroy(true, { children: true });
      const board = new Container(); app.stage.addChild(board);
      const desk = deskTexture();
      const textures = new Map<string, Texture>(); const pending = new Set<string>();
      const textureKey = (c: CardDefinition) => JSON.stringify(c.art);
      let selected = ''; let shake = 0; let lastRevision = -1;
      const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const arrivals = new Map<string, number>();
      let animated: { node: Container; x: number; y: number; tilt: number; hover: boolean; start: number; id: string }[] = [];
      let positions = new Map<string, { x: number; y: number }>();
      let strike: { x: number; y: number; tx: number; ty: number; life: number } | undefined;
      let deaths: { x: number; y: number; life: number; texture?: Texture }[] = [];
      const ashes: { x: number; y: number }[] = [];
      const scraps = new Container(); app.stage.addChild(scraps);
      const strokes = new Graphics(); app.stage.addChild(strokes);
      const text = (label: string, x: number, y: number, size = 17, color = ink) => {
        const node = new Text({ text: label, style: { fontFamily: 'Neucha', fontSize: size, fill: color, wordWrap: true, wordWrapWidth: 108 } }); node.position.set(x,y); return node;
      };
      const ensureTexture = (c: CardDefinition) => {
        const key = textureKey(c);
        if (!textures.has(key) && !pending.has(key)) {
          pending.add(key);
          void renderPhoto(c.art).then(canvas => { if (!cancelled) { textures.set(key, Texture.from(canvas)); draw(); } }).catch(() => {}).finally(() => pending.delete(key));
        }
      };
      function card(c: CardDefinition, x: number, y: number, id: string, action: () => void, minion?: Minion, enabled = true) {
        ensureTexture(c);
        const node = new Container({ x, y }); node.eventMode = 'static'; node.cursor = enabled ? 'pointer' : 'default';
        const rarity = ({ common: 0x4B5563, rare: 0x2563EB, epic: 0x9333EA, legendary: 0xEAB308, ultimate: 0x06B6D4 })[c.rarity];
        const frame = new Graphics().poly([5,5,120,8,119,158,4,160]).fill({ color: ink, alpha: .22 })
          .poly([0,1,115,-1,117,154,-2,153]).fill(paper).stroke({ color: selected === id ? 0xd92525 : rarity, width: selected === id ? 4 : 2.5 })
          .moveTo(3,150).lineTo(113,152).lineTo(114,3).stroke({ color: ink, width: .7 });
        if (minion?.shield) frame.poly([-6,-7,121,-5,123,159,-7,161,-6,-7]).stroke({ color: 0x7ed321, width: 3 });
        node.addChild(frame);
        const tex = textures.get(textureKey(c));
        if (tex) { const image = new Sprite(tex); image.position.set(7,9); image.width = 102; image.height = 88; node.addChild(image); }
        node.addChild(new Graphics().poly([30,-7,78,-4,76,8,28,5]).fill({ color: ink, alpha: .85 }).rect(7,94,102,3).fill(rarity)
          .poly([50,88, 61,99, 50,110, 39,99]).fill(rarity).stroke({ color: ink, width: 1.4 }));
        const name = text(c.name[i18n.language] || c.name.ru, 7,101,13); name.style.wordWrapWidth = 102; name.style.wordWrap = false; if (name.width > 102) name.scale.x = 102/name.width; node.addChild(name);
        const badge = (value: number, bx: number, by: number, color: number) => {
          node.addChild(new Graphics().poly([bx-2,by,bx+22,by-2,bx+24,by+23,bx,by+25]).fill(color).stroke({ color: ink, width: 1.5 }));
          const label = text(String(value),bx+3,by+2,16,paper); label.style.fontFamily = 'Russo One'; node.addChild(label);
        };
        badge(c.cost,-5,8,ink); badge(minion?.attack ?? c.attack,5,120,ink); badge(minion?.health ?? c.health,85,120,0xd92525);
        const rarityLabel = text(i18n.t(c.rarity),32,124,9,rarity); rarityLabel.style.wordWrapWidth = 50; node.addChild(rarityLabel);
        const detail = minion ? (minion.ready ? i18n.t('ready') : i18n.t('sleeping')) : c.properties.map(p => i18n.t(p)).join(' · ');
        node.addChild(text(detail,7,146,8, minion?.ready ? 0x397200 : 0x808080));
        if (!arrivals.has(id)) arrivals.set(id, performance.now());
        const tilt = (([...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 7)-3)*.006;
        const item = { node, x, y, tilt, hover: false, start: arrivals.get(id)!, id }; animated.push(item);
        node.on('pointerover', () => { item.hover = true; node.zIndex = 10; setInspected({ id, card: c, x, minion }); });
        node.on('pointerout', () => { item.hover = false; node.zIndex = 0; setInspected(prev => prev?.id === id ? undefined : prev); });
        node.on('pointertap', () => { setInspected({ id, card: c, x, minion }); if (enabled) action(); });
        board.addChild(node); positions.set(id, { x: x+58, y: y+77 });
      }
      function draw() {
        if (cancelled) return;
        board.removeChildren().forEach(n => n.destroy({ children: true })); animated = []; positions = new Map();
        const s = session.getSnapshot();
        if (s.status === 'offline') { deaths = []; ashes.length = 0; }
        const live = new Set([...s.hand.map(h => h.instanceId), ...s.minions.map(m => m.id), 'sample', 'sample-2', 'sample-3']);
        for (const id of arrivals.keys()) if (!live.has(id)) arrivals.delete(id);
        if (s.revision !== lastRevision) { selected = ''; lastRevision = s.revision; }
        board.sortableChildren = true;
        board.addChild(new Sprite(desk));
        const caption = text(i18n.t('arena'),35,34,17,0x808080); caption.style.wordWrapWidth = 300; board.addChild(caption);
        const handCaption = text(i18n.t('handLabel'),40,509,17); handCaption.style.wordWrapWidth = 300; board.addChild(handCaption);
        const active = s.status === 'active' && s.activePlayer === s.sessionId;
        const definitions = new Map(s.cards.map(c => [c.id,c]));
        for (const p of s.players) {
          const own = p.id === s.sessionId, y = own ? 456 : 22;
          const hero = new Container({ x: 350, y });
          hero.addChild(new Graphics().poly([0,2,300,-1,298,45,3,47]).fill(ink));
          const label = text(`${i18n.t(own ? 'you' : 'opponent')}   ♥ ${p.health}   ◆ ${p.mana}   ▤ ${p.handCount} / ${p.deckCount}`, 10,13,16,paper); label.style.wordWrapWidth = 290; hero.addChild(label);
          hero.eventMode = 'static'; hero.cursor = !own && selected ? 'crosshair' : 'default';
          hero.on('pointertap', () => { if (!own && selected) session.attack(selected, p.id); }); board.addChild(hero);
          positions.set(p.id, { x: 500, y: y+23 });
          s.minions.filter(m => m.owner === p.id).forEach((m,n) => {
            const c = definitions.get(m.cardId); if (!c) return;
            card(c, 44+n*130, own ? 292 : 92, m.id, () => {
              if (own && active && s.phase === 'combat' && m.ready) { selected = m.id; draw(); }
              else if (!own && selected) session.attack(selected,m.id);
            },m);
          });
        }
        const handWidth = s.hand.length*96+20;
        s.hand.forEach((h,n) => { const c = definitions.get(h.cardId); if (c) card(c, (1000-handWidth)/2+n*96, 545, h.instanceId, () => session.play(h.instanceId), undefined, active && s.phase === 'main' && (s.players.find(p => p.id === s.sessionId)?.mana ?? 0) >= c.cost); });
        if (!s.players.length) {
          const title = text(i18n.t('connectHint'),255,130,32); title.style.wordWrapWidth = 510; title.style.align = 'center'; board.addChild(title);
          card(starterCards[1],278,270,'sample-2',()=>{},undefined,false);
          card(starterCards[0],442,250,'sample',()=>{},undefined,false);
          card(starterCards[4],606,279,'sample-3',()=>{},undefined,false);
          const note = text(i18n.t('sampleNote'),390,465,23); note.style.wordWrapWidth = 300; note.rotation = -.04; board.addChild(note);
        }
      }
      const unsubscribe = session.subscribe(draw); i18n.on('languageChanged', draw);
      const stopEvents = session.onEvent(event => {
        if (event.kind === 'attack') {
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
        if (url && localStorage.getItem('sound') !== 'off') { const audio = new Audio(url); audio.volume = .45; void audio.play().catch(() => {}); }
      });
      draw();
      app.ticker.add(ticker => {
        if (motion.matches) { strike = undefined; deaths = []; shake = 0; }
        const scale = Math.min(app.screen.width/1000,app.screen.height/720), now = performance.now();
        board.scale.set(scale); board.position.set((app.screen.width-1000*scale)/2 + Math.sin(now*.1)*shake, (app.screen.height-720*scale)/2);
        shake *= Math.exp(-ticker.deltaMS/75);
        for (const a of animated) {
          const age = Math.min(1,(now-a.start)/420), back = 1 + 2.70158*(age-1)**3 + 1.70158*(age-1)**2;
          const hover = a.hover && !motion.matches;
          a.node.y = a.y + (motion.matches ? 0 : (1-back)*-65) - (hover ? 22 : 0);
          a.node.rotation = a.tilt + (hover ? -.035 + Math.sin(Math.floor(now/80))*.004 : 0);
          const targetScale = hover ? 1.18 : 1;
          a.node.scale.set(motion.matches ? 1 : a.node.scale.x+(targetScale-a.node.scale.x)*(1-Math.exp(-ticker.deltaMS/65)));
          a.node.alpha = motion.matches ? 1 : Math.min(1,.5+age*2);
          if (strike && !motion.matches && Math.abs(a.x+58-strike.x)<1 && Math.abs(a.y+77-strike.y)<1) {
            const lunge = Math.sin((1-strike.life)*Math.PI)*.28;
            a.node.x = a.x+(strike.tx-strike.x)*lunge; a.node.y += (strike.ty-strike.y)*lunge;
          } else a.node.x = a.x;
        }
        strokes.clear(); strokes.position.copyFrom(board.position); strokes.scale.set(scale);
        scraps.position.copyFrom(board.position); scraps.scale.set(scale);
        scraps.removeChildren().forEach(n => n.destroy({ children: true }));
        for (const p of ashes) for (let n=0;n<12;n++) strokes.circle(p.x+(n*17%65)-32,p.y+45+(n*13%18),n%4+1).fill({color:ink,alpha:.3});
        deaths = deaths.filter(d => d.life > 0);
        for (const d of deaths) {
          d.life -= ticker.deltaMS/650; const step = Math.floor((1-d.life)*8)/8;
          for (const side of [-1,1]) {
            const piece = new Container({ x: d.x+side*step*65, y: d.y+step*100, rotation: side*step*.8, alpha: Math.max(0,d.life) });
            const shape = side < 0 ? [-58,-77,0,-77,-8,-36,6,-10,-7,28,0,77,-58,77] : [0,-77,58,-77,58,77,0,77,-7,28,6,-10,-8,-36];
            piece.addChild(new Graphics().poly(shape).fill(paper).stroke({color:ink,width:2}));
            if (d.texture) { const photo = new Sprite(d.texture); photo.position.set(-51,-68); photo.width=102; photo.height=88;
              const mask = new Graphics().poly(shape).fill(0xffffff); piece.addChild(photo,mask); photo.mask=mask;
            }
            scraps.addChild(piece);
          }
        }
        if (strike) {
          strike.life -= ticker.deltaMS/300;
          if (strike.life <= 0) strike = undefined;
          else { const stepped = Math.ceil(strike.life*4)/4;
            for (let n=0;n<9;n++) { const angle=n*2.4, radius=25+(1-stepped)*55;
              strokes.moveTo(strike.tx+Math.cos(angle)*10,strike.ty+Math.sin(angle)*10).lineTo(strike.tx+Math.cos(angle)*radius,strike.ty+Math.sin(angle)*radius).stroke({color:n%3 ? ink : 0xd92525,width:stepped*5,alpha:strike.life});
            }
            strokes.moveTo(strike.tx-22,strike.ty+25).lineTo(strike.tx+17,strike.ty-27).moveTo(strike.tx-9,strike.ty+28).lineTo(strike.tx+30,strike.ty-21).stroke({color:ink,width:5*stepped,alpha:strike.life});
          }
        }
      });
      dispose = () => { unsubscribe(); stopEvents(); i18n.off('languageChanged', draw); app.destroy(true, { children: true }); desk.destroy(true); textures.forEach(texture => texture.destroy(true)); };
    })().catch(() => { dispose(); dispose=()=>{}; if (!cancelled) setFailed(true); });
    return () => { cancelled = true; dispose(); };
  }, []);
  return <div className="board-wrap"><div className="board" ref={host}>{failed && <p role="alert">{t('renderError')}</p>}</div>
    {inspected && <div className={`inspect ${inspected.x < 500 ? 'right' : 'left'}`}><CardInspect card={inspected.card} attack={inspected.minion?.attack} health={inspected.minion?.health} /></div>}
  </div>;
}
