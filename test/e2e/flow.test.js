// 확장을 실제로 불러와서 "시작 → 링크 3번 → 목표 도착" 흐름을 확인한다.
// namu.wiki 요청은 모두 가짜 페이지로 응답하고, 그 밖의 외부 요청은 막는다.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { fakePageHtml } from './fake-namu.js';

const EXT = fileURLToPath(new URL('../../extension', import.meta.url));

let context;
let worker;
let extensionId;
const seen = { namu: [], blocked: [] };

before(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium', // 확장은 새 headless 모드가 있는 Chromium에서만 불러올 수 있다
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('https://namu.wiki/')) {
      seen.namu.push(url);
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fakePageHtml() });
    }
    if (/^(chrome-extension|about|data|blob):/.test(url)) return route.continue();
    seen.blocked.push(url);
    return route.abort();
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
});

after(async () => {
  await context?.close();
});

async function storage(keys) {
  return worker.evaluate((k) => chrome.storage.local.get(k), keys);
}

async function startCustomGame(start, target) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.fill('#custom-start', start);
  await popup.fill('#custom-target', target);
  const [game] = await Promise.all([context.waitForEvent('page'), popup.click('#custom-form button[type=submit]')]);
  await game.waitForURL((u) => u.pathname.startsWith('/w/'));
  const hud = game.locator('#namu-speedrun-hud .hud');
  await hud.waitFor();
  return { game, hud };
}

async function waitForGame(predicate) {
  for (let i = 0; i < 50; i++) {
    const { game } = await storage('game');
    if (predicate(game)) return game;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('게임 상태가 기대한 대로 바뀌지 않았어요');
}

test('시작 → 링크 3번(일반 로드, pushState, 리다이렉트) → 목표 도착', async () => {
  const { game: page, hud } = await startCustomGame('짜장면', '아이작 뉴턴');

  await assert.doesNotReject(hud.getByText('아이작 뉴턴').waitFor());
  // 게임 중에는 검색창이 숨겨진다 (selectors.js의 추정 선택자가 가짜 페이지에 맞는 경우)
  assert.equal(await page.locator('form.fake-search').isVisible(), false);

  await page.click('a[href="/w/' + encodeURIComponent('중국') + '"]'); // 일반 로드
  await page.waitForURL('**/w/' + encodeURIComponent('중국'));
  await waitForGame((g) => g.clicks === 1);

  await page.locator('#namu-speedrun-hud .hud').waitFor();
  await page.click('a[data-spa]'); // pushState
  await page.waitForURL('**/w/' + encodeURIComponent('영국'));
  await waitForGame((g) => g.clicks === 2);

  await page.click('a[href="/w/' + encodeURIComponent('뉴턴') + '"]'); // 리다이렉트 문서
  await page.waitForURL((u) => u.searchParams.get('from') === '뉴턴');

  const result = page.locator('#namu-speedrun-hud .result');
  await result.waitFor();
  assert.match(await result.innerText(), /목표 도착!/);
  const share = await result.locator('textarea').inputValue();
  assert.match(share, /^나무위키 스피드런 \(직접 입력\)\n짜장면 → 아이작 뉴턴\n3클릭 · \d+:\d\d$/);

  const { game, records } = await storage(['game', 'records']);
  assert.equal(game.status, 'finished');
  assert.equal(game.clicks, 3);
  assert.deepEqual(game.path.map((p) => p.title), ['짜장면', '중국', '영국', '아이작 뉴턴']);
  assert.equal(records[0].status, 'finished');
  assert.equal(records[0].violated, false);

  // 결과를 닫으면 HUD가 사라지고 검색창이 돌아온다
  await result.getByText('닫기').click();
  await page.locator('#namu-speedrun-hud').waitFor({ state: 'detached' });
  assert.equal(await page.locator('form.fake-search').isVisible(), true);
});

test('이름공간 문서는 규칙 위반, 뒤로 가기도 1클릭, 포기하면 기록에 남는다', async () => {
  const { game: page } = await startCustomGame('짜장면', '아이작 뉴턴');

  await page.click('a[href="/w/' + encodeURIComponent('분류:중국 요리') + '"]');
  await waitForGame((g) => g.violations.length === 1);
  await page.locator('#namu-speedrun-hud .warn').waitFor();

  await page.goBack();
  const game = await waitForGame((g) => g.clicks === 2);
  assert.equal(game.path[2].via, 'history');

  page.once('dialog', (d) => d.accept());
  await page.locator('#namu-speedrun-hud').getByText('포기').click();
  await page.locator('#namu-speedrun-hud').waitFor({ state: 'detached' });

  const { records } = await storage('records');
  assert.equal(records[0].status, 'abandoned');
  assert.equal(records[0].violated, true);
  assert.equal(records[0].clicks, 2);
});

test('랜덤 도전은 문서 모음에서 시작과 목표를 뽑는다', async () => {
  const { docs } = JSON.parse(readFileSync(new URL('../../extension/data/pool.json', import.meta.url)));
  const titles = new Set(docs.map((d) => d.title));
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

  const route = popup.locator('#random-route');
  await route.filter({ hasText: '→' }).waitFor();
  await popup.click('#random-reroll');
  const [start, target] = (await route.textContent()).split(' → ');
  assert.ok(titles.has(start) && titles.has(target) && start !== target, `${start} → ${target}`);

  const [page] = await Promise.all([context.waitForEvent('page'), popup.click('#random-start')]);
  await page.waitForURL((u) => u.pathname.startsWith('/w/'));
  const game = await waitForGame((g) => g?.status === 'running');
  assert.equal(game.mode, 'random');
  assert.equal(game.challengeId, null);
  assert.equal(game.start, start);
  assert.equal(game.target, target);

  page.once('dialog', (d) => d.accept());
  await page.locator('#namu-speedrun-hud').getByText('포기').click();
});

test('외부로 나간 요청이 없다', () => {
  assert.deepEqual(seen.blocked, []);
  assert.ok(seen.namu.length > 0);
});
