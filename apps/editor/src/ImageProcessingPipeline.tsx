import type { CardDefinition } from '@kartishki/shared';
import { normalizePreset, applyPortraitPreset, portraitPresets } from '@kartishki/shared/photo';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useCardArt } from '../../client/src/ui/cardArt';

type Art=CardDefinition['art'];
export function ImageProcessingPipeline({art,onChange}:{art:Art;onChange:(art:Art)=>void}){
 const {t,i18n}=useTranslation();const ru=i18n.language.startsWith('ru');const id=useId();const preset=normalizePreset(art.preset);
 const preview=useCardArt(art,512);const defaults=portraitPresets[preset as keyof typeof portraitPresets]??portraitPresets.printed;
 const labels={
  printed:ru?'Печатный портрет':'Printed Portrait',
  dirty:ru?'Грязная печать':'Dirty Print',
  noir:ru?'Чёрные чернила':'Noir Ink',
  faded:ru?'Выцветший':'Faded',
  sepia:ru?'Сепия':'Sepia',
  harsh:ru?'Жёсткий контраст':'Harsh contrast',
  cyan:ru?'Цианотипия':'Cyanotype',
  bleach:ru?'Выбеленный':'Bleach',
  offset:ru?'Офсет':'Offset',
  flash:ru?'Вспышка':'Flash',
  toon:ru?'Тоон':'Toon',
  gif:ru?'Гиф-растр':'GIF raster',
  none:ru?'Оригинал':'Original',
 };
 const slider=(key:'brightness'|'contrast'|'saturation'|'warmth'|'grain'|'intensity'|'paper'|'vignette'|'inkEdge'|'rotation',label:string,min:number,max:number)=>{
  const value=art[key]??(key==='rotation'?0:defaults[key]);
  return <label htmlFor={`${id}-${key}`} key={key}>{label} <output>{value.toFixed(2)}</output><input id={`${id}-${key}`} type="range" min={min} max={max} step=".01" value={value} disabled={preset==='none'&&key!=='rotation'} onChange={e=>onChange({...art,[key]:Number(e.target.value)})}/></label>;
 };
 return <fieldset className="photo-pipeline"><legend>{t('photoPipeline')}</legend>
  <div className="photo-preview portrait-crop-guides">{preview&&<img src={preview} alt={ru?'Предпросмотр обработки фотографии':'Processed portrait preview'}/>}<span className="portrait-safe-area" aria-hidden="true"/><small>{ru?'Лицо внутри рамки':'Keep face inside guide'}</small></div>
  <div className="photo-controls"><label htmlFor={`${id}-preset`}>{t('photoPreset')}<select id={`${id}-preset`} value={preset} onChange={e=>onChange(applyPortraitPreset(art,e.target.value as keyof typeof portraitPresets))}>
   {Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
   {!(preset in labels)&&<option value={preset}>{t(`photo_${preset}`)} ({ru?'сохранённый':'saved'})</option>}
  </select></label>
  {slider('brightness',ru?'Яркость':'Brightness',.5,1.5)}
  {slider('contrast',t('contrast'),.1,4)}
  {slider('saturation',t('saturation'),0,2)}
  <details className="portrait-advanced"><summary>{ru?'Точная настройка печати':'Advanced print controls'}</summary>
   {slider('warmth',ru?'Теплота':'Warmth',-1,1)}{slider('grain',ru?'Зерно':'Grain',0,1)}
   {slider('intensity',ru?'Печатный эффект':'Print effect',0,1)}{slider('paper',ru?'Бумага':'Paper texture',0,1)}
   {slider('vignette',ru?'Виньетка':'Vignette',0,1)}{slider('inkEdge',ru?'Контур тушью':'Ink edge',0,1)}
   {slider('rotation',ru?'Поворот':'Rotation',-30,30)}
  </details>
  <button type="button" onClick={()=>onChange({...applyPortraitPreset(art,'printed'),rotation:0})}>{ru?'Сбросить обработку':'Reset processing'}</button>
  <button type="button" aria-pressed={preset==='none'} onClick={()=>onChange(applyPortraitPreset(art,'none'))}>{t('photoNone')}</button>
  {art.originalUrl&&<a href={art.originalUrl} target="_blank" rel="noreferrer">{ru?'Исходный файл сохранён ↗':'Original file preserved ↗'}</a>}
  </div>
 </fieldset>;
}
