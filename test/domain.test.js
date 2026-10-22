import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, createQuestion, transition } from '../src/domain.js';

function random(seed = 1) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function question(seed = 1, previousRange = null) {
  return createQuestion({ id: `question-${seed}`, rng: random(seed), previousRange });
}

function start(state = createInitialState(), seed = 1) {
  return transition(state, { type: 'START', question: question(seed, state.session?.question.range) });
}

function select(state, id) {
  return transition(state, { type: 'SELECT', id });
}

function complete(state) {
  return select(select(state, 'fn-sum'), 'arg-correct');
}

test('generated SUM questions agree with their table and have six distinct choices per stage', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const q = question(seed);
    assert.ok(q.rows.length >= 3 && q.rows.length <= 5);
    assert.equal(q.columns.length, 3);
    const salesIndex = q.columns.findIndex(column => column.title === '売上');
    const column = q.columns[salesIndex].letter;
    const expectedRange = `${column}2:${column}${q.rows.length + 1}`;
    assert.equal(q.range, expectedRange);
    assert.equal(q.formula, `=SUM(${expectedRange})`);
    assert.equal(q.total, q.rows.reduce((sum, row) => sum + row.cells[salesIndex], 0));
    for (const options of Object.values(q.choices)) {
      assert.equal(options.length, 6);
      assert.equal(new Set(options.map(option => option.label)).size, 6);
    }
  }
});

test('another question changes the correct argument, even with the same random input', () => {
  const first = question(10);
  const second = question(10, first.range);
  assert.notEqual(first.range, second.range);
});

test('a wrong function stays at the same step and does not update progress', () => {
  const state = select(start(), 'fn-average');
  assert.equal(state.session.stage, 'function');
  assert.equal(state.session.hadMistake, true);
  assert.equal(state.session.feedback, 'incorrect');
  assert.equal(state.progress.SUM.normal, 'unanswered');
});

test('selecting SUM advances to the argument without adding a closing parenthesis', () => {
  const state = select(start(), 'fn-sum');
  assert.equal(state.session.stage, 'argument');
  assert.equal(state.session.functionPart, '=SUM(');
  assert.equal(state.session.argumentPart, null);
});

test('a wrong comma is rejected without completing or repairing the formula', () => {
  const state = select(select(start(), 'fn-sum'), 'arg-trailing-comma');
  assert.equal(state.session.stage, 'argument');
  assert.equal(state.session.argumentPart, null);
  assert.equal(state.session.feedback, 'incorrect');
  assert.equal(state.progress.SUM.normal, 'unanswered');
});

test('a clean complete answer records a correct result and shows the explanation', () => {
  const state = complete(start());
  assert.equal(state.screen, 'review');
  assert.equal(state.session.outcome, 'correct');
  assert.equal(state.progress.SUM.normal, 'correct');
  assert.equal(state.session.functionPart + state.session.argumentPart, state.session.question.formula);
});

test('a corrected answer still records incorrect after a mistake during the question', () => {
  const state = complete(select(start(), 'fn-no-equals'));
  assert.equal(state.session.outcome, 'incorrect');
  assert.equal(state.progress.SUM.normal, 'incorrect');
});

test('discarding an unfinished question with a mistake preserves previous progress', () => {
  let state = complete(start());
  state = complete(start(state, 2));
  assert.equal(state.progress.SUM.normal, 'mastered');
  state = select(start(state, 3), 'fn-average');
  state = start(transition(state, { type: 'HOME' }), 4);
  assert.equal(state.progress.SUM.normal, 'mastered');
  assert.equal(state.session.hadMistake, false);
});

test('returning to the function keeps the selected text and mistake flag', () => {
  let state = select(start(), 'fn-no-open');
  state = select(state, 'fn-sum');
  state = transition(state, { type: 'BACK' });
  assert.equal(state.session.stage, 'function');
  assert.equal(state.session.functionPart, '=SUM(');
  assert.equal(state.session.hadMistake, true);
  assert.equal(complete(state).session.outcome, 'incorrect');
});

test('two consecutive correct answers become mastered and further correct answers stay mastered', () => {
  let state = complete(start());
  state = complete(start(state, 2));
  assert.equal(state.progress.SUM.normal, 'mastered');
  state = complete(start(state, 3));
  assert.equal(state.progress.SUM.normal, 'mastered');
});

test('an incorrect result resets consecutive correct progress', () => {
  let state = complete(start());
  state = select(start(state, 2), 'fn-average');
  state = complete(state);
  assert.equal(state.progress.SUM.normal, 'incorrect');
  state = complete(start(state, 3));
  assert.equal(state.progress.SUM.normal, 'correct');
});

test('showing the answer records an incorrect result exactly once', () => {
  const state = transition(start(), { type: 'SHOW_ANSWER' });
  assert.equal(state.session.revealed, true);
  assert.equal(state.session.outcome, 'incorrect');
  assert.equal(state.progress.SUM.normal, 'incorrect');
  assert.strictEqual(transition(state, { type: 'SHOW_ANSWER' }), state);
});

test('reloading and reselecting a completed answer does not count the same result twice', () => {
  const state = JSON.parse(JSON.stringify(complete(start())));
  assert.strictEqual(select(state, 'arg-correct'), state);
  assert.equal(state.progress.SUM.normal, 'correct');
});

test('home and resume preserve the same question, options, and current step', () => {
  const state = select(start(), 'fn-sum');
  const home = transition(state, { type: 'HOME' });
  assert.equal(home.screen, 'home');
  const resumed = transition(home, { type: 'RESUME' });
  assert.equal(resumed.screen, 'practice');
  assert.deepEqual(resumed.session, state.session);
});

test('unknown options do not affect the question or progress', () => {
  const state = start();
  assert.strictEqual(select(state, 'does-not-exist'), state);
});
