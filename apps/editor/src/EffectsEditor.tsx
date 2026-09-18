import {
  AB_EFFECT_STEP_LIMIT,
  autoBattlerEffectScales,
  autoBattlerEffectTargets,
  autoBattlerEffectTriggers,
  autoBattlerKeywords,
  autoBattlerTribes,
  type AutoBattlerEffect,
  type AutoBattlerEffectAction,
  type AutoBattlerEffectStep,
  type AutoBattlerEffectTarget,
  type AutoBattlerEffectTrigger,
  type AutoBattlerKeyword,
  type AutoBattlerMinionDef,
  type AutoBattlerTribe,
} from '@kartishki/shared';

export type NameFn = (group: 'tribes' | 'keywords', id: string) => string;
type Kind = AutoBattlerEffectAction['kind'];
type TribeKey = 'tribe' | 'onTribe' | 'perTribe';
type KeywordKey = 'onKeyword' | 'perKeyword';

export const clamp = (value: unknown, min: number, max: number) => { const n = Math.round(Number(value)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; };

const TRIGGER: Record<AutoBattlerEffectTrigger, [string, string]> = {
  battlecry: ['Боевой клич', 'Battlecry'],
  play: ['После розыгрыша существа', 'After you play a minion'],
  buy: ['После покупки существа', 'After you buy a minion'],
  sell: ['После продажи', 'After you sell'],
  endTurn: ['В конце хода', 'End of turn'],
  triple: ['Триплет', 'After you make a triple'],
  startCombat: ['В начале боя', 'Start of combat'],
  deathrattle: ['Предсмертный хрип', 'Deathrattle'],
  aura: ['Аура', 'Aura'],
  reroll: ['После обновления лавки', 'After you refresh the tavern'],
  friendlyDeath: ['Когда ваше существо погибает', 'Whenever a friendly minion dies'],
  shieldPop: ['Когда ваше существо теряет щит', 'Whenever a friendly minion loses Divine Shield'],
  friendlyAttack: ['После атаки вашего существа', 'After a friendly minion attacks'],
  spell: ['После заклинания таверны', 'After you play a tavern spell'],
  friendlySummon: ['Когда ваше существо призвано в бою', 'Whenever a friendly minion is summoned in combat'],
  selfDamage: ['После урона герою от ваших демонов', 'After your hero takes damage from your demons'],
  devour: ['После пожирания существа из лавки', 'After a friendly minion devours'],
};
const TARGET: Record<AutoBattlerEffectTarget, [string, string]> = {
  self: ['себе', 'self'], adjacent: ['соседям', 'adjacent minions'], friendly: ['всем своим', 'all friendly minions'], random: ['случайному своему', 'a random friendly minion'],
  bought: ['купленному', 'the bought minion'], hand: ['существам в руке', 'minions in hand'], tavern: ['существам в лавке', 'tavern minions'], subject: ['виновнику', 'the subject minion'],
};
const KIND: Record<Kind, [string, string]> = { buff: ['Бафф', 'Buff'], gold: ['Золото', 'Gold'], aura: ['Аура', 'Aura'], keyword: ['Свойство', 'Keyword'], summon: ['Призыв', 'Summon'], echo: ['Эхо (клич/хрип дважды)', 'Echo (battlecry/deathrattle twice)'], selfDamage: ['Урон своему герою', 'Damage your hero'], devour: ['Пожрать существо из лавки', 'Devour a tavern minion'], guard: ['Защита героя от своих демонов', 'Guard the hero from its demons'] };
const SCALE = { tribes: ['за каждую расу на поле', 'per tribe on board'], minions: ['за каждое своё существо', 'per friendly minion'] } as const;

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

/** One line per scenario step: the action, its target and scaling. */
export function stepSummary(e: AutoBattlerEffect, step: AutoBattlerEffectStep, ru: boolean, name: NameFn, minionName: (id: string) => string): string {
  const i = ru ? 0 : 1;
  const a = step.action;
  const kw = (k: AutoBattlerKeyword) => name('keywords', k);
  const tribe = (t: AutoBattlerTribe | 'all') => t === 'all' ? (ru ? 'любой расы' : 'of any tribe') : name('tribes', t);
  const action = a.kind === 'buff' ? `${signed(a.attack)}/${signed(a.health)}`
    : a.kind === 'gold' ? (ru ? `+${a.amount} золота` : `+${a.amount} gold`)
    : a.kind === 'aura' ? (ru ? `+${a.attack} к атаке` : `+${a.attack} attack`)
    : a.kind === 'keyword' ? (ru ? `даёт «${kw(a.keyword)}»` : `grants ${kw(a.keyword)}`)
    : a.kind === 'echo' ? (ru ? `ваши ${a.echo === 'battlecry' ? 'боевые кличи' : 'предсмертные хрипы'} срабатывают дважды` : `your ${a.echo === 'battlecry' ? 'Battlecries' : 'Deathrattles'} trigger twice`)
    : a.kind === 'selfDamage' ? (ru ? `герой получает ${a.amount} урона` : `your hero takes ${a.amount} damage`)
    : a.kind === 'devour' ? (ru ? `пожирает ${a.count} из лавки` : `devours ${a.count} from the tavern`)
    : a.kind === 'guard' ? (ru ? 'герой защищён от своих демонов' : 'your hero is guarded from its demons')
    : (ru ? `призывает ${a.count}× ${minionName(a.summonId)}` : `summons ${a.count}× ${minionName(a.summonId)}`);
  const parts = [action];
  if (a.kind === 'buff' || a.kind === 'keyword' || a.kind === 'aura') parts.push(`→ ${(a.kind === 'aura' ? TARGET.friendly : TARGET[step.target ?? 'self'])[i]}${step.tribe ? ` ${tribe(step.tribe)}` : ''}`);
  if (step.per === 'tribes') parts.push(`× ${SCALE.tribes[i]}`);
  if (step.per === 'minions') parts.push(`× ${SCALE.minions[i]}${step.perTribe ? ` ${tribe(step.perTribe)}` : ''}${step.perKeyword ? (ru ? ` с «${kw(step.perKeyword)}»` : ` with ${kw(step.perKeyword)}`) : ''}`);
  void e;
  return parts.join(' ');
}

export function effectSummary(e: AutoBattlerEffect, ru: boolean, name: NameFn, minionName: (id: string) => string): string {
  const i = ru ? 0 : 1;
  const a = e.action;
  const kw = (k: AutoBattlerKeyword) => name('keywords', k);
  const tribe = (t: AutoBattlerTribe | 'all') => t === 'all' ? (ru ? 'любой расы' : 'of any tribe') : name('tribes', t);
  const action = a.kind === 'buff' ? `${signed(a.attack)}/${signed(a.health)}`
    : a.kind === 'gold' ? (ru ? `+${a.amount} золота` : `+${a.amount} gold`)
    : a.kind === 'aura' ? (ru ? `+${a.attack} к атаке` : `+${a.attack} attack`)
    : a.kind === 'keyword' ? (ru ? `даёт «${kw(a.keyword)}»` : `grants ${kw(a.keyword)}`)
    : a.kind === 'echo' ? (ru ? `ваши ${a.echo === 'battlecry' ? 'боевые кличи' : 'предсмертные хрипы'} срабатывают дважды` : `your ${a.echo === 'battlecry' ? 'Battlecries' : 'Deathrattles'} trigger twice`)
    : a.kind === 'selfDamage' ? (ru ? `герой получает ${a.amount} урона` : `your hero takes ${a.amount} damage`)
    : a.kind === 'devour' ? (ru ? `пожирает ${a.count} из лавки` : `devours ${a.count} from the tavern`)
    : a.kind === 'guard' ? (ru ? 'герой защищён от своих демонов' : 'your hero is guarded from its demons')
    : (ru ? `призывает ${a.count}× ${minionName(a.summonId)}` : `summons ${a.count}× ${minionName(a.summonId)}`);
  const trigger = e.trigger === 'battlecry' || e.trigger === 'deathrattle' ? kw(e.trigger) : TRIGGER[e.trigger][i];
  const cond = [e.onTribe && tribe(e.onTribe), e.onKeyword && kw(e.onKeyword)].filter(Boolean).join(', ');
  const parts = [`${trigger}${cond ? ` (${cond})` : ''}: ${action}`];
  if (a.kind === 'buff' || a.kind === 'keyword' || a.kind === 'aura') parts.push(`→ ${(a.kind === 'aura' ? TARGET.friendly : TARGET[e.target ?? 'self'])[i]}${e.tribe ? ` ${tribe(e.tribe)}` : ''}`);
  if (e.per === 'tribes') parts.push(`× ${SCALE.tribes[i]}`);
  if (e.per === 'minions') parts.push(`× ${SCALE.minions[i]}${e.perTribe ? ` ${tribe(e.perTribe)}` : ''}${e.perKeyword ? (ru ? ` с «${kw(e.perKeyword)}»` : ` with ${kw(e.perKeyword)}`) : ''}`);
  for (const step of e.steps ?? []) parts.push(`, ${ru ? 'затем' : 'then'} ${stepSummary(e, step, ru, name, minionName)}`);
  return parts.join(' ');
}

const blankAction = (kind: Kind, summonId: string): AutoBattlerEffectAction =>
  kind === 'buff' ? { kind, attack: 1, health: 1 } : kind === 'gold' ? { kind, amount: 1 } : kind === 'aura' ? { kind, attack: 1 } : kind === 'keyword' ? { kind, keyword: 'taunt' } : kind === 'echo' ? { kind, echo: 'battlecry' } : kind === 'selfDamage' ? { kind, amount: 1 } : kind === 'devour' ? { kind, count: 1 } : kind === 'guard' ? { kind } : { kind, summonId, count: 1 };

type Props = {
  effects: AutoBattlerEffect[];
  onChange: (effects: AutoBattlerEffect[]) => void;
  minions: AutoBattlerMinionDef[];
  ru: boolean;
  name: NameFn;
  minionName: (id: string) => string;
};

export function EffectsEditor({ effects, onChange, minions, ru, name, minionName }: Props) {
  const i = ru ? 0 : 1;
  const set = (at: number, fn: (e: AutoBattlerEffect) => AutoBattlerEffect) => onChange(effects.map((e, k) => k === at ? fn(e) : e));
  const move = (at: number, by: number) => { const next = [...effects]; const [e] = next.splice(at, 1); next.splice(at + by, 0, e!); onChange(next); };
  const tokens = minions.filter(m => m.token);
  const others = minions.filter(m => !m.token);
  const defaultSummon = tokens[0]?.id ?? minions[0]?.id ?? '';
  const option = (id: string) => <option key={id} value={id}>{minionName(id)}</option>;
  const tribeSelect = (at: number, e: AutoBattlerEffect, key: TribeKey, title: string) => <label>{title}<select value={e[key] ?? ''} onChange={ev => set(at, x => ({ ...x, [key]: (ev.target.value || undefined) as AutoBattlerTribe | 'all' | undefined }))}>
    <option value="">—</option><option value="all">{ru ? 'Любая раса' : 'Any tribe'}</option>
    {autoBattlerTribes.map(t => <option key={t} value={t}>{name('tribes', t)}</option>)}
  </select></label>;
  const keywordSelect = (at: number, e: AutoBattlerEffect, key: KeywordKey, title: string) => <label>{title}<select value={e[key] ?? ''} onChange={ev => set(at, x => ({ ...x, [key]: (ev.target.value || undefined) as AutoBattlerKeyword | undefined }))}>
    <option value="">—</option>
    {autoBattlerKeywords.map(k => <option key={k} value={k}>{name('keywords', k)}</option>)}
  </select></label>;
  const num = (at: number, e: AutoBattlerEffect, title: string, value: number, min: number, max: number, apply: (a: AutoBattlerEffectAction, n: number) => AutoBattlerEffectAction) =>
    <label>{title}<input type="number" min={min} max={max} value={value} onChange={ev => set(at, x => ({ ...x, action: apply(x.action, clamp(ev.target.value, min, max)) }))} /></label>;
  // Scenario steps: the same target/action/scale fields, edited on e.steps[k].
  const setStep = (at: number, k: number, fn: (step: AutoBattlerEffectStep) => AutoBattlerEffectStep) => set(at, x => ({ ...x, steps: (x.steps ?? []).map((step, n) => n === k ? fn(step) : step) }));
  const stepNum = (at: number, k: number, title: string, value: number, min: number, max: number, apply: (a: AutoBattlerEffectAction, n: number) => AutoBattlerEffectAction) =>
    <label>{title}<input type="number" min={min} max={max} value={value} onChange={ev => setStep(at, k, x => ({ ...x, action: apply(x.action, clamp(ev.target.value, min, max)) }))} /></label>;
  const stepTribe = (at: number, k: number, step: AutoBattlerEffectStep, key: 'tribe' | 'perTribe', title: string) => <label>{title}<select value={step[key] ?? ''} onChange={ev => setStep(at, k, x => ({ ...x, [key]: (ev.target.value || undefined) as AutoBattlerTribe | 'all' | undefined }))}>
    <option value="">—</option><option value="all">{ru ? 'Любая раса' : 'Any tribe'}</option>
    {autoBattlerTribes.map(t => <option key={t} value={t}>{name('tribes', t)}</option>)}
  </select></label>;
  const scenario = (at: number, e: AutoBattlerEffect) => {
    const steps = e.steps ?? [];
    return <div className="effect-steps">
      <p className="effect-steps-title">{ru ? 'Сценарий: шаги после первого действия' : 'Scenario: steps after the first action'} ({steps.length}/{AB_EFFECT_STEP_LIMIT})</p>
      {steps.map((step, k) => {
        const a = step.action;
        return <div className="effect-step" key={k}>
          <div className="effect-head"><p className="effect-summary">{ru ? 'Шаг' : 'Step'} {k + 2}: {stepSummary(e, step, ru, name, minionName)}</p>
            <span className="effect-buttons">
              <button type="button" disabled={k === 0} onClick={() => set(at, x => { const next = [...(x.steps ?? [])]; const [s] = next.splice(k, 1); next.splice(k - 1, 0, s!); return { ...x, steps: next }; })}>↑</button>
              <button type="button" disabled={k === steps.length - 1} onClick={() => set(at, x => { const next = [...(x.steps ?? [])]; const [s] = next.splice(k, 1); next.splice(k + 1, 0, s!); return { ...x, steps: next }; })}>↓</button>
              <button type="button" onClick={() => set(at, x => { const next = (x.steps ?? []).filter((_, n) => n !== k); return { ...x, steps: next.length ? next : undefined }; })}>✕</button>
            </span></div>
          <div className="effect-fields">
            <label>{ru ? 'Цель' : 'Target'}<select value={step.target ?? ''} onChange={ev => setStep(at, k, x => ({ ...x, target: (ev.target.value || undefined) as AutoBattlerEffectTarget | undefined }))}>
              <option value="">{ru ? 'по умолчанию (себе)' : 'default (self)'}</option>
              {autoBattlerEffectTargets.map(t => <option key={t} value={t}>{TARGET[t][i]}</option>)}
            </select></label>
            {stepTribe(at, k, step, 'tribe', ru ? 'Раса цели' : 'Target tribe')}
            <label>{ru ? 'Действие' : 'Action'}<select value={a.kind} onChange={ev => { const kind = ev.target.value as Kind; setStep(at, k, x => ({ ...x, action: blankAction(kind === 'aura' && e.trigger !== 'aura' ? 'buff' : kind, defaultSummon) })); }}>
              {(Object.keys(KIND) as Kind[]).filter(kind => kind !== 'aura' || e.trigger === 'aura').map(kind => <option key={kind} value={kind}>{KIND[kind][i]}</option>)}
            </select></label>
            {a.kind === 'buff' && <>
              {stepNum(at, k, ru ? 'Атака' : 'Attack', a.attack, -20, 20, (x, n) => x.kind === 'buff' ? { ...x, attack: n } : x)}
              {stepNum(at, k, ru ? 'Здоровье' : 'Health', a.health, -20, 20, (x, n) => x.kind === 'buff' ? { ...x, health: n } : x)}
            </>}
            {a.kind === 'gold' && stepNum(at, k, ru ? 'Золото' : 'Gold', a.amount, 1, 10, (x, n) => x.kind === 'gold' ? { ...x, amount: n } : x)}
            {a.kind === 'aura' && stepNum(at, k, ru ? 'Атака ауры' : 'Aura attack', a.attack, 1, 10, (x, n) => x.kind === 'aura' ? { ...x, attack: n } : x)}
            {a.kind === 'keyword' && <label>{ru ? 'Свойство' : 'Keyword'}<select value={a.keyword} onChange={ev => setStep(at, k, x => ({ ...x, action: { kind: 'keyword', keyword: ev.target.value as AutoBattlerKeyword } }))}>
              {autoBattlerKeywords.map(kw => <option key={kw} value={kw}>{name('keywords', kw)}</option>)}
            </select></label>}
            {a.kind === 'summon' && <>
              <label>{ru ? 'Призыв' : 'Summon'}<select value={a.summonId} onChange={ev => setStep(at, k, x => ({ ...x, action: { kind: 'summon', summonId: ev.target.value, count: x.action.kind === 'summon' ? x.action.count : 1 } }))}>
                {!minions.some(m => m.id === a.summonId) && <option value={a.summonId}>{a.summonId || '—'}</option>}
                <optgroup label={ru ? 'Жетоны' : 'Tokens'}>{tokens.map(m => option(m.id))}</optgroup>
                <optgroup label={ru ? 'Остальные' : 'Others'}>{others.map(m => option(m.id))}</optgroup>
              </select></label>
              {stepNum(at, k, ru ? 'Количество' : 'Count', a.count, 1, 7, (x, n) => x.kind === 'summon' ? { ...x, count: n } : x)}
            </>}
            <label>{ru ? 'Множитель' : 'Scale'}<select value={step.per ?? ''} onChange={ev => setStep(at, k, x => ({ ...x, per: (ev.target.value || undefined) as AutoBattlerEffectStep['per'], perTribe: ev.target.value === 'minions' ? x.perTribe : undefined, perKeyword: ev.target.value === 'minions' ? x.perKeyword : undefined }))}>
              <option value="">—</option>
              {autoBattlerEffectScales.map(sc => <option key={sc} value={sc}>{SCALE[sc][i]}</option>)}
            </select></label>
            {step.per === 'minions' && stepTribe(at, k, step, 'perTribe', ru ? 'Раса множителя' : 'Scale tribe')}
          </div>
        </div>;
      })}
      <button type="button" disabled={steps.length >= AB_EFFECT_STEP_LIMIT} onClick={() => set(at, x => ({ ...x, steps: [...(x.steps ?? []), { target: 'self', action: { kind: 'buff', attack: 1, health: 1 } }] }))}>{ru ? 'Добавить шаг' : 'Add step'}</button>
    </div>;
  };

  return <fieldset className="effects-editor"><legend>{ru ? 'Эффекты' : 'Effects'} ({effects.length}/6)</legend>
    {effects.map((e, at) => {
      const a = e.action;
      return <article className="effect-card" key={at}>
        <div className="effect-head">
          <p className="effect-summary">{at + 1}. {effectSummary(e, ru, name, minionName)}</p>
          <span className="effect-buttons">
            <button type="button" disabled={at === 0} title={ru ? 'Выше' : 'Move up'} onClick={() => move(at, -1)}>↑</button>
            <button type="button" disabled={at === effects.length - 1} title={ru ? 'Ниже' : 'Move down'} onClick={() => move(at, 1)}>↓</button>
            <button type="button" title={ru ? 'Удалить' : 'Remove'} onClick={() => onChange(effects.filter((_, k) => k !== at))}>✕</button>
          </span>
        </div>
        <div className="effect-fields">
          <label>{ru ? 'Триггер' : 'Trigger'}<select value={e.trigger} onChange={ev => { const trigger = ev.target.value as AutoBattlerEffectTrigger; set(at, x => ({ ...x, trigger, action: x.action.kind === 'aura' && trigger !== 'aura' ? blankAction('buff', defaultSummon) : x.action })); }}>
            {autoBattlerEffectTriggers.map(t => <option key={t} value={t}>{t === 'battlecry' || t === 'deathrattle' ? name('keywords', t) : TRIGGER[t][i]}</option>)}
          </select></label>
          <label>{ru ? 'Цель' : 'Target'}<select value={e.target ?? ''} onChange={ev => set(at, x => ({ ...x, target: (ev.target.value || undefined) as AutoBattlerEffectTarget | undefined }))}>
            <option value="">{ru ? 'по умолчанию (себе)' : 'default (self)'}</option>
            {autoBattlerEffectTargets.map(t => <option key={t} value={t}>{TARGET[t][i]}</option>)}
          </select></label>
          {tribeSelect(at, e, 'tribe', ru ? 'Раса цели' : 'Target tribe')}
          <label>{ru ? 'Действие' : 'Action'}<select value={a.kind} onChange={ev => { const kind = ev.target.value as Kind; set(at, x => ({ ...x, trigger: kind === 'aura' ? 'aura' : x.trigger, action: blankAction(kind, defaultSummon) })); }}>
            {(Object.keys(KIND) as Kind[]).map(k => <option key={k} value={k}>{KIND[k][i]}</option>)}
          </select></label>
          {a.kind === 'buff' && <>
            {num(at, e, ru ? 'Атака' : 'Attack', a.attack, -20, 20, (x, n) => x.kind === 'buff' ? { ...x, attack: n } : x)}
            {num(at, e, ru ? 'Здоровье' : 'Health', a.health, -20, 20, (x, n) => x.kind === 'buff' ? { ...x, health: n } : x)}
          </>}
          {a.kind === 'gold' && num(at, e, ru ? 'Золото' : 'Gold', a.amount, 1, 10, (x, n) => x.kind === 'gold' ? { ...x, amount: n } : x)}
          {a.kind === 'aura' && num(at, e, ru ? 'Атака ауры' : 'Aura attack', a.attack, 1, 10, (x, n) => x.kind === 'aura' ? { ...x, attack: n } : x)}
          {a.kind === 'keyword' && <label>{ru ? 'Свойство' : 'Keyword'}<select value={a.keyword} onChange={ev => set(at, x => ({ ...x, action: { kind: 'keyword', keyword: ev.target.value as AutoBattlerKeyword } }))}>
            {autoBattlerKeywords.map(k => <option key={k} value={k}>{name('keywords', k)}</option>)}
          </select></label>}
          {a.kind === 'summon' && <>
            <label>{ru ? 'Призыв' : 'Summon'}<select value={a.summonId} onChange={ev => set(at, x => ({ ...x, action: { kind: 'summon', summonId: ev.target.value, count: x.action.kind === 'summon' ? x.action.count : 1 } }))}>
              {!minions.some(m => m.id === a.summonId) && <option value={a.summonId}>{a.summonId || '—'}</option>}
              <optgroup label={ru ? 'Жетоны' : 'Tokens'}>{tokens.map(m => option(m.id))}</optgroup>
              <optgroup label={ru ? 'Остальные' : 'Others'}>{others.map(m => option(m.id))}</optgroup>
            </select></label>
            {num(at, e, ru ? 'Количество' : 'Count', a.count, 1, 7, (x, n) => x.kind === 'summon' ? { ...x, count: n } : x)}
          </>}
          {tribeSelect(at, e, 'onTribe', ru ? 'Только если раса' : 'Only if tribe')}
          {keywordSelect(at, e, 'onKeyword', ru ? 'Только если свойство' : 'Only if keyword')}
          <label>{ru ? 'Множитель' : 'Scale'}<select value={e.per ?? ''} onChange={ev => set(at, x => ({ ...x, per: (ev.target.value || undefined) as AutoBattlerEffect['per'], perTribe: ev.target.value === 'minions' ? x.perTribe : undefined, perKeyword: ev.target.value === 'minions' ? x.perKeyword : undefined }))}>
            <option value="">—</option>
            {autoBattlerEffectScales.map(s => <option key={s} value={s}>{SCALE[s][i]}</option>)}
          </select></label>
          {e.per === 'minions' && tribeSelect(at, e, 'perTribe', ru ? 'Раса множителя' : 'Scale tribe')}
          {e.per === 'minions' && keywordSelect(at, e, 'perKeyword', ru ? 'Свойство множителя' : 'Scale keyword')}
        </div>
        {scenario(at, e)}
      </article>;
    })}
    <button type="button" disabled={effects.length >= 6} onClick={() => onChange([...effects, { trigger: 'battlecry', target: 'self', action: { kind: 'buff', attack: 1, health: 1 } }])}>{ru ? 'Добавить эффект' : 'Add effect'}</button>
  </fieldset>;
}
