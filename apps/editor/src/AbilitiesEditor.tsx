import type { CardDefinition } from '@kartishki/shared';
import { effects, triggers } from '@kartishki/shared';
import { useTranslation } from 'react-i18next';
type Props = { card: CardDefinition; cards: CardDefinition[]; onChange: (card: CardDefinition) => void };
export function AbilitiesEditor({ card, cards, onChange }: Props) {
  const { t } = useTranslation();
  const update = (index: number, patch: Partial<CardDefinition['abilities'][number]>) => onChange({ ...card, abilities: card.abilities.map((a, n) => n === index ? { ...a, ...patch } : a) });
  const add = (trigger: string) => onChange({ ...card, abilities: [...card.abilities, { trigger, effectId: trigger === 'enrage' ? 'attack' : 'summon', params: trigger === 'enrage' ? { target: 'self', amount: 2 } : { target: 'self', amount: 1, cardId: cards[0]?.id ?? card.id } }] });
  return <fieldset><legend>{t('abilities')}</legend><div className="trigger-buttons">{triggers.map(trigger => <button key={trigger} type="button" disabled={card.abilities.length >= 8} onClick={() => add(trigger)}>+ {t(trigger)}</button>)}</div>
    {card.abilities.map((a, index) => <fieldset key={index} className="ability-editor"><legend>{a.name || t(a.trigger)}</legend>
      <label>Название способности<input value={a.name ?? ''} placeholder={t(a.trigger)} maxLength={100} onChange={e => update(index, { name: e.target.value })} /></label>
      <label>{t('trigger')}<select value={a.trigger} onChange={e => update(index, { trigger: e.target.value, ...(e.target.value === 'enrage' && a.effectId !== 'summon' ? { effectId: 'attack', params: { target: 'self', amount: 2 } } : {}) })}>{triggers.map(k => <option key={k} value={k}>{t(k)}</option>)}</select></label>
      <label>{t('effect')}<select value={a.effectId} onChange={e => update(index, { effectId: e.target.value, params: e.target.value === 'summon' ? { target: 'self', cardId: cards[0]?.id ?? card.id, amount: 1 } : { target: 'self', amount: 2 } })}>{effects.filter(k => a.trigger !== 'enrage' || ['attack','summon'].includes(k)).map(k => <option key={k} value={k}>{t(k)}</option>)}</select></label>
      {a.effectId === 'summon' ? <label>Карта для призыва<select value={String(a.params.cardId)} onChange={e => update(index, { params: { ...a.params, cardId: e.target.value } })}>{[card, ...cards.filter(c => c.id !== card.id)].map(c => <option key={c.id} value={c.id}>{c.name.ru}</option>)}</select></label> : <label>{t('target')}<select disabled={a.trigger === 'enrage'} value={String(a.params.target)} onChange={e => update(index, { params: { ...a.params, target: e.target.value } })}>{['self','allEnemies',...(['damage','heal'].includes(a.effectId) ? ['enemyHero'] : [])].map(k => <option key={k} value={k}>{t(k)}</option>)}</select></label>}
      <label>{a.effectId === 'summon' ? 'Количество существ' : t('amount')}<input type="number" min={1} max={a.effectId === 'summon' ? 7 : 20} value={Number(a.params.amount)} onChange={e => update(index, { params: { ...a.params, amount: Number(e.target.value) } })} /></label>
      {a.trigger === 'enrage' && <p>Срабатывает при переходе из полного здоровья в раненое состояние. После полного лечения может сработать снова.</p>}
      <button onClick={() => onChange({ ...card, abilities: card.abilities.filter((_, n) => n !== index) })}>{t('remove')}</button>
    </fieldset>)}<p>Призыв ограничен 7 существами на вашей стороне. Боевой клич срабатывает только при розыгрыше из руки.</p></fieldset>;
}
