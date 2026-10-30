import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docUrl, normalizeTitle, parseNamuUrl, sameTitle } from '../../extension/lib/title.js';

const W = 'https://namu.wiki/w/';

test('퍼센트 인코딩된 제목을 푼다', () => {
  assert.deepEqual(parseNamuUrl(W + encodeURIComponent('아이작 뉴턴')), {
    kind: 'doc',
    title: '아이작 뉴턴',
    redirectedFrom: null,
  });
});

test('#앵커와 ?쿼리를 뗀다', () => {
  const p = parseNamuUrl(`${W}${encodeURIComponent('짜장면')}?uuid=123#s-2.1`);
  assert.equal(p.title, '짜장면');
});

test('인코딩된 ?와 #은 제목의 일부로 남긴다', () => {
  assert.equal(parseNamuUrl(W + encodeURIComponent('누구?#1')).title, '누구?#1');
});

test('제목 속 슬래시는 그대로든 %2F든 같은 제목이 된다', () => {
  assert.equal(parseNamuUrl(`${W}AC/DC`).title, 'AC/DC');
  assert.equal(parseNamuUrl(`${W}AC%2FDC`).title, 'AC/DC');
});

test('공백을 정리한다', () => {
  assert.equal(normalizeTitle('  아이작   뉴턴  '), '아이작 뉴턴');
  assert.equal(normalizeTitle('아이작​ 뉴턴'), '아이작 뉴턴');
  assert.equal(parseNamuUrl(`${W}%20%EB%8B%AC%20`).title, '달');
});

test('NFD로 들어온 한글도 같은 제목으로 본다', () => {
  assert.ok(sameTitle('달'.normalize('NFD'), '달'));
});

test('잘못된 % 시퀀스가 있어도 예외 없이 처리한다', () => {
  assert.equal(parseNamuUrl(`${W}100%25%ZZ`).title, '100%%ZZ');
});

test('리다이렉트의 from 쿼리를 읽는다', () => {
  const p = parseNamuUrl(`${W}${encodeURIComponent('방탄소년단')}?from=BTS`);
  assert.equal(p.title, '방탄소년단');
  assert.equal(p.redirectedFrom, 'BTS');
});

test('from이 제목과 같으면 리다이렉트로 보지 않는다', () => {
  assert.equal(parseNamuUrl(`${W}BTS?from=bts`).redirectedFrom, null);
});

test('영문 대소문자만 다르면 같은 제목', () => {
  assert.ok(sameTitle('K-POP', 'K-pop'));
  assert.ok(!sameTitle('달', '해'));
  assert.ok(!sameTitle('', ''));
});

test('문서가 아닌 나무위키 페이지는 special', () => {
  assert.deepEqual(parseNamuUrl(`https://namu.wiki/edit/${encodeURIComponent('달')}`), {
    kind: 'special',
    section: 'edit',
    path: '/edit/달',
  });
  assert.equal(parseNamuUrl('https://namu.wiki/Search?q=x').section, 'Search');
});

test('루트, 다른 사이트, 잘못된 URL은 other', () => {
  assert.equal(parseNamuUrl('https://namu.wiki/').kind, 'other');
  assert.equal(parseNamuUrl('https://example.com/w/달').kind, 'other');
  assert.equal(parseNamuUrl('https://namu.wiki.evil.com/w/달').kind, 'other');
  assert.equal(parseNamuUrl('not a url').kind, 'other');
  assert.equal(parseNamuUrl(`${W}`).kind, 'other');
});

test('docUrl은 parseNamuUrl과 왕복된다', () => {
  for (const t of ['아이작 뉴턴', 'AC/DC', 'C++', '누구?', 'K-POP']) {
    assert.equal(parseNamuUrl(docUrl(t)).title, t);
  }
});
