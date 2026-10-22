const PROGRESS = ['unanswered', 'incorrect', 'correct', 'mastered'];
const PRODUCTS = ['ノート', 'ペン', 'ファイル', 'ふせん', 'クリップ', '定規', '消しゴム', '封筒'];
const FUNCTION_CHOICES = [
  { id: 'fn-sum', label: '=SUM(', reason: '' },
  { id: 'fn-average', label: '=AVERAGE(', reason: 'AVERAGEは平均を求める関数です。合計にはSUMを使います。' },
  { id: 'fn-max', label: '=MAX(', reason: 'MAXは最大値を求める関数です。合計にはSUMを使います。' },
  { id: 'fn-no-equals', label: 'SUM(', reason: '数式の先頭には等号「=」が必要です。' },
  { id: 'fn-no-open', label: '=SUM', reason: '関数名の後には開き括弧「(」が必要です。' },
  { id: 'fn-count', label: '=COUNT(', reason: 'COUNTは数値が入ったセルの個数を数えます。合計にはSUMを使います。' },
];

function shuffle(items, rng) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(rng() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function createQuestion({ previousRange = null, rng = Math.random, id = crypto.randomUUID() } = {}) {
  const variants = ['B', 'C'].flatMap(column => [3, 4, 5].map(count => ({
    column, count, range: `${column}2:${column}${count + 1}`,
  }))).filter(variant => variant.range !== previousRange);
  const variant = variants[Math.floor(rng() * variants.length)];
  const salesInB = variant.column === 'B';
  const columns = [
    { letter: 'A', title: '商品' },
    { letter: 'B', title: salesInB ? '売上' : '個数' },
    { letter: 'C', title: salesInB ? '個数' : '売上' },
  ];
  const names = shuffle(PRODUCTS, rng);
  const rows = Array.from({ length: variant.count }, (_, index) => {
    const sales = (10 + Math.floor(rng() * 290)) * 10;
    const units = 1 + Math.floor(rng() * 9);
    return { number: index + 2, cells: [names[index], ...(salesInB ? [sales, units] : [units, sales])] };
  });
  const { range, column, count } = variant;
  const unitColumn = salesInB ? 'C' : 'B';
  const argumentChoices = [
    { id: 'arg-correct', label: `${range})`, reason: '' },
    { id: 'arg-short-end', label: `${column}2:${column}${count})`, reason: '範囲の最後の商品が含まれていません。' },
    { id: 'arg-short-start', label: `${column}3:${column}${count + 1})`, reason: '範囲の最初の商品が含まれていません。' },
    { id: 'arg-units', label: `${unitColumn}2:${unitColumn}${count + 1})`, reason: '指定したのは個数の列です。売上の列を指定します。' },
    { id: 'arg-trailing-comma', label: `${range},`, reason: '範囲を一つ指定して終えるので、最後はカンマではなく閉じ括弧「)」にします。' },
    { id: 'arg-no-close', label: range, reason: '数式の最後に閉じ括弧「)」が必要です。' },
  ];
  return {
    id,
    columns,
    rows,
    range,
    formula: `=SUM(${range})`,
    total: rows.reduce((sum, row) => sum + row.cells[salesInB ? 1 : 2], 0),
    choices: {
      function: shuffle(FUNCTION_CHOICES.map(choice => ({ ...choice })), rng),
      argument: shuffle(argumentChoices, rng),
    },
  };
}

export function createInitialState() {
  return { version: 1, screen: 'home', progress: { SUM: { normal: 'unanswered' } }, session: null };
}

function finish(state, outcome) {
  state.session.stage = 'complete';
  state.session.outcome = outcome;
  state.session.feedback = null;
  state.screen = 'review';
  const previous = state.progress.SUM.normal;
  state.progress.SUM.normal = outcome === 'incorrect'
    ? 'incorrect'
    : (previous === 'correct' || previous === 'mastered' ? 'mastered' : 'correct');
  return state;
}

export function transition(state, action) {
  if (action.type === 'START') {
    return {
      ...state,
      screen: 'practice',
      session: {
        question: action.question,
        stage: 'function',
        functionPart: null,
        argumentPart: null,
        hadMistake: false,
        lastMistake: null,
        feedback: null,
        outcome: null,
        revealed: false,
      },
    };
  }
  if (action.type === 'HOME') {
    return state.screen === 'home' ? state : { ...state, screen: 'home' };
  }
  const session = state.session;
  if (!session) return state;
  if (action.type === 'RESUME') {
    return { ...state, screen: session.stage === 'complete' ? 'review' : 'practice' };
  }
  if (session.stage === 'complete') return state;
  if (action.type === 'BACK' && session.stage === 'argument') {
    return { ...state, session: { ...session, stage: 'function', feedback: null } };
  }
  if (action.type === 'SHOW_ANSWER') {
    const next = structuredClone(state);
    next.session.revealed = true;
    return finish(next, 'incorrect');
  }
  if (action.type !== 'SELECT') return state;
  const choice = session.question.choices[session.stage].find(option => option.id === action.id);
  if (!choice) return state;
  const next = structuredClone(state);
  const expected = session.stage === 'function' ? '=SUM(' : `${session.question.range})`;
  if (choice.label !== expected) {
    next.session.hadMistake = true;
    next.session.feedback = 'incorrect';
    next.session.lastMistake = { label: choice.label, reason: choice.reason };
    return next;
  }
  next.session.feedback = null;
  if (session.stage === 'function') {
    next.session.functionPart = choice.label;
    next.session.stage = 'argument';
    return next;
  }
  next.session.argumentPart = choice.label;
  return finish(next, session.hadMistake ? 'incorrect' : 'correct');
}

export function isValidState(state) {
  if (!state || state.version !== 1 || !['home', 'practice', 'review'].includes(state.screen)
    || !PROGRESS.includes(state.progress?.SUM?.normal)) return false;
  if (state.session === null) return state.screen === 'home';
  const session = state.session;
  const question = session?.question;
  if (!session || !['function', 'argument', 'complete'].includes(session.stage)
    || typeof session.hadMistake !== 'boolean' || typeof session.revealed !== 'boolean'
    || ![null, 'incorrect'].includes(session.feedback)
    || ![null, 'correct', 'incorrect'].includes(session.outcome)
    || ![null, '=SUM('].includes(session.functionPart)) return false;
  if (!question || typeof question.id !== 'string' || typeof question.range !== 'string'
    || !/^[BC]2:[BC][4-6]$/.test(question.range)
    || question.formula !== `=SUM(${question.range})` || !Number.isFinite(question.total)
    || !Array.isArray(question.columns) || question.columns.length !== 3
    || !Array.isArray(question.rows) || question.rows.length < 3 || question.rows.length > 5) return false;
  if (!question.columns.every((column, index) => column?.letter === ['A', 'B', 'C'][index] && typeof column.title === 'string')) return false;
  if (!question.rows.every((row, index) => row?.number === index + 2 && Array.isArray(row.cells)
    && row.cells.length === 3 && typeof row.cells[0] === 'string'
    && Number.isFinite(row.cells[1]) && Number.isFinite(row.cells[2]))) return false;
  if (!['function', 'argument'].every(stage => Array.isArray(question.choices?.[stage])
    && question.choices[stage].length === 6
    && question.choices[stage].every(choice => typeof choice?.id === 'string' && typeof choice.label === 'string' && typeof choice.reason === 'string')
    && new Set(question.choices[stage].map(choice => choice.id)).size === 6)) return false;
  if (session.argumentPart !== null && session.argumentPart !== `${question.range})`) return false;
  if (session.lastMistake !== null && (typeof session.lastMistake?.label !== 'string' || typeof session.lastMistake?.reason !== 'string')) return false;
  if (session.stage === 'argument' && session.functionPart !== '=SUM(') return false;
  if (session.stage === 'complete' && session.outcome === null) return false;
  if (session.stage !== 'complete' && session.outcome !== null) return false;
  if (state.screen === 'practice' && session.stage === 'complete') return false;
  if (state.screen === 'review' && session.stage !== 'complete') return false;
  return true;
}
