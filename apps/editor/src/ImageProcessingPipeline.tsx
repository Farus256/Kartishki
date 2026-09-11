import type { CardDefinition } from '@kartishki/shared';
import { useId } from 'react';
import { useCardArt } from '../../client/src/ui/cardArt';

type Art = CardDefinition['art'];
const presets = { xerox: 'Газетный растр / Xerox', comic: 'Тушь + постеризация', stencil: 'Трафарет / Полароид' } as const;

/** Controlled settings feed the same renderPhoto pipeline used by CardInspect and the game. */
export function ImageProcessingPipeline({ art, onChange }: { art: Art; onChange: (art: Art) => void }) {
  const preset = art.preset ?? 'xerox';
  const id = useId();
  const preview = useCardArt(art, 512);
  return <fieldset className="photo-pipeline"><legend>Обработка фото · Noir Comic</legend>
    <div className="photo-preview">{preview && <img src={preview} alt="Предпросмотр обработки фотографии" />}</div>
    <div className="photo-controls">
    <label>Художественный фильтр<select value={preset} onChange={e => onChange({ ...art, preset: e.target.value as Art['preset'] })}>
      {Object.entries(presets).map(([id, title]) => <option key={id} value={id}>{title}</option>)}
    </select></label>
    <label htmlFor={`${id}-threshold`}>Порог контраста (Threshold) <output>{Math.round(art.threshold * 100)}%</output>
      <input id={`${id}-threshold`} type="range" min="0" max="1" step=".01" value={art.threshold} onChange={e => onChange({ ...art, threshold: Number(e.target.value) })} />
    </label>
    <label htmlFor={`${id}-edge`}>Толщина контура <output>{art.edgeWidth ?? 1}</output>
      <input id={`${id}-edge`} type="range" min="0" max="4" step="1" disabled={preset !== 'comic'} value={art.edgeWidth ?? 1} onChange={e => onChange({ ...art, edgeWidth: Number(e.target.value) })} />
    </label>
    <label htmlFor={`${id}-raster`}>Интенсивность растра <output>{Math.round((art.rasterIntensity ?? .55) * 100)}%</output>
      <input id={`${id}-raster`} type="range" min="0" max="1" step=".01" disabled={preset !== 'xerox'} value={art.rasterIntensity ?? .55} onChange={e => onChange({ ...art, rasterIntensity: Number(e.target.value) })} />
    </label>
    <label>Контраст<input type="range" min=".1" max="4" step=".01" value={art.contrast} onChange={e => onChange({ ...art, contrast: Number(e.target.value) })} /></label>
    <p>Контур применяется к туши, растр — к Xerox.</p>
    </div>
  </fieldset>;
}
