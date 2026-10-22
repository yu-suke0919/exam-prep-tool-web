import { createQuestion } from './domain.js';
import { createStore } from './storage.js';
import './style.css';

const app = document.querySelector('#app');
const records = { unanswered: '未回答', incorrect: '不正解', correct: '正解', mastered: '2連続正解' };
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
const back = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';
const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const number = value => value.toLocaleString('ja-JP');
let store;

function header(home) {
  return `<header class="app-header"><div class="header-inner">
    <div class="brand"><span class="brand-mark" aria-hidden="true">ƒx</span><span>関数トレーニング</span></div>
    ${home ? '<span class="header-caption">Excelの関数を学ぶ</span>' : `<button class="menu-button" data-action="home" aria-label="メニューに戻る" ${store.pending ? 'disabled' : ''}>${back}<span>メニュー</span></button>`}
  </div></header>`;
}

function saveError() {
  if (!store.pending) return '';
  return `<div class="save-error" role="alert"><div><strong>保存できませんでした</strong><p>回答はこの画面に保持しています。保存できるまで画面を閉じずに、再試行してください。</p></div><button class="retry-button" data-action="retry">保存を再試行</button></div>`;
}

function homeScreen(state) {
  const record = state.progress.SUM.normal;
  const inProgress = state.session && state.session.stage !== 'complete';
  return `<main class="home-content">
    <div class="home-intro"><span class="eyebrow">EXCEL FUNCTION PRACTICE</span><h1>使える関数を、<br>ひとつずつ。</h1><p>表を見て、関数と引数を選ぶ。<br>小さな練習で、数式をつくる力を。</p></div>
    <section class="practice-card" aria-labelledby="practice-title">
      <div class="card-topline"><span class="eyebrow">今回の練習</span><span class="mode-badge">通常モード</span></div>
      <div class="function-description"><span class="sum-symbol" aria-hidden="true">Σ</span><div><h2 id="practice-title">SUM</h2><p>合計を求める</p></div></div>
      <p class="card-description">商品ごとの売上から、合計を求めましょう。<br>選ぶたびに正誤を確認できます。</p>
      <div class="practice-details"><span>1問ずつ練習</span><span>引数の説明あり</span></div>
      ${inProgress ? `<p class="resume-note">途中の問題があります。続きから再開できます。</p><button class="primary-button" data-action="resume">続きから ${arrow}</button><button class="secondary-button" data-action="start">新しく始める</button><p class="small-note">新しく始めると、未完成の問題は破棄します。</p>` : `<button class="primary-button" data-action="start">${state.session ? 'もう1問解く' : '練習を始める'} ${arrow}</button>`}
    </section>
    <section class="record-card" aria-label="SUMの学習記録"><div><span class="eyebrow">学習記録</span><h2>SUM <span>通常モード</span></h2></div><span class="record-badge record-${record}">${records[record]}</span></section>
    <p class="storage-note">記録と途中の回答は、このブラウザに自動保存されます。</p>
  </main>`;
}

