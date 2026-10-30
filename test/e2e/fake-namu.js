// 나무위키 URL 구조(/w/제목, /Search, ?from=)만 흉내 낸 가짜 페이지.
// 실제 나무위키의 HTML 구조를 따라 하지 않는다. 확장이 URL만 보고 판정하는지 확인하는 용도다.
// Playwright route가 https://namu.wiki/* 요청을 가로채 이 HTML로 응답하므로 실제 서버로는 요청이 나가지 않는다.

// spa: true 인 링크는 history.pushState로 이동한다 (전체 새로고침 없음).
// redirect 문서는 replaceState로 /w/대상?from=원래제목 으로 주소를 바꾼다.
export const DOCS = {
  짜장면: { links: [{ to: '중국' }, { to: '분류:중국 요리' }] },
  중국: { links: [{ to: '영국', spa: true }, { to: '짜장면' }] },
  영국: { links: [{ to: '뉴턴' }, { to: '중국', spa: true }] },
  뉴턴: { redirect: '아이작 뉴턴' },
  '아이작 뉴턴': { links: [{ to: '영국' }] },
  '분류:중국 요리': { links: [{ to: '짜장면' }] },
};

export function fakePageHtml() {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>가짜 나무위키</title></head>
<body>
  <header>
    <form action="/Search" class="fake-search"><input name="q" placeholder="여기에서 검색"></form>
  </header>
  <main><h1 id="doc-title"></h1><div id="content"></div></main>
  <script>
    const DOCS = ${JSON.stringify(DOCS)};
    const href = (t) => '/w/' + encodeURIComponent(t);
    function currentTitle() {
      return decodeURIComponent(location.pathname.slice(3));
    }
    function render() {
      let title = currentTitle();
      const doc = DOCS[title];
      if (doc && doc.redirect) {
        history.replaceState(null, '', href(doc.redirect) + '?from=' + encodeURIComponent(title));
        title = doc.redirect;
      }
      document.title = title + ' - 가짜 나무위키';
      document.getElementById('doc-title').textContent = title;
      const content = document.getElementById('content');
      content.replaceChildren();
      for (const link of (DOCS[title] || { links: [] }).links) {
        const a = document.createElement('a');
        a.href = href(link.to);
        a.textContent = link.to;
        if (link.spa) a.dataset.spa = '1';
        const p = document.createElement('p');
        p.append(a);
        content.append(p);
      }
    }
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-spa]');
      if (!a) return;
      e.preventDefault();
      history.pushState(null, '', a.getAttribute('href'));
      render();
    });
    window.addEventListener('popstate', render);
    render();
  </script>
</body></html>`;
}
