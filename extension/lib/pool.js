// 랜덤 도전: 문서 모음(data/pool.json)에서 시작 문서와 목표 문서를 따로 뽑는다.
//
// 문서 모음은 서로 관계없는 문서를 분야(cat)별로 모은 것이다. 쌍을 미리 만들어 두지 않는다.
// differentCategory를 켜면 두 문서를 다른 분야에서 고른다 (지금은 팝업에서 끈 채로 쓴다).

import { titleKey } from './title.js';

export const POOL_CATEGORIES = {
  food: '음식',
  animal: '동물',
  nature: '자연·식물',
  science: '과학',
  space: '우주',
  body: '몸·건강',
  world_history: '세계사',
  korea_history: '한국사',
  country_city: '나라·도시',
  landmark: '명소',
  korea_place: '한국 지역',
  art_music: '미술·음악',
  book_film: '책·영화·방송',
  tech: '기술·인터넷',
  sport: '스포츠',
  game: '게임·놀이',
  daily: '생활',
  myth: '신화·종교',
};

// 반환: { start, target } (각각 문서 모음의 항목) 또는 고를 수 없으면 null
export function pickPair(docs, { rand = Math.random, differentCategory = false, exclude = [] } = {}) {
  const excluded = new Set(exclude.map(titleKey));
  const candidates = docs.filter((d) => !excluded.has(titleKey(d.title)));
  const pickFrom = (list) => list[Math.floor(rand() * list.length) % list.length];

  if (candidates.length < 2) return null;
  const start = pickFrom(candidates);
  const rest = candidates.filter(
    (d) => titleKey(d.title) !== titleKey(start.title) && (!differentCategory || d.cat !== start.cat),
  );
  if (!rest.length) return null;
  return { start, target: pickFrom(rest) };
}
