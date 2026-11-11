// 여러 화면이 함께 쓰는 부품
//  - signSlots: 이름+서명칸 여러 개(기본 4칸, [＋ 서명자 추가]로 늘림). 작성 중인 칸은 기기에 임시 저장
//  - attachLogs / logPageImages: 교육일지·점검일지 등을 사진·이미지·PDF로 받아 결과지 뒤에 쪽으로 붙임
//  - Keep: 사진 촬영 앱 등으로 갔다 와서 앱이 다시 열려도 보던 화면과 입력 중이던 내용을 되살림

// ---------- 여러 명 서명칸 ----------
// o: { key(임시저장 이름), names(등록 근로자), signed()→이미 서명한 이름, room()→더 받을 수 있는 인원,
//      onSave(list)→저장한 항목 배열을 돌려줌, initial(기본 칸 수) }
function signSlots(box, o) {
  const DK = 'slots:' + o.key, INIT = o.initial || 4, MAXSLOT = 30;
  let drafts = [];
  try { drafts = JSON.parse(localStorage.getItem(DK) || '[]'); } catch (e) { drafts = []; }
  box.innerHTML = `<div class="slots"></div>
    <div class="slot-acts"><button type="button" class="btn" data-sadd>＋ 서명자 추가</button><button type="button" class="btn primary big" data-ssave>작성한 서명 저장</button></div>`;
  const grid = $('.slots', box), slots = [];
  const persist = () => {
    const d = slots.map(x => x.draft());
    try { if (d.some(v => v.name || v.sig)) localStorage.setItem(DK, JSON.stringify(d)); else localStorage.removeItem(DK); } catch (e) { /* 저장 불가 */ }
  };
  const later = () => setTimeout(persist, 40);
  const renumber = () => slots.forEach((x, i) => { $('.slot-no', x.el).textContent = i + 1; });
  function add(d = {}) {
    const el = document.createElement('section');
    el.className = 'slot';
    el.innerHTML = `<div class="slot-h"><b class="slot-no"></b><input name="name" autocomplete="off" placeholder="성명"><button type="button" class="slot-x" title="이 칸 비우기">✕</button></div>
      <div class="sigwrap"><canvas class="sigpad"></canvas><button type="button" class="btn ghost sm" data-clr>다시 쓰기</button></div>`;
    grid.appendChild(el);
    const nameIn = $('[name=name]', el), pad = Sig.pad($('canvas', el));
    attachNameSearch(nameIn, o.names || [], o.signed());
    const getUsed = attachPastSigs(el, nameIn, pad);
    const x = {
      el, nameIn, pad, getUsed,
      sig: () => getUsed() || pad.code(),
      draft: () => ({ name: nameIn.value.trim(), sig: x.sig() }),
      reset() { nameIn.value = ''; nameIn.dispatchEvent(new Event('input')); pad.clear(); }
    };
    slots.push(x);
    if (d.name) { nameIn.value = d.name; nameIn.dispatchEvent(new Event('change')); }
    if (d.sig) setTimeout(() => pad.load(d.sig), 150);
    nameIn.addEventListener('input', later);
    $('canvas', el).addEventListener('pointerup', later);
    $('[data-clr]', el).addEventListener('click', () => { pad.clear(); later(); });
    el.addEventListener('change', later); // 이전 서명 체크 등
    el.addEventListener('sigpaper', later); // 종이 서명 촬영
    $('.slot-x', el).onclick = () => {
      if (slots.length > INIT) { el.remove(); slots.splice(slots.indexOf(x), 1); renumber(); } else x.reset();
      later();
    };
    renumber();
    return x;
  }
  const n = Math.max(INIT, drafts.length);
  for (let i = 0; i < n; i++) add(drafts[i] || {});
  $('[data-sadd]', box).onclick = () => {
    if (slots.length >= MAXSLOT) { toast(`서명칸은 ${MAXSLOT}개까지 열 수 있습니다.`); return; }
    const x = add(); x.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); x.nameIn.focus();
  };
  $('[data-ssave]', box).onclick = async () => {
    const filled = slots.filter(x => x.nameIn.value.trim() || x.sig());
    if (!filled.length) { toast('서명칸에 이름과 서명을 넣어 주세요.'); return; }
    for (const x of filled) {
      if (!x.nameIn.value.trim()) { toast('이름이 빠진 서명칸이 있습니다.'); x.nameIn.focus(); return; }
      if (!x.sig()) { toast(`${x.nameIn.value.trim()} 님의 서명이 없습니다.`); x.el.scrollIntoView({ block: 'center' }); return; }
    }
    const names = filled.map(x => x.nameIn.value.trim());
    if (new Set(names).size < names.length) { toast('같은 이름이 두 칸에 들어 있습니다.'); return; }
    const room = o.room();
    if (filled.length > room) { toast(room > 0 ? `더 받을 수 있는 서명은 ${room}명입니다.` : '서명 인원이 다 찼습니다.', 3500); return; }
    const dup = names.filter(nm => o.signed().includes(nm));
    if (dup.length && !confirm(`${dup.join(', ')} 님은 이미 서명했습니다. 한 번 더 받을까요?`)) return;
    const list = [];
    for (const x of filled) {
      const name = x.nameIn.value.trim(), used = x.getUsed();
      const reuse = !!used && (await Registry.sigs(name)).some(y => y.g === used);
      list.push({ name, sig: x.sig(), reuse, slot: x });
    }
    const saved = (await o.onSave(list)) || [];
    saved.forEach(it => it.slot.reset());
    // 기본 칸보다 많이 연 빈 칸은 정리
    for (const x of slots.slice()) if (slots.length > INIT && !x.nameIn.value.trim() && !x.sig()) { x.el.remove(); slots.splice(slots.indexOf(x), 1); }
    renumber(); persist();
  };
  return {
    // 빈 칸에 이름 넣기 (등록 근로자 이름을 눌렀을 때)
    fill(name) {
      const x = slots.find(s => !s.nameIn.value.trim()) || (slots.length < MAXSLOT ? add() : null);
      if (!x) return;
      x.nameIn.value = name; x.nameIn.dispatchEvent(new Event('input')); x.nameIn.dispatchEvent(new Event('change'));
      x.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
}
// 서명칸 위에 한 번만 보여 주는 확인사항
function confirmOnceHTML(groups) {
  return `<div class="confirm-once">${groups.map(g => `<div class="co-g"><b>${esc(g.title)}</b><ol>${g.items.map(it => `<li>${it}</li>`).join('')}</ol></div>`).join('')}
    <p class="co-note">※ 위 내용을 읽어 주고, 서명하면 확인한 것으로 봅니다.</p></div>`;
}

// ---------- 교육일지·점검일지 덧붙이기 ----------
const LOG_KINDS = ['교육일지', '점검일지', '기타 첨부'];
function attachLogs(box, rec, saveFn) {
  rec.logs = rec.logs || [];
  let kind = LOG_KINDS[0];
  const draw = () => {
    const L = rec.logs;
    box.innerHTML = `<section class="logs">
      <h2 class="h">교육일지·점검일지 덧붙이기 <small>(선택 · ${L.length}쪽)</small></h2>
      <p class="hint">갖고 있는 교육일지·점검일지를 촬영하거나 이미지·PDF로 넣으면 결과지 뒤에 쪽으로 붙습니다. 지금 없으면 나중에 <b>기록</b>에서 이 결과를 열어 추가하고 다시 만들면 됩니다.</p>
      <div class="row lg-add"><select class="lg-kind">${LOG_KINDS.map(k => `<option ${k === kind ? 'selected' : ''}>${k}</option>`).join('')}</select>
        <button type="button" class="btn sm primary" data-lg="cam">사진 촬영</button><button type="button" class="btn sm" data-lg="img">이미지 선택</button><button type="button" class="btn sm" data-lg="pdf">PDF 추가</button></div>
      <p class="hint lg-msg"></p>
      ${L.length ? `<ol class="lg-list">${L.map((p, i) => `<li><img src="${p.img}" alt="${esc(p.kind)}"><div class="lg-meta"><select data-lk="${i}">${LOG_KINDS.map(k => `<option ${k === p.kind ? 'selected' : ''}>${k}</option>`).join('')}</select><small>결과지 뒤 ${i + 1}번째 쪽</small></div>
        <div class="pg-btns"><button type="button" data-lu="${i}" ${i ? '' : 'disabled'} title="앞으로">↑</button><button type="button" data-ld="${i}" ${i < L.length - 1 ? '' : 'disabled'} title="뒤로">↓</button><button type="button" data-lx="${i}" title="빼기">✕</button></div></li>`).join('')}</ol>` : ''}
    </section>`;
    const msg = $('.lg-msg', box);
    $('.lg-kind', box).onchange = e => { kind = e.target.value; };
    const push = async items => { rec.logs.push(...items.map(img => ({ img, kind }))); await saveFn(); draw(); toast(`${kind} ${items.length}쪽을 넣었습니다.`); };
    $$('[data-lg]', box).forEach(b => b.onclick = async () => {
      try {
        if (b.dataset.lg === 'pdf') {
          const [f] = await pickFiles('application/pdf', false); if (!f) return;
          const pages = await Pages.fromPdf(f, (i, n) => { msg.textContent = `PDF 나누는 중… ${i}/${n}쪽`; });
          msg.textContent = ''; await push(pages.map(p => p.img));
        } else {
          const files = await pickFiles('image/*', b.dataset.lg === 'img', b.dataset.lg === 'cam' ? 'environment' : undefined);
          if (!files.length) return;
          const imgs = [];
          for (const f of files) imgs.push(await readImage(f, 1800, 0.85));
          await push(imgs);
        }
      } catch (e) { msg.textContent = ''; toast('넣지 못했습니다: ' + e.message, 4000); }
    });
    $$('[data-lk]', box).forEach(s => s.onchange = async () => { rec.logs[+s.dataset.lk].kind = s.value; await saveFn(); });
    $$('[data-lu]', box).forEach(b => b.onclick = async () => { const i = +b.dataset.lu; [L[i - 1], L[i]] = [L[i], L[i - 1]]; await saveFn(); draw(); });
    $$('[data-ld]', box).forEach(b => b.onclick = async () => { const i = +b.dataset.ld; [L[i + 1], L[i]] = [L[i], L[i + 1]]; await saveFn(); draw(); });
    $$('[data-lx]', box).forEach(b => b.onclick = async () => { if (!confirm('이 쪽을 뺄까요?')) return; L.splice(+b.dataset.lx, 1); await saveFn(); draw(); });
  };
  draw();
}
// 첨부 쪽을 A4 이미지로 (머리글·바닥글은 결과지와 같은 모양)
async function logPageImages(logs, title) {
  if (!logs || !logs.length) return [];
  const root = document.createElement('div');
  root.className = 'rp-root';
  document.body.appendChild(root);
  const out = [];
  const count = {}, idx = {};
  logs.forEach(l => { count[l.kind] = (count[l.kind] || 0) + 1; });
  try {
    for (let i = 0; i < logs.length; i++) {
      const l = logs[i];
      idx[l.kind] = (idx[l.kind] || 0) + 1;
      root.innerHTML = `<div class="rp-page"><div class="rp-top"><img class="rp-logo" src="img/brand-logo.png" alt="사람인 안전지도사 사무소"><span>${esc(title)}</span></div>
        <div class="rp-body"><h2 class="rp-h2">${esc(l.kind)}${count[l.kind] > 1 ? ` (${idx[l.kind]}/${count[l.kind]})` : ''}</h2><div class="rp-logbox"><img src="${l.img}"></div></div>
        <div class="rp-foot"><span>사람인안전지도사사무소</span><span>첨부 ${i + 1} / ${logs.length}</span></div></div>`;
      const page = $('.rp-page', root), box = $('.rp-logbox', page), img = $('img', box);
      await new Promise(r => { if (img.complete) r(); else { img.onload = img.onerror = r; setTimeout(r, 4000); } });
      // html2canvas는 object-fit을 지원하지 않아 크기를 직접 맞춘다
      const bw = box.clientWidth, bh = box.clientHeight, s = Math.min(bw / (img.naturalWidth || 1), bh / (img.naturalHeight || 1));
      img.style.width = Math.round((img.naturalWidth || bw) * s) + 'px'; img.style.height = Math.round((img.naturalHeight || bh) * s) + 'px';
      const c = await html2canvas(page, { scale: 2, backgroundColor: '#ffffff', logging: false, scrollX: -window.scrollX, scrollY: -window.scrollY });
      out.push(c.toDataURL('image/jpeg', 0.88));
    }
  } finally {
    root.remove();
  }
  return out;
}

// ---------- 다른 앱에 다녀와도 이어서 작성 ----------
const Keep = (() => {
  const K = 'keepState', WIN = 30 * 60 * 1000; // 30분 안에 돌아오면 되살림
  const fields = () => [...view().querySelectorAll('input, textarea, select')]
    .filter(el => !['file', 'password', 'hidden', 'button', 'submit', 'search'].includes(el.type) && !el.closest('.lockbox, .sugg, .slot, .modal'));
  function snapshot() {
    try {
      const h = location.hash || '#/';
      if (document.body.classList.contains('locked')) return;
      const f = fields().map(el => (el.type === 'checkbox' || el.type === 'radio') ? { c: el.checked } : { v: el.value });
      localStorage.setItem(K, JSON.stringify({ h, at: Date.now(), y: window.scrollY, f }));
      Lock.keep();
    } catch (e) { /* 저장 불가 */ }
  }
  const read = () => { try { const s = JSON.parse(localStorage.getItem(K) || 'null'); return s && Date.now() - s.at < WIN ? s : null; } catch (e) { return null; } };
  // 화면을 그린 뒤 호출: 같은 화면이면 입력값·스크롤을 되살린다
  function restore() {
    const st = read();
    if (!st || st.h !== (location.hash || '#/')) return;
    try { localStorage.removeItem(K); } catch (e) { /* 무시 */ }
    const els = fields();
    if (els.length === st.f.length) {
      els.forEach((el, i) => {
        const d = st.f[i];
        if ('c' in d) { if (el.checked !== d.c) { el.checked = d.c; el.dispatchEvent(new Event('change', { bubbles: true })); } }
        else if (el.value !== d.v) { el.value = d.v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
      });
    }
    setTimeout(() => window.scrollTo(0, st.y || 0), 80);
  }
  // 앱을 새로 띄웠을 때(홈 주소) 30분 안에 보던 화면이 있으면 그 화면으로
  function resumeHash() {
    const st = read();
    const h = location.hash || '#/';
    if (st && (h === '#/' || h === '#') && st.h && st.h !== '#/') return st.h;
    return null;
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') snapshot(); });
  window.addEventListener('pagehide', snapshot);
  return { snapshot, restore, resumeHash };
})();

// ---------- 종이 서명 촬영 ----------
// 종이에 쓴 이름·서명을 찍고, 서명 부분을 손가락으로 골라 배경을 지운 서명 그림(500x200 PNG)으로 만든다.
// 이름은 사진을 보며 확인 입력. 결과: { code, name } 또는 취소 시 null
function paperSig({ name = '', fixedName = false } = {}) {
  return new Promise(async resolve => {
    const file = await pickFile('image/*', 'environment');
    if (!file) { resolve(null); return; }
    const src = await readImage(file, 1800, 0.92);
    const img = new Image();
    await new Promise(r => { img.onload = img.onerror = r; img.src = src; });
    let rot = 0, box = null, off = 0, done = false, work = null;
    const m = modal(`<h2>종이 서명 등록</h2>
      <p class="hint">사진에서 <b>서명 부분</b>을 손가락으로 끌어 사각형으로 고르세요. 이름은 사진을 보고 확인해 입력합니다.</p>
      <div class="ps-wrap"><canvas class="ps-cv"></canvas></div>
      <div class="row ps-tools"><button type="button" class="btn sm" data-rot>↻ 사진 돌리기</button><button type="button" class="btn sm ghost" data-all>전체 선택</button>
        <label class="ps-th">진하기 <input type="range" min="-60" max="60" step="5" value="0" data-th></label></div>
      <div class="ps-prev-w"><span>등록될 서명</span><canvas class="ps-prev" width="500" height="200"></canvas></div>
      <label>이름 <input name="pname" value="${esc(name)}" ${fixedName ? 'readonly class="fixed"' : ''} placeholder="사진의 이름을 보고 입력"></label>
      <button type="button" class="btn big primary" data-ok>서명 등록</button>`, { wide: true, onClose: () => { if (!done) resolve(null); } });
    const cv = $('.ps-cv', m.el), prev = $('.ps-prev', m.el), nameIn = $('[name=pname]', m.el);
    // 돌린 사진을 작업용 캔버스로
    const makeWork = () => {
      const w = rot % 180 ? img.naturalHeight : img.naturalWidth, h = rot % 180 ? img.naturalWidth : img.naturalHeight;
      work = document.createElement('canvas'); work.width = w; work.height = h;
      const x = work.getContext('2d');
      x.translate(w / 2, h / 2); x.rotate(rot * Math.PI / 180); x.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      box = null;
    };
    let k = 1;
    const show = () => {
      const maxW = $('.ps-wrap', m.el).clientWidth || 320, maxH = Math.max(240, window.innerHeight * 0.5);
      k = Math.min(maxW / work.width, maxH / work.height);
      cv.width = Math.round(work.width * k); cv.height = Math.round(work.height * k);
      const x = cv.getContext('2d');
      x.drawImage(work, 0, 0, cv.width, cv.height);
      if (box) {
        x.fillStyle = 'rgba(0,0,0,.45)';
        const [bx, by, bw, bh] = box.map(v => v * k);
        x.fillRect(0, 0, cv.width, by); x.fillRect(0, by + bh, cv.width, cv.height - by - bh);
        x.fillRect(0, by, bx, bh); x.fillRect(bx + bw, by, cv.width - bx - bw, bh);
        x.strokeStyle = '#2f9e44'; x.lineWidth = 3; x.strokeRect(bx, by, bw, bh);
      }
      extract();
    };
    // 고른 부분에서 잉크만 남기고 배경을 지워 500x200에 맞춘다
    let result = '';
    function extract() {
      const pc = prev.getContext('2d');
      pc.clearRect(0, 0, prev.width, prev.height);
      result = '';
      if (!box || box[2] < 8 || box[3] < 8) return;
      const [bx, by, bw, bh] = box.map(Math.round);
      const d = work.getContext('2d').getImageData(bx, by, bw, bh), px = d.data, n = bw * bh;
      const g = new Uint8Array(n), hist = new Array(256).fill(0);
      for (let i = 0; i < n; i++) { const v = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000 | 0; g[i] = v; hist[v]++; }
      // 오츠(Otsu) 방식으로 잉크/종이 경계 밝기 찾기
      let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
      let sB = 0, wB = 0, best = 0, T = 128;
      for (let t = 0; t < 256; t++) {
        wB += hist[t]; if (!wB) continue;
        const wF = n - wB; if (!wF) break;
        sB += t * hist[t];
        const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
        if (v > best) { best = v; T = t; }
      }
      T = Math.max(20, Math.min(235, T + off));
      const soft = Math.max(12, T * 0.22);
      const a = new Uint8ClampedArray(n);
      let x0 = bw, y0 = bh, x1 = -1, y1 = -1;
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const i = y * bw + x, al = Math.max(0, Math.min(1, (T - g[i]) / soft + 0.5));
        a[i] = al * 255;
        if (al > 0.6) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 < 0) return;
      const tw = x1 - x0 + 1, th = y1 - y0 + 1;
      const ink = document.createElement('canvas'); ink.width = tw; ink.height = th;
      const id = ink.getContext('2d').createImageData(tw, th);
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const j = (y * tw + x) * 4;
        id.data[j] = id.data[j + 1] = id.data[j + 2] = 17; id.data[j + 3] = a[(y + y0) * bw + (x + x0)];
      }
      ink.getContext('2d').putImageData(id, 0, 0);
      const pad = 0.06, s = Math.min(prev.width * (1 - 2 * pad) / tw, prev.height * (1 - 2 * pad) / th);
      pc.imageSmoothingQuality = 'high';
      pc.drawImage(ink, (prev.width - tw * s) / 2, (prev.height - th * s) / 2, tw * s, th * s);
      result = prev.toDataURL('image/png');
    }
    // 손가락으로 끌어 사각형 고르기
    let p0 = null;
    const at = e => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(work.width, (e.clientX - r.left) / r.width * work.width)), Math.max(0, Math.min(work.height, (e.clientY - r.top) / r.height * work.height))]; };
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', e => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ } p0 = at(e); });
    cv.addEventListener('pointermove', e => {
      if (!p0) return; const p = at(e);
      box = [Math.min(p0[0], p[0]), Math.min(p0[1], p[1]), Math.abs(p[0] - p0[0]), Math.abs(p[1] - p0[1])];
      show();
    });
    const up = () => { p0 = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    $('[data-rot]', m.el).onclick = () => { rot = (rot + 90) % 360; makeWork(); show(); };
    $('[data-all]', m.el).onclick = () => { box = [0, 0, work.width, work.height]; show(); };
    $('[data-th]', m.el).oninput = e => { off = +e.target.value; extract(); }; // 오른쪽으로 갈수록 진하게(잉크로 보는 밝기 기준을 올림)
    $('[data-ok]', m.el).onclick = () => {
      if (!result) { toast('사진에서 서명 부분을 끌어서 고르세요.'); return; }
      const nm = nameIn.value.trim();
      if (!fixedName && !nm) { toast('이름을 입력하세요.'); nameIn.focus(); return; }
      done = true; m.close(); resolve({ code: result, name: nm });
    };
    makeWork();
    show();
  });
}
