import { AbilitiesEditor } from './AbilitiesEditor';
import { BattlegroundsEditor } from './BattlegroundsEditor';
import { HeroEditor } from './HeroEditor';
import { LevelsEditor } from './LevelsEditor';
import { MusicEditor } from './MusicEditor';
import { ShopEditor } from './ShopEditor';
import { ImageProcessingPipeline } from './ImageProcessingPipeline';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import i18n from '@kartishki/i18n';
import { rarities, properties, starterCards, starterAutoBattlerCatalog, validateCard, type CardDefinition, type Catalog } from '@kartishki/shared';
import { applyPortraitPreset } from '@kartishki/shared/photo';
import { uploadPortrait } from './uploadPortrait';
import { CardInspect } from '../../client/src/ui/CardInspect';
import '../../client/src/style.css';
import './editor.css';

const DRAFT_KEY = 'kartishki-editor-draft-v1';
const MODE_KEY = 'kartishki-editor-mode-v1';
const endpoint = import.meta.env.VITE_SERVER_URL ?? 'http://127.0.0.1:2567';
type EditorMode = 'cards' | 'heroes' | 'battlegrounds' | 'levels' | 'music' | 'shop';
function readMode(): EditorMode {
  try {
    const mode = localStorage.getItem(MODE_KEY);
    if (mode === 'cards' || mode === 'heroes' || mode === 'battlegrounds' || mode === 'levels' || mode === 'music' || mode === 'shop') return mode;
  } catch { /* First visit opens Battlegrounds. */ }
  return 'battlegrounds';
}
function readData(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
}
function Editor() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<EditorMode>(readMode);
  useEffect(() => { try { localStorage.setItem(MODE_KEY, mode); } catch { /* Keep working if storage is blocked. */ } }, [mode]);
  const [card, setCard] = useState<CardDefinition>(() => { try { const draft: unknown = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null'); if (validateCard(draft)) return draft; } catch { /* Use a clean card when storage is unavailable. */ } return structuredClone(starterCards[0]); });
  const [catalog, setCatalog] = useState<Catalog>({ version: 0, cards: [] });
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const imageRequest = useRef(0);
  const [draftStatus, setDraftStatus] = useState('');
  useEffect(() => { const timer = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(card)); setDraftStatus(i18n.language === 'ru' ? 'Черновик сохранён на устройстве' : 'Draft saved on this device'); } catch { setDraftStatus(i18n.language === 'ru' ? 'Не удалось сохранить черновик. Экспортируйте JSON.' : 'Draft storage unavailable. Export JSON.'); } }, 450); return () => clearTimeout(timer); }, [card]);
  async function load() {
    setBusy(true);
    try { const result = await fetch(`${endpoint}/api/catalog`); if (!result.ok) throw new Error(); const data: Catalog = await result.json(); setCatalog(data); setMessage('catalogLoaded'); }
    catch { setMessage('connectionError'); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  function save() {
    if (!validateCard(card)) { setMessage('invalidCard'); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(card,null,2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${card.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function publish() {
    if (!validateCard(card)) { setMessage('invalidCard'); return; }
    setBusy(true);
    try {
      const response = await fetch(`${endpoint}/api/catalog`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card, version: catalog.version }) });
      const data = await response.json(); if (!response.ok) { setMessage(data.error ?? 'publishError'); return; }
      setCatalog(data); setMessage('published');
    } catch { setMessage('publishError'); } finally { setBusy(false); }
  }
  function choose(c: CardDefinition) { imageRequest.current++; setCard(structuredClone(c)); setMessage(''); }
  async function photo(file?: File) {
    if (!file) return;
    const request = ++imageRequest.current;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 8_000_000) { setMessage('invalidImage'); return; }
    try {
      const source = await uploadPortrait(file, endpoint);
      if (request === imageRequest.current) setCard(c => ({ ...c, art: applyPortraitPreset({ ...c.art, ...source,rotation:0,crop: { x: .5, y: .5, size: 1 } },'printed') }));
    } catch { if (request === imageRequest.current) setMessage('invalidImage'); }
  }

  const nav = <>
    <button type="button" aria-pressed={mode === 'battlegrounds'} onClick={() => { setMode('battlegrounds'); void load(); }}>{i18n.language === 'ru' ? 'Поле сражений' : 'Battlegrounds'}</button>
    <button type="button" aria-pressed={mode === 'cards'} onClick={() => setMode('cards')}>{i18n.language === 'ru' ? 'Обычные карты' : 'Standard cards'}</button>
    <button type="button" aria-pressed={mode === 'shop'} onClick={() => { setMode('shop'); void load(); }}>{t('shopEditor')}</button>
    <button type="button" aria-pressed={mode === 'levels'} onClick={() => { setMode('levels'); void load(); }}>{t('levelsEditor')}</button>
    <button type="button" aria-pressed={mode === 'music'} onClick={() => { setMode('music'); void load(); }}>{t('menuMusic')}</button>
    <select aria-label={t('language')} value={i18n.language} onChange={e => { void i18n.changeLanguage(e.target.value); document.documentElement.lang=e.target.value; }}><option value="ru">Русский</option><option value="en">English</option></select>
  </>;
  if (mode === 'heroes') return <HeroEditor onBack={() => { setMode('cards'); void load(); }} />;
  if (mode === 'battlegrounds') return <BattlegroundsEditor nav={nav} />;
  if (mode === 'levels') return <LevelsEditor nav={nav} />;
  if (mode === 'music') return <MusicEditor nav={nav} />;
  if (mode === 'shop') return <ShopEditor nav={nav} />;
  return <main className="editor"><header><h1>{t('editor')}</h1><div className="editor-nav">{nav}<button onClick={() => setMode('heroes')}>{i18n.language === 'ru' ? 'Редактор героев' : 'Hero editor'}</button></div></header>
    <p className="editor-autosave">{draftStatus}</p><div className="toolbar"><button onClick={() => choose({ ...structuredClone(starterCards[0]), id: `card-${Date.now()}`, name: { ru: t('newCard'), en: '' } })}>{t('newCard')}</button><button disabled={busy} onClick={() => void load()}>{t('reloadCatalog')}</button>
    <select aria-label={t('catalog')} value={catalog.cards.some(c=>c.id===card.id) ? card.id : ''} onChange={e => { const c=catalog.cards.find(c=>c.id===e.target.value); if(c) choose(c); }}><option value="">{t('draft')}</option>{catalog.cards.map(c=><option key={c.id} value={c.id}>{c.name[i18n.language] || c.name.ru}</option>)}</select>
    <label className="file-button">{t('import')}<input type="file" accept="application/json,.json" onChange={e => { const file=e.target.files?.[0]; if(file) void (async()=>{ try { if(file.size>7_000_000) throw new Error(); const data: unknown=JSON.parse(await file.text()); if(!validateCard(data)) throw new Error(); choose(data); } catch { setMessage('invalidCard'); } })(); }}/></label></div>
    <div className="editor-grid"><section className="editor-fields"><h2>{i18n.language === 'ru' ? 'Параметры карты' : 'Card details'}</h2>
      <label>{t('cardId')}<input value={card.id} maxLength={60} onChange={e=>setCard({...card,id:e.target.value})}/></label>
      {(['ru','en'] as const).map(lang=><label key={lang}>{t('name')} ({lang})<input value={card.name[lang] ?? ''} maxLength={100} onChange={e=>setCard({...card,name:{...card.name,[lang]:e.target.value}})}/></label>)}
      <label>{t('description')}<textarea value={card.description.ru} maxLength={500} onChange={e=>setCard({...card,description:{...card.description,ru:e.target.value}})}/></label>
      <label>{t('description')} (en)<textarea value={card.description.en ?? ''} maxLength={500} onChange={e=>setCard({...card,description:{...card.description,en:e.target.value}})}/></label>
      <div className="stats-fields">{(['cost','attack','health'] as const).map(key=><label key={key}>{t(key)}<input type="number" min={key==='health'?1:0} max={key==='cost'?10:99} value={card[key]} onChange={e=>setCard({...card,[key]:Number(e.target.value)})}/></label>)}</div>
      <label>{t('rarity')}<select value={card.rarity} onChange={e=>setCard({...card,rarity:e.target.value as CardDefinition['rarity']})}>{rarities.map(r=><option key={r} value={r}>{t(r)}</option>)}</select></label>
      <label>{t('minionTypes')}<input value={card.minionTypes.join(',')} onChange={e=>setCard({...card,minionTypes:e.target.value ? e.target.value.split(',') : []})}/></label>
      <fieldset><legend>{t('properties')}</legend>{properties.map(p=><label className="check" key={p}><input type="checkbox" checked={card.properties.includes(p)} onChange={e=>setCard({...card,properties:e.target.checked?[...card.properties,p]:card.properties.filter(x=>x!==p)})}/>{t(p)}</label>)}</fieldset>
      <AbilitiesEditor card={card} cards={catalog.cards} onChange={setCard} />
    </section><section className="editor-art-panel">

      <label>{t('photo')}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void photo(e.target.files?.[0])}/></label>
      <label>{i18n.language==='ru'?'Портрет в лавке':'Use portrait in Tavern'}<select value={card.autoBattlerId??''} onChange={e=>setCard({...card,autoBattlerId:e.target.value||undefined})}><option value="">—</option>{starterAutoBattlerCatalog.minions.filter(m=>!m.token).map(m=><option key={m.id} value={m.id}>{m.name[i18n.language==='en'?'en':'ru']}</option>)}</select></label>
      <div className="photo-actions"><button type="button" onClick={() => setCard(c => ({ ...c, art: { ...c.art, crop: { x: .5, y: .5, size: 1 } } }))}>{i18n.language === 'ru' ? 'Сбросить кадрирование' : 'Reset crop'}</button><button type="button" disabled={!card.art.url} onClick={() => { imageRequest.current++; setCard(c => ({ ...c, art: { ...c.art, url: '' } })); }}>{i18n.language === 'ru' ? 'Убрать фото' : 'Remove photo'}</button></div>
      {(['x','y','size'] as const).map(key=><label key={key}>{t(`crop_${key}`)}<input type="range" min={key==='size'?.1:0} max={1} step={.01} value={card.art.crop[key]} onChange={e=>setCard({...card,art:{...card.art,crop:{...card.art.crop,[key]:Number(e.target.value)}}})}/></label>)}
      <ImageProcessingPipeline art={card.art} onChange={art => setCard(c => ({ ...c, art }))} />
      <fieldset><legend>{t('audio')}</legend>{([['spawn','spawnSound'],['death','deathSound'],['attack','attackSound']] as const).map(([event, label]) => <div key={event} className="audio-row">
        <label>{t(label)}<input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/webm" onChange={e=>{ const f=e.target.files?.[0], id=card.id; if(f) void (async()=>{ if(f.size>1_000_000 || !/^audio\/(mpeg|mp3|wav|x-wav|ogg|webm)$/.test(f.type)){setMessage('invalidAudio');return;} const url=await readData(f); setCard(c=>c.id===id?{...c,audio:{...c.audio,[event]:url}}:c); })().catch(()=>setMessage('invalidAudio')); }}/></label>
        {card.audio[event] && <><audio controls src={card.audio[event]}/><button onClick={()=>setCard({...card,audio:{...card.audio,[event]:''}})}>{t('remove')}</button></>}
      </div>)}</fieldset>

    </section><aside className="editor-preview-panel"><div className="editor-preview"><h2>{i18n.language === 'ru' ? 'Предпросмотр в игре' : 'In-game preview'}</h2><div className="inspect editor-inspect"><CardInspect card={card} catalog={[card, ...catalog.cards.filter(c => c.id !== card.id)]} /></div></div></aside></div>
    <section className="publish"><button onClick={save}>{t('export')}</button><button disabled={busy || !catalog.version || !validateCard(card)} onClick={()=>void publish()}>{t('publish')}</button><p role="status">{message && t(message)}</p></section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Editor/>);