function questionPanel(question) {
  return `<section class="question-panel" aria-labelledby="question-title">
    <div class="question-meta"><span class="eyebrow">PRACTICE · SUM</span><span class="mode-badge">通常モード</span></div>
    <h2 id="question-title" class="question-title">全商品の売上の合計を求めてください。</h2>
    <div class="sheet-wrap"><table class="sheet"><caption class="sr-only">商品ごとの売上と個数</caption><thead><tr><th aria-label="行番号"></th>${question.columns.map(column => `<th scope="col">${column.letter}</th>`).join('')}</tr><tr><th scope="row">1</th>${question.columns.map(column => `<th scope="col">${escape(column.title)}</th>`).join('')}</tr></thead><tbody>${question.rows.map(row => `<tr><th scope="row">${row.number}</th>${row.cells.map(cell => `<td class="${typeof cell === 'number' ? 'numeric' : ''}">${escape(typeof cell === 'number' ? number(cell) : cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="table-note">列記号と行番号を使って、範囲を選びましょう。</p>
  </section>`;
}

function answerPanel(session) {
  const argument = session.stage === 'argument';
  return `<section class="answer-panel" aria-labelledby="step-title">
    <div class="step-line"><h2 id="step-title" tabindex="-1">${argument ? '引数を選んでください' : '関数を選んでください'}</h2><span>${argument ? '2' : '1'} / 2</span></div>
    <div class="formula" aria-label="組み立て中の式">${session.functionPart ? `<button class="formula-part ${argument ? '' : 'editing'}" data-action="back" aria-label="関数を選び直す">${escape(session.functionPart)}</button>` : '<span class="formula-placeholder">選んだ式がここに入ります</span>'}${argument ? '<span class="insertion-point" aria-hidden="true"></span>' : ''}</div>
    <div class="argument-help">${argument ? '<strong>数値1</strong><span>合計する数値やセルの範囲を指定します。</span>' : '<span>合計を求める関数を選びましょう。</span>'}</div>
    <div class="feedback-slot"><p role="status" aria-live="polite" class="feedback">${session.feedback === 'incorrect' ? '不正解' : ''}</p></div>
    <div class="choices">${session.question.choices[session.stage].map(choice => `<button class="choice-button ${session.feedback && session.lastMistake?.label === choice.label ? 'was-incorrect' : ''}" data-action="select" data-choice="${escape(choice.id)}">${escape(choice.label)}</button>`).join('')}</div>
    <div class="answer-tools"><button class="text-button" data-action="back" ${argument ? '' : 'disabled'}>${back}戻る</button><button class="text-button" data-action="reveal">答えを見る</button></div>
  </section>`;
}

function reviewScreen(session, record) {
  const correct = session.outcome === 'correct';
  const question = session.question;
  return `<main class="review-content">
    <div class="result-icon ${correct ? '' : 'result-retry'}" aria-hidden="true">${correct ? check : '↻'}</div>
    <span class="result-badge ${correct ? 'result-correct' : 'result-incorrect'}">${correct ? '正解' : '不正解'}</span>
    <h1 tabindex="-1" class="result-title">${correct ? '正解です' : '答えを確認しましょう'}</h1>
    <p class="result-lead">${correct ? '売上の範囲を、正しく指定できました。' : (session.revealed ? '「答えを見る」を使ったので、不正解として記録しました。' : '途中で間違えたため、不正解として記録しました。')}</p>
    <section class="explanation-card" aria-labelledby="explanation-title"><h2 id="explanation-title">正解の式</h2><code class="completed-formula">${escape(question.formula)}</code><div class="total-row"><span>計算結果</span><output aria-label="計算結果">${number(question.total)}</output></div><div class="explanation"><p><strong>SUM</strong> は、指定した範囲の数値を合計する関数です。</p><p><strong>${escape(question.range)}</strong> で、最初の商品から最後の商品までの売上を指定します。式の最後は <strong>)</strong> で閉じます。</p></div>${session.lastMistake ? `<div class="mistake-explanation"><span>選び直した箇所</span><code>${escape(session.lastMistake.label)}</code><p>${escape(session.lastMistake.reason)}</p></div>` : ''}</section>
    <div class="saved-record"><span>SUMの記録</span><span class="record-badge record-${record}">${records[record]}</span></div>
    <button class="primary-button" data-action="start">もう1問解く ${arrow}</button>
    <p class="small-note">次の問題では、表と正解の範囲が変わります。</p>
  </main>`;
}

function render(focusTarget) {
  const state = store.state;
  app.className = `app-shell screen-${state.screen}${store.pending ? ' has-save-error' : ''}`;
  app.innerHTML = header(state.screen === 'home') + saveError() + (state.screen === 'home'
    ? homeScreen(state)
    : state.screen === 'review'
      ? reviewScreen(state.session, state.progress.SUM.normal)
      : `<main class="workspace">${questionPanel(state.session.question)}${answerPanel(state.session)}</main>`);
  if (store.pending) {
    app.querySelectorAll('button:not([data-action="retry"])').forEach(button => { button.disabled = true; });
  }
  if (focusTarget) app.querySelector(focusTarget)?.focus({ preventScroll: true });
}

function initialize() {
  try {
    store = createStore(window.localStorage);
    render();
  } catch {
    app.className = 'app-shell';
    app.innerHTML = `<main class="load-error" role="alert"><span class="brand-mark" aria-hidden="true">ƒx</span><h1>記録を読み込めませんでした</h1><p>このブラウザの保存データにアクセスできないか、データが壊れています。記録を上書きせずに停止しました。</p><button class="primary-button" data-action="reload">読み込みを再試行</button></main>`;
  }
}

app.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'reload') { initialize(); return; }
  if (action === 'retry') { store.retry(); render(); return; }
  if (!store || store.pending) return;
  let focusTarget;
  switch (action) {
    case 'start':
      store.dispatch({ type: 'START', question: createQuestion({ previousRange: store.state.session?.question.range }) });
      focusTarget = '#step-title';
      break;
    case 'resume': store.dispatch({ type: 'RESUME' }); focusTarget = '#step-title'; break;
    case 'home': store.dispatch({ type: 'HOME' }); break;
    case 'back': store.dispatch({ type: 'BACK' }); focusTarget = '#step-title'; break;
    case 'select':
      store.dispatch({ type: 'SELECT', id: button.dataset.choice });
      focusTarget = store.state.screen === 'review' ? '.result-title' : (store.state.session.feedback ? `[data-choice="${button.dataset.choice}"]` : '#step-title');
      break;
    case 'reveal': store.dispatch({ type: 'SHOW_ANSWER' }); focusTarget = '.result-title'; break;
    default: return;
  }
  render(focusTarget);
});

initialize();
