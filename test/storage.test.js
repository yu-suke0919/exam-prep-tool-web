import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestion } from '../src/domain.js';
import { createStore, STORAGE_KEY } from '../src/storage.js';

class MemoryStorage {
  value = null;
  writes = 0;
  fail = false;
  getItem() { return this.value; }
  setItem(key, value) {
    assert.equal(key, STORAGE_KEY);
    if (this.fail) throw new Error('Storage is full');
    this.value = value;
    this.writes++;
  }
}

function start(store) {
  store.dispatch({ type: 'START', question: createQuestion({ id: 'saved-question', rng: () => 0.4 }) });
}

function complete(store) {
  store.dispatch({ type: 'SELECT', id: 'fn-sum' });
  store.dispatch({ type: 'SELECT', id: 'arg-correct' });
}

test('an empty browser store starts unanswered without writing over anything', () => {
  const storage = new MemoryStorage();
  const store = createStore(storage);
  assert.equal(store.state.progress.SUM.normal, 'unanswered');
  assert.equal(storage.writes, 0);
});

test('progress and the completed question are saved in the same document', () => {
  const storage = new MemoryStorage();
  const store = createStore(storage);
  start(store);
  complete(store);
  const saved = JSON.parse(storage.value);
  assert.equal(saved.progress.SUM.normal, 'correct');
  assert.equal(saved.session.outcome, 'correct');
  assert.equal(saved.screen, 'review');
});

test('a mistake is restored without recording an unfinished question as incorrect', () => {
  const storage = new MemoryStorage();
  const store = createStore(storage);
  start(store);
  store.dispatch({ type: 'SELECT', id: 'fn-average' });
  const restored = createStore(storage);
  assert.equal(restored.state.session.hadMistake, true);
  assert.equal(restored.state.session.question.id, 'saved-question');
  assert.equal(restored.state.progress.SUM.normal, 'unanswered');
  complete(restored);
  assert.equal(restored.state.progress.SUM.normal, 'incorrect');
});

test('a failed write keeps the pending result and retries it without grading again', () => {
  const storage = new MemoryStorage();
  const store = createStore(storage);
  start(store);
  store.dispatch({ type: 'SELECT', id: 'fn-sum' });
  storage.fail = true;
  assert.equal(store.dispatch({ type: 'SELECT', id: 'arg-correct' }), false);
  assert.equal(store.pending, true);
  assert.equal(store.state.session.outcome, 'correct');
  assert.equal(store.retry(), false);
  storage.fail = false;
  assert.equal(store.retry(), true);
  assert.equal(store.pending, false);
  assert.equal(createStore(storage).state.progress.SUM.normal, 'correct');
});

test('new actions cannot replace an unsaved result', () => {
  const storage = new MemoryStorage();
  const store = createStore(storage);
  start(store);
  storage.fail = true;
  store.dispatch({ type: 'SHOW_ANSWER' });
  const pending = store.state;
  assert.equal(store.dispatch({ type: 'START', question: createQuestion() }), false);
  assert.strictEqual(store.state, pending);
});

test('unreadable stored data is reported and never overwritten automatically', () => {
  const storage = new MemoryStorage();
  storage.value = '{broken';
  assert.throws(() => createStore(storage), /保存/);
  assert.equal(storage.value, '{broken');
  assert.equal(storage.writes, 0);
});

test('a malformed saved session is reported instead of crashing during rendering', () => {
  const storage = new MemoryStorage();
  storage.value = JSON.stringify({ version: 1, progress: { SUM: { normal: 'correct' } }, screen: 'practice', session: {} });
  assert.throws(() => createStore(storage), /保存/);
});

test('a completed result is not written or counted twice after restoring it', () => {
  const storage = new MemoryStorage();
  const store = createStore(storage);
  start(store);
  complete(store);
  const writes = storage.writes;
  const restored = createStore(storage);
  restored.dispatch({ type: 'SELECT', id: 'arg-correct' });
  assert.equal(storage.writes, writes);
  assert.equal(restored.state.progress.SUM.normal, 'correct');
});
