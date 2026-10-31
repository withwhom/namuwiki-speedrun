# CLAUDE.md

나무위키 스피드런 크롬 확장 (Manifest V3, 순수 JavaScript, 빌드 없음).
사용자가 namu.wiki를 직접 돌아다니고, 확장은 그 위에 HUD만 얹는다.

## 구조

```
extension/                 크롬에 "압축해제된 확장 프로그램"으로 불러오는 폴더 (이 안에 node_modules 금지)
  manifest.json            권한: storage, webNavigation, host https://namu.wiki/* — 더 늘리지 않는다
  background.js            서비스 워커. webNavigation 이벤트 → lib/navigation.js → chrome.storage.local
  lib/                     순수 로직 ES 모듈. 브라우저 API를 쓰지 않는다 (Node 단위 테스트 대상)
    title.js               URL → 제목 정리의 단일 진입점 parseNamuUrl. URL 형식 가정은 전부 여기
    rules.js               규칙 위반 판정 (이름공간, 문서가 아닌 페이지, 주소창 입력)
    navigation.js          게임 상태 전이 (시작, 이동, 리다이렉트 보정, 도착, 포기)
    score.js               기록, 최고 기록, 공유 문구, 시간 형식
    daily.js               오늘의 문제 선택 (KST 기준)
    pool.js                랜덤 도전: 문서 모음에서 두 문서 뽑기 (pickPair), 분야 목록
  content/
    loader.js              콘텐츠 스크립트 → hud.js를 동적 import
    hud.js                 Shadow DOM HUD와 결과 화면. storage의 'game'을 보여주기만 한다
    selectors.js           나무위키 DOM 선택자는 이 파일에만 둔다
  popup/                   팝업 (오늘의 문제, 랜덤, 직접 입력, 기록)
  data/challenges.json     오늘의 문제 목록 (시작·목표 쌍)
  data/pool.json           랜덤 도전용 문서 모음 (쌍이 아니라 문서 하나씩)
test/unit/                 node --test 단위 테스트 (npm test)
test/e2e/                  Playwright + 가짜 나무위키 페이지 (npm run test:e2e)
```

상태 흐름: `background.js`만 `game`·`records`·`best`를 쓴다. `hud.js`와 팝업은 읽고, 바꿀 일이 있으면 `chrome.runtime.sendMessage`(`game:start`, `game:abandon`, `game:dismiss`, `game:resume`)로 요청한다. `hudPrefs`만 `hud.js`가 직접 쓴다.

## 핵심 원칙

1. **판정은 URL로.** 문서인지, 어떤 문서인지, 규칙 위반인지는 `parseNamuUrl`과 webNavigation의 `transitionType`/`transitionQualifiers`로만 정한다. 페이지 DOM을 읽어 판정하지 않는다.
2. **선택자는 `content/selectors.js` 한 곳에.** 화면을 건드리는 기능(검색창 숨기기, 다크 모드 감지)은 선택자가 하나도 맞지 않아도 게임이 정상 동작해야 한다. 예외는 잡아서 삼킨다.
3. **namu.wiki로 요청을 보내지 않는다.** 확장도 테스트도 `fetch`·XHR로 나무위키에 접근하지 않는다. 확장은 게임 탭을 시작 문서 주소로 보내는 것만 한다. E2E 테스트는 `context.route`로 `https://namu.wiki/*`를 가로채 가짜 HTML로 응답하고 그 밖의 외부 요청은 막는다.
4. 외부 서버, 원격 코드, 분석 도구를 쓰지 않는다. 라이브러리를 확장에 넣지 않는다.
5. 확인되지 않은 나무위키 동작은 코드 주석에 `[T1]`, `[R2]`처럼 번호를 붙여 적는다. 사실로 확인되면 주석을 고친다.
6. 새 로직은 `lib/`에 순수 함수로 넣고 `test/unit/`에 테스트를 붙인다.

## 문제 목록 추가 규칙 (`extension/data/challenges.json`)

오늘의 문제는 `daily.js`가 **`since <= 날짜`인 문제만 후보로 삼아** id 순으로 정렬한 뒤 날짜 해시로 고른다. 그래서 아래를 지켜야 지난 날짜의 문제가 바뀌지 않는다.

- 기존 항목의 `id`와 `since`는 절대 바꾸거나 지우지 않는다. 문서명 오타 수정(`start`, `target`, `aliases`)은 괜찮다.
- 문제를 더 이상 쓰고 싶지 않아도 지우지 않는다. 필요하면 `start`/`target`을 고친다.
- 새 항목의 `id`는 지금까지의 최댓값 + 1. 다시 쓰지 않는다.
- 새 항목의 `since`는 **추가하는 날의 다음 날 이후**로 적는다. 오늘 날짜를 쓰면 오늘의 문제가 하루 중간에 바뀔 수 있다.
- 형식: `{ "id": 59, "since": "2026-11-15", "start": "시작 문서", "target": "목표 문서", "aliases": ["목표의 다른 이름"] }`
  - `aliases`는 선택. 목표 문서가 다른 이름(리다이렉트 대상 등)으로 열릴 수 있을 때 적는다.
  - 목표 도착은 영문 대소문자와 띄어쓰기를 무시하고 비교한다. 띄어쓰기만 다른 별개의 문서가 있어 구분해야 하면 `"exactSpacing": true`를 단다 (선택, 기본 false).
- 이름공간 문서(`분류:` 등)는 시작·목표로 쓰지 않는다. `npm test`가 형식, id 중복, 이름공간을 검사한다.
- 문서명은 실제로 나무위키에서 확인하고 넣는다.
  - 없는 문서("해당 문서를 찾을 수 없습니다")는 쓰지 않는다. 나무위키는 없는 문서도 `/w/제목` 주소로 열리므로 확장이 걸러 주지 않는다.
  - 리다이렉트(주소에 `?from=`이 붙음)되는 이름은 목표로 쓸 때 실제 문서명을 `target`에 적는다. 실제 문서 링크를 바로 눌러 도착하면 `from`이 없기 때문이다.
  - 동음이의어 문서(분류:동음이의어)는 쓰지 않는다.

## 문서 모음 추가 규칙 (`extension/data/pool.json`)

랜덤 도전은 문서 모음에서 시작과 목표를 매번 따로 뽑는다. 쌍을 저장하지 않는다.

- 형식: `{ "title": "문서명", "cat": "food" }`. `cat`은 `lib/pool.js`의 `POOL_CATEGORIES` 키 중 하나.
  - 분야는 지금 쓰이지 않지만 나중에 "같은 분야끼리는 안 뽑기" 같은 사용자 설정에 쓴다 (`pickPair`의 `differentCategory`).
- 서로 거리가 먼 문서를 고르게 넣는다. 너무 좁은 문서(작은 지명, 단역 인물)는 피한다.
- id·since가 없으므로 순서를 바꾸거나 지워도 된다.
- 제목 확인 규칙은 위와 같다: 없는 문서·동음이의어 문서는 빼고, 리다이렉트되는 이름은 실제 문서명으로 적는다.
- `npm test`가 중복(띄어쓰기·대소문자 무시), 이름공간, 분야, 개수(1000개 이상)를 검사한다.
