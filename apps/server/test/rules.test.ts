import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchState, PlayerState } from '@kartishki/shared';
import { advancePhase } from '../src/rules';

function match() {
  const state = new MatchState();
  state.players.set('a', new PlayerState());
  state.players.set('b', new PlayerState());
  state.status = 'active'; state.activePlayer = 'a'; state.turn = 1;
  return state;
}

test('invalid, stale and out-of-turn inputs cannot mutate state', () => {
  const state = match(); const before = state.toJSON();
  for (const input of [null, {}, 'main', { expectedRevision: -1 }, { expectedRevision: '0' }]) {
    assert.equal(advancePhase(state, 'a', input), false);
  }
  assert.equal(advancePhase(state, 'b', { expectedRevision: 0 }), false);
  assert.equal(advancePhase(state, 'intruder', { expectedRevision: 0 }), false);
  assert.deepEqual(state.toJSON(), before);
});

test('phases follow strict order, rotate players and cap mana', () => {
  const state = match();
  for (let turn = 1; turn <= 24; turn++) {
    const active = turn % 2 ? 'a' : 'b';
    assert.equal(state.activePlayer, active);
    assert.equal(state.turn, turn);
    for (const phase of ['main', 'combat', 'end', 'start']) {
      const revision = state.revision;
      assert.equal(advancePhase(state, active, { expectedRevision: revision }), true);
      assert.equal(state.phase, phase);
      assert.equal(advancePhase(state, active, { expectedRevision: revision }), false);
    }
    assert.equal(state.players.get(state.activePlayer)!.mana, Math.min(10, Math.ceil((turn + 1) / 2)));
  }
});

test('waiting and finished matches reject actions', () => {
  for (const status of ['waiting', 'finished']) {
    const state = match(); state.status = status;
    assert.equal(advancePhase(state, 'a', { expectedRevision: 0 }), false);
    assert.equal(state.phase, 'start');
  }
});
