import { dailyChallenge, kstDate, poolFor, randomChallenge } from '../lib/daily.js';
import { buildShareText, challengeKey, formatDuration, shareHeading } from '../lib/score.js';
import { namespaceOf } from '../lib/rules.js';
import { normalizeTitle, sameTitle } from '../lib/title.js';

const $ = (id) => document.getElementById(id);

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

async function loadChallenges() {
  const res = await fetch(chrome.runtime.getURL('data/challenges.json'));
  const data = await res.json();
  return data.challenges;
}

async function startGame(setup, current) {
  if (current && (current.status === 'pending' || current.status === 'running')) {
    if (!window.confirm('진행 중인 게임이 있어요. 포기하고 새로 시작할까요?')) return;
  }
  const res = await chrome.runtime.sendMessage({ type: 'game:start', setup });
  if (res?.ok) window.close();
  else window.alert(res?.error ?? '게임을 시작하지 못했어요.');
}

function challengeSetup(mode, challenge, dailyNo = null) {
  return {
    mode,
    challengeId: challenge.id,
    dailyNo,
    start: challenge.start,
    target: challenge.target,
    aliases: challenge.aliases ?? [],
  };
}

function recordLine(record, { showCopy }) {
  const badges = [];
  if (record.mode === 'daily') badges.push(el('span', { class: 'badge', text: `#${record.dailyNo}` }));
  if (record.mode === 'random') badges.push(el('span', { class: 'badge', text: '랜덤' }));
  if (record.mode === 'custom') badges.push(el('span', { class: 'badge', text: '직접' }));
  if (record.status === 'abandoned') badges.push(el('span', { class: 'badge', text: '포기' }));
  if (record.violated) badges.push(el('span', { class: 'badge bad', text: '규칙 위반' }));
  const date = new Date(record.endedAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
  const sub = `${record.clicks}클릭 · ${formatDuration(record.durationMs)} · ${date}`;
  const copy =
    showCopy && record.status === 'finished'
      ? el('button', {
          class: 'btn small',
          text: '복사',
          title: `${shareHeading(record)} 공유 문구 복사`,
          onclick: async (e) => {
            await navigator.clipboard.writeText(buildShareText(record));
            e.target.textContent = '복사됨';
          },
        })
      : null;
  return el('li', {}, [
    el('span', { class: 'title' }, [`${record.start} → ${record.target}`, ...badges]),
    el('span', { class: 'sub', text: sub }),
    copy,
  ]);
}

function renderList(list, records, opts) {
  list.replaceChildren();
  if (!records.length) {
    list.append(el('li', { class: 'empty', text: '아직 기록이 없어요.' }));
    return;
  }
  for (const r of records) list.append(recordLine(r, opts));
}

async function main() {
  const [challenges, stored] = await Promise.all([
    loadChallenges(),
    chrome.storage.local.get(['game', 'records', 'best']),
  ]);
  const { game = null, records = [], best = {} } = stored;
  const today = kstDate(Date.now());

  // 진행 중 게임
  if (game && (game.status === 'pending' || game.status === 'running')) {
    $('current').hidden = false;
    $('current-route').textContent = `${game.start} → ${game.target}`;
    $('current-meta').textContent = `${game.clicks}클릭 · 현재 문서: ${game.currentTitle ?? '시작 전'}`;
    $('resume').addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'game:resume' });
      window.close();
    });
    $('abandon').addEventListener('click', async () => {
      if (!window.confirm('이번 도전을 포기할까요?')) return;
      await chrome.runtime.sendMessage({ type: 'game:abandon' });
      window.close();
    });
  }

  // 오늘의 문제
  const daily = dailyChallenge(challenges, today);
  if (daily) {
    $('daily-title').textContent = `오늘의 문제 #${daily.number}`;
    $('daily-route').textContent = `${daily.challenge.start} → ${daily.challenge.target}`;
    const myBest = best[challengeKey({ challengeId: daily.challenge.id })];
    $('daily-best').textContent = myBest
      ? `내 최고 기록: ${myBest.clicks}클릭 · ${formatDuration(myBest.durationMs)}`
      : '아직 도전하지 않았어요.';
    $('daily-start').addEventListener('click', () =>
      startGame(challengeSetup('daily', daily.challenge, daily.number), game),
    );
  } else {
    $('daily-start').disabled = true;
  }

  // 랜덤 도전: 오늘까지 공개된 문제 중에서 고른다.
  const pool = poolFor(challenges, today);
  let pick = randomChallenge(pool, Math.random, daily?.challenge.id);
  const showPick = () => ($('random-route').textContent = pick ? `${pick.start} → ${pick.target}` : '');
  showPick();
  $('random-reroll').addEventListener('click', () => {
    pick = randomChallenge(pool, Math.random, pick?.id);
    showPick();
  });
  $('random-start').addEventListener('click', () => pick && startGame(challengeSetup('random', pick), game));

  // 직접 입력
  $('custom-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const start = normalizeTitle($('custom-start').value);
    const target = normalizeTitle($('custom-target').value);
    const error = $('custom-error');
    if (!start || !target) error.textContent = '시작 문서와 목표 문서를 모두 입력해 주세요.';
    else if (sameTitle(start, target)) error.textContent = '시작 문서와 목표 문서가 같아요.';
    else if (namespaceOf(start) || namespaceOf(target)) error.textContent = '분류:, 틀: 같은 이름공간 문서는 쓸 수 없어요.';
    else {
      error.textContent = '';
      startGame({ mode: 'custom', start, target }, game);
    }
  });

  // 기록
  renderList($('recent'), records.slice(0, 10), { showCopy: true });
  const bestList = Object.values(best).sort((a, b) => b.endedAt - a.endedAt).slice(0, 15);
  renderList($('best'), bestList, { showCopy: true });
}

main();
