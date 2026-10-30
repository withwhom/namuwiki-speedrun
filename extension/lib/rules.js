// 규칙 위반 판정. URL을 parseNamuUrl로 정리한 결과와 webNavigation 정보만 본다.
//
// 확인 필요한 가정:
// [R1] 이름공간 문서는 /w/<이름공간>:<제목> 형태다 (예: /w/분류:한국의 음식).
// [R2] 편집·역링크·역사·토론·검색 등은 /w/가 아닌 경로로 열린다.
//      알려진 경로: /edit/ /backlink/ /history/ /discuss/ /thread/ /Search /go/ /raw/ /diff/ /blame/ /random
//      목록에 없는 경로도 '문서가 아닌 페이지'로 보고 위반 처리한다.
// [R3] 주소창 직접 입력은 webNavigation transitionType 'typed'(또는 주소창 추천 선택 'generated' 등)로 들어온다.
//      history 기반 이동(onHistoryStateUpdated)은 페이지 안의 링크로만 일어난다고 보고 typed 판정을 하지 않는다.

import { normalizeTitle } from './title.js';

export const FORBIDDEN_NAMESPACES = ['분류', '파일', '틀', '나무위키', '사용자', '특수기능', '휴지통'];

export const SPECIAL_SECTION_LABELS = {
  edit: '편집',
  backlink: '역링크',
  history: '역사',
  discuss: '토론',
  thread: '토론',
  Search: '검색',
  search: '검색',
  go: '검색',
  raw: '원본 보기',
  diff: '비교',
  blame: '기여자 보기',
  revert: '되돌리기',
  move: '문서 이동',
  delete: '문서 삭제',
  acl: 'ACL',
  random: '임의 문서',
  RecentChanges: '최근 변경',
  RecentDiscuss: '최근 토론',
  contribution: '기여 내역',
  member: '계정',
  Upload: '업로드',
};

export const DIRECT_TRANSITIONS = {
  typed: '주소창 직접 입력',
  generated: '주소창 검색',
  keyword: '주소창 검색',
  keyword_generated: '주소창 검색',
  auto_bookmark: '북마크',
};

export function namespaceOf(title) {
  const t = normalizeTitle(title);
  return FORBIDDEN_NAMESPACES.find((ns) => t.startsWith(`${ns}:`)) ?? null;
}

export function specialPageName(section) {
  const label = SPECIAL_SECTION_LABELS[section];
  return label ? `${label} 페이지` : '문서가 아닌 페이지';
}

// parsed: parseNamuUrl 결과. 반환: [{ code, label }]
export function findViolations({ parsed, transitionType, transitionQualifiers = [], source }) {
  const found = [];
  if (parsed.kind === 'doc') {
    const ns = namespaceOf(parsed.title);
    if (ns) found.push({ code: 'namespace', label: `${ns} 이름공간 문서` });
  } else if (parsed.kind === 'special') {
    found.push({ code: 'special', label: specialPageName(parsed.section) });
  }
  if (source === 'commit') {
    const direct = DIRECT_TRANSITIONS[transitionType];
    if (direct) found.push({ code: 'typed', label: direct });
    else if (transitionQualifiers.includes('from_address_bar')) {
      found.push({ code: 'typed', label: '주소창 직접 입력' });
    }
  }
  return found;
}
