// 고위험요인 평가: 고용노동부 「건설업 사고사망 핵심위험요인(SIF) 평가표」(12개 공종·113개 단위작업·1,687개 항목)를
// 전체 검색 또는 공종·작업·단위작업 선택으로 찾아 위험성평가 항목을 고르고, 해당여부·위험등급(상·중·하)·현장대책을 적어
// 지도요원·현장소장 서명과 함께 1~2쪽 PDF와 쪽별 이미지로 저장한다.
const Sif = (() => {
  const MAX = 14; // 한 번에 평가할 최대 항목 수 (2쪽 안에 읽기 좋은 크기)
  const PAGE_N = 50; // 검색 결과 한 번에 보여줄 개수
  const pad2 = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const fmtDay = ymd => { const [y, m, d] = String(ymd || '').split('-'); return y ? `${y}. ${+m}. ${+d}.` : ''; };
  const save = t => { t.updated = Date.now(); return DB.put('sessions', t); };
  const all = async () => (await DB.all('sessions').catch(() => [])).filter(x => x.kind === 'sif').sort((a, b) => b.created - a.created);
  const INSPECTOR_NAME = String(INSPECTOR).split(' ').pop();
  const GRADES = ['상', '중', '하'];

  // ---------- 평가표 자료 ----------
  let DATA = null, FLAT = null;
  async function load() {
    if (FLAT) return FLAT;
    const res = await fetch(`data/sif.json?v=${APP_VERSION}`);
    if (!res.ok) throw new Error('평가표 자료를 불러오지 못했습니다.');
    DATA = await res.json();
    FLAT = [];
    for (const c of DATA) for (const w of c.w) for (const u of w.u) u.i.forEach((it, k) => {
      const [o, t, n, d, m, f] = it;
      FLAT.push({ id: `${u.c}#${k}`, cc: c.c, cn: c.n, wc: w.c, wn: w.n, uc: u.c, un: u.n, o, t, n, d, m, k8: !!(f & 1), k3: !!(f & 2),
        hay: [c.n, w.n, u.n, o, t, d, m.join(' ')].join(' ') });
    });
    return FLAT;
  }

  // ---------- 목록 ----------
  const tally = t => { const on = t.items.filter(x => x.on); return `해당 ${on.length}개 · 상 ${on.filter(x => x.g === '상').length} · 중 ${on.filter(x => x.g === '중').length} · 하 ${on.filter(x => x.g === '하').length}`; };
  function card(t) {
    return `<a class="card" href="#/h/${t.id}">
      <b><span class="cat c-sif">SIF</span>${esc(t.site || '(현장명 없음)')}</b>
      <span>${esc(fmtDay(t.date))} · ${esc(workSummary(t) || '항목 선택 전')}</span>
      <span class="badge ${t.done ? 'ok' : ''}">${t.done ? '완료' : '작성 중'} · 평가 ${t.items.length}개 · ${tally(t)}</span></a>`;
  }
  const workSummary = t => [...new Set(t.items.map(x => x.wn))].join(', ');
  async function list() {
    const items = await all();
    view().innerHTML = `<div class="bar"><h1>고위험요인 평가</h1><a class="btn primary" href="#/sif/new">＋ 평가 시작</a></div>
      <p class="hint">고용노동부 「건설업 사고사망 핵심위험요인(SIF) 평가표」의 공종·세부작업별 사망사고 사례와 감소대책을 검색해 위험성평가에 활용합니다. 고른 항목의 해당여부·위험등급·현장대책을 적어 1~2쪽 PDF와 쪽별 이미지로 저장합니다.</p>
      ${items.length ? `<div class="cards">${items.map(t => `<div class="rec">${card(t)}<div class="row"><button class="btn ghost sm" data-copy="${t.id}">이 항목으로 새 평가</button><button class="btn ghost sm" data-del="${t.id}">삭제</button></div></div>`).join('')}</div>` : '<p class="hint">아직 평가 기록이 없습니다.</p>'}`;
    $$('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('이 평가 기록을 삭제할까요? (저장해 둔 PDF는 지워지지 않습니다)')) return;
      await DB.del('sessions', b.dataset.del); list();
    });
    $$('[data-copy]').forEach(b => b.onclick = async () => create(null, await DB.get('sessions', b.dataset.copy)));
  }
  const lastBoss = async site => ((await DB.all('sessions').catch(() => [])).filter(x => ['sif', 'law', 'sapa'].includes(x.kind) && x.boss && Registry.norm(x.site) === Registry.norm(site)).sort((a, b) => b.created - a.created)[0] || {}).boss || '';
  async function create(siteArg, from) {
    const site = from ? from.site : siteArg ? decodeURIComponent(siteArg) : '';
    const reg = site ? await Registry.site(site) : null;
    const t = {
      id: uid(10), kind: 'sif', created: Date.now(), done: false, site: reg ? reg.name : site, date: today(),
      inspector: INSPECTOR_NAME, boss: site ? await lastBoss(site) : '', items: [], sigI: '', sigB: ''
    };
    if (from) t.items = from.items.map(x => Object.assign({}, x, { on: true, g: '', x: '' }));
    await save(t);
    location.replace(`#/h/${t.id}`);
  }
  const pick = f => ({ id: f.id, cn: f.cn, wn: f.wn, uc: f.uc, un: f.un, o: f.o, t: f.t, n: f.n, d: f.d, m: f.m.slice(), k8: f.k8, k3: f.k3, on: true, g: '', x: '' });

  // ---------- 평가 화면 ----------
  async function view_(id) {
    const t = await DB.get('sessions', id);
    if (!t || t.kind !== 'sif') { view().innerHTML = '<p>평가 기록을 찾을 수 없습니다.</p><a class="btn" href="#/sif">평가 목록</a>'; return; }
    view().innerHTML = '<p class="hint">평가표 자료를 불러오는 중…</p>';
    let flat;
    try { flat = await load(); } catch (e) { view().innerHTML = `<p class="err">${esc(e.message)} 인터넷 연결을 확인하세요.</p>`; return; }
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = setTimeout(() => save(t), 400); };
    const opt = (v, l, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`;
    view().innerHTML = `<div class="bar"><h1>고위험요인 평가</h1><a class="btn ghost sm" href="#/sif">목록</a></div>
      <form class="form" id="hf">
        <label>현장명 <input name="site" required value="${esc(t.site)}" placeholder="현장명 입력 또는 검색 (초성 검색 가능)"></label>
        <div class="grid3"><label>평가일 <input name="date" type="date" value="${esc(t.date)}"></label>
          <label>지도요원 <input value="${esc(t.inspector || INSPECTOR_NAME)}" readonly class="fixed"></label>
          <label>현장소장 <input name="boss" value="${esc(t.boss)}" placeholder="현장소장 이름"></label></div>
      </form>
      <section class="sf-search">
        <h2 class="h">핵심위험요인 찾기 <small>(${flat.length.toLocaleString()}개 항목)</small></h2>
        <input id="sq" type="search" placeholder="전체 검색: 작업·기인물·재해상세·대책 (예: 굴착기, 개구부, 달비계, ㄷㅂㄱ)">
        <div class="sf-sel">
          <select id="s-c"><option value="">공종 전체</option>${DATA.map(c => opt(c.c, `${c.c}. ${c.n}`)).join('')}</select>
          <select id="s-w"><option value="">작업 전체</option></select>
          <select id="s-u"><option value="">단위작업 전체</option></select>
          <select id="s-t"><option value="">재해종류 전체</option>${[...new Set(flat.map(f => f.t))].map(k => [k, flat.filter(f => f.t === k).length]).sort((a, b) => b[1] - a[1]).map(([k, n]) => opt(k, `${k} (${n})`)).join('')}</select>
        </div>
        <div class="row sf-flags"><label class="chip"><input type="checkbox" id="s-k8"><span>8대 위험요인만</span></label><label class="chip"><input type="checkbox" id="s-k3"><span>3대 사고유형만</span></label><button type="button" class="btn ghost sm" id="s-reset">조건 지우기</button></div>
        <p class="hint" id="s-info"></p>
        <ul class="sf-res" id="s-res"></ul>
        <div class="row center"><button type="button" class="btn ghost hide" id="s-more">더 보기</button></div>
      </section>
      <section class="sf-picked">
        <div class="bar"><h2 class="h">평가 항목 <small id="p-cnt"></small></h2></div>
        <p class="hint">위에서 <b>＋ 평가에 추가</b>로 고른 항목입니다. 해당여부와 위험등급(상·중·하)을 고르고, 현장 추가대책을 적으세요. 최대 ${MAX}개(결과지 1~2쪽).</p>
        <ol class="sf-plist" id="p-list"></ol>
      </section>
      <h2 class="h">서명</h2>
      <div class="lw-sigs">
        <section class="lw-sig" id="sgI"><input type="hidden" name="name" value="${esc(t.inspector || INSPECTOR_NAME)}">
          <div class="sigwrap"><span>지도요원 <b>${esc(t.inspector || INSPECTOR_NAME)}</b> 서명</span><canvas class="sigpad"></canvas><button type="button" class="btn ghost sm" data-clr>다시 쓰기</button></div></section>
        <section class="lw-sig" id="sgB"><input type="hidden" name="name" value="${esc(t.boss)}">
          <div class="sigwrap"><span>현장소장 <b class="bossname">${esc(t.boss || '(이름 입력)')}</b> 서명</span><canvas class="sigpad"></canvas><button type="button" class="btn ghost sm" data-clr>다시 쓰기</button></div></section>
      </div>
      <div class="row center"><button class="btn big primary" id="make">결과지 만들기 (PDF·쪽별 이미지)</button></div>
      <div id="out"></div>`;
    const f = $('#hf');
    siteField(f.site, async () => {
      t.site = f.site.value.trim();
      if (!f.boss.value.trim()) { const b = await lastBoss(t.site); if (b) { f.boss.value = b; f.boss.dispatchEvent(new Event('input')); } }
      later();
    });
    f.site.addEventListener('input', () => { t.site = f.site.value.trim(); later(); });
    f.date.onchange = () => { t.date = f.date.value; later(); };

    // ----- 검색 -----
    const sc = $('#s-c'), sw = $('#s-w'), su = $('#s-u'), st = $('#s-t'), sq = $('#sq');
    let shown = PAGE_N, hits = [];
    const fillW = () => {
      const c = DATA.find(x => x.c === sc.value);
      sw.innerHTML = '<option value="">작업 전체</option>' + (c ? c.w.map(w => opt(w.c, `${w.c} ${w.n}`)).join('') : '');
      fillU();
    };
    const fillU = () => {
      const c = DATA.find(x => x.c === sc.value), w = c && c.w.find(x => x.c === sw.value);
      su.innerHTML = '<option value="">단위작업 전체</option>' + (w ? w.u.map(u => opt(u.c, `${u.c} ${u.n} (${u.i.length})`)).join('') : '');
    };
    const picked = () => new Set(t.items.map(x => x.id));
    function search() {
      const q = sq.value.trim().replace(/굴삭기/g, '굴착기'), words = q.split(/\s+/).filter(Boolean); // 예전 용어 '굴삭기'로 찾아도 나오게
      hits = flat.filter(x => (!sc.value || x.cc === sc.value) && (!sw.value || x.wc === sw.value) && (!su.value || x.uc === su.value)
        && (!st.value || x.t === st.value) && (!$('#s-k8').checked || x.k8) && (!$('#s-k3').checked || x.k3)
        && words.every(wd => Search.match(x.hay, wd)));
      shown = PAGE_N; drawRes();
    }
    function drawRes() {
      const has = picked(), filtered = sq.value.trim() || sc.value || st.value || $('#s-k8').checked || $('#s-k3').checked;
      $('#s-info').textContent = filtered ? `검색 결과 ${hits.length.toLocaleString()}개` : `전체 ${hits.length.toLocaleString()}개 — 검색어를 넣거나 공종·작업·단위작업을 고르세요.`;
      $('#s-res').innerHTML = hits.slice(0, shown).map(x => `<li class="sf-it ${has.has(x.id) ? 'on' : ''}">
        <div class="sf-path">${esc(x.cn)} › ${esc(x.wn)} › <b>${esc(x.un)}</b></div>
        <div class="sf-tags"><span class="sf-o">${esc(x.o)}</span><span class="sf-t">${esc(x.t)}</span>${x.k8 ? '<span class="sf-k">8대 위험요인</span>' : ''}${x.k3 ? '<span class="sf-k3">3대 사고유형</span>' : ''}<span class="sf-n">사망 ${x.n}건</span></div>
        <div class="sf-d">${esc(x.d)}</div>
        <details class="sf-m"><summary>위험성 감소대책 ${x.m.length}개</summary><ul>${x.m.map(m => `<li>${esc(m)}</li>`).join('')}</ul></details>
        <button type="button" class="btn sm ${has.has(x.id) ? 'ghost' : 'primary'}" data-add="${x.id}">${has.has(x.id) ? '✓ 추가됨 (빼기)' : '＋ 평가에 추가'}</button></li>`).join('') || '<li class="hint">조건에 맞는 항목이 없습니다.</li>';
      $('#s-more').classList.toggle('hide', hits.length <= shown);
      $('#s-more').textContent = `더 보기 (${(hits.length - shown).toLocaleString()}개 남음)`;
      $$('[data-add]').forEach(b => b.onclick = () => {
        const i = t.items.findIndex(x => x.id === b.dataset.add);
        if (i >= 0) t.items.splice(i, 1);
        else {
          if (t.items.length >= MAX) { toast(`한 번에 최대 ${MAX}개까지 평가합니다. 더 필요하면 평가를 나눠 만드세요.`, 3500); return; }
          t.items.push(pick(flat.find(x => x.id === b.dataset.add)));
        }
        later(); drawRes(); drawPicked();
      });
    }
    let qt = 0;
    sq.oninput = () => { clearTimeout(qt); qt = setTimeout(search, 180); };
    sc.onchange = () => { fillW(); search(); };
    sw.onchange = () => { fillU(); search(); };
    su.onchange = st.onchange = $('#s-k8').onchange = $('#s-k3').onchange = search;
    $('#s-reset').onclick = () => { sq.value = ''; sc.value = ''; st.value = ''; $('#s-k8').checked = $('#s-k3').checked = false; fillW(); search(); };
    $('#s-more').onclick = () => { shown += PAGE_N; drawRes(); };

    // ----- 고른 항목 평가 -----
    function drawPicked() {
      $('#p-cnt').textContent = `${t.items.length} / ${MAX}개 · ${tally(t)}`;
      $('#p-list').innerHTML = t.items.map((x, i) => `<li class="sf-p ${x.on ? '' : 'off'}" data-i="${i}">
        <div class="sf-ph"><b>${i + 1}.</b> <span class="sf-path">${esc(x.wn)} › <b>${esc(x.un)}</b></span><button type="button" class="btn ghost sm" data-rm>✕</button></div>
        <div class="sf-tags"><span class="sf-o">${esc(x.o)}</span><span class="sf-t">${esc(x.t)}</span>${x.k8 ? '<span class="sf-k">8대</span>' : ''}${x.k3 ? '<span class="sf-k3">3대</span>' : ''}</div>
        <div class="sf-d">${esc(x.d)}</div>
        <div class="sf-eval">
          <label class="sf-on"><input type="checkbox" data-on ${x.on ? 'checked' : ''}><span>해당</span></label>
          <span class="sf-g">위험등급 ${GRADES.map(g => `<button type="button" data-g="${g}" class="${x.g === g ? 'on' : ''} g-${g}">${g}</button>`).join('')}</span>
        </div>
        <details class="sf-m"><summary>위험성 감소대책 ${x.m.length}개</summary><ul>${x.m.map(m => `<li>${esc(m)}</li>`).join('')}</ul></details>
        <textarea data-x rows="2" placeholder="현장 추가대책 (선택)">${esc(x.x || '')}</textarea>
      </li>`).join('') || '<li class="hint">아직 고른 항목이 없습니다.</li>';
      $$('#p-list [data-i]').forEach(li => {
        const x = t.items[+li.dataset.i];
        $('[data-rm]', li).onclick = () => { t.items.splice(+li.dataset.i, 1); later(); drawPicked(); drawRes(); };
        $('[data-on]', li).onchange = e => { x.on = e.target.checked; li.classList.toggle('off', !x.on); later(); $('#p-cnt').textContent = `${t.items.length} / ${MAX}개 · ${tally(t)}`; };
        $$('[data-g]', li).forEach(b => b.onclick = () => {
          x.g = x.g === b.dataset.g ? '' : b.dataset.g;
          $$('[data-g]', li).forEach(y => y.classList.toggle('on', y.dataset.g === x.g));
          later(); $('#p-cnt').textContent = `${t.items.length} / ${MAX}개 · ${tally(t)}`;
        });
        $('[data-x]', li).oninput = e => { x.x = e.target.value; later(); };
      });
    }
    // 처음: 고른 항목이 있으면 그 단위작업을 보여준다
    if (t.items.length) { const u = t.items[0].uc.split('.'); sc.value = u[0]; fillW(); sw.value = `${u[0]}.${u[1]}`; fillU(); }
    search(); drawPicked();

    // ----- 서명 -----
    const sigBox = (id, key) => {
      const root = $('#' + id), pad = Sig.pad($('canvas', root)), nameIn = $('[name=name]', root);
      if (t[key]) setTimeout(() => pad.load(t[key]), 60);
      const getUsed = attachPastSigs(root, nameIn, pad);
      $('[data-clr]', root).addEventListener('click', () => { pad.clear(); t[key] = ''; later(); });
      const store = () => { t[key] = getUsed() || pad.code(); later(); };
      $('canvas', root).addEventListener('pointerup', () => setTimeout(store, 30));
      $('canvas', root).addEventListener('sigwidth', () => setTimeout(store, 30));
      $('canvas', root).addEventListener('sigpaper', () => setTimeout(store, 30));
      root.addEventListener('click', e => { if (e.target.closest('[data-g]')) setTimeout(store, 30); });
      return { store };
    };
    const sI = sigBox('sgI', 'sigI'), sB = sigBox('sgB', 'sigB');
    f.boss.addEventListener('input', () => {
      t.boss = f.boss.value.trim();
      $('#sgB .bossname').textContent = t.boss || '(이름 입력)';
      const hn = $('#sgB [name=name]'); hn.value = t.boss; hn.dispatchEvent(new Event('input'));
      later();
    });

    $('#make').onclick = async () => {
      clearTimeout(timer);
      sI.store(); sB.store(); clearTimeout(timer);
      if (!t.site) { toast('현장명을 입력하세요.'); f.site.focus(); return; }
      if (!t.items.length) { toast('평가할 항목을 1개 이상 추가하세요.'); $('#sq').focus(); return; }
      if (!t.boss) { toast('현장소장 이름을 입력하세요.'); f.boss.focus(); return; }
      const noG = t.items.filter(x => x.on && !x.g).length;
      if (noG && !confirm(`해당 항목 중 ${noG}개의 위험등급이 비어 있습니다. 그대로 만들까요?`)) return;
      const miss = [!t.sigI && '지도요원', !t.sigB && '현장소장'].filter(Boolean);
      if (miss.length && !confirm(`${miss.join('·')} 서명이 없습니다. 서명 칸을 비운 채로 만들까요?`)) return;
      const btn = $('#make'), label = btn.textContent; btn.disabled = true; btn.textContent = '만드는 중…';
      try {
        await save(t);
        await Registry.addSite(t.site);
        const at = Date.now();
        if (t.sigI) await Registry.addSig(t.inspector || INSPECTOR_NAME, t.sigI, t.site, at);
        if (t.sigB) await Registry.addSig(t.boss, t.sigB, t.site, at);
        const res = await build(t);
        t.done = true; await save(t);
        const name = fileName(t), N = res.pages.length;
        $('#out').innerHTML = `<h2 class="h">미리보기 <small>(${N}쪽)</small></h2>
          <div class="tbm-prev">${res.pages.map(p => `<img src="${p}" alt="고위험요인 평가 결과">`).join('')}</div>
          <div class="save-actions">
            <button class="btn primary" id="sv-pdf">PDF 저장 (${N}쪽)</button>
            <button class="btn" id="sv-share">PDF 공유 (카카오톡·메일 등)</button>
            ${res.pages.map((_, i) => `<button class="btn ghost" data-jpg="${i}">${i + 1}쪽 이미지(JPG) 저장</button>`).join('')}
            ${N > 1 ? `<button class="btn ghost" id="sv-imgshare">이미지 ${N}장 공유</button>` : '<button class="btn ghost" id="sv-imgshare">이미지 공유</button>'}
          </div>`;
        const imgFiles = await Promise.all(res.pages.map((p, i) => toFile(p, `${name}_${i + 1}쪽.jpg`))); // 공유 버튼에서 바로 쓰도록 미리
        const pdfFile = new File([res.pdf], name + '.pdf', { type: 'application/pdf' });
        const imgFile = async i => imgFiles[i];
        $('#sv-pdf').onclick = () => downloadBlob(res.pdf, name + '.pdf');
        $$('[data-jpg]').forEach(b => b.onclick = async () => downloadBlob(await imgFile(+b.dataset.jpg), `${name}_${+b.dataset.jpg + 1}쪽.jpg`));
        const share = files => shareFiles(files, name);
        $('#sv-share').onclick = () => share([pdfFile]);
        $('#sv-imgshare').onclick = () => share(imgFiles);
        $('#out').scrollIntoView({ behavior: 'smooth' });
        btn.textContent = '다시 만들기';
      } catch (e) {
        console.error(e); toast('결과지를 만들지 못했습니다: ' + e.message, 5000); btn.textContent = label;
      }
      btn.disabled = false;
    };
  }
  const fileName = t => `고위험요인평가_${(t.site || '현장').replace(/[\\/:*?"<>|]/g, '_')}_${(t.date || '').replace(/-/g, '')}`;

  // ---------- 결과지 (A4 세로 1~2쪽) ----------
  const sigImg = g => g ? `<img src="${Sig.toImage(g, 400, 160)}">` : '';
  const rowHTML = (x, i) => `<tr>
    <td class="c">${i + 1}</td>
    <td><b>${esc(x.wn)}</b><div class="sh-u">${esc(x.un)}</div></td>
    <td><b>${esc(x.o)}</b><div class="sh-k">${esc(x.t)}${x.k8 ? ' · 8대' : ''}${x.k3 ? ' · 3대' : ''}</div><div class="sh-n">사망 ${x.n}건</div></td>
    <td class="sh-d">${esc(x.d)}</td>
    <td class="c sh-on">${x.on ? '☑' : '☐'}</td>
    <td class="c sh-g ${x.on && x.g ? 'g-' + x.g : ''}">${x.on ? esc(x.g || '') : ''}</td>
    <td class="sh-m">${x.m.map(m => `<div>▶ ${esc(m)}</div>`).join('')}</td>
    <td class="sh-x">${esc(x.x || '').replace(/\n/g, '<br>')}</td></tr>`;
  const HEAD = `<colgroup><col style="width:4%"><col style="width:12%"><col style="width:12%"><col style="width:21%"><col style="width:5%"><col style="width:6%"><col style="width:27%"><col></colgroup>
    <tr><th>No</th><th>작업명<br><small>단위작업</small></th><th>기인물<br><small>재해종류</small></th><th>재해 상세 (사망사고 사례)</th><th>해당<br>여부</th><th>위험<br>등급</th><th>위험성 감소대책</th><th>현장 추가대책</th></tr>`;
  function pageHTML(t, rows, p, total, start) {
    const top = p === 0 ? `
      <div class="lw-top">
        <div class="tb-title"><img class="tb-logo" src="img/brand-logo.png" alt="사람인 안전지도사 사무소"><h1>건설업 고위험요인(SIF) 위험성평가표</h1>
          <div class="lw-info">현장명: <b>${esc(t.site)}</b> &nbsp;·&nbsp; 평가일: <b>${esc(fmtDay(t.date))}</b></div>
          <div class="lw-info">평가 작업: <b>${esc(workSummary(t))}</b></div>
          <div class="lw-info">평가 ${t.items.length}개 · <b>${tally(t)}</b></div></div>
        <table class="lw-sign"><tr><th>구분</th><th>성명</th><th>서명</th></tr>
          <tr><th>지도요원</th><td>${esc(t.inspector || INSPECTOR_NAME)}</td><td class="lw-sg">${sigImg(t.sigI)}</td></tr>
          <tr><th>현장소장</th><td>${esc(t.boss)}</td><td class="lw-sg">${sigImg(t.sigB)}</td></tr></table>
      </div>` : `<div class="lw-top2"><b>건설업 고위험요인(SIF) 위험성평가표</b><span>${esc(t.site)} · ${esc(fmtDay(t.date))}</span></div>`;
    return `<div class="lw-page sh-page">${top}
      <table class="tb-t sh-t">${HEAD}${rows.map((x, k) => rowHTML(x, start + k)).join('')}</table>
      <div class="sh-note">※ 위험등급: 상(즉시 개선·작업중지 검토) · 중(작업 전 대책 이행 확인) · 하(관리 유지) &nbsp;|&nbsp; 8대: 8대 위험요인 기인물, 3대: 3대 사고유형(추락·끼임·부딪힘)</div>
      <div class="tb-foot"><span>사람인안전지도사사무소 · 지도요원 ${esc(t.inspector || INSPECTOR_NAME)} · 출처: 고용노동부 건설업 사고사망 핵심위험요인(SIF) 평가표</span><span>${p + 1} / ${total}쪽</span></div>
    </div>`;
  }
  async function build(t) {
    const root = document.createElement('div');
    root.className = 'rp-root';
    document.body.appendChild(root);
    const fits = (rows, p, total, start, fs) => {
      root.innerHTML = pageHTML(t, rows, p, total, start);
      const page = $('.lw-page', root);
      $('.sh-t', page).style.fontSize = fs + 'px';
      return page.scrollHeight <= page.clientHeight + 1; // 내용이 쪽 높이 안에 들어오는지
    };
    const pages = [];
    try {
      // 1쪽에 들어가는 만큼 넣고, 나머지는 2쪽. 2쪽도 넘치면 글씨를 줄인다.
      let fs = 12, split;
      for (; fs >= 8; fs -= 0.5) {
        let n = t.items.length;
        while (n > 1 && !fits(t.items.slice(0, n), 0, 2, 0, fs)) n--;
        if (n === t.items.length && fits(t.items, 0, 1, 0, fs)) { split = [t.items]; break; }
        if (fits(t.items.slice(n), 1, 2, n, fs)) { split = [t.items.slice(0, n), t.items.slice(n)]; break; }
      }
      if (!split) { fs = 8; const h = Math.ceil(t.items.length / 2); split = [t.items.slice(0, h), t.items.slice(h)]; }
      let start = 0;
      for (let p = 0; p < split.length; p++) {
        root.innerHTML = pageHTML(t, split[p], p, split.length, start);
        const page = $('.lw-page', root);
        $('.sh-t', page).style.fontSize = fs + 'px';
        await Promise.all([...root.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 4000); })));
        const c = await html2canvas(page, { scale: 2, backgroundColor: '#ffffff', logging: false, scrollX: -window.scrollX, scrollY: -window.scrollY });
        pages.push(c.toDataURL('image/jpeg', 0.9));
        start += split[p].length;
      }
    } finally {
      root.remove();
    }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    pages.forEach((img, i) => { if (i) pdf.addPage(); pdf.addImage(img, 'JPEG', 0, 0, 210, 297); });
    return { pdf: pdf.output('blob'), pages };
  }

  return { list, create, view: view_, card, build, load };
})();
