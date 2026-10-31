// 나무위키 화면 요소에 닿는 선택자는 모두 여기에 둔다.
// 이 선택자들은 실제 페이지를 보지 않고 쓴 추정값이다 (확인 필요).
// 맞지 않아도 게임 판정은 URL로 하므로 게임은 그대로 동작하고, 검색창이 안 숨겨지는 것만 달라진다.
//
// 확인 필요한 가정:
// [S1] 검색창은 placeholder에 '검색'이 들어간 input이거나, /Search 또는 /go 로 보내는 form 안에 있다.
//      선택자가 맞아 검색창을 쓸 수 없게 되는 것은 확인됨 2026-10-30. 다만 감싸는 상자가 남아 검은 칸으로 보인다.
//      검은 칸은 그대로 두기로 했다 (게임에 지장 없음).
// [S2] 나무위키 다크 모드는 <html> 또는 <body>에 'dark'가 들어간 클래스가 붙는다.
//      HUD가 맥 시스템 테마(밝은/어두운)를 따라 바뀌는 것은 확인됨 2026-10-31.
//      나무위키만 따로 다크 모드로 둔 경우의 감지는 미확인 (틀려도 HUD가 시스템 테마를 따를 뿐이다).

export const HUD_HOST_ID = 'namu-speedrun-hud';
export const HIDE_STYLE_ID = 'namu-speedrun-hide-search';

// 하나씩 따로 규칙을 만들기 때문에 하나가 잘못돼도 나머지는 적용된다.
export const SEARCH_SELECTORS = [
  'form[action*="/Search"]',
  'form[action*="/go"]',
  'form:has(input[placeholder*="검색"])',
  'input[placeholder*="검색"]',
  'input[type="search"]',
];

export const SITE_DARK_SELECTORS = ['html[class*="dark"]', 'body[class*="dark"]'];

export function setSearchHidden(hidden) {
  try {
    const existing = document.getElementById(HIDE_STYLE_ID);
    if (!hidden) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const style = document.createElement('style');
    style.id = HIDE_STYLE_ID;
    style.textContent = SEARCH_SELECTORS.map((s) => `${s} { display: none !important; }`).join('\n');
    (document.head ?? document.documentElement).appendChild(style);
  } catch {
    // 선택자 문제로 실패해도 게임에는 영향이 없다.
  }
}

export function isSiteDarkMode() {
  try {
    return SITE_DARK_SELECTORS.some((s) => document.querySelector(s));
  } catch {
    return false;
  }
}
