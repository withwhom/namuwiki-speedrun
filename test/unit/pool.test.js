import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POOL_CATEGORIES, pickPair } from '../../extension/lib/pool.js';
import { namespaceOf } from '../../extension/lib/rules.js';
import { normalizeTitle } from '../../extension/lib/title.js';

const { docs } = JSON.parse(readFileSync(new URL('../../extension/data/pool.json', import.meta.url)));

const sample = [
  { title: '짜장면', cat: 'food' },
  { title: '김치', cat: 'food' },
  { title: '블랙홀', cat: 'space' },
];

// 정해진 값을 차례로 내주는 가짜 난수
const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('서로 다른 두 문서를 고른다', () => {
  for (let i = 0; i < 200; i++) {
    const { start, target } = pickPair(sample);
    assert.notEqual(start.title, target.title);
  }
});

test('같은 난수면 같은 쌍: 분야를 먼저 고르고 그 안에서 문서를 고른다', () => {
  // 분야 food(0) → 짜장면(0), 남은 분야 중 space(0.99) → 블랙홀
  assert.deepEqual(pickPair(sample, { rand: seq(0, 0, 0.99, 0) }), { start: sample[0], target: sample[2] });
  // space → 블랙홀, food → 김치
  assert.deepEqual(pickPair(sample, { rand: seq(0.99, 0, 0, 0.99) }), { start: sample[2], target: sample[1] });
});

test('기본은 같은 분야끼리도 나올 수 있다', () => {
  assert.deepEqual(pickPair(sample, { rand: seq(0, 0, 0, 0) }), { start: sample[0], target: sample[1] });
});

test('문서 수가 적은 분야도 다른 분야만큼 자주 나온다', () => {
  const docs = [...Array.from({ length: 9 }, (_, i) => ({ title: `음식${i}`, cat: 'food' })), { title: '달', cat: 'space' }];
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let space = 0;
  for (let i = 0; i < 2000; i++) if (pickPair(docs, { rand }).start.cat === 'space') space++;
  assert.ok(space > 800 && space < 1200, `space ${space}/2000`);
});

test('differentCategory면 다른 분야에서만 목표를 고른다', () => {
  for (const r of [0, 0.5, 0.99]) {
    const { start, target } = pickPair(sample, { rand: seq(0, 0, r, r), differentCategory: true });
    assert.equal(start.title, '짜장면');
    assert.equal(target.title, '블랙홀');
  }
  assert.equal(pickPair(sample.slice(0, 2), { differentCategory: true }), null);
});

test('exclude한 문서는 고르지 않는다', () => {
  for (let i = 0; i < 50; i++) {
    const { start, target } = pickPair(sample, { exclude: ['짜장면'] });
    assert.ok(start.title !== '짜장면' && target.title !== '짜장면');
  }
});

test('문서가 둘 미만이면 null', () => {
  assert.equal(pickPair([]), null);
  assert.equal(pickPair(sample.slice(0, 1)), null);
});

test('pool.json: 1000개 이상, 제목 고유(띄어쓰기·대소문자 무시), 이름공간 없음, 정해진 분야', () => {
  assert.ok(docs.length >= 1000, `${docs.length}개`);
  const keys = new Set();
  for (const d of docs) {
    assert.equal(d.title, normalizeTitle(d.title), d.title);
    assert.equal(namespaceOf(d.title), null, d.title);
    assert.ok(d.cat in POOL_CATEGORIES, `${d.title}: 분야 ${d.cat}`);
    const key = d.title.replace(/ /g, '').toLowerCase();
    assert.ok(!keys.has(key), `중복 ${d.title}`);
    keys.add(key);
  }
});

test('pool.json: 모든 분야에 문서가 30개 이상', () => {
  const count = {};
  for (const d of docs) count[d.cat] = (count[d.cat] ?? 0) + 1;
  for (const cat of Object.keys(POOL_CATEGORIES)) assert.ok((count[cat] ?? 0) >= 30, `${cat}: ${count[cat] ?? 0}개`);
});
