// 콘텐츠 스크립트는 ES 모듈로 바로 선언할 수 없어서, 확장 안의 모듈을 동적으로 불러온다.
import(chrome.runtime.getURL('content/hud.js')).catch((err) => console.error('[namu-speedrun]', err));
