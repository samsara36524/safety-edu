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
      sig: () => getUsed() || (pad.isEmpty() ? '' : Sig.encode(pad.strokes())),
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
