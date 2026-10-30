// 게임 화면(HUD, 결과 화면). Shadow DOM 안에 그려서 나무위키 스타일과 섞이지 않게 한다.
// 상태는 background.js가 chrome.storage.local의 'game'에 쓰고, 여기서는 그 값을 보여주기만 한다.
// 나무위키 DOM에 닿는 부분은 selectors.js에만 있다.

import { HUD_HOST_ID, isSiteDarkMode, setSearchHidden } from './selectors.js';
import { buildShareText, formatDuration } from '../lib/score.js';
import { elapsedMs } from '../lib/navigation.js';

const STYLE = `
:host { all: initial; }
.hud, .backdrop {
  --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --line: #d1d9e0; --chip: #f3f5f7;
  --accent: #00a495; --accent-fg: #ffffff; --warn-bg: #fff4e5; --warn-fg: #8a4b00; --bad: #c62828;
  font: 13px/1.45 system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  color: var(--fg);
}
@media (prefers-color-scheme: dark) {
  .hud, .backdrop {
    --bg: #1e2227; --fg: #e6e8eb; --muted: #a0a8b2; --line: #3a4048; --chip: #2a2f36;
    --accent: #2bc4b4; --accent-fg: #0b1a19; --warn-bg: #3a2a12; --warn-fg: #ffcf8a; --bad: #ff8a80;
  }
}
:host([data-theme="dark"]) .hud, :host([data-theme="dark"]) .backdrop {
  --bg: #1e2227; --fg: #e6e8eb; --muted: #a0a8b2; --line: #3a4048; --chip: #2a2f36;
  --accent: #2bc4b4; --accent-fg: #0b1a19; --warn-bg: #3a2a12; --warn-fg: #ffcf8a; --bad: #ff8a80;
}
* { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; }
.hud {
  position: fixed; z-index: 2147483646; width: 280px; max-width: calc(100vw - 16px);
  background: var(--bg); border: 1px solid var(--line); border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0,0,0,.18); overflow: hidden;
}
.bar {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px;
  background: var(--accent); color: var(--accent-fg); cursor: grab; user-select: none; touch-action: none;
}
.bar.dragging { cursor: grabbing; }
.time { font-weight: 700; font-size: 16px; font-variant-numeric: tabular-nums; }
.clicks { font-weight: 600; }
.spacer { flex: 1; }
.icon { border: 0; background: transparent; color: inherit; font-size: 14px; padding: 0 4px; line-height: 1; }
.body { padding: 10px; display: grid; gap: 8px; }
.hud.collapsed .body { display: none; }
.target { color: var(--muted); }
.target strong { color: var(--fg); }
.path { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 4px; max-height: 160px; overflow: auto; }
.path li { background: var(--chip); border-radius: 6px; padding: 1px 6px; }
.path li.bad { color: var(--bad); font-weight: 600; }
.path li.sep { background: transparent; padding: 0; color: var(--muted); }
.warn { background: var(--warn-bg); color: var(--warn-fg); border-radius: 6px; padding: 6px 8px; }
.status { color: var(--muted); }
.row { display: flex; gap: 6px; justify-content: flex-end; }
.btn { border: 1px solid var(--line); background: var(--bg); border-radius: 6px; padding: 4px 10px; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); font-weight: 600; }
.backdrop {
  position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center;
  background: rgba(0,0,0,.45); padding: 16px;
}
.result {
  width: 380px; max-width: 100%; max-height: calc(100vh - 32px); overflow: auto;
  background: var(--bg); border-radius: 12px; padding: 18px; display: grid; gap: 10px;
  box-shadow: 0 10px 40px rgba(0,0,0,.3);
}
.result h2 { margin: 0; font-size: 18px; }
.route { font-weight: 600; }
.stats { display: flex; gap: 16px; font-size: 15px; }
.stats b { font-size: 20px; font-variant-numeric: tabular-nums; }
.share { width: 100%; min-height: 96px; resize: vertical; font: 13px/1.5 ui-monospace, Menlo, monospace;
  color: var(--fg); background: var(--chip); border: 1px solid var(--line); border-radius: 6px; padding: 8px; }
.bad-text { color: var(--bad); font-weight: 600; }
[hidden] { display: none !important; }
`;

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

