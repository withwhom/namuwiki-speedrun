// 게임 상태와 이동 판정. 브라우저 API를 쓰지 않는 순수 함수만 둔다.
//
// 이동 하나(nav)는 webNavigation 이벤트를 정리한 값이다:
//   { url, transitionType, transitionQualifiers, source: 'commit' | 'history' | 'fragment' }
//
// 확인 필요한 가정:
// [N1] 리다이렉트 문서로 가는 링크를 누르면 주소가 /w/원래제목 → /w/대상제목?from=원래제목 순서로 바뀔 수 있다.
//      두 번째 주소의 from이 바로 앞 경로 항목과 같으면 새 이동이 아니라 앞 항목을 고친다.
// [N2] 뒤로/앞으로 가기는 transitionQualifiers에 'forward_back'이 붙는다. 방향은 알 수 없어서 한 종류로 표시한다.
// [N3] 문서가 아닌 페이지(편집, 검색 등)는 /w/ 문서가 아니므로 클릭 수에 넣지 않고 경로에만 남긴다.

import { parseNamuUrl, sameTitle } from './title.js';
import { findViolations, specialPageName } from './rules.js';

export function createGame(setup, tabId, now) {
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    mode: setup.mode, // 'daily' | 'random' | 'custom'
    challengeId: setup.challengeId ?? null,
    dailyNo: setup.dailyNo ?? null,
    start: setup.start,
    target: setup.target,
    aliases: setup.aliases ?? [],
    tabId,
    status: 'pending', // pending → running → finished | abandoned
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    clicks: 0,
    currentTitle: null,
    path: [],
    violations: [],
  };
}

export function isTarget(game, title) {
  if (!title) return false;
  return [game.target, ...game.aliases].some((t) => sameTitle(t, title));
}

function reachedTarget(game, parsed) {
  return isTarget(game, parsed.title) || isTarget(game, parsed.redirectedFrom);
}

function isBackForward(nav) {
  return (nav.transitionQualifiers ?? []).includes('forward_back');
}

// 반환: { game, events }. 아무 일도 없으면 같은 game 객체를 그대로 돌려준다.
export function applyNavigation(game, nav, now) {
  const unchanged = { game, events: [] };
  if (game.status !== 'pending' && game.status !== 'running') return unchanged;

  const parsed = parseNamuUrl(nav.url);
  if (parsed.kind === 'other') return unchanged;

  // 시작 문서가 열릴 때까지는 기다린다. 확장이 연 첫 /w/ 문서가 시작 문서다.
  if (game.status === 'pending') {
    if (parsed.kind !== 'doc') return unchanged;
    const next = {
      ...game,
      status: 'running',
      startedAt: now,
      currentTitle: parsed.title,
      path: [{ title: parsed.title, via: 'start', at: 0, violations: [] }],
    };
    return { game: next, events: ['started'] };
  }

  const at = now - game.startedAt;

  if (parsed.kind === 'doc') {
    // 같은 문서 안에서 앵커만 바뀌었거나 새로고침한 경우
    if (sameTitle(parsed.title, game.currentTitle)) return unchanged;

    // [N1] 리다이렉트로 주소만 바뀐 경우: 앞 항목의 제목을 고친다.
    const last = game.path[game.path.length - 1];
    if (parsed.redirectedFrom && last && !last.special && sameTitle(parsed.redirectedFrom, last.title)) {
      const path = [...game.path.slice(0, -1), { ...last, title: parsed.title, redirectedFrom: last.title }];
      const next = { ...game, path, currentTitle: parsed.title };
      return finishIfArrived(next, parsed, now, ['redirect']);
    }
  }

  const violations = findViolations({ parsed, ...nav });
  const via = isBackForward(nav) ? 'history' : 'link';
  const events = [];
  let next;

  if (parsed.kind === 'doc') {
    next = {
      ...game,
      clicks: game.clicks + 1,
      currentTitle: parsed.title,
      path: [
        ...game.path,
        {
          title: parsed.title,
          via,
          at,
          redirectedFrom: parsed.redirectedFrom,
          violations: violations.map((v) => v.code),
        },
      ],
    };
    events.push('moved');
  } else {
    // [N3] 문서가 아닌 페이지: 클릭 수와 현재 문서는 그대로 두고 경로에만 남긴다.
    next = {
      ...game,
      path: [
        ...game.path,
        {
          title: specialPageName(parsed.section),
          special: true,
          via,
          at,
          violations: violations.map((v) => v.code),
        },
      ],
    };
  }

  if (violations.length) {
    next.violations = [...game.violations, ...violations.map((v) => ({ ...v, at, url: nav.url }))];
    events.push('violation');
  }

  return parsed.kind === 'doc' ? finishIfArrived(next, parsed, now, events) : { game: next, events };
}

function finishIfArrived(game, parsed, now, events) {
  if (!reachedTarget(game, parsed)) return { game, events };
  return { game: { ...game, status: 'finished', finishedAt: now }, events: [...events, 'finished'] };
}

export function abandonGame(game, now) {
  if (game.status !== 'pending' && game.status !== 'running') return game;
  return { ...game, status: 'abandoned', finishedAt: now };
}

export function elapsedMs(game, now) {
  if (!game.startedAt) return 0;
  return (game.finishedAt ?? now) - game.startedAt;
}
