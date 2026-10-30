// 기록, 최고 기록, 공유 문구.

import { elapsedMs } from './navigation.js';
import { titleKey } from './title.js';

export const MAX_RECORDS = 100;

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// 문제별 최고 기록을 묶는 키. 목록의 문제는 id로, 직접 입력은 시작·목표 제목으로 묶는다.
export function challengeKey({ challengeId, start, target }) {
  if (challengeId != null) return `c:${challengeId}`;
  return `custom:${titleKey(start)}→${titleKey(target)}`;
}

export function buildRecord(game) {
  return {
    id: game.id,
    key: challengeKey(game),
    mode: game.mode,
    challengeId: game.challengeId,
    dailyNo: game.dailyNo,
    start: game.start,
    target: game.target,
    status: game.status, // 'finished' | 'abandoned'
    clicks: game.clicks,
    durationMs: elapsedMs(game, game.finishedAt ?? game.startedAt ?? game.createdAt),
    path: game.path.map((p) => ({ title: p.title, via: p.via, special: !!p.special, violated: p.violations.length > 0 })),
    violations: game.violations.map((v) => v.label),
    violated: game.violations.length > 0,
    endedAt: game.finishedAt ?? game.createdAt,
  };
}

export function addRecord(records, record, max = MAX_RECORDS) {
  return [record, ...records.filter((r) => r.id !== record.id)].slice(0, max);
}

export function isValidForBest(record) {
  return record.status === 'finished' && !record.violated;
}

// 클릭 수가 적은 쪽이 낫고, 같으면 시간이 짧은 쪽이 낫다.
export function isBetter(a, b) {
  if (!b) return true;
  if (a.clicks !== b.clicks) return a.clicks < b.clicks;
  return a.durationMs < b.durationMs;
}

export function updateBest(best, record) {
  if (!isValidForBest(record)) return best;
  if (!isBetter(record, best[record.key])) return best;
  return { ...best, [record.key]: record };
}

export function shareHeading(record) {
  if (record.mode === 'daily' && record.dailyNo != null) return `나무위키 스피드런 #${record.dailyNo}`;
  if (record.mode === 'random') return '나무위키 스피드런 (랜덤)';
  return '나무위키 스피드런 (직접 입력)';
}

export function buildShareText(record) {
  const lines = [
    shareHeading(record),
    `${record.start} → ${record.target}`,
    `${record.clicks}클릭 · ${formatDuration(record.durationMs)}`,
  ];
  if (record.violated) lines.push('⚠ 규칙 위반 기록');
  return lines.join('\n');
}

export function formatPath(record) {
  return record.path.map((p) => (p.via === 'history' ? `↩ ${p.title}` : p.title)).join(' → ');
}
