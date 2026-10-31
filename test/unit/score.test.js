import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addRecord,
  buildRecord,
  buildShareText,
  challengeKey,
  formatDuration,
  formatPath,
  isBetter,
  updateBest,
} from '../../extension/lib/score.js';
import { applyNavigation, createGame } from '../../extension/lib/navigation.js';

const link = (t) => ({ url: 'https://namu.wiki/w/' + encodeURIComponent(t), transitionType: 'link', source: 'commit' });

function finishedGame(setup = {}, titles = ['짜장면', '중국', '아이작 뉴턴'], step = 1000) {
  let g = createGame({ mode: 'daily', challengeId: 1, dailyNo: 12, start: '짜장면', target: '아이작 뉴턴', ...setup }, 1, 0);
  titles.forEach((t, i) => (g = applyNavigation(g, link(t), 1000 + i * step).game));
  return g;
}

test('시간 형식', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(133_900), '2:13');
  assert.equal(formatDuration(3_725_000), '1:02:05');
  assert.equal(formatDuration(-5), '0:00');
});

test('공유 문구 (오늘의 문제)', () => {
  const g = finishedGame({}, ['짜장면', 'a', 'b', 'c', 'd', '아이작 뉴턴'], 26_600);
  const r = buildRecord(g);
  assert.equal(buildShareText(r), '나무위키 스피드런 #12\n짜장면 → 아이작 뉴턴\n5클릭 · 2:13');
});

test('공유 문구 (랜덤, 직접, 위반)', () => {
  const r = buildRecord(finishedGame({ mode: 'random', dailyNo: null }));
  assert.match(buildShareText(r), /^나무위키 스피드런 \(랜덤\)\n/);
  const c = buildRecord(finishedGame({ mode: 'custom', challengeId: null, dailyNo: null }, ['짜장면', '틀:x', '아이작 뉴턴']));
  const text = buildShareText(c);
  assert.match(text, /^나무위키 스피드런 \(직접 입력\)\n/);
  assert.match(text, /⚠ 규칙 위반 기록$/);
});

test('기록 내용', () => {
  const r = buildRecord(finishedGame());
  assert.equal(r.status, 'finished');
  assert.equal(r.clicks, 2);
  assert.equal(r.durationMs, 2000);
  assert.equal(r.key, 'c:1');
  assert.equal(formatPath(r), '짜장면 → 중국 → 아이작 뉴턴');
});

test('문제 키: 목록 문제는 id, 직접 입력은 제목', () => {
  assert.equal(challengeKey({ challengeId: 3, start: 'a', target: 'b' }), 'c:3');
  assert.equal(challengeKey({ challengeId: null, start: 'K-POP', target: '달' }), challengeKey({ start: 'k-pop', target: '달' }));
});

test('최고 기록: 클릭 수 → 시간 순, 위반·포기는 제외', () => {
  const a = { key: 'k', status: 'finished', violated: false, clicks: 4, durationMs: 9000 };
  const b = { ...a, clicks: 3, durationMs: 50000 };
  const c = { ...a, clicks: 3, durationMs: 20000 };
  assert.ok(isBetter(b, a));
  assert.ok(isBetter(c, b));
  let best = updateBest({}, a);
  best = updateBest(best, b);
  best = updateBest(best, c);
  assert.equal(best.k, c);
  assert.equal(updateBest(best, { ...a, clicks: 1, violated: true }), best);
  assert.equal(updateBest(best, { ...a, clicks: 1, status: 'abandoned' }), best);
});

test('최근 기록은 최신순, 최대 개수 유지', () => {
  let list = [];
  for (let i = 0; i < 5; i++) list = addRecord(list, { id: String(i) }, 3);
  assert.deepEqual(list.map((r) => r.id), ['4', '3', '2']);
});
