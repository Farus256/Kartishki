import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { starterHeroes, validateHero, type Catalog, type HeroDefinition } from '@kartishki/shared';
import { HeroPortrait } from '../../client/src/ui/HeroPortrait';
import { ImageProcessingPipeline } from './ImageProcessingPipeline';
import { uploadPortrait } from './uploadPortrait';
import { applyPortraitPreset } from '@kartishki/shared/photo';
const endpoint = import.meta.env.VITE_SERVER_URL ?? 'http://127.0.0.1:2567';
export function HeroEditor({ onBack }: { onBack: () => void }) {
  const { i18n } = useTranslation();
  const ru = i18n.language === 'ru';
  const [hero, setHero] = useState<HeroDefinition>(() => structuredClone(starterHeroes[0]));
  const [catalog, setCatalog] = useState<Catalog>({ version: 0, cards: [], heroes: [] });
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const request = useRef(0);
  async function load() { try { const r = await fetch(`${endpoint}/api/catalog`); if (!r.ok) throw new Error(); setCatalog(await r.json()); } catch { setMessage(ru ? 'Не удалось загрузить каталог' : 'Could not load the catalog'); } }
  useEffect(() => { void load(); }, []);
  function choose(h: HeroDefinition) { request.current++; setHero(structuredClone(h)); setMessage(''); }
  async function photo(file?: File) {
    if (!file) return; const revision = ++request.current;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 8_000_000) { setMessage(ru ? 'Нужен PNG, JPEG или WebP до 8 МБ' : 'Need PNG, JPEG or WebP up to 8 MB'); return; }
    try {
      const source = await uploadPortrait(file, endpoint);
      if (revision === request.current) setHero(h => ({ ...h, art: applyPortraitPreset({ ...h.art, ...source, rotation:0,crop: { x: .5, y: .5, size: 1 } },'printed') }));
    } catch { if(revision === request.current) setMessage(ru ? 'Не удалось обработать фото' : 'Could not process the photo'); }
  }
  async function publish() {
    if (!validateHero(hero)) { setMessage(ru ? 'Проверьте параметры героя' : 'Check the hero fields'); return; }
    setBusy(true);
    try { const r = await fetch(`${endpoint}/api/heroes`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({hero,version:catalog.version}) }); const data = await r.json();
      if (!r.ok) { setMessage(r.status === 409 ? (ru ? 'Каталог изменился. Обновите каталог и повторите сохранение.' : 'Catalog changed. Reload and publish again.') : (ru ? 'Ошибка публикации: проверьте параметры и карту призыва.' : 'Publish failed: check the fields and the summon card.')); return; }
      setCatalog(data); setMessage(ru ? 'Герой опубликован. Он доступен при выборе в новых матчах.' : 'Hero published. New matches can pick it.');
    } catch { setMessage(ru ? 'Не удалось соединиться с сервером' : 'Could not reach the server'); } finally { setBusy(false); }
  }
  const ability = (patch: Partial<HeroDefinition['ability']>) => setHero(h => ({ ...h, ability: { ...h.ability, ...patch } }));
  return <main className="editor"><header><h1>{ru ? 'Редактор героев' : 'Hero editor'}</h1><button onClick={onBack}>{ru ? 'К редактору карт' : 'Back to cards'}</button></header>
    <div className="toolbar"><button onClick={() => choose({ ...structuredClone(starterHeroes[0]), id: `hero-${Date.now()}`, name: ru ? 'Новый герой' : 'New hero' })}>{ru ? 'Новый герой' : 'New hero'}</button><button onClick={() => void load()}>{ru ? 'Обновить каталог' : 'Reload catalog'}</button><select aria-label={ru ? 'Каталог героев' : 'Hero catalog'} value={catalog.heroes?.some(h => h.id === hero.id) ? hero.id : ''} onChange={e => { const h = catalog.heroes?.find(h => h.id === e.target.value); if (h) choose(h); }}><option value="">{ru ? 'Черновик' : 'Draft'}</option>{catalog.heroes?.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></div>
    <div className="editor-grid"><section className="editor-fields"><h2>{ru ? 'Герой' : 'Hero'}</h2>
      <label>{ru ? 'ID героя' : 'Hero ID'}<input value={hero.id} maxLength={60} onChange={e => setHero({ ...hero, id:e.target.value })} /></label>
      <label>{ru ? 'Имя героя' : 'Hero name'}<input value={hero.name} maxLength={100} onChange={e => setHero({ ...hero, name:e.target.value })} /></label>
      <label>{ru ? 'Описание героя' : 'Hero description'}<textarea value={hero.description} maxLength={500} onChange={e => setHero({ ...hero, description:e.target.value })} /></label>
      <label>{ru ? 'Здоровье героя' : 'Hero health'}<input type="number" min={1} max={99} value={hero.health} onChange={e => setHero({ ...hero, health:Number(e.target.value) })} /></label>
      <fieldset><legend>{ru ? 'Способность героя' : 'Hero power'}</legend><label>{ru ? 'Название силы' : 'Power name'}<input value={hero.ability.name} maxLength={100} onChange={e => ability({name:e.target.value})} /></label>
      <label>{ru ? 'Стоимость силы' : 'Power cost'}<input type="number" min={0} max={10} value={hero.ability.cost} onChange={e => ability({cost:Number(e.target.value)})} /></label>
      <label>{ru ? 'Эффект силы' : 'Power effect'}<select value={hero.ability.effectId} onChange={e => ability({ effectId:e.target.value as HeroDefinition['ability']['effectId'], amount:1, cardId:catalog.cards[0]?.id })}><option value="damage">{ru ? 'Урон выбранному противнику' : 'Damage a chosen enemy'}</option><option value="heal">{ru ? 'Лечение своего героя' : 'Heal your hero'}</option><option value="summon">{ru ? 'Призыв существ' : 'Summon minions'}</option></select></label>
      <label>{ru ? 'Сила эффекта' : 'Effect amount'}<input type="number" min={1} max={hero.ability.effectId === 'summon' ? 7 : 20} value={hero.ability.amount} onChange={e => ability({amount:Number(e.target.value)})} /></label>
      {hero.ability.effectId === 'summon' && <label>{ru ? 'Карта для призыва' : 'Card to summon'}<select value={hero.ability.cardId ?? ''} onChange={e => ability({cardId:e.target.value})}>{catalog.cards.map(c => <option key={c.id} value={c.id}>{c.name[i18n.language] || c.name.ru}</option>)}</select></label>}<p>{ru ? 'Один раз за свой ход. Урон бьёт любое вражеское существо или героя — Провокация силу героя не останавливает.' : 'Once per turn. Damage hits any enemy minion or hero — Taunt does not stop a hero power.'}</p></fieldset>
    </section><section className="editor-art-panel"><label>{ru ? 'Фотография героя' : 'Hero photo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void photo(e.target.files?.[0])} /></label>
      {(['x','y','size'] as const).map(key => <label key={key}>{ru ? 'Кадр' : 'Crop'} {key}<input type="range" min={key === 'size' ? .1 : 0} max={1} step={.01} value={hero.art.crop[key]} onChange={e => setHero({ ...hero, art:{ ...hero.art, crop:{ ...hero.art.crop, [key]:Number(e.target.value) } } })} /></label>)}
      <button onClick={() => { request.current++; setHero({ ...hero, art:{ ...hero.art,url:'',crop:{x:.5,y:.5,size:1} } }); }}>{ru ? 'Убрать фото героя' : 'Remove hero photo'}</button>
      <ImageProcessingPipeline art={hero.art} onChange={art => setHero(h => ({...h,art}))} />
    </section><aside className="editor-preview-panel"><HeroPortrait hero={hero} cards={catalog.cards} /></aside></div>
    <section className="publish"><button disabled={busy || !catalog.version || !validateHero(hero)} onClick={() => void publish()}>{ru ? 'Опубликовать героя' : 'Publish hero'}</button><p role="status">{message}</p></section>
  </main>;
}