function send(type) {
  try {
    return chrome.runtime.sendMessage({ type });
  } catch {
    return Promise.resolve(null); // 확장을 다시 불러온 뒤 남은 옛 스크립트
  }
}

function renderPath(list, path) {
  list.replaceChildren();
  path.forEach((step, i) => {
    if (i > 0) list.append(el('li', { class: 'sep', text: step.via === 'history' ? '↩' : '→' }));
    const bad = step.violations?.length > 0;
    list.append(el('li', { class: bad ? 'bad' : '', text: bad ? `⚠ ${step.title}` : step.title }));
  });
  list.scrollTop = list.scrollHeight;
}

class Hud {
  constructor(tabId) {
    this.tabId = tabId;
    this.game = null;
    this.prefs = { x: null, y: 16, collapsed: false };
    this.shownViolations = 0;
    this.warnTimer = null;
    this.host = el('div', { id: HUD_HOST_ID });
    this.root = this.host.attachShadow({ mode: 'open' });
    this.build();
    setInterval(() => this.tick(), 250);
  }

  build() {
    this.timeEl = el('span', { class: 'time', text: '0:00' });
    this.clicksEl = el('span', { class: 'clicks', text: '0클릭' });
    this.toggleBtn = el('button', { class: 'icon', title: '접기/펼치기', 'aria-label': '접기/펼치기', onclick: () => this.toggle() });
    this.bar = el('div', { class: 'bar' }, [this.timeEl, this.clicksEl, el('span', { class: 'spacer' }), this.toggleBtn]);
    this.targetEl = el('strong');
    this.statusEl = el('div', { class: 'status' });
    this.pathEl = el('ol', { class: 'path', 'aria-label': '지나온 경로' });
    this.warnEl = el('div', { class: 'warn', role: 'alert', hidden: '' });
    const giveUp = el('button', { class: 'btn', text: '포기', onclick: () => this.giveUp() });
    this.body = el('div', { class: 'body' }, [
      el('div', { class: 'target' }, ['목표 ', this.targetEl]),
      this.statusEl,
      this.pathEl,
      this.warnEl,
      el('div', { class: 'row' }, [giveUp]),
    ]);
    this.panel = el('div', { class: 'hud' }, [this.bar, this.body]);
    this.backdrop = el('div', { class: 'backdrop', hidden: '' });
    this.root.append(el('style', { text: STYLE }), this.panel, this.backdrop);
    this.bindDrag();
  }

  setPrefs(prefs) {
    this.prefs = { ...this.prefs, ...prefs };
    this.applyPosition();
    this.panel.classList.toggle('collapsed', !!this.prefs.collapsed);
    this.toggleBtn.textContent = this.prefs.collapsed ? '▸' : '▾';
  }

  savePrefs() {
    chrome.storage.local.set({ hudPrefs: this.prefs }).catch(() => {});
  }

  applyPosition() {
    const w = this.panel.offsetWidth || 280;
    const h = this.panel.offsetHeight || 40;
    const maxX = Math.max(8, window.innerWidth - w - 8);
    const maxY = Math.max(8, window.innerHeight - h - 8);
    const x = this.prefs.x == null ? maxX : Math.min(Math.max(8, this.prefs.x), maxX);
    const y = Math.min(Math.max(8, this.prefs.y ?? 16), maxY);
    this.panel.style.left = `${x}px`;
    this.panel.style.top = `${y}px`;
  }

