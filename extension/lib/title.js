// 나무위키 URL ↔ 문서 제목 변환.
// 나무위키 URL 형식에 대한 가정은 모두 이 파일에 모은다. 실제 형식이 다르면 여기만 고친다.
//
// 확인 필요한 가정:
// [T1] 일반 문서 주소는 https://namu.wiki/w/<퍼센트 인코딩된 제목> 이다.
// [T2] 제목에 '/'가 들어가면 경로에 그대로 남거나 %2F로 인코딩된다. 어느 쪽이든 /w/ 뒤 전체를 제목으로 본다.
// [T3] 리다이렉트 문서를 열면 주소가 대상 문서로 바뀌고 ?from=<원래 제목> 쿼리가 붙는다.
//      원래 주소 → 대상 주소로 두 번 바뀌어도 이동 한 번으로 친다 (navigation.js 참고).
//      from 쿼리가 없더라도 경로의 제목만으로 판정하므로 게임은 동작한다.
// [T4] 공백은 %20으로 인코딩되며, '_'나 '+'를 공백 대신 쓰지 않는다.
// [T5] 영문 대소문자만 다른 두 제목은 같은 문서로 본다 (예: K-POP / K-pop).
// [T6] 문서 주소를 만들 때는 제목 전체를 encodeURIComponent로 인코딩한다 ('/' 포함).
// [T7] namu.wiki 루트(/)는 대문으로 넘어가는 중간 단계로 보고 무시한다.
// [T8] 목표 도착 판정에서는 띄어쓰기만 다른 제목을 같은 문서로 본다 (예: 레오나르도 다 빈치 / 레오나르도 다빈치).
//      띄어쓰기가 중요한 문제는 challenges.json에 "exactSpacing": true를 달아 끈다.
//      어느 문서로 이동했는지(클릭 수) 판정에는 띄어쓰기를 그대로 쓴다.

export const NAMU_HOST = 'namu.wiki';
export const DOC_PREFIX = '/w/';
export const REDIRECT_FROM_PARAM = 'from';

// 잘못된 % 시퀀스가 섞여 있어도 예외 없이 풀 수 있는 부분만 푼다.
function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text.replace(/(%[0-9A-Fa-f]{2})+/g, (chunk) => {
      try {
        return decodeURIComponent(chunk);
      } catch {
        return chunk;
      }
    });
  }
}

// 사람이 입력한 제목이나 URL에서 꺼낸 제목을 같은 모양으로 맞춘다.
export function normalizeTitle(raw) {
  if (raw == null) return '';
  return String(raw)
    .normalize('NFC')
    .replace(/[​‌‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleKey(title) {
  return normalizeTitle(title).toLowerCase(); // [T5]
}

export function sameTitle(a, b, { ignoreSpaces = false } = {}) {
  if (!a || !b) return false;
  if (ignoreSpaces) return titleKey(a).replace(/ /g, '') === titleKey(b).replace(/ /g, ''); // [T8]
  return titleKey(a) === titleKey(b);
}

// 제목 정리의 단일 진입점: URL 하나를 받아 어떤 페이지인지 알려준다.
//   { kind: 'doc', title, redirectedFrom }   일반 /w/ 문서
//   { kind: 'special', section, path }        편집·역사·검색 등 문서가 아닌 나무위키 페이지
//   { kind: 'other' }                         나무위키가 아니거나 판정할 필요가 없는 주소
export function parseNamuUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return { kind: 'other' };
  }
  if (url.hostname !== NAMU_HOST) return { kind: 'other' };

  // URL 객체가 #앵커와 ?쿼리를 pathname에서 떼어 준다. pathname은 아직 인코딩된 상태다.
  const path = url.pathname;

  if (path.startsWith(DOC_PREFIX)) {
    const title = normalizeTitle(safeDecode(path.slice(DOC_PREFIX.length))); // [T1][T2]
    if (!title) return { kind: 'other' };
    const fromRaw = url.searchParams.get(REDIRECT_FROM_PARAM); // [T3]
    const from = fromRaw ? normalizeTitle(fromRaw) : '';
    return {
      kind: 'doc',
      title,
      redirectedFrom: from && !sameTitle(from, title) ? from : null,
    };
  }

  if (path === '/' || path === '') return { kind: 'other' }; // [T7]

  return {
    kind: 'special',
    section: safeDecode(path.split('/')[1] || ''),
    path: safeDecode(path),
  };
}

export function docUrl(title) {
  return `https://${NAMU_HOST}${DOC_PREFIX}${encodeURIComponent(normalizeTitle(title))}`; // [T6]
}
