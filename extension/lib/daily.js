// 오늘의 문제 선택.
//
// 지난 날짜의 문제가 바뀌지 않는 이유:
//   어떤 날짜 D의 후보는 since <= D 인 문제들뿐이다. 새 문제는 항상 추가한 날보다 뒤의 since를 달기 때문에
//   이미 지난 날짜의 후보 목록은 늘어나지 않는다. 후보 안에서는 id 순으로 정렬한 뒤 날짜 해시로 하나를 고른다.
//   그래서 기존 문제의 id·since를 바꾸거나 지우면 안 된다 (CLAUDE.md 참고).
//
// 날짜는 한국 시간(KST, UTC+9) 기준이다.

export const DAILY_EPOCH = '2026-10-30'; // #1이 되는 날
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function kstDate(now) {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function dayIndex(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function dailyNumber(dateStr) {
  return dayIndex(dateStr) - dayIndex(DAILY_EPOCH) + 1;
}

// FNV-1a 32비트. 날짜 문자열을 고르게 섞는 용도라 암호학적 성질은 필요 없다.
export function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function poolFor(challenges, dateStr) {
  return challenges.filter((c) => c.since <= dateStr).sort((a, b) => a.id - b.id);
}

// 반환: { challenge, number, date } 또는 후보가 없으면 null
export function dailyChallenge(challenges, dateStr) {
  const date = dateStr < DAILY_EPOCH ? DAILY_EPOCH : dateStr;
  const pool = poolFor(challenges, date);
  if (!pool.length) return null;
  const challenge = pool[hash32(`namu-speedrun:${date}`) % pool.length];
  return { challenge, number: dailyNumber(date), date };
}
