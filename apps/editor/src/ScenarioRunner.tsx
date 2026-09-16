import { useEffect, useState } from 'react';
import { autoBattlerEffectTriggers, type AutoBattlerEffectAction, type AutoBattlerEffectTrigger, type AutoBattlerMinionDef } from '@kartishki/shared';

type Body = { id: string; cardId: string; attack: number; health: number; keywords: string[] };
type Step = { step: number; action: AutoBattlerEffectAction; times: number; targets: string[]; gold: number; bankedGold: number; board: Body[]; hand: Body[] };

const SUBJECT_TRIGGERS: AutoBattlerEffectTrigger[] = ['play', 'buy', 'sell', 'friendlyDeath', 'shieldPop', 'friendlyAttack'];

/**
 * Step-through preview: the server runs the draft's trigger on a sample board with the real interpreter and returns
 * the board after every scenario step; the author walks through the steps one at a time.
 */
export function ScenarioRunner({ minion, minions, endpoint, ru, minionName }: { minion: AutoBattlerMinionDef; minions: AutoBattlerMinionDef[]; endpoint: string; ru: boolean; minionName: (id: string) => string }) {
  const triggers = [...new Set((minion.effects ?? []).map(e => e.trigger))];
  const [trigger, setTrigger] = useState<AutoBattlerEffectTrigger>(triggers[0] ?? 'battlecry');
  const [board, setBoard] = useState<string[]>([]);
  const [hand, setHand] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [golden, setGolden] = useState(false);
  const [seed, setSeed] = useState(7);
  const [result, setResult] = useState<{ steps: Step[]; fired: boolean } | null>(null);
  const [shown, setShown] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!triggers.includes(trigger) && triggers[0]) setTrigger(triggers[0]); }, [triggers.join(',')]);
  useEffect(() => { setResult(null); setShown(0); }, [minion, trigger, board.join(','), hand.join(','), subject, golden, seed]);
  const picks = minions.filter(m => !m.spell && m.id !== minion.id);
  const label = (body: Body) => `${minionName(body.cardId)} ${body.attack}/${body.health}${body.keywords.length ? ` [${body.keywords.join(', ')}]` : ''}`;
  async function run() {
    setBusy(true); setError('');
    try {
      const r = await fetch(`${endpoint}/api/simulate-effect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minion, board, hand, trigger, subject: subject || undefined, golden, seed }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'invalidRequest');
      setResult(data); setShown(data.steps.length ? 1 : 0);
    } catch (e) { setError(ru ? `Не удалось прогнать сценарий: ${e instanceof Error ? e.message : ''}` : `Could not run the scenario: ${e instanceof Error ? e.message : ''}`); }
    finally { setBusy(false); }
  }
  const current = result?.steps[shown - 1];
  return <fieldset className="scenario-runner" data-testid="scenario-runner"><legend>{ru ? 'Прогон сценария по шагам' : 'Scenario step-through'}</legend>
    {!triggers.length && <p>{ru ? 'У существа нет эффектов — нечего прогонять.' : 'The minion has no effects to run.'}</p>}
    {triggers.length > 0 && <>
      <div className="effect-fields">
        <label>{ru ? 'Триггер' : 'Trigger'}<select value={trigger} onChange={e => setTrigger(e.target.value as AutoBattlerEffectTrigger)}>
          {autoBattlerEffectTriggers.filter(t => triggers.includes(t)).map(t => <option key={t} value={t}>{t}</option>)}
        </select></label>
        <label>{ru ? 'Стол рядом (до 6)' : 'Board mates (up to 6)'}<select multiple size={6} value={board} onChange={e => setBoard([...e.target.selectedOptions].map(o => o.value).slice(0, 6))}>
          {picks.map(m => <option key={m.id} value={m.id}>{minionName(m.id)} {m.attack}/{m.health}</option>)}
        </select></label>
        <label>{ru ? 'В руке (до 3)' : 'In hand (up to 3)'}<select multiple size={4} value={hand} onChange={e => setHand([...e.target.selectedOptions].map(o => o.value).slice(0, 3))}>
          {picks.map(m => <option key={m.id} value={m.id}>{minionName(m.id)}</option>)}
        </select></label>
        {SUBJECT_TRIGGERS.includes(trigger) && <label>{ru ? 'Виновник триггера' : 'Trigger subject'}<select value={subject} onChange={e => setSubject(e.target.value)}>
          <option value="">—</option>
          <option value={minion.id}>{ru ? 'само существо' : 'the minion itself'}</option>
          {board.map(id => <option key={id} value={id}>{minionName(id)}</option>)}
        </select></label>}
        <label className="check"><input type="checkbox" checked={golden} onChange={e => setGolden(e.target.checked)} />{ru ? 'Золотое' : 'Golden'}</label>
        <label>{ru ? 'Зерно случайности' : 'Random seed'}<input type="number" min={1} max={9999} value={seed} onChange={e => setSeed(Math.max(1, Math.min(9999, Number(e.target.value) || 1)))} /></label>
      </div>
      <div className="effect-buttons"><button type="button" disabled={busy} onClick={() => void run()}>{ru ? 'Прогнать' : 'Run'}</button></div>
      {error && <p className="editor-issues">{error}</p>}
      {result && !result.fired && <p>{ru ? 'Триггер не сработал: условия (раса / свойство виновника, множитель) не выполнены.' : 'The trigger did not fire: its conditions (subject tribe / keyword, scale) were not met.'}</p>}
      {result && result.fired && <div className="scenario-steps">
        <div className="effect-buttons">
          <button type="button" disabled={shown <= 1} onClick={() => setShown(n => n - 1)}>◀ {ru ? 'Шаг назад' : 'Back'}</button>
          <span>{ru ? 'Шаг' : 'Step'} {shown} / {result.steps.length}</span>
          <button type="button" disabled={shown >= result.steps.length} onClick={() => setShown(n => n + 1)}>{ru ? 'Следующий шаг' : 'Next step'} ▶</button>
        </div>
        {current && <div className="scenario-state">
          <p><b>{ru ? 'Действие' : 'Action'}:</b> {JSON.stringify(current.action)} × {current.times} → {current.targets.length ? current.targets.join(', ') : (ru ? 'без целей' : 'no targets')}</p>
          <p><b>{ru ? 'Золото' : 'Gold'}:</b> {current.gold}{current.bankedGold ? ` (+${current.bankedGold} ${ru ? 'на следующий ход' : 'next turn'})` : ''}</p>
          <ol className="scenario-board">{current.board.map(body => <li key={body.id} className={current.targets.includes(body.id) ? 'is-hit' : ''}><span>{body.id}</span> {label(body)}</li>)}</ol>
          {current.hand.length > 0 && <p><b>{ru ? 'Рука' : 'Hand'}:</b> {current.hand.map(label).join(' · ')}</p>}
        </div>}
      </div>}
    </>}
  </fieldset>;
}
