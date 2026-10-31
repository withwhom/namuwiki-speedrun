// 랜덤 도전: 문서 모음(data/pool.json)에서 시작 문서와 목표 문서를 따로 뽑는다.
//
// 문서 모음은 서로 관계없는 문서를 분야(cat)별로 모은 것이다. 쌍을 미리 만들어 두지 않는다.
// 분야마다 문서 수가 달라도 고르게 나오도록 분야를 먼저 고르고, 그 분야 안에서 문서를 고른다.
// differentCategory를 켜면 두 문서를 다른 분야에서 고른다 (지금은 팝업에서 끈 채로 쓴다).

import { titleKey } from './title.js';

export const POOL_CATEGORIES = {
  food: '음식',
  animal: '동물',
  nature: '자연·식물',
  science: '과학',
  space: '우주',
  body: '몸·건강',
  material: '물질·재료',
  shape_number: '색·도형·숫자',
  world_history: '세계사',
  korea_history: '한국사',
  people: '인물',
  idea: '철학·사상',
  society: '사회·경제',
  military: '군사·무기',
  country_city: '나라·도시',
  landmark: '세계 명소·지형',
  korea_place: '한국 지역',
  language: '언어·문자',
  art_music: '미술·음악',
  book_film: '책·영화·방송',
  character: '캐릭터',
  tech: '기술·인터넷',
  transport: '탈것·교통',
  sport: '스포츠',
  game: '게임·놀이',
  daily: '생활',
  abstract: '추상 개념',
  myth: '신화·종교',
};

function pickOne(list, rand) {
  return list[Math.floor(rand() * list.length) % list.length];
}

// 분야를 고르게 고른 뒤 그 분야의 문서 하나. 후보가 없으면 null
function pickByCategory(docs, rand) {
  const byCat = new Map();
  for (const d of docs) {
    if (!byCat.has(d.cat)) byCat.set(d.cat, []);
    byCat.get(d.cat).push(d);
  }
  if (!byCat.size) return null;
  const cats = [...byCat.keys()].sort();
  return pickOne(byCat.get(pickOne(cats, rand)), rand);
}

// 반환: { start, target } (각각 문서 모음의 항목) 또는 고를 수 없으면 null
export function pickPair(docs, { rand = Math.random, differentCategory = false, exclude = [] } = {}) {
  const excluded = new Set(exclude.map(titleKey));
  const candidates = docs.filter((d) => !excluded.has(titleKey(d.title)));
  const start = pickByCategory(candidates, rand);
  if (!start) return null;
  const rest = candidates.filter(
    (d) => titleKey(d.title) !== titleKey(start.title) && (!differentCategory || d.cat !== start.cat),
  );
  const target = pickByCategory(rest, rand);
  return target ? { start, target } : null;
}
