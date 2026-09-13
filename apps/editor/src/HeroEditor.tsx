import { useEffect, useRef, useState } from 'react';
import { starterHeroes, validateHero, type Catalog, type HeroDefinition } from '@kartishki/shared';
import { HeroPortrait } from '../../client/src/ui/HeroPortrait';
import { ImageProcessingPipeline } from './ImageProcessingPipeline';
import { uploadPortrait } from './uploadPortrait';
import { applyPortraitPreset } from '@kartishki/shared/photo';
const endpoint = import.meta.env.VITE_SERVER_URL ?? 'http://127.0.0.1:2567';
export function HeroEditor({ onBack }: { onBack: () => void }) {
  const [hero, setHero] = useState<HeroDefinition>(() => structuredClone(starterHeroes[0]));
  const [catalog, setCatalog] = useState<Catalog>({ version: 0, cards: [], heroes: [] });
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const request = useRef(0);
  async function load() { try { const r = await fetch(`${endpoint}/api/catalog`); if (!r.ok) throw new Error(); setCatalog(await r.json()); } catch { setMessage('Не удалось загрузить каталог'); } }
  useEffect(() => { void load(); }, []);
  function choose(h: HeroDefinition) { request.current++; setHero(structuredClone(h)); setMessage(''); }
  async function photo(file?: File) {
    if (!file) return; const revision = ++request.current;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 8_000_000) { setMessage('Нужен PNG, JPEG или WebP до 8 МБ'); return; }
    try {
      const source = await uploadPortrait(file, endpoint);
      if (revision === request.current) setHero(h => ({ ...h, art: applyPortraitPreset({ ...h.art, ...source, rotation:0,crop: { x: .5, y: .5, size: 1 } },'printed') }));
    } catch { if(revision === request.current) setMessage('Не удалось обработать фото'); }
  }
  async function publish() {
    if (!validateHero(hero)) { setMessage('Проверьте параметры героя'); return; }
    setBusy(true);
    try { const r = await fetch(`${endpoint}/api/heroes`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({hero,version:catalog.version}) }); const data = await r.json();
      if (!r.ok) { setMessage(r.status === 409 ? 'Каталог изменился. Обновите каталог и повторите сохранение.' : 'Ошибка публикации: проверьте параметры и карту призыва.'); return; }
      setCatalog(data); setMessage('Герой опубликован. Он доступен при выборе в новых матчах.');
    } catch { setMessage('Не удалось соединиться с сервером'); } finally { setBusy(false); }
  }
  const ability = (patch: Partial<HeroDefinition['ability']>) => setHero(h => ({ ...h, ability: { ...h.ability, ...patch } }));
  return <main className="editor"><header><h1>Редактор героев</h1><button onClick={onBack}>К редактору карт</button></header>
    <div className="toolbar"><button onClick={() => choose({ ...structuredClone(starterHeroes[0]), id: `hero-${Date.now()}`, name: 'Новый герой' })}>Новый герой</button><button onClick={() => void load()}>Обновить каталог</button><select aria-label="Каталог героев" value={catalog.heroes?.some(h => h.id === hero.id) ? hero.id : ''} onChange={e => { const h = catalog.heroes?.find(h => h.id === e.target.value); if (h) choose(h); }}><option value="">Черновик</option>{catalog.heroes?.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></div>
    <div className="editor-grid"><section className="editor-fields"><h2>Герой</h2>
      <label>ID героя<input value={hero.id} maxLength={60} onChange={e => setHero({ ...hero, id:e.target.value })} /></label>
      <label>Имя героя<input value={hero.name} maxLength={100} onChange={e => setHero({ ...hero, name:e.target.value })} /></label>
      <label>Описание героя<textarea value={hero.description} maxLength={500} onChange={e => setHero({ ...hero, description:e.target.value })} /></label>
      <label>Здоровье героя<input type="number" min={1} max={99} value={hero.health} onChange={e => setHero({ ...hero, health:Number(e.target.value) })} /></label>
      <fieldset><legend>Способность героя</legend><label>Название силы<input value={hero.ability.name} maxLength={100} onChange={e => ability({name:e.target.value})} /></label>
      <label>Стоимость силы<input type="number" min={0} max={10} value={hero.ability.cost} onChange={e => ability({cost:Number(e.target.value)})} /></label>
      <label>Эффект силы<select value={hero.ability.effectId} onChange={e => ability({ effectId:e.target.value as HeroDefinition['ability']['effectId'], amount:1, cardId:catalog.cards[0]?.id })}><option value="damage">Урон выбранному противнику</option><option value="heal">Лечение своего героя</option><option value="summon">Призыв существ</option></select></label>
      <label>Сила эффекта<input type="number" min={1} max={hero.ability.effectId === 'summon' ? 7 : 20} value={hero.ability.amount} onChange={e => ability({amount:Number(e.target.value)})} /></label>
      {hero.ability.effectId === 'summon' && <label>Карта для призыва<select value={hero.ability.cardId ?? ''} onChange={e => ability({cardId:e.target.value})}>{catalog.cards.map(c => <option key={c.id} value={c.id}>{c.name.ru}</option>)}</select></label>}<p>Один раз за свой ход. Для урона выберите цель на столе. Существа защищают своего героя.</p></fieldset>
    </section><section className="editor-art-panel"><label>Фотография героя<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void photo(e.target.files?.[0])} /></label>
      {(['x','y','size'] as const).map(key => <label key={key}>Кадр {key}<input type="range" min={key === 'size' ? .1 : 0} max={1} step={.01} value={hero.art.crop[key]} onChange={e => setHero({ ...hero, art:{ ...hero.art, crop:{ ...hero.art.crop, [key]:Number(e.target.value) } } })} /></label>)}
      <button onClick={() => { request.current++; setHero({ ...hero, art:{ ...hero.art,url:'',crop:{x:.5,y:.5,size:1} } }); }}>Убрать фото героя</button>
      <ImageProcessingPipeline art={hero.art} onChange={art => setHero(h => ({...h,art}))} />
    </section><aside className="editor-preview-panel"><HeroPortrait hero={hero} cards={catalog.cards} /></aside></div>
    <section className="publish"><button disabled={busy || !catalog.version || !validateHero(hero)} onClick={() => void publish()}>Опубликовать героя</button><p role="status">{message}</p></section>
  </main>;
}
