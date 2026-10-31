// 게임 중에 막을 브라우저 찾기 단축키 판정.
//
// 막는 것: 찾기(맥 Cmd+F, 그 밖 Ctrl+F), 다음/이전 찾기(Cmd/Ctrl+G, Shift 포함, F3, Shift+F3).
// 크롬 메뉴로 여는 찾기와 주소창에 커서가 있을 때 누른 단축키는 페이지까지 오지 않아 막을 수 없다.
// 맥에서는 Ctrl+F가 입력 칸의 커서 이동이라 건드리지 않는다.
//
// 확인 필요한 가정:
// [K1] 크롬은 페이지가 keydown에서 preventDefault 하면 찾기 창을 열지 않는다 (Cmd/Ctrl+F, G, F3).
// [K2] 한글 자판일 때 Cmd/Ctrl과 함께 누르면 key가 'ㄹ'로 올 수 있어 code('KeyF')도 본다.

function isLetter(event, letter) {
  const key = String(event.key ?? '');
  if (/^[a-z]$/i.test(key)) return key.toLowerCase() === letter;
  return event.code === `Key${letter.toUpperCase()}`;
}

// event: KeyboardEvent처럼 key, code, ctrlKey, metaKey, altKey, shiftKey를 가진 객체
export function isFindShortcut(event, { mac = false } = {}) {
  if (!event || event.altKey) return false;
  const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (mod) return isLetter(event, 'f') || isLetter(event, 'g');
  return event.key === 'F3' && !event.ctrlKey && !event.metaKey;
}
