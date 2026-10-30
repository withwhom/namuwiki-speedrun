// 서비스 워커: webNavigation으로 게임 탭의 이동을 관찰하고 게임 상태를 chrome.storage.local에 저장한다.
// namu.wiki로 직접 요청을 보내지 않는다. 탭을 시작 문서 주소로 보내는 것만 한다.
//
// 저장 키:
//   game     진행 중이거나 막 끝난 게임 (없으면 null)
//   records  최근 기록, 최신순
//   best     문제별 최고 기록 { [challengeKey]: record }
//   hudPrefs HUD 위치·접힘 상태 (content/hud.js가 관리)
//
// 확인 필요한 가정:
// [B1] 나무위키는 전체 새로고침 없이 history.pushState로 문서를 옮길 수 있다 → onHistoryStateUpdated로 받는다.
// [B2] 같은 문서 안 뒤로/앞으로 가기는 Chrome이 onReferenceFragmentUpdated로 알릴 때가 있다 → 이것도 받는다.
//      제목이 같으면 navigation.js에서 무시되므로 앵커 이동만으로 클릭이 늘지 않는다.

import { abandonGame, applyNavigation, createGame } from './lib/navigation.js';
import { addRecord, buildRecord, updateBest } from './lib/score.js';
import { docUrl, normalizeTitle } from './lib/title.js';

const NAV_FILTER = { url: [{ hostEquals: 'namu.wiki' }] };

// 이벤트가 몰려도 storage 읽기·쓰기가 겹치지 않게 한 줄로 처리한다.
let chain = Promise.resolve();
function serial(task) {
  const run = chain.then(task);
  chain = run.catch((err) => console.error('[namu-speedrun]', err));
  return run;
}

async function loadGame() {
  const { game = null } = await chrome.storage.local.get('game');
  return game;
}

async function saveRecord(game, update) {
  const { records = [], best = {} } = await chrome.storage.local.get(['records', 'best']);
  const record = buildRecord(game);
  update.records = addRecord(records, record);
  update.best = updateBest(best, record);
  return record;
}

function onNavigation(source) {
  return (details) => {
    if (details.frameId !== 0) return;
    serial(async () => {
      const game = await loadGame();
      if (!game || game.tabId !== details.tabId) return;
      const nav = {
        url: details.url,
        transitionType: details.transitionType,
        transitionQualifiers: details.transitionQualifiers ?? [],
        source,
      };
      const now = Math.round(details.timeStamp ?? Date.now());
      const { game: next, events } = applyNavigation(game, nav, now);
      if (next === game) return;
      const update = { game: next };
      if (events.includes('finished')) next.result = await saveRecord(next, update);
      await chrome.storage.local.set(update);
    });
  };
}

// 이벤트 리스너는 서비스 워커가 다시 깨어날 때를 위해 최상위에서 등록해야 한다.
chrome.webNavigation.onCommitted.addListener(onNavigation('commit'), NAV_FILTER);
chrome.webNavigation.onHistoryStateUpdated.addListener(onNavigation('history'), NAV_FILTER);
chrome.webNavigation.onReferenceFragmentUpdated.addListener(onNavigation('fragment'), NAV_FILTER);

// about:blank 탭을 먼저 만들어 tabId를 저장한 뒤 주소를 바꾼다. 그래야 첫 이동 이벤트를 놓치지 않는다.
async function openGameTab(url) {
  const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  return { tabId: tab.id, go: () => chrome.tabs.update(tab.id, { url }) };
}

async function endCurrentGame(update) {
  const game = await loadGame();
  if (game && (game.status === 'pending' || game.status === 'running')) {
    const abandoned = abandonGame(game, Date.now());
    if (abandoned.startedAt) await saveRecord(abandoned, update);
  }
}

const handlers = {
  async 'game:start'({ setup }) {
    const start = normalizeTitle(setup.start);
    const target = normalizeTitle(setup.target);
    if (!start || !target) throw new Error('시작 문서와 목표 문서를 모두 입력해 주세요.');
    const update = {};
    await endCurrentGame(update);
    const { tabId, go } = await openGameTab(docUrl(start));
    update.game = createGame({ ...setup, start, target }, tabId, Date.now());
    await chrome.storage.local.set(update);
    await go();
    return { ok: true };
  },

  async 'game:abandon'() {
    const update = { game: null };
    await endCurrentGame(update);
    await chrome.storage.local.set(update);
    return { ok: true };
  },

  async 'game:dismiss'() {
    const game = await loadGame();
    if (game && game.status !== 'pending' && game.status !== 'running') {
      await chrome.storage.local.set({ game: null });
    }
    return { ok: true };
  },

  // 게임 탭을 닫았을 때 마지막 문서를 새 탭에서 다시 연다. 같은 문서라 클릭 수는 늘지 않는다.
  async 'game:resume'() {
    const game = await loadGame();
    if (!game || (game.status !== 'pending' && game.status !== 'running')) return { ok: false };
    const { tabId, go } = await openGameTab(docUrl(game.currentTitle ?? game.start));
    await chrome.storage.local.set({ game: { ...game, tabId } });
    await go();
    return { ok: true };
  },

  async 'hud:hello'(_msg, sender) {
    return { tabId: sender.tab?.id ?? null };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  serial(() => handler(msg, sender))
    .then((res) => sendResponse(res))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
  return true;
});
