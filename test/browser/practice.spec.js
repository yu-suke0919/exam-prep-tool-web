import { test, expect } from '@playwright/test';

let browserErrors;
test.beforeEach(async ({ page }) => {
  browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto('/');
});
test.afterEach(() => expect(browserErrors).toEqual([]));

async function start(page) {
  await page.getByRole('button', { name: '練習を始める', exact: true }).click();
  await expect(page.getByRole('heading', { name: '全商品の売上の合計を求めてください。' })).toBeVisible();
}

async function tableAnswer(page) {
  const titles = await page.locator('thead tr:last-child th').allTextContents();
  const letters = await page.locator('thead tr:first-child th').allTextContents();
  const salesIndex = titles.findIndex(title => title.trim() === '売上');
  const rows = page.locator('tbody tr');
  const first = (await rows.first().locator('th').textContent()).trim();
  const last = (await rows.last().locator('th').textContent()).trim();
  const numbers = await page.locator(`tbody tr td:nth-of-type(${salesIndex})`).allTextContents();
  return {
    argument: `${letters[salesIndex].trim()}${first}:${letters[salesIndex].trim()}${last})`,
    total: numbers.reduce((sum, value) => sum + Number(value.replaceAll(',', '')), 0),
  };
}

async function solve(page) {
  const answer = await tableAnswer(page);
  await page.getByRole('button', { name: '=SUM(', exact: true }).click();
  await page.getByRole('button', { name: answer.argument, exact: true }).click();
  return answer;
}

test('solve a mobile SUM question and retain the correct record after reload', async ({ page }) => {
  await start(page);
  const answer = await solve(page);
  await expect(page.getByRole('heading', { name: '正解です' })).toBeVisible();
  await expect(page.getByLabel('計算結果')).toHaveText(answer.total.toLocaleString('ja-JP'));
  await page.reload();
  await expect(page.getByRole('heading', { name: '正解です' })).toBeVisible();
  await page.getByRole('button', { name: 'メニューに戻る' }).click();
  await expect(page.getByRole('region', { name: 'SUMの学習記録' }).getByText('正解', { exact: true })).toBeVisible();
});

test('resume the same options after a comma mistake and record incorrect on completion', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '=SUM(', exact: true }).click();
  const options = await page.locator('.choices button').allTextContents();
  await page.getByRole('button', { name: /^[BC]\d+:[BC]\d+,$/ }).click();
  await expect(page.getByRole('status')).toHaveText('不正解');
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('不正解');
  expect(await page.locator('.choices button').allTextContents()).toEqual(options);
  const answer = await tableAnswer(page);
  await page.getByRole('button', { name: answer.argument, exact: true }).click();
  await expect(page.getByRole('heading', { name: '答えを確認しましょう' })).toBeVisible();
  await expect(page.locator('.result-badge')).toHaveText('不正解');
});

test('discarding an unfinished mistake preserves the previously correct record', async ({ page }) => {
  await start(page);
  const first = await solve(page);
  await page.getByRole('button', { name: 'もう1問解く', exact: true }).click();
  const second = await tableAnswer(page);
  expect(second.argument).not.toBe(first.argument);
  await page.getByRole('button', { name: 'SUM(', exact: true }).click();
  await page.getByRole('button', { name: 'メニューに戻る' }).click();
  await page.getByRole('button', { name: '新しく始める', exact: true }).click();
  await page.getByRole('button', { name: 'メニューに戻る' }).click();
  await expect(page.getByRole('region', { name: 'SUMの学習記録' }).getByText('正解', { exact: true })).toBeVisible();
});

