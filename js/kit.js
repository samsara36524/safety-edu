// 여러 화면이 함께 쓰는 부품
//  - signSlots: 이름+서명칸 여러 개(기본 4칸, [＋ 서명자 추가]로 늘림). 작성 중인 칸은 기기에 임시 저장
//  - attachLogs / logPageImages: 교육일지·점검일지 등을 사진·이미지·PDF로 받아 결과지 뒤에 쪽으로 붙임
//  - Keep: 사진 촬영 앱 등으로 갔다 와서 앱이 다시 열려도 보던 화면과 입력 중이던 내용을 되살림

// ---------- 여러 명 서명칸 ----------
// o: { key(임시저장 이름), names(등록 근로자), signed()→이미 서명한 이름, room()→더 받을 수 있는 인원,
//      onSave(list)→저장한 항목 배열을 돌려줌, initial(기본 칸 수) }
function signSlots(box, o) {
  const DK = 'slots:' + o.key, INIT = o.initial || 4, MAXSLOT = 30;
  const MK = 'nameMode'; // 이름 입력 방식: t 직접 입력, p 촬영 입력 (마지막 선택 기억)
  const lastMode = () => { try { return localStorage.getItem(MK) === 'p' ? 'p' : 't'; } catch (e) { return 't'; } };
  let drafts = [];
  try { drafts = JSON.parse(localStorage.getItem(DK) || '[]'); } catch (e) { drafts = []; }
  box.innerHTML = `<div class="slots"></div>
    <div class="slot-acts"><button type="button" class="btn" data-sadd>＋ 서명자 추가</button><button type="button" class="btn primary big" data-ssave>작성한 서명 저장</button></div>`;
  const grid = $('.slots', box), slots = [];
  const persist = () => {
    const d = slots.map(x => x.draft());
    try { if (d.some(v => v.name || v.nameImg || v.sig)) localStorage.setItem(DK, JSON.stringify(d)); else localStorage.removeItem(DK); } catch (e) { /* 저장 불가 */ }
  };
  const later = () => setTimeout(persist, 40);
  const renumber = () => slots.forEach((x, i) => { $('.slot-no', x.el).textContent = i + 1; });
  function add(d = {}) {
    const el = document.createElement('section'), rid = uid(6);
    el.className = 'slot';
    el.innerHTML = `<div class="slot-h"><b class="slot-no"></b>
        <div class="nm-box">
          <div class="seg sm nm-mode"><label><input type="radio" name="nm${rid}" value="t"><span>이름 직접 입력</span></label><label><input type="radio" name="nm${rid}" value="p"><span>이름 촬영 입력</span></label></div>
          <div class="nm-photo"><img class="nm-img" alt="촬영한 이름"><button type="button" class="btn sm" data-nshot>📷 이름 촬영</button></div>
          <input name="name" autocomplete="off" placeholder="성명">
        </div>
        <button type="button" class="slot-x" title="이 칸 비우기">✕</button></div>
      <div class="sigwrap"><canvas class="sigpad"></canvas><button type="button" class="btn ghost sm" data-clr>다시 쓰기</button></div>`;
    grid.appendChild(el);
    const nameIn = $('[name=name]', el), pad = Sig.pad($('canvas', el));
    attachNameSearch(nameIn, o.names || [], o.signed());
    const getUsed = attachPastSigs(el, nameIn, pad);
    const nmImg = $('.nm-img', el), nmPhoto = $('.nm-photo', el), nmBtn = $('[data-nshot]', el);
    const x = {
      el, nameIn, pad, getUsed, mode: d.mode || lastMode(), nameImg: d.nameImg || '',
      sig: () => getUsed() || pad.code(),
      name: () => nameIn.value.trim(),
      hasName: () => !!nameIn.value.trim(),
      draft: () => ({ mode: x.mode, name: nameIn.value.trim(), nameImg: x.nameImg, sig: x.sig() }),
      reset() { nameIn.value = ''; nameIn.dispatchEvent(new Event('input')); x.nameImg = ''; drawName(); pad.clear(); }
    };
    // 이름 칸: 직접 입력이면 입력칸, 촬영 입력이면 촬영한 이름 그림
    const drawName = () => {
      $$('.nm-mode input', el).forEach(r => { r.checked = r.value === x.mode; });
      nameIn.placeholder = x.mode === 'p' ? '위 사진의 이름을 보고 입력' : '이름 입력 또는 검색 (초성 검색 가능)';
      nmPhoto.classList.toggle('hide', x.mode !== 'p');
      nmImg.classList.toggle('hide', !x.nameImg);
      if (x.nameImg) nmImg.src = x.nameImg;
      nmBtn.textContent = x.nameImg ? '📷 다시 촬영' : '📷 이름 촬영';
    };
    $$('.nm-mode input', el).forEach(r => r.onchange = () => {
      x.mode = r.value; try { localStorage.setItem(MK, x.mode); } catch (e) { /* 저장 불가 */ }
      drawName(); later();
    });
    nmBtn.onclick = async () => {
      const r = await paperCrop({ kind: 'name' });
      if (!r) return;
      x.nameImg = r.code; drawName(); later();
      setTimeout(() => nameIn.focus(), 100); // 사진을 보고 바로 입력
    };
    slots.push(x);
    if (d.name) { nameIn.value = d.name; nameIn.dispatchEvent(new Event('change')); }
    if (d.sig) setTimeout(() => pad.load(d.sig), 150);
    drawName();
    nameIn.addEventListener('input', later);
    $('canvas', el).addEventListener('pointerup', later);
    $('[data-clr]', el).addEventListener('click', () => { pad.clear(); later(); });
    el.addEventListener('change', later); // 이전 서명 체크 등
    el.addEventListener('sigpaper', later); // 종이 서명 촬영
    el.addEventListener('sigwidth', later); // 굵기 변경
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
    const x = add(); x.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (x.mode === 't') x.nameIn.focus();
  };
  $('[data-ssave]', box).onclick = async () => {
    const filled = slots.filter(x => x.hasName() || x.sig());
    if (!filled.length) { toast('서명칸에 이름과 서명을 넣어 주세요.'); return; }
    for (const x of filled) {
      if (!x.hasName()) { toast(x.mode === 't' ? '이름이 빠진 서명칸이 있습니다.' : '촬영한 이름을 보고 이름 칸에 입력해 주세요.'); x.el.scrollIntoView({ block: 'center' }); x.nameIn.focus(); return; }
      if (!x.sig()) { toast(`${x.name()} 님의 서명이 없습니다.`); x.el.scrollIntoView({ block: 'center' }); return; }
    }
    const names = filled.map(x => x.name()).filter(Boolean);
    if (new Set(names).size < names.length) { toast('같은 이름이 두 칸에 들어 있습니다.'); return; }
    const room = o.room();
    if (filled.length > room) { toast(room > 0 ? `더 받을 수 있는 서명은 ${room}명입니다.` : '서명 인원이 다 찼습니다.', 3500); return; }
    const dup = names.filter(nm => o.signed().includes(nm));
    if (dup.length && !confirm(`${dup.join(', ')} 님은 이미 서명했습니다. 한 번 더 받을까요?`)) return;
    const list = [];
    for (const x of filled) {
      const name = x.name(), used = x.getUsed();
      const reuse = !!name && !!used && (await Registry.sigs(name)).some(y => y.g === used);
      list.push({ name, sig: x.sig(), reuse, slot: x });
    }
    const saved = (await o.onSave(list)) || [];
    saved.forEach(it => it.slot.reset());
    // 기본 칸보다 많이 연 빈 칸은 정리
    for (const x of slots.slice()) if (slots.length > INIT && !x.hasName() && !x.sig()) { x.el.remove(); slots.splice(slots.indexOf(x), 1); }
    renumber(); persist();
  };
  return {
    // 빈 칸에 이름 넣기 (등록 근로자 이름을 눌렀을 때)
    fill(name) {
      const x = slots.find(s => !s.hasName()) || (slots.length < MAXSLOT ? add() : null);
      if (!x) return;
      x.mode = 't';
      $$('.nm-mode input', x.el).forEach(r => { r.checked = r.value === 't'; r.dispatchEvent(new Event('change')); });
      x.nameIn.value = name; x.nameIn.dispatchEvent(new Event('input')); x.nameIn.dispatchEvent(new Event('change'));
      x.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
}
// 근로자 이름 표시 (목록·결과지에는 이름 글자만)
function nameCell(w) { return w ? esc(w.name) : ''; }
// ---------- 파일 공유 (결과지 전달) ----------
// 휴대폰 공유 창은 버튼을 누른 직후에만 열 수 있어, 파일은 미리 만들어 두고 누르면 바로 연다.
// 공유를 지원하지 않거나 실패하면 다운로드로 대신한다.
async function shareFiles(files, title) {
  if (navigator.canShare && navigator.share) {
    let ok = false;
    try { ok = navigator.canShare({ files }); } catch (e) { ok = false; }
    if (ok) {
      try { await navigator.share({ files, title, text: title }); return true; }
      catch (e) {
        if (e.name === 'AbortError') return false; // 사용자가 닫음
        // NotAllowedError 등: 아래에서 다운로드로 대신
      }
    }
  }
  files.forEach(f => downloadBlob(f, f.name));
  toast(`이 기기는 바로 공유가 안 되어 ${files.length > 1 ? files.length + '개 파일을 ' : ''}다운로드했습니다. 카카오톡 등에서 [파일]로 보내세요.`, 5000);
  return false;
}
const toFile = async (dataUrl, name) => new File([await dataUrlToBlob(dataUrl)], name, { type: 'image/jpeg' });

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
      const st = { h, at: Date.now(), y: window.scrollY, f };
      localStorage.setItem(K, JSON.stringify(st));
      if (EDIT.test(h) && f.length) putDraft(st); // 작성 화면이면 임시저장도 (기한 없음)
      Lock.keep();
    } catch (e) { /* 저장 불가 */ }
  }
  // ----- 임시저장: 작성 화면의 입력 내용을 기한 없이 보관 → 다음에 그 화면을 열면 이어서 -----
  const D = 'drafts', DMAX = 30;
  const EDIT = /^#\/(s|t|m|l|z|h|v)\/[^/]+/; // 안전교육·TBM·장비측정·산안법·중처법·고위험요인 작성 화면
  const drafts = () => { try { return JSON.parse(localStorage.getItem(D) || '{}'); } catch (e) { return {}; } };
  function putDraft(st) {
    const all = drafts(); all[st.h] = st;
    const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
    keys.slice(DMAX).forEach(k => delete all[k]);
    try { localStorage.setItem(D, JSON.stringify(all)); } catch (e) { /* 저장 불가 */ }
  }
  function dropDraft(h) { const all = drafts(); if (all[h]) { delete all[h]; try { localStorage.setItem(D, JSON.stringify(all)); } catch (e) { /* 무시 */ } } }
  // [임시저장] 버튼
  function saveNow() {
    snapshot();
    toast('임시저장했습니다. 나중에 이 화면을 열면 이어서 작성할 수 있습니다.', 3000);
  }
  const apply = st => {
    const els = fields();
    if (els.length !== st.f.length) return false;
    els.forEach((el, i) => {
      const d = st.f[i];
      if ('c' in d) { if (el.checked !== d.c) { el.checked = d.c; el.dispatchEvent(new Event('change', { bubbles: true })); } }
      else if (el.value !== d.v) { el.value = d.v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    return true;
  };
  const read = () => { try { const s = JSON.parse(localStorage.getItem(K) || 'null'); return s && Date.now() - s.at < WIN ? s : null; } catch (e) { return null; } };
  // 화면을 그린 뒤 호출: 같은 화면이면 입력값·스크롤을 되살린다
  async function restore() {
    const h = location.hash || '#/';
    btn.classList.toggle('hide', !EDIT.test(h));
    const st = read();
    if (st && st.h === h) { // 방금(30분 안) 다른 앱에 다녀온 경우
      try { localStorage.removeItem(K); } catch (e) { /* 무시 */ }
      apply(st);
      setTimeout(() => window.scrollTo(0, st.y || 0), 80);
      return;
    }
    // 임시저장한 내용: 기록이 그 뒤에 저장되지 않았을 때만 이어서 불러온다
    const dr = drafts()[h];
    if (!dr) return;
    const m = h.match(/^#\/[a-z]\/([^/]+)/);
    const rec = m ? await DB.get('sessions', m[1]).catch(() => null) : null;
    if (!rec) { dropDraft(h); return; }
    if ((rec.updated || rec.created || 0) > dr.at) { dropDraft(h); return; } // 더 최근에 저장됨
    if (apply(dr)) toast('임시저장한 내용을 불러왔습니다. 이어서 작성하세요.', 3000);
    dropDraft(h);
    setTimeout(() => window.scrollTo(0, dr.y || 0), 80);
  }
  // 작성 화면 오른쪽 아래 [임시저장] 버튼
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'btn tmpsave hide'; btn.textContent = '💾 임시저장';
  btn.onclick = saveNow;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(btn));
  if (document.body) document.body.appendChild(btn);
  // 앱을 새로 띄웠을 때(홈 주소) 30분 안에 보던 화면이 있으면 그 화면으로
  function resumeHash() {
    const st = read();
    const h = location.hash || '#/';
    if (st && (h === '#/' || h === '#') && st.h && st.h !== '#/') return st.h;
    return null;
  }
  // 앱 안에서 다른 화면으로 옮길 때도 작성 화면의 입력 내용을 임시저장 (화면이 바뀌기 전에 실행)
  let curHash = location.hash || '#/';
  window.addEventListener('hashchange', () => {
    try {
      if (EDIT.test(curHash) && !document.body.classList.contains('locked')) {
        const f = fields().map(el => (el.type === 'checkbox' || el.type === 'radio') ? { c: el.checked } : { v: el.value });
        if (f.length) putDraft({ h: curHash, at: Date.now(), y: window.scrollY, f });
      }
    } catch (e) { /* 무시 */ }
    curHash = location.hash || '#/';
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') snapshot(); });
  window.addEventListener('pagehide', snapshot);
  return { snapshot, restore, resumeHash, saveNow };
})();

// ---------- 종이 이름·서명 촬영 ----------
// 종이에 쓴 이름 또는 서명을 찍고, 범위를 손가락으로 골라 배경을 지운 그림(PNG)으로 만든다.
// kind: 'name'(이름 500x140) 또는 'sig'(서명 500x200, 굵기 선택). 결과: { code, level } 또는 취소 시 null
function paperCrop({ kind = 'sig' } = {}) {
  return new Promise(async resolve => {
    const file = await pickFile('image/*', 'environment');
    if (!file) { resolve(null); return; }
    const src = await readImage(file, 1800, 0.92);
    const img = new Image();
    await new Promise(r => { img.onload = img.onerror = r; img.src = src; });
    const isSig = kind === 'sig', what = isSig ? '서명' : '이름';
    const W = 500, H = isSig ? 200 : 140;
    let rot = 0, off = 0, done = false, work = null, box = null;
    let level = (() => { try { const v = +localStorage.getItem('sigWidth'); return v >= 1 && v <= 5 ? v : 3; } catch (e) { return 3; } })();
    const m = modal(`<h2>종이 ${what} 촬영</h2>
      <p class="hint">사진에서 <b>${what} 범위</b>를 손가락으로 끌어 사각형으로 고르세요.</p>
      <div class="ps-wrap"><canvas class="ps-cv"></canvas></div>
      <div class="row ps-tools"><button type="button" class="btn sm" data-rot>↻ 사진 돌리기</button>
        <label class="ps-th">진하기 <input type="range" min="-60" max="60" step="5" value="0" data-th></label></div>
      ${isSig ? `<div class="sigw ps-w"><span>서명 굵기</span>${[1, 2, 3, 4, 5].map(n => `<button type="button" data-lv="${n}" title="${['', '아주 가늘게', '가늘게', '보통', '굵게', '아주 굵게'][n]}"><i style="height:${[0, 2, 3, 4, 6, 8][n]}px"></i></button>`).join('')}</div>` : ''}
      <div class="ps-prev-w"><span>등록될 ${what}</span><canvas class="ps-prev ${isSig ? '' : 'nm'}" width="${W}" height="${H}"></canvas></div>
      <button type="button" class="btn big primary" data-ok>${what} 넣기</button>`, { wide: true, onClose: () => { if (!done) resolve(null); } });
    const cv = $('.ps-cv', m.el), prev = $('.ps-prev', m.el);
    const raw = document.createElement('canvas'); raw.width = W; raw.height = H; // 굵기 적용 전
    const makeWork = () => {
      const w = rot % 180 ? img.naturalHeight : img.naturalWidth, h = rot % 180 ? img.naturalWidth : img.naturalHeight;
      work = document.createElement('canvas'); work.width = w; work.height = h;
      const x = work.getContext('2d');
      x.translate(w / 2, h / 2); x.rotate(rot * Math.PI / 180); x.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      box = null;
    };
    const color = isSig ? '#2f9e44' : '#1c7ed6';
    const show = () => {
      const maxW = $('.ps-wrap', m.el).clientWidth || 320, maxH = Math.max(240, window.innerHeight * 0.5);
      const k = Math.min(maxW / work.width, maxH / work.height);
      cv.width = Math.round(work.width * k); cv.height = Math.round(work.height * k);
      const x = cv.getContext('2d');
      x.drawImage(work, 0, 0, cv.width, cv.height);
      if (box) {
        const [bx, by, bw, bh] = box.map(v => v * k);
        x.fillStyle = 'rgba(0,0,0,.45)';
        x.fillRect(0, 0, cv.width, by); x.fillRect(0, by + bh, cv.width, cv.height - by - bh);
        x.fillRect(0, by, bx, bh); x.fillRect(bx + bw, by, cv.width - bx - bw, bh);
        x.strokeStyle = color; x.lineWidth = 3; x.strokeRect(bx, by, bw, bh);
      }
      update();
    };
    let result = '';
    const markLv = () => $$('[data-lv]', m.el).forEach(b => b.classList.toggle('on', +b.dataset.lv === level));
    function update() {
      const ok = inkFrom(box, raw);
      const pc = prev.getContext('2d'); pc.clearRect(0, 0, W, H);
      result = '';
      if (!ok) return;
      if (isSig && level !== 3) {
        const t = new Image(); t.src = Sig.inkWeight(raw, level - 3);
        t.onload = () => { pc.clearRect(0, 0, W, H); pc.drawImage(t, 0, 0); };
        result = t.src;
      } else { pc.drawImage(raw, 0, 0); result = raw.toDataURL('image/png'); }
    }
    // 고른 범위에서 잉크만 남기고 배경을 지워 out 캔버스에 맞춘다
    function inkFrom(b, out) {
      const pc = out.getContext('2d');
      pc.clearRect(0, 0, out.width, out.height);
      if (!b || b[2] < 8 || b[3] < 8) return false;
      const [bx, by, bw, bh] = b.map(Math.round);
      const px = work.getContext('2d').getImageData(bx, by, bw, bh).data, n = bw * bh;
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
      if (x1 < 0) return false;
      const tw = x1 - x0 + 1, th = y1 - y0 + 1;
      const ink = document.createElement('canvas'); ink.width = tw; ink.height = th;
      const id = ink.getContext('2d').createImageData(tw, th);
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const j = (y * tw + x) * 4;
        id.data[j] = id.data[j + 1] = id.data[j + 2] = 17; id.data[j + 3] = a[(y + y0) * bw + (x + x0)];
      }
      ink.getContext('2d').putImageData(id, 0, 0);
      const pad = 0.06, s = Math.min(out.width * (1 - 2 * pad) / tw, out.height * (1 - 2 * pad) / th);
      pc.imageSmoothingQuality = 'high';
      pc.drawImage(ink, (out.width - tw * s) / 2, (out.height - th * s) / 2, tw * s, th * s);
      return true;
    }
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
    $('[data-th]', m.el).oninput = e => { off = +e.target.value; update(); }; // 오른쪽으로 갈수록 진하게
    $$('[data-lv]', m.el).forEach(b => b.onclick = () => {
      level = +b.dataset.lv; markLv(); update();
      try { localStorage.setItem('sigWidth', level); } catch (e) { /* 저장 불가 */ }
    });
    markLv();
    $('[data-ok]', m.el).onclick = () => {
      if (!result) { toast(`사진에서 ${what} 범위를 끌어서 고르세요.`); return; }
      done = true; m.close(); resolve({ code: result, level: isSig ? level : 3 });
    };
    makeWork();
    show();
  });
}

// ---------- 와이파이 없는 곳에서 사용 (오프라인) ----------
// 앱이 쓰는 모든 파일(화면·라이브러리·교육자료 그림·평가표 자료·PDF 도구)을 기기에 미리 저장해 두고,
// 인터넷이 없을 때는 화면에 '오프라인'을 표시하고 할 수 있는 방법을 안내한다.
const Offline = (() => {
  const cacheName = () => 'safety-edu-v' + APP_VERSION; // sw.js 의 CACHE 와 같은 이름
  const FLAG = 'offlinePrep';
  function assets() {
    const set = new Set(['./', 'index.html', 'manifest.webmanifest', 'data/topics.json', 'data/extra.json', 'data/sif.json',
      'vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js', 'img/brand-logo.png', 'img/brand-mark.png',
      'icons/app-192.png', 'icons/app-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-180.png', 'icons/favicon-64.png']);
    document.querySelectorAll('script[src], link[rel=stylesheet]').forEach(e => set.add((e.getAttribute('src') || e.getAttribute('href')).split('?')[0]));
    // 교육자료 안의 그림 경로
    const walk = v => {
      if (typeof v === 'string') { if (/^img\/[\w./-]+\.(jpe?g|png|webp)$/i.test(v)) set.add(v); }
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk((Store.topics || []).filter(t => !t.custom));
    return [...set];
  }
  async function status() {
    if (!('caches' in window)) return null;
    const c = await caches.open(cacheName()), list = assets();
    let ok = 0;
    for (const u of list) if (await c.match(u, { ignoreSearch: true })) ok++;
    return { ok, total: list.length };
  }
  async function prepare(onProgress) {
    if (!('caches' in window)) throw new Error('이 브라우저는 오프라인 저장을 지원하지 않습니다.');
    const c = await caches.open(cacheName()), list = assets();
    let done = 0, fail = 0;
    for (const u of list) {
      if (!(await c.match(u, { ignoreSearch: true }))) {
        try { const r = await fetch(u, { cache: 'no-cache' }); if (r.ok) await c.put(u, r); else fail++; } catch (e) { fail++; }
      }
      done++; onProgress && onProgress(done, list.length);
    }
    if (!fail) { try { localStorage.setItem(FLAG, APP_VERSION); } catch (e) { /* 무시 */ } }
    return { fail, total: list.length };
  }
  const isReady = () => { try { return localStorage.getItem(FLAG) === APP_VERSION; } catch (e) { return false; } };
  // 인터넷 상태 표시
  const mark = () => document.body.classList.toggle('offline', !navigator.onLine);
  window.addEventListener('online', () => { mark(); auto(); });
  window.addEventListener('offline', () => { mark(); toast('인터넷이 끊겼습니다. 저장해 둔 파일로 계속 사용할 수 있습니다.', 3500); });
  // 인터넷이 될 때 한 번(버전마다) 조용히 준비
  let running = false;
  async function auto() {
    if (running || !navigator.onLine || isReady() || !('caches' in window)) return;
    running = true;
    try { await prepare(); } catch (e) { /* 다음 기회에 */ }
    running = false;
  }
  return { status, prepare, isReady, mark, auto, assets };
})();
