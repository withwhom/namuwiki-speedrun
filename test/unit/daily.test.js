import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAILY_EPOCH, dailyChallenge, dailyNumber, kstDate, randomChallenge } from '../../extension/lib/daily.js';
import { namespaceOf } from '../../extension/lib/rules.js';
import { normalizeTitle, sameTitle } from '../../extension/lib/title.js';

const { challenges } = JSON.parse(readFileSync(new URL('../../extension/data/challenges.json', import.meta.url)));

function datesFrom(start, days) {
  const out = [];
  const t = Date.parse(`${start}T00:00:00Z`);
  for (let i = 0; i < days; i++) out.push(new Date(t + i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

test('KST 날짜: UTC 15시가 넘으면 다음 날', () => {
  assert.equal(kstDate(Date.parse('2026-10-30T14:59:59Z')), '2026-10-30');
  assert.equal(kstDate(Date.parse('2026-10-30T15:00:00Z')), '2026-10-31');
});

test('오늘의 문제 번호', () => {
  assert.equal(dailyNumber(DAILY_EPOCH), 1);
  assert.equal(dailyNumber('2026-11-10'), 12);
});

test('같은 날짜는 언제나 같은 문제', () => {
  for (const d of datesFrom('2026-10-30', 30)) {
    assert.equal(dailyChallenge(challenges, d).challenge.id, dailyChallenge(challenges, d).challenge.id);
  }
});

test('목록 순서를 섞어도 결과는 같다', () => {
  const shuffled = [...challenges].reverse();
  for (const d of datesFrom('2026-10-30', 30)) {
    assert.equal(dailyChallenge(shuffled, d).challenge.id, dailyChallenge(challenges, d).challenge.id);
  }
});

test('나중에 문제를 추가해도 지난 날짜의 문제는 바뀌지 않는다', () => {
  const past = datesFrom('2026-10-30', 60);
  const before = past.map((d) => dailyChallenge(challenges, d).challenge.id);
  const added = Array.from({ length: 40 }, (_, i) => ({
    id: 1000 + i,
    since: '2027-01-01',
    start: `새 시작 ${i}`,
    target: `새 목표 ${i}`,
  }));
  const after = past.map((d) => dailyChallenge([...challenges, ...added], d).challenge.id);
  assert.deepEqual(after, before);
  // 공개일 이후에는 새 문제도 나올 수 있다
  const later = datesFrom('2027-01-01', 120).map((d) => dailyChallenge([...challenges, ...added], d).challenge.id);
  assert.ok(later.some((id) => id >= 1000));
});

test('에포크 이전 날짜는 #1로 맞춘다', () => {
  assert.equal(dailyChallenge(challenges, '2020-01-01').number, 1);
});

test('후보가 없으면 null', () => {
  assert.equal(dailyChallenge([], '2026-11-01'), null);
});

test('랜덤 도전은 제외한 id를 고르지 않는다', () => {
  const two = challenges.slice(0, 2);
  for (const r of [0, 0.5, 0.999]) assert.equal(randomChallenge(two, () => r, two[0].id).id, two[1].id);
});

test('challenges.json: 50개 이상, id 고유, 필수 항목', () => {
  assert.ok(challenges.length >= 50);
  const ids = new Set();
  for (const c of challenges) {
    assert.ok(Number.isInteger(c.id) && c.id > 0, `id ${c.id}`);
    assert.ok(!ids.has(c.id), `중복 id ${c.id}`);
    ids.add(c.id);
    assert.match(c.since, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(c.since >= DAILY_EPOCH);
    assert.equal(c.start, normalizeTitle(c.start));
    assert.equal(c.target, normalizeTitle(c.target));
    assert.ok(!sameTitle(c.start, c.target), `${c.id}: 시작과 목표가 같음`);
    assert.equal(namespaceOf(c.start), null);
    assert.equal(namespaceOf(c.target), null);
  }
});

test('challenges.json: 요청된 문제 쌍 포함', () => {
  const required = [
    ['짜장면', '아이작 뉴턴'], ['손흥민', '달'], ['BTS', '조선'], ['서울', '올림픽'], ['김치', 'NASA'],
    ['축구', '세종대왕'], ['스마트폰', '고려'], ['유튜브', '이순신'], ['라면', '블랙홀'], ['K-POP', '피타고라스'],
  ];
  for (const [s, t] of required) {
    assert.ok(challenges.some((c) => c.start === s && c.target === t), `${s} → ${t}`);
  }
});
