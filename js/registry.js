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
  async function addPeople(siteName, names, when = Date.now()) {
    const r = await load(), st = siteRec(r, siteName);
    if (!st) return;
    for (const n of names) {
      const v = String(n || '').trim();
      if (v) st.people[v] = Math.max(st.people[v] || 0, when);
    }
    st.updated = Math.max(st.updated, when);
    await save();
  }
  async function removePerson(siteName, name) {
    const r = await load(), st = r.sites[norm(siteName)];
    if (st) { delete st.people[name]; await save(); }
  }
  async function removeSite(siteName) {
    const r = await load(); delete r.sites[norm(siteName)]; await save();
  }
  async function sites() {
    const r = await load();
    return Object.values(r.sites).sort((a, b) => b.updated - a.updated);
  }
  async function site(name) { const r = await load(); return r.sites[norm(name)] || null; }
  async function people(siteName) {
    const st = await site(siteName);
    return st ? Object.entries(st.people).sort((a, b) => b[1] - a[1]).map(e => e[0]) : [];
  }
  // 처음 한 번: 기존 교육 기록에서 현장·근로자를 등록
  async function backfill() {
    const r = await load();
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
  return { addSite, addPeople, removePerson, removeSite, sites, site, people, backfill, norm };
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
