// 현장·근로자 등록부 (교육한 현장과 교육받은 사람을 기억) + 검색 입력창
const Registry = (() => {
  const KEY = 'registry';
  let cache = null;
  const norm = s => String(s || '').replace(/\s+/g, '');

  async function load() {
    if (!cache) cache = (await DB.get('kv', KEY).catch(() => null)) || { sites: {}, bf: false };
    return cache;
  }
  const save = () => DB.put('kv', cache, KEY);
  function siteRec(r, name) {
    const k = norm(name);
    if (!k) return null;
    return (r.sites[k] = r.sites[k] || { name: String(name).trim(), place: '', people: {}, created: Date.now(), updated: 0 });
  }

  async function addSite(name, place) {
    const r = await load(), st = siteRec(r, name);
    if (!st) return;
    st.name = String(name).trim();
    if (place) st.place = place;
    st.updated = Date.now();
    await save();
  }
  // names: '이름' 또는 { name, tel } 목록. 전화번호가 있으면 함께 저장(없으면 기존 번호 유지)
  async function addPeople(siteName, names, when = Date.now()) {
    const r = await load(), st = siteRec(r, siteName);
    if (!st) return;
    for (const n of names) {
      const v = String((n && n.name) || n || '').trim();
      if (!v) continue;
      st.people[v] = Math.max(st.people[v] || 0, when);
      if (st.pdel) delete st.pdel[v];
      const tel = fmtTel(n && n.tel);
      if (tel) (st.tels = st.tels || {})[v] = tel;
    }
    st.updated = Math.max(st.updated, when);
    await save();
  }
  // 한 사람 수정 (이름을 바꾸면 옮겨 저장)
  async function savePerson(siteName, oldName, name, tel) {
    const r = await load(), st = siteRec(r, siteName);
    const v = String(name || '').trim();
    if (!st || !v) throw new Error('이름을 입력하세요.');
    st.tels = st.tels || {};
    if (oldName && oldName !== v) {
      if (st.people[v] != null) throw new Error(`${v} 님이 이미 명단에 있습니다.`);
      st.people[v] = st.people[oldName] || Date.now();
      delete st.people[oldName]; delete st.tels[oldName];
    } else if (st.people[v] == null) st.people[v] = Date.now();
    const t = fmtTel(tel);
    if (t) st.tels[v] = t; else delete st.tels[v];
    await save();
  }
  async function removePerson(siteName, name) {
    const r = await load(), st = r.sites[norm(siteName)];
    if (st) { delete st.people[name]; if (st.tels) delete st.tels[name]; (st.pdel = st.pdel || {})[name] = Date.now(); await save(); }
  }
  // 전화번호 모양 맞추기: 01012345678 → 010-1234-5678
  function fmtTel(s) {
    const d = String(s || '').replace(/[^\d+]/g, '').replace(/^\+82/, '0');
    if (!d) return '';
    if (/^02\d{7,8}$/.test(d)) return d.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3');
    if (/^0\d{9,10}$/.test(d)) return d.replace(/^(0\d{2})(\d{3,4})(\d{4})$/, '$1-$2-$3');
    if (/^1\d{7}$/.test(d)) return d.replace(/^(\d{4})(\d{4})$/, '$1-$2');
    return String(s).trim();
  }
  // 붙여넣은 글에서 이름·전화번호 뽑기: 한 줄(또는 쉼표)에 한 명, '홍길동 010-1234-5678' / '홍길동,01012345678' 등
  function parsePeople(text) {
    const out = [];
    const rows = String(text || '').split(/\n|[;；]/);
    for (const row of rows) {
      // 한 줄에 전화번호가 여러 개면 쉼표로 여러 명, 아니면 쉼표는 이름·번호 구분으로 본다
      const telRe = /(\+?82[-\s]?|0)1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}|0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g;
      const tels = row.match(telRe) || [];
      const parts = tels.length > 1 || !tels.length ? row.split(/[,，]/) : [row];
      for (const p of parts) {
        const tel = (p.match(telRe) || [])[0] || '';
        const name = p.replace(telRe, ' ').replace(/[,，:：\-–\t]/g, ' ').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
        const last = out[out.length - 1];
        if (name) out.push({ name, tel: fmtTel(tel), row });
        else if (tel && last && last.row === row && !last.tel) last.tel = fmtTel(tel); // "이름, 번호" 순서로 쉼표가 섞인 경우
      }
    }
    return out.map(({ name, tel }) => ({ name, tel }));
  }
  async function tels(siteName) { const st = await site(siteName); return (st && st.tels) || {}; }
  // 현장 등록·수정 (oldName이 있으면 수정, 이름이 바뀌면 옮겨 저장)
  const FIELDS = ['client', 'addr', 'place', 'mgr', 'tel', 'memo'];
  async function saveSite(oldName, data) {
    const r = await load();
    const name = String(data.name || '').trim(), nk = norm(name);
    if (!nk) throw new Error('현장명을 입력하세요.');
    const ok = oldName ? norm(oldName) : null;
    if (r.sites[nk] && nk !== ok) throw new Error(`'${r.sites[nk].name}' 현장이 이미 등록되어 있습니다.`);
    const st = (ok && r.sites[ok]) || { people: {}, created: Date.now() };
    if (ok && ok !== nk) delete r.sites[ok];
    st.name = name;
    for (const f of FIELDS) st[f] = String(data[f] || '').trim();
    st.updated = Date.now();
    r.sites[nk] = st;
    // 이름이 바뀌면 이전 서명에 적힌 현장명도 바꾼다
    if (ok && ok !== nk && r.sigs) for (const list of Object.values(r.sigs)) for (const x of list) if (norm(x.site) === ok) x.site = name;
    await save();
    return st;
  }
  // 삭제한 현장은 기록(del)으로 남겨 다른 기기와 합칠 때도 지워지게 한다
  async function removeSite(siteName) {
    const r = await load(), k = norm(siteName);
    delete r.sites[k]; (r.del = r.del || {})[k] = Date.now(); await save();
  }
  function reload() { cache = null; } // 다른 기기 정보를 합친 뒤 다시 읽기
  async function sites() {
    const r = await load();
    return Object.values(r.sites).sort((a, b) => b.updated - a.updated);
  }
  async function site(name) { const r = await load(); return r.sites[norm(name)] || null; }
  async function people(siteName) {
    const st = await site(siteName);
    return st ? Object.entries(st.people).sort((a, b) => b[1] - a[1]).map(e => e[0]) : [];
  }
  // 이름별 과거 서명 (최근 5개, 같은 서명은 하나만)
  const SIG_MAX = 5;
  function putSig(r, name, g, site, at) {
    const n = String(name || '').trim();
    if (!n || !g) return;
    r.sigs = r.sigs || {};
    const list = (r.sigs[n] || []).filter(x => x.g !== g);
    list.push({ g, site: site || '', at: at || Date.now() });
    r.sigs[n] = list.sort((a, b) => b.at - a.at).slice(0, SIG_MAX);
  }
  async function addSig(name, g, site, at) { const r = await load(); putSig(r, name, g, site, at); await save(); }
  async function sigs(name) { const r = await load(); return ((r.sigs || {})[String(name || '').trim()] || []).slice(); }
  async function removeSig(name, g) {
    const r = await load(), n = String(name || '').trim();
    if (r.sigs && r.sigs[n]) { r.sigs[n] = r.sigs[n].filter(x => x.g !== g); if (!r.sigs[n].length) delete r.sigs[n]; await save(); }
  }
  // 처음 한 번: 기존 교육 기록에서 현장·근로자·서명을 등록
  async function backfill() {
    const r = await load();
    if (!r.bs) {
      const list = await DB.all('sessions').catch(() => []);
      for (const s of list) for (const w of s.workers || []) putSig(r, w.name, w.sig, s.site, w.at * 1000);
      r.bs = true;
      await save();
    }
    if (r.bf) return;
    const list = await DB.all('sessions').catch(() => []);
    for (const s of list) {
      if (!s.site) continue;
      const st = siteRec(r, s.site);
      if (s.place) st.place = s.place;
      st.updated = Math.max(st.updated, s.updated || s.created || 0);
      for (const w of s.workers || []) st.people[w.name] = Math.max(st.people[w.name] || 0, w.at * 1000);
    }
    r.bf = true;
    await save();
  }
  return { reload, addSite, saveSite, addPeople, savePerson, parsePeople, fmtTel, tels, removePerson, removeSite, sites, site, people, backfill, norm, addSig, sigs, removeSig };
})();

