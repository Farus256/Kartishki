import { ImageProcessingPipeline } from './ImageProcessingPipeline';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import i18n from '@kartishki/i18n';
import { rarities, properties, triggers, effects, starterCards, validateCard, type CardDefinition, type Catalog } from '@kartishki/shared';
import { CardInspect } from '../../client/src/ui/CardInspect';
import '../../client/src/style.css';

const endpoint = import.meta.env.VITE_SERVER_URL ?? 'http://127.0.0.1:2567';
function readData(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
}
function Editor() {
  const { t } = useTranslation();
  const [card, setCard] = useState<CardDefinition>(() => structuredClone(starterCards[0]));
  const [catalog, setCatalog] = useState<Catalog>({ version: 0, cards: [] });
  const [token, setToken] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const imageRequest = useRef(0);
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
      const response = await fetch(`${endpoint}/api/catalog`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ card, version: catalog.version }) });
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
      const image = new Image(); image.src = await readData(file); await image.decode();
      if (image.width*image.height > 24_000_000) throw new Error();
      const canvas = document.createElement('canvas'), scale = Math.min(1,1024/Math.max(image.width,image.height));
      canvas.width = Math.max(1,Math.round(image.width*scale)); canvas.height = Math.max(1,Math.round(image.height*scale));
      canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
      const url = canvas.toDataURL('image/jpeg',.85);
      if (request === imageRequest.current) setCard(c => ({ ...c, art: { ...c.art, url, crop: { x: .5, y: .5, size: 1 } } }));
    } catch { if (request === imageRequest.current) setMessage('invalidImage'); }
  }
  const updateAbility = (index: number, patch: Partial<CardDefinition['abilities'][number]>) => setCard(c => ({ ...c, abilities: c.abilities.map((a,n) => n === index ? { ...a,...patch } : a) }));
  return <main className="editor"><header><h1>{t('editor')}</h1><select aria-label={t('language')} value={i18n.language} onChange={e => { void i18n.changeLanguage(e.target.value); document.documentElement.lang=e.target.value; }}><option value="ru">Русский</option><option value="en">English</option></select></header>
    <p>{t('editorNote')}</p><div className="toolbar"><button onClick={() => choose({ ...structuredClone(starterCards[0]), id: `card-${Date.now()}`, name: { ru: t('newCard'), en: '' } })}>{t('newCard')}</button><button disabled={busy} onClick={() => void load()}>{t('reloadCatalog')}</button>
    <select aria-label={t('catalog')} value={catalog.cards.some(c=>c.id===card.id) ? card.id : ''} onChange={e => { const c=catalog.cards.find(c=>c.id===e.target.value); if(c) choose(c); }}><option value="">{t('draft')}</option>{catalog.cards.map(c=><option key={c.id} value={c.id}>{c.name[i18n.language] || c.name.ru}</option>)}</select>
    <label>{t('import')}<input type="file" accept="application/json,.json" onChange={e => { const file=e.target.files?.[0]; if(file) void (async()=>{ try { if(file.size>7_000_000) throw new Error(); const data: unknown=JSON.parse(await file.text()); if(!validateCard(data)) throw new Error(); choose(data); } catch { setMessage('invalidCard'); } })(); }}/></label></div>
    <div className="editor-grid"><section>
      <label>{t('cardId')}<input value={card.id} maxLength={60} onChange={e=>setCard({...card,id:e.target.value})}/></label>
      {(['ru','en'] as const).map(lang=><label key={lang}>{t('name')} ({lang})<input value={card.name[lang] ?? ''} maxLength={100} onChange={e=>setCard({...card,name:{...card.name,[lang]:e.target.value}})}/></label>)}
      <label>{t('description')}<textarea value={card.description.ru} maxLength={500} onChange={e=>setCard({...card,description:{...card.description,ru:e.target.value}})}/></label>
      <div className="stats-fields">{(['cost','attack','health'] as const).map(key=><label key={key}>{t(key)}<input type="number" min={key==='health'?1:0} max={key==='cost'?10:99} value={card[key]} onChange={e=>setCard({...card,[key]:Number(e.target.value)})}/></label>)}</div>
      <label>{t('rarity')}<select value={card.rarity} onChange={e=>setCard({...card,rarity:e.target.value as CardDefinition['rarity']})}>{rarities.map(r=><option key={r} value={r}>{t(r)}</option>)}</select></label>
      <label>{t('minionTypes')}<input value={card.minionTypes.join(',')} onChange={e=>setCard({...card,minionTypes:e.target.value ? e.target.value.split(',') : []})}/></label>
      <fieldset><legend>{t('properties')}</legend>{properties.map(p=><label className="check" key={p}><input type="checkbox" checked={card.properties.includes(p)} onChange={e=>setCard({...card,properties:e.target.checked?[...card.properties,p]:card.properties.filter(x=>x!==p)})}/>{t(p)}</label>)}</fieldset>
      <fieldset><legend>{t('abilities')}</legend>{card.abilities.map((a,n)=><div className="ability" key={n}>
        <select aria-label={t('trigger')} value={a.trigger} onChange={e=>updateAbility(n,{trigger:e.target.value,...(e.target.value==='enrage'?{effectId:'attack',params:{target:'self',amount:2}}:{})})}>{triggers.map(k=><option key={k} value={k}>{t(k)}</option>)}</select>
        <select aria-label={t('effect')} value={a.effectId} disabled={a.trigger==='enrage'} onChange={e=>updateAbility(n,{effectId:e.target.value,params:{...a.params,target:'self'}})}>{effects.map(k=><option key={k} value={k}>{t(k)}</option>)}</select>
        <select aria-label={t('target')} value={String(a.params.target)} disabled={a.trigger==='enrage'} onChange={e=>updateAbility(n,{params:{...a.params,target:e.target.value}})}>{['self','allEnemies',...(['damage','heal'].includes(a.effectId)?['enemyHero']:[])].map(k=><option key={k} value={k}>{t(k)}</option>)}</select>
        <input aria-label={t('amount')} type="number" min={1} max={20} value={Number(a.params.amount)} onChange={e=>updateAbility(n,{params:{...a.params,amount:Number(e.target.value)}})}/>
        <button onClick={()=>setCard({...card,abilities:card.abilities.filter((_,i)=>i!==n)})}>{t('remove')}</button>
      </div>)}<button disabled={card.abilities.length>=8} onClick={()=>setCard({...card,abilities:[...card.abilities,{trigger:'battlecry',effectId:'damage',params:{target:'enemyHero',amount:1}}]})}>{t('addAbility')}</button><p>{t('enrageNote')}</p></fieldset>
    </section><section>
      <div className="inspect editor-inspect"><CardInspect card={card} /></div>
      <fieldset><legend>{t('audio')}</legend>{([['spawn','spawnSound'],['death','deathSound'],['attack','attackSound']] as const).map(([event, label]) => <div key={event} className="audio-row">
        <label>{t(label)}<input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/webm" onChange={e=>{ const f=e.target.files?.[0], id=card.id; if(f) void (async()=>{ if(f.size>1_000_000 || !/^audio\/(mpeg|mp3|wav|x-wav|ogg|webm)$/.test(f.type)){setMessage('invalidAudio');return;} const url=await readData(f); setCard(c=>c.id===id?{...c,audio:{...c.audio,[event]:url}}:c); })().catch(()=>setMessage('invalidAudio')); }}/></label>
        {card.audio[event] && <><audio controls src={card.audio[event]}/><button onClick={()=>setCard({...card,audio:{...card.audio,[event]:''}})}>{t('remove')}</button></>}
      </div>)}</fieldset>
      <label>{t('photo')}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void photo(e.target.files?.[0])}/></label>
      {(['x','y','size'] as const).map(key=><label key={key}>{t(`crop_${key}`)}<input type="range" min={key==='size'?.1:0} max={1} step={.01} value={card.art.crop[key]} onChange={e=>setCard({...card,art:{...card.art,crop:{...card.art.crop,[key]:Number(e.target.value)}}})}/></label>)}
      <ImageProcessingPipeline art={card.art} onChange={art => setCard(c => ({ ...c, art }))} />
    </section></div>
    <section className="publish"><button onClick={save}>{t('export')}</button><label>{t('adminToken')}<input type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)}/></label><button disabled={busy || !token || !catalog.version} onClick={()=>void publish()}>{t('publish')}</button><p role="status">{message && t(message)}</p></section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Editor/>);
