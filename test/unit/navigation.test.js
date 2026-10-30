import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abandonGame, applyNavigation, createGame, elapsedMs } from '../../extension/lib/navigation.js';

const W = 'https://namu.wiki/w/';
const u = (title, query = '') => W + encodeURIComponent(title) + query;
const link = (title, query) => ({ url: u(title, query), transitionType: 'link', transitionQualifiers: [], source: 'commit' });
const push = (title, query) => ({ url: u(title, query), source: 'history' });

function newGame(setup = {}) {
  return createGame({ mode: 'custom', start: '짜장면', target: '아이작 뉴턴', ...setup }, 7, 1000);
}

function play(game, navs, startAt = 2000, step = 1000) {
  let g = game;
  const events = [];
  navs.forEach((nav, i) => {
    const r = applyNavigation(g, nav, startAt + i * step);
    g = r.game;
    events.push(r.events);
  });
  return { game: g, events };
}

test('첫 문서가 열리면 시작하고 클릭은 0', () => {
  const { game, events } = play(newGame(), [link('짜장면')]);
  assert.equal(game.status, 'running');
  assert.equal(game.clicks, 0);
  assert.equal(game.startedAt, 2000);
  assert.deepEqual(events, [['started']]);
});

test('시작 전 문서가 아닌 페이지는 무시', () => {
  const g = newGame();
  assert.equal(applyNavigation(g, { url: 'https://namu.wiki/', source: 'commit' }, 1).game, g);
  assert.equal(applyNavigation(g, { url: 'https://namu.wiki/Search?q=x', source: 'commit' }, 1).game, g);
});

test('새 문서마다 1클릭, 일반 로드와 history 이동 모두', () => {
  const { game } = play(newGame(), [link('짜장면'), link('중국'), push('영국')]);
  assert.equal(game.clicks, 2);
  assert.deepEqual(game.path.map((p) => p.title), ['짜장면', '중국', '영국']);
});

test('같은 문서의 앵커 이동·새로고침·중복 이벤트는 세지 않는다', () => {
  const { game } = play(newGame(), [
    link('짜장면'),
    link('중국'),
    { url: u('중국', '#s-3'), source: 'fragment' },
    { url: u('중국'), transitionType: 'reload', source: 'commit' },
    push('중국'),
  ]);
  assert.equal(game.clicks, 1);
  assert.equal(game.path.length, 2);
});

test('뒤로/앞으로 가기도 1클릭이고 경로에 표시', () => {
  const back = { url: u('짜장면'), transitionType: 'link', transitionQualifiers: ['forward_back'], source: 'commit' };
  const { game } = play(newGame(), [link('짜장면'), link('중국'), back]);
  assert.equal(game.clicks, 2);
  assert.equal(game.path[2].via, 'history');
});

test('목표에 도착하면 끝나고 시간이 멈춘다', () => {
  const { game, events } = play(newGame(), [link('짜장면'), link('중국'), link('영국'), link('아이작 뉴턴')]);
  assert.equal(game.status, 'finished');
  assert.equal(game.clicks, 3);
  assert.equal(elapsedMs(game, 999999), 3000);
  assert.ok(events[3].includes('finished'));
  // 끝난 뒤의 이동은 무시
  assert.equal(applyNavigation(game, link('달'), 9000).game, game);
});

test('별칭이나 대소문자가 다른 제목으로도 도착 인정', () => {
  const g = newGame({ target: 'NASA', aliases: ['미국 항공우주국'] });
  assert.equal(play(g, [link('짜장면'), link('미국 항공우주국')]).game.status, 'finished');
  assert.equal(play(g, [link('짜장면'), link('nasa')]).game.status, 'finished');
});

test('리다이렉트: /w/원래제목 → /w/대상?from=원래제목 은 이동 한 번', () => {
  const { game } = play(newGame(), [link('짜장면'), link('뉴턴'), push('아이작 뉴턴', '?from=' + encodeURIComponent('뉴턴'))]);
  assert.equal(game.clicks, 1);
  assert.equal(game.status, 'finished');
  assert.deepEqual(game.path.map((p) => p.title), ['짜장면', '아이작 뉴턴']);
  assert.equal(game.path[1].redirectedFrom, '뉴턴');
});

test('리다이렉트가 서버에서 끝나 대상 주소만 보이면 그대로 1클릭', () => {
  const { game } = play(newGame(), [link('짜장면'), link('아이작 뉴턴', '?from=' + encodeURIComponent('뉴턴'))]);
  assert.equal(game.clicks, 1);
  assert.equal(game.status, 'finished');
});

test('목표가 리다이렉트 이름이어도 from으로 도착 인정', () => {
  const g = newGame({ target: 'BTS' });
  const { game } = play(g, [link('짜장면'), link('방탄소년단', '?from=BTS')]);
  assert.equal(game.status, 'finished');
});

test('시작 문서가 리다이렉트되면 시작 항목만 고친다', () => {
  const g = newGame({ start: 'BTS', target: '조선' });
  const { game } = play(g, [link('BTS'), push('방탄소년단', '?from=BTS')]);
  assert.equal(game.clicks, 0);
  assert.equal(game.path.length, 1);
  assert.equal(game.path[0].title, '방탄소년단');
  assert.equal(game.path[0].via, 'start');
});

test('이름공간 문서는 클릭으로 세고 위반 기록', () => {
  const { game, events } = play(newGame(), [link('짜장면'), link('분류:중국 요리')]);
  assert.equal(game.clicks, 1);
  assert.equal(game.violations.length, 1);
  assert.equal(game.violations[0].code, 'namespace');
  assert.deepEqual(game.path[1].violations, ['namespace']);
  assert.ok(events[1].includes('violation'));
});

test('편집·검색 페이지는 클릭은 그대로, 경로와 위반에 남는다', () => {
  const { game } = play(newGame(), [
    link('짜장면'),
    { url: 'https://namu.wiki/Search?q=뉴턴', transitionType: 'link', source: 'commit' },
    link('짜장면'),
  ]);
  assert.equal(game.clicks, 0);
  assert.equal(game.path[1].title, '검색 페이지');
  assert.equal(game.path[1].special, true);
  assert.equal(game.violations[0].code, 'special');
});

test('주소창 직접 입력은 위반이지만 도착은 인정', () => {
  const typed = { url: u('아이작 뉴턴'), transitionType: 'typed', source: 'commit' };
  const { game } = play(newGame(), [link('짜장면'), typed]);
  assert.equal(game.status, 'finished');
  assert.equal(game.violations[0].code, 'typed');
});

test('다른 사이트로 가는 이동은 무시', () => {
  const { game } = play(newGame(), [link('짜장면'), { url: 'https://example.com/', source: 'commit' }]);
  assert.equal(game.path.length, 1);
});

test('포기', () => {
  const { game } = play(newGame(), [link('짜장면')]);
  const a = abandonGame(game, 5000);
  assert.equal(a.status, 'abandoned');
  assert.equal(elapsedMs(a, 99999), 3000);
  assert.equal(abandonGame(a, 6000), a);
});