const Search = (() => {
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const chosung = s => [...s].map(ch => {
    const c = ch.charCodeAt(0) - 0xAC00;
    return c >= 0 && c <= 11171 ? CHO[Math.floor(c / 588)] : ch;
  }).join('');
  const isCho = s => /^[ㄱ-ㅎ]+$/.test(s);

  // 검색어가 글자 그대로 들어있거나, 초성(ㅎㄱㄷ)이 맞으면 일치
  function match(text, q) {
    const qn = String(q || '').replace(/\s+/g, '').toLowerCase();
    if (!qn) return true;
    const t = String(text || '').replace(/\s+/g, '').toLowerCase();
    return t.includes(qn) || (isCho(qn) && chosung(t).includes(qn));
  }

  // input 아래에 검색 결과 목록을 붙인다.
  // source(q) → [{ value, label, sub, disabled }], onPick(item)
  function attach(input, source, onPick, { max = 8 } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'sugg-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const list = document.createElement('ul');
    list.className = 'sugg hide';
    wrap.appendChild(list);
    input.setAttribute('autocomplete', 'off');
    let items = [];
    // 앞글자(또는 앞 초성)가 맞는 항목을 위로
    const rank = (it, q) => {
      const qn = String(q || '').replace(/\s+/g, '').toLowerCase();
      if (!qn) return 0;
      const t = String(it.value).replace(/\s+/g, '').toLowerCase();
      return t.startsWith(qn) || chosung(t).startsWith(qn) ? 0 : 1;
    };
    async function show() {
      const q = input.value;
      items = (await source(q)).map((it, i) => [rank(it, q), i, it]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]).slice(0, max);
      if (!items.length) { list.classList.add('hide'); return; }
      list.innerHTML = items.map((it, i) => `<li data-i="${i}" class="${it.disabled ? 'off' : ''}"><b>${esc(it.label || it.value)}</b>${it.sub ? `<span>${esc(it.sub)}</span>` : ''}</li>`).join('');
      list.classList.remove('hide');
    }
    input.addEventListener('focus', show);
    input.addEventListener('input', show);
    input.addEventListener('blur', () => setTimeout(() => list.classList.add('hide'), 200));
    // 터치 시 입력창 포커스를 잃기 전에 선택되도록 pointerdown 사용
    list.addEventListener('pointerdown', e => {
      const li = e.target.closest('li');
      if (!li) return;
      e.preventDefault();
      const it = items[+li.dataset.i];
      if (!it || it.disabled) return;
      input.value = it.value;
      list.classList.add('hide');
      input.dispatchEvent(new Event('change'));
      onPick && onPick(it);
    });
    return { refresh: show };
  }
  return { attach, match, chosung };
})();
