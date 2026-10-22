import { createInitialState, isValidState, transition } from './domain.js';

export const STORAGE_KEY = 'mos-function-practice.v1';

export function createStore(storage) {
  let state;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    state = raw === null ? createInitialState() : JSON.parse(raw);
    if (!isValidState(state)) throw new Error('Invalid saved state');
  } catch (cause) {
    throw new Error('保存データを読み込めませんでした。', { cause });
  }
  let pendingState = null;

  function persist(candidate) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(candidate));
      state = candidate;
      pendingState = null;
      return true;
    } catch {
      pendingState = candidate;
      return false;
    }
  }

  return {
    get state() { return pendingState ?? state; },
    get pending() { return pendingState !== null; },
    dispatch(action) {
      if (pendingState !== null) return false;
      const candidate = transition(state, action);
      return candidate === state ? true : persist(candidate);
    },
    retry() {
      return pendingState === null ? true : persist(pendingState);
    },
  };
}