  bindDrag() {
    let start = null;
    this.bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const rect = this.panel.getBoundingClientRect();
      start = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      this.bar.setPointerCapture(e.pointerId);
      this.bar.classList.add('dragging');
    });
    this.bar.addEventListener('pointermove', (e) => {
      if (!start) return;
      this.prefs.x = e.clientX - start.dx;
      this.prefs.y = e.clientY - start.dy;
      this.applyPosition();
    });
    const end = () => {
      if (!start) return;
      start = null;
      this.bar.classList.remove('dragging');
      this.savePrefs();
    };
    this.bar.addEventListener('pointerup', end);
    this.bar.addEventListener('pointercancel', end);
    window.addEventListener('resize', () => this.applyPosition());
  }

  toggle() {
    this.setPrefs({ collapsed: !this.prefs.collapsed });
    this.savePrefs();
  }

  giveUp() {
    if (window.confirm('이번 도전을 포기할까요? 기록에는 "포기"로 남아요.')) send('game:abandon');
  }

  isMine(game) {
    return !!game && game.tabId === this.tabId;
  }

  update(game) {
    const prev = this.game;
    this.game = this.isMine(game) ? game : null;
    const active = this.game && (this.game.status === 'pending' || this.game.status === 'running');
    setSearchHidden(!!active);

    if (!this.game) {
      this.host.remove();
      this.backdrop.hidden = true;
      return;
    }
    if (!this.host.isConnected) document.documentElement.append(this.host);
    if (prev?.id !== this.game.id) this.shownViolations = 0;

    const g = this.game;
    this.targetEl.textContent = g.target;
    this.clicksEl.textContent = `${g.clicks}클릭`;
    this.statusEl.textContent = g.status === 'pending' ? '시작 문서를 여는 중…' : '';
    this.statusEl.hidden = g.status !== 'pending';
    renderPath(this.pathEl, g.path);

    if (g.violations.length > this.shownViolations) {
      const latest = g.violations[g.violations.length - 1];
      this.showWarning(`⚠ 규칙 위반: ${latest.label}. 기록에 "규칙 위반"으로 남아요.`);
      this.shownViolations = g.violations.length;
    }

    if (g.status === 'finished' && g.result) this.showResult(g.result);
    else this.backdrop.hidden = true;

    this.applyPosition();
    this.tick();
  }

  showWarning(text) {
    this.warnEl.textContent = text;
    this.warnEl.hidden = false;
    if (this.prefs.collapsed) this.setPrefs({ collapsed: false });
    clearTimeout(this.warnTimer);
    this.warnTimer = setTimeout(() => (this.warnEl.hidden = true), 6000);
  }

  showResult(record) {
    if (this.resultFor === record.id && !this.backdrop.hidden) return;
    this.resultFor = record.id;
    const shareText = buildShareText(record);
    const share = el('textarea', { class: 'share', readonly: '', 'aria-label': '공유 문구' });
    share.value = shareText;
    share.rows = shareText.split('\n').length + 1;
    const copyBtn = el('button', { class: 'btn primary', text: '공유 문구 복사' });
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareText);
      } catch {
        share.select();
        document.execCommand('copy');
      }
      copyBtn.textContent = '복사했어요';
    });
    const path = el('ol', { class: 'path', 'aria-label': '전체 경로' });
    renderPath(path, record.path.map((p) => ({ ...p, violations: p.violated ? ['x'] : [] })));
    const dialog = el('div', { class: 'result', role: 'dialog', 'aria-label': '결과' }, [
      el('h2', { text: '목표 도착!' }),
      el('div', { class: 'route', text: `${record.start} → ${record.target}` }),
      el('div', { class: 'stats' }, [
        el('span', {}, [el('b', { text: formatDuration(record.durationMs) }), ' 시간']),
        el('span', {}, [el('b', { text: String(record.clicks) }), ' 클릭']),
      ]),
      record.violated
        ? el('div', { class: 'bad-text', text: `규칙 위반 ${record.violations.length}회: ${record.violations.join(', ')}` })
        : null,
      path,
      share,
      el('div', { class: 'row' }, [
        copyBtn,
        el('button', { class: 'btn', text: '닫기', onclick: () => send('game:dismiss') }),
      ]),
    ]);
    this.backdrop.replaceChildren(dialog);
    this.backdrop.hidden = false;
  }

  tick() {
    if (!this.game) return;
    this.timeEl.textContent = formatDuration(elapsedMs(this.game, Date.now()));
    if (isSiteDarkMode()) this.host.setAttribute('data-theme', 'dark');
    else this.host.removeAttribute('data-theme');
  }
}

async function main() {
  if (document.getElementById(HUD_HOST_ID)) return;
  const hello = await send('hud:hello');
  if (!hello?.tabId) return;
  const hud = new Hud(hello.tabId);
  const { game = null, hudPrefs = {} } = await chrome.storage.local.get(['game', 'hudPrefs']);
  hud.setPrefs(hudPrefs);
  hud.update(game);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.game) hud.update(changes.game.newValue ?? null);
  });
}

main();
