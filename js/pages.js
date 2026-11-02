// 페이지 단위 교육자료: PDF·이미지·촬영 사진을 한 쪽씩 등록하고, 교육 때 전체화면으로 넘겨 본다.
const Pages = (() => {
  const MAX = 1600, Q = 0.85;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // pdf.js는 PDF를 넣을 때만 불러온다
  let pdfReady = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfReady) pdfReady = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'vendor/pdfjs/pdf.min.js';
      sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js'; resolve(window.pdfjsLib); };
      sc.onerror = () => { pdfReady = null; reject(new Error('PDF 도구를 불러오지 못했습니다. 인터넷 연결을 확인하세요.')); };
      document.head.appendChild(sc);
    });
    return pdfReady;
  }

  // PDF → 쪽마다 JPEG
  async function fromPdf(file, onProgress) {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) {
      onProgress && onProgress(i, doc.numPages);
      const page = await doc.getPage(i);
      const v1 = page.getViewport({ scale: 1 });
      const scale = Math.min(3, MAX / Math.max(v1.width, v1.height));
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      // 'print' 방식: 화면 갱신(requestAnimationFrame)을 기다리지 않아 화면이 꺼지거나 가려져도 멈추지 않는다
      await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
      out.push({ img: c.toDataURL('image/jpeg', Q), cap: '' });
      page.cleanup();
    }
    doc.destroy();
    return out;
  }

  // 편집 화면의 페이지 목록
  function editorHTML(pages) {
    return `<div class="pg-edit">
      <div class="row">
        <button type="button" class="btn" data-padd="pdf">PDF 추가</button>
        <button type="button" class="btn" data-padd="img">이미지 추가 (여러 장)</button>
        <button type="button" class="btn" data-padd="cam">카메라로 촬영</button>
      </div>
      <p class="hint" id="pg-msg">${pages.length ? `${pages.length}쪽 · 순서는 ↑↓ 로 바꿉니다.` : 'PDF는 쪽마다 나뉘어 등록되고, 이미지·사진은 한 장이 한 쪽이 됩니다.'}</p>
      <ol class="pg-list">${pages.map((p, i) => `<li data-i="${i}">
        <img src="${p.img}" alt="${i + 1}쪽" data-pview="${i}">
        <div class="pg-meta"><b>${i + 1}쪽</b><input data-pcap="${i}" value="${esc(p.cap || '')}" placeholder="설명 (선택)"></div>
        <div class="pg-btns"><button type="button" data-pup="${i}" ${i ? '' : 'disabled'} title="앞으로">↑</button><button type="button" data-pdown="${i}" ${i < pages.length - 1 ? '' : 'disabled'} title="뒤로">↓</button><button type="button" data-pdel="${i}" title="삭제">✕</button></div>
      </li>`).join('')}</ol>
    </div>`;
  }
  // pages 배열을 직접 고친다. 바뀔 때마다 rerender() 호출
  function bindEditor(root, pages, rerender, { pickFiles, readImage, toast }) {
    const add = async kind => {
      const msg = root.querySelector('#pg-msg');
      try {
        if (kind === 'pdf') {
          const [f] = await pickFiles('application/pdf,.pdf'); if (!f) return;
          const got = await fromPdf(f, (i, n) => { msg.textContent = `PDF 나누는 중… ${i} / ${n}쪽`; });
          pages.push(...got); toast(`${got.length}쪽을 추가했습니다.`);
        } else {
          const files = kind === 'cam' ? await pickFiles('image/*', false, 'environment') : await pickFiles('image/*', true);
          if (!files.length) return;
          for (let i = 0; i < files.length; i++) {
            msg.textContent = `이미지 처리 중… ${i + 1} / ${files.length}`;
            pages.push({ img: await readImage(files[i], MAX, Q), cap: '' });
          }
          toast(`${files.length}쪽을 추가했습니다.`);
        }
      } catch (e) { toast('추가하지 못했습니다: ' + (e && e.message || '파일을 읽을 수 없습니다. 형식을 확인하세요.'), 4000); }
      rerender();
    };
    root.querySelectorAll('[data-padd]').forEach(b => b.onclick = () => add(b.dataset.padd));
    const swap = (a, b) => { [pages[a], pages[b]] = [pages[b], pages[a]]; rerender(); };
    root.querySelectorAll('[data-pup]').forEach(b => b.onclick = () => swap(+b.dataset.pup, +b.dataset.pup - 1));
    root.querySelectorAll('[data-pdown]').forEach(b => b.onclick = () => swap(+b.dataset.pdown, +b.dataset.pdown + 1));
    root.querySelectorAll('[data-pdel]').forEach(b => b.onclick = () => { if (confirm(`${+b.dataset.pdel + 1}쪽을 삭제할까요?`)) { pages.splice(+b.dataset.pdel, 1); rerender(); } });
    root.querySelectorAll('[data-pcap]').forEach(inp => inp.oninput = () => { pages[+inp.dataset.pcap].cap = inp.value.trim(); });
    root.querySelectorAll('[data-pview]').forEach(img => img.onclick = () => show(pages, +img.dataset.pview));
  }

  // 교육 화면: 페이지 묶음
  function viewHTML(t) {
    const pages = t.pages || [];
    if (!pages.length) return '';
    return `<section class="t-pages">
      <div class="bar"><h3>교육자료 <small>${pages.length}쪽</small></h3><button type="button" class="btn primary" data-slides="${esc(t.id)}">▶ 전체화면으로 보기</button></div>
      <div class="pg-view">${pages.map((p, i) => `<figure><img src="${p.img}" alt="${i + 1}쪽" loading="lazy" data-slide="${i}"><figcaption>${i + 1} / ${pages.length}${p.cap ? ' · ' + esc(p.cap) : ''}</figcaption></figure>`).join('')}</div>
    </section>`;
  }

  // 전체화면 넘겨보기 (좌우 버튼·밀기·방향키)
  function show(pages, start = 0) {
    if (!pages || !pages.length) return;
    let i = Math.max(0, Math.min(pages.length - 1, start));
    const el = document.createElement('div');
    el.className = 'slides';
    el.innerHTML = `<img alt=""><div class="sl-cap"></div>
      <button type="button" class="sl-prev" aria-label="이전 쪽">‹</button><button type="button" class="sl-next" aria-label="다음 쪽">›</button>
      <button type="button" class="sl-close" aria-label="닫기">✕</button>`;
    document.body.appendChild(el);
    const img = el.querySelector('img'), cap = el.querySelector('.sl-cap');
    const draw = () => {
      img.src = pages[i].img;
      cap.textContent = `${i + 1} / ${pages.length}${pages[i].cap ? ' · ' + pages[i].cap : ''}`;
      el.querySelector('.sl-prev').disabled = i === 0;
      el.querySelector('.sl-next').disabled = i === pages.length - 1;
    };
    const go = d => { const n = i + d; if (n >= 0 && n < pages.length) { i = n; draw(); } };
    const close = () => {
      document.removeEventListener('keydown', key);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      el.remove();
    };
    const key = e => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
      else if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', key);
    el.querySelector('.sl-prev').onclick = () => go(-1);
    el.querySelector('.sl-next').onclick = () => go(1);
    el.querySelector('.sl-close').onclick = close;
    // 손가락으로 밀어서 넘기기, 화면 좌우를 눌러도 넘어감
    let sx = null, sy = 0;
    img.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
    img.addEventListener('pointerup', e => {
      if (sx === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) go(e.clientX > window.innerWidth / 2 ? 1 : -1);
    });
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    draw();
  }

  return { fromPdf, editorHTML, bindEditor, viewHTML, show, loadPdfJs };
})();