test('two solved questions become two consecutive correct answers and remain so after reload', async ({ page }) => {
  await start(page);
  await solve(page);
  await page.getByRole('button', { name: 'もう1問解く', exact: true }).click();
  await solve(page);
  await page.getByRole('button', { name: 'メニューに戻る' }).click();
  await expect(page.getByText('2連続正解', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('2連続正解', { exact: true })).toBeVisible();
});

test('a failed save blocks the next question and retry does not count the answer twice', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    window.failResultSave = true;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'mos-function-practice.v1' && window.failResultSave && JSON.parse(value).session?.stage === 'complete') {
        throw new DOMException('Storage is full', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  await page.reload();
  await start(page);
  await solve(page);
  await expect(page.getByRole('alert')).toContainText('保存できませんでした');
  await expect(page.getByRole('button', { name: 'もう1問解く', exact: true })).toBeDisabled();
  await page.evaluate(() => { window.failResultSave = false; });
  await page.getByRole('button', { name: '保存を再試行' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'メニューに戻る' }).click();
  await expect(page.getByRole('region', { name: 'SUMの学習記録' }).getByText('正解', { exact: true })).toBeVisible();
});

test('back and tapping the formula retain the question and immediately grade the next selection', async ({ page }) => {
  await start(page);
  const answer = await tableAnswer(page);
  await page.getByRole('button', { name: '=SUM(', exact: true }).click();
  const argumentOptions = await page.locator('.choices button').allTextContents();
  await page.getByRole('button', { name: '戻る', exact: true }).click();
  await expect(page.getByRole('heading', { name: '関数を選んでください' })).toBeVisible();
  await page.getByRole('button', { name: '=SUM(', exact: true }).click();
  expect(await page.locator('.choices button').allTextContents()).toEqual(argumentOptions);
  await page.getByRole('button', { name: '関数を選び直す' }).click();
  await page.getByRole('button', { name: 'SUM(', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('不正解');
  await page.getByRole('button', { name: '=SUM(', exact: true }).click();
  await page.getByRole('button', { name: answer.argument, exact: true }).click();
  await expect(page.locator('.result-badge')).toHaveText('不正解');
});

test('show answer records incorrect and displays the formula and result', async ({ page }) => {
  await start(page);
  const answer = await tableAnswer(page);
  await page.getByRole('button', { name: '答えを見る', exact: true }).click();
  await expect(page.locator('.result-badge')).toHaveText('不正解');
  await expect(page.locator('.completed-formula')).toHaveText(`=SUM(${answer.argument}`);
  await expect(page.getByLabel('計算結果')).toHaveText(answer.total.toLocaleString('ja-JP'));
  await page.reload();
  await page.getByRole('button', { name: 'メニューに戻る' }).click();
  await expect(page.getByRole('region', { name: 'SUMの学習記録' }).getByText('不正解', { exact: true })).toBeVisible();
});

test('resume from the menu preserves the argument choices', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '=SUM(', exact: true }).click();
  const options = await page.locator('.choices button').allTextContents();
  await page.getByRole('button', { name: 'メニューに戻る' }).click();
  await page.reload();
  await page.getByRole('button', { name: '続きから', exact: true }).click();
  await expect(page.getByRole('heading', { name: '引数を選んでください' })).toBeVisible();
  expect(await page.locator('.choices button').allTextContents()).toEqual(options);
});

test('unreadable saved data is kept intact and does not start a new question', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('mos-function-practice.v1', '{broken'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('記録を読み込めませんでした');
  await expect(page.getByRole('button', { name: '練習を始める' })).toHaveCount(0);
  await page.getByRole('button', { name: '読み込みを再試行' }).click();
  expect(await page.evaluate(() => localStorage.getItem('mos-function-practice.v1'))).toBe('{broken');
});

test('mobile layout keeps table and answer areas separate and has no horizontal overflow', async ({ page }, testInfo) => {
  await start(page);
  await page.getByRole('button', { name: '=SUM(', exact: true }).click();
  await expect(page.locator('.choices button')).toHaveCount(6);
  const table = await page.locator('.question-panel').boundingBox();
  const answer = await page.locator('.answer-panel').boundingBox();
  expect(answer.y).toBeGreaterThanOrEqual(table.y + table.height - 1);
  for (const button of await page.locator('.choices button').all()) {
    await expect(button).toBeInViewport({ ratio: 1 });
  }
  await page.screenshot({ path: testInfo.outputPath('sum-mobile.png'), fullPage: true });
  for (const viewport of [{ width: 375, height: 667 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    expect(await page.locator('html').evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
