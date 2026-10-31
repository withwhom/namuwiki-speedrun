import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findViolations, namespaceOf } from '../../extension/lib/rules.js';
import { parseNamuUrl } from '../../extension/lib/title.js';

const codes = (url, extra = {}) =>
  findViolations({ parsed: parseNamuUrl(url), source: 'commit', transitionType: 'link', ...extra }).map((v) => v.code);

const W = 'https://namu.wiki/w/';

test('일반 문서 링크는 위반이 아니다', () => {
  assert.deepEqual(codes(W + encodeURIComponent('달')), []);
});

test('이름공간 문서는 위반', () => {
  for (const ns of ['분류', '파일', '틀', '나무위키', '사용자']) {
    assert.deepEqual(codes(W + encodeURIComponent(`${ns}:무언가`)), ['namespace'], ns);
  }
});

test('제목 중간의 콜론은 이름공간이 아니다', () => {
  assert.equal(namespaceOf('스타워즈: 깨어난 포스'), null);
  assert.equal(namespaceOf('분류학'), null);
});

test('편집·역링크·역사·검색·토론 페이지는 위반', () => {
  for (const path of ['edit/달', 'backlink/달', 'history/달', 'Search?q=달', 'go/달', 'discuss/달', 'thread/abc']) {
    assert.deepEqual(codes(`https://namu.wiki/${path}`), ['special'], path);
  }
});

test('목록에 없는 경로도 문서가 아닌 페이지로 위반', () => {
  const v = findViolations({ parsed: parseNamuUrl('https://namu.wiki/unknown/x'), source: 'commit' });
  assert.equal(v[0].label, '문서가 아닌 페이지');
  const edit = findViolations({ parsed: parseNamuUrl('https://namu.wiki/edit/x'), source: 'commit' });
  assert.equal(edit[0].label, '편집 페이지');
});

test('주소창 직접 입력은 위반', () => {
  assert.deepEqual(codes(W + 'x', { transitionType: 'typed' }), ['typed']);
  assert.deepEqual(codes(W + 'x', { transitionType: 'generated' }), ['typed']);
  assert.deepEqual(codes(W + 'x', { transitionType: 'auto_bookmark' }), ['typed']);
  assert.deepEqual(codes(W + 'x', { transitionType: 'link', transitionQualifiers: ['from_address_bar'] }), ['typed']);
});

test('history 이동은 transitionType으로 typed 판정을 하지 않는다', () => {
  assert.deepEqual(codes(W + 'x', { source: 'history', transitionType: 'typed' }), []);
});

test('이름공간 + 직접 입력은 둘 다 기록', () => {
  assert.deepEqual(codes(W + encodeURIComponent('틀:x'), { transitionType: 'typed' }), ['namespace', 'typed']);
});
