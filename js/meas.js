// 장비측정: 지도요원이 측정장비로 잰 결과(측정장소·측정값·지도사항·사진)를 장비별로 기록하고
// A4 한 장에 장비 3개씩 PDF(여러 장) 또는 하나의 이미지로 저장한다.
// 측정장소·측정값·지도사항은 현장과 관계없이 장비별로 지난 입력을 불러올 수 있다.
const Meas = (() => {
  // 장비 목록과 법적기준 (기준 문구는 앱에서 고칠 수 있고, 고친 값은 이 기기에 기억된다)
  const EQUIP = [
    { k: 'o2', n: '산소농도', u: '%', ph: '예: 20.9%', std: '18% 이상 23.5% 미만\n(산업안전보건기준규칙 제618조 적정공기)' },
    { k: 'gas', n: '가스농도', u: '', ph: '예: CO 0ppm / H₂S 0ppm / LEL 0%', std: 'CO 30ppm 미만\nH₂S 10ppm 미만\nLEL(폭발하한) 10% 미만' },
    { k: 'earth', n: '접지저항', u: 'Ω', ph: '예: 85Ω', std: '[KEC] 보호접지(TT계통)\nRA × IΔn ≤ 50V\n→ 누전차단기 30mA: 1,666Ω 이하\n피뢰시스템: 10Ω 이하 권장' },
    { k: 'insul', n: '절연저항', u: 'MΩ', ph: '예: 100MΩ 이상', std: '[KEC·전기설비기술기준 제52조]\nSELV·PELV(DC 250V): 0.5MΩ 이상\nFELV·500V 이하(DC 500V): 1.0MΩ 이상\n500V 초과(DC 1000V): 1.0MΩ 이상' },
    { k: 'lux', n: '조도계', u: 'lx', ph: '예: 180lx', std: '(산업안전보건기준규칙 제8조)\n초정밀작업 750럭스 이상\n정밀작업 300럭스 이상\n보통작업 150럭스 이상\n그 밖의 작업 75럭스 이상' },
    { k: 'volt', n: '저압검전기', u: '', ph: '예: 무전압 확인', std: '정전작업 전 검전기로\n충전 여부 확인 → 무전압 확인 후 작업\n(산업안전보건기준규칙 제319조)' },
    { k: 'gnd', n: '접지선시험기', u: '', ph: '예: 접지 정상 / 극성 정상', std: '전기기계·기구 외함 접지 연결 확인\n(접지 정상·극성 정상일 것)\n(산업안전보건기준규칙 제302조)' },
    { k: 'etc', n: '기타', u: '', ph: '측정값', std: '' }
  ];
  const BYK = Object.fromEntries(EQUIP.map(e => [e.k, e]));
  const PER_PAGE = 3;
  const JUDGE = { ok: '적합', ng: '부적합' };
  const pad2 = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const fmtDay = ymd => { const [y, m, d] = String(ymd || '').split('-'); return y ? `${y}. ${+m}. ${+d}.` : ''; };
  const save = t => { t.updated = Date.now(); return DB.put('sessions', t); };
  const all = async () => (await DB.all('sessions').catch(() => [])).filter(x => x.kind === 'meas').sort((a, b) => b.created - a.created);
  const lines = s => esc(s || '').replace(/\n/g, '<br>');

  // 기기에 기억한 법적기준
  const stdMap = async () => (await DB.get('kv', 'measStd').catch(() => null)) || {};
  const stdOf = (k, map) => (map && map[k] != null ? map[k] : (BYK[k] || {}).std || '');

  // ---------- 지난 입력 (장비별·항목별, 현장 무관) ----------
  // measLib = { 장비키: { loc: [..], val: [..], note: [..] } } — 최근 것이 앞, 항목별 최대 30개
  const LIBMAX = 30;
  const libGet = async () => (await DB.get('kv', 'measLib').catch(() => null)) || {};
  async function libAdd(items) {
    const lib = await libGet();
    for (const it of items) {
      const key = it.k === 'etc' ? 'etc:' + (it.name || '') : it.k;
      const e = lib[key] || (lib[key] = { loc: [], val: [], note: [] });
      for (const f of ['loc', 'val', 'note']) {
        const v = (it[f] || '').trim();
        if (!v) continue;
        e[f] = [v, ...e[f].filter(x => x !== v)].slice(0, LIBMAX);
      }
    }
    await DB.put('kv', lib, 'measLib');
  }
  async function libRemove(key, f, v) {
    const lib = await libGet();
    if (lib[key]) { lib[key][f] = lib[key][f].filter(x => x !== v); await DB.put('kv', lib, 'measLib'); }
  }
  const libKey = it => it.k === 'etc' ? 'etc:' + (it.name || '') : it.k;
  const FIELD = { loc: '측정장소', val: '측정값', note: '지도사항' };

  // 지난 입력 고르기 창
  async function pickPast(it, f, onPick) {
    const key = libKey(it);
    const m = modal(`<h2>${esc(it.name)} · 지난 ${FIELD[f]}</h2>
      <input class="pp-q" placeholder="검색 (초성 검색 가능)">
      <ul class="pp-list"></ul>`, { wide: true });
    const q = $('.pp-q', m.el), ul = $('.pp-list', m.el);
    const draw = async () => {
      const list = ((await libGet())[key] || {})[f] || [];
      const hit = list.filter(v => !q.value.trim() || Search.match(v, q.value));
      ul.innerHTML = hit.length ? hit.map((v, i) => `<li><button type="button" class="pp-use" data-i="${i}">${lines(v)}</button><button type="button" class="pdel" data-rm="${i}" title="목록에서 삭제">✕</button></li>`).join('')
        : `<li class="hint">${list.length ? '검색 결과가 없습니다.' : `아직 저장된 ${FIELD[f]}이(가) 없습니다. 결과지를 만들면 입력한 내용이 여기에 쌓입니다.`}</li>`;
      $$('.pp-use', ul).forEach(b => b.onclick = () => { onPick(hit[+b.dataset.i]); m.close(); });
      $$('[data-rm]', ul).forEach(b => b.onclick = async () => { await libRemove(key, f, hit[+b.dataset.rm]); draw(); });
    };
    q.oninput = draw;
    draw();
  }

  // ---------- 목록 ----------
  function card(t) {
    const sel = t.items.filter(x => x.on);
    return `<a class="card" href="#/m/${t.id}">
      <b><span class="cat c-meas">측정</span>${esc(t.site || '(현장명 없음)')}</b>
      <span>${esc(fmtDay(t.date))} · ${esc(sel.map(x => x.name).join(', ') || '장비 선택 전')}</span>
      <span class="badge ${t.done ? 'ok' : ''}">${t.done ? '완료' : '작성 중'} · 장비 ${sel.length}개 · ${Math.max(1, Math.ceil(sel.length / PER_PAGE))}쪽</span></a>`;
  }
  async function list() {
    const items = await all();
    view().innerHTML = `<div class="bar"><h1>장비측정</h1><a class="btn primary" href="#/meas/new">＋ 측정 기록</a></div>
      <p class="hint">측정장비로 잰 결과를 장비별로 기록하고 사진을 붙여, A4 한 장에 장비 3개씩 PDF나 이미지로 저장합니다.</p>
      ${items.length ? `<div class="cards">${items.map(t => `<div class="rec">${card(t)}<div class="row"><button class="btn ghost sm" data-copy="${t.id}">이 장비 구성으로 새 기록</button><button class="btn ghost sm" data-del="${t.id}">삭제</button></div></div>`).join('')}</div>` : '<p class="hint">아직 측정 기록이 없습니다.</p>'}`;
    $$('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('이 측정 기록을 삭제할까요? (저장해 둔 PDF는 지워지지 않습니다)')) return;
      await DB.del('sessions', b.dataset.del); list();
    });
    $$('[data-copy]').forEach(b => b.onclick = async () => create(null, await DB.get('sessions', b.dataset.copy)));
  }

  const blank = (k, std) => ({ k, name: k === 'etc' ? '' : BYK[k].n, std, on: false, loc: '', val: '', judge: '', note: '', photo: '' });
  async function create(siteArg, from) {
    const map = await stdMap();
    const site = from ? from.site : siteArg ? decodeURIComponent(siteArg) : '';
    const reg = site ? await Registry.site(site) : null;
    const t = {
      id: uid(10), kind: 'meas', created: Date.now(), done: false,
      site: reg ? reg.name : site, date: today(), inspector: INSPECTOR,
      items: EQUIP.map(e => blank(e.k, stdOf(e.k, map)))
    };
    if (from) from.items.forEach(x => { const it = t.items.find(y => y.k === x.k); if (it) { it.on = x.on; if (x.k === 'etc') { it.name = x.name; it.std = x.std; } } });
    await save(t);
    location.replace(`#/m/${t.id}`);
  }

  // ---------- 작성 화면 ----------
  async function view_(id) {
    const t = await DB.get('sessions', id);
    if (!t || t.kind !== 'meas') { view().innerHTML = '<p>측정 기록을 찾을 수 없습니다.</p><a class="btn" href="#/meas">측정 목록</a>'; return; }
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = setTimeout(() => save(t), 400); };

    view().innerHTML = `<div class="bar"><h1>장비측정 기록</h1><a class="btn ghost sm" href="#/meas">목록</a></div>
      <form class="form" id="mf">
        <label>현장명<input name="site" required value="${esc(t.site)}" placeholder="현장명 입력 또는 검색 (초성 검색 가능)"></label>
        <div class="grid2"><label>측정일 <input name="date" type="date" value="${esc(t.date)}"></label>
          <label>측정자 <input value="${esc(INSPECTOR)}" readonly class="fixed"></label></div>
        <fieldset><legend>측정한 장비 <small>(체크한 장비만 작성·출력)</small></legend>
          <div class="eq-pick">${t.items.map((it, i) => `<label class="chip"><input type="checkbox" data-on="${i}" ${it.on ? 'checked' : ''}><span>${esc(it.k === 'etc' ? '기타(직접 입력)' : it.name)}</span></label>`).join('')}</div></fieldset>
      </form>
      <div id="eqs"></div>
      <div class="row center"><button class="btn big primary" id="make">결과지 만들기 (PDF·이미지)</button></div>
      <div id="out"></div>`;
    const f = $('#mf');
    siteField(f.site, () => { t.site = f.site.value.trim(); later(); });
    f.site.oninput = () => { t.site = f.site.value.trim(); later(); };
    f.date.onchange = () => { t.date = f.date.value; later(); };
    $$('[data-on]').forEach(c => c.onchange = () => { t.items[+c.dataset.on].on = c.checked; later(); drawEqs(); });

    function drawEqs() {
      const box = $('#eqs');
      const on = t.items.map((it, i) => [it, i]).filter(([it]) => it.on);
      box.innerHTML = on.length ? on.map(([it, i], n) => `<section class="eq" data-i="${i}">
        <div class="eq-h"><b>${n + 1}. ${esc(it.k === 'etc' ? (it.name || '기타 장비') : it.name)}</b>
          ${n % PER_PAGE === 0 && on.length > PER_PAGE ? `<small class="eq-pg">${Math.floor(n / PER_PAGE) + 1}쪽</small>` : ''}</div>
        ${it.k === 'etc' ? `<label>장비명 <input data-f="name" value="${esc(it.name)}" placeholder="예: 소음계, 풍속계"></label>` : ''}
        <details class="eq-std" ${it.k === 'etc' && !it.std ? 'open' : ''}><summary>법적기준 <span>${esc((it.std || '(입력 필요)').split('\n')[0])}${(it.std || '').includes('\n') ? ' …' : ''}</span></summary>
          <textarea data-f="std" rows="4" placeholder="법적기준을 입력하세요">${esc(it.std)}</textarea>
          ${it.k !== 'etc' ? '<div class="row"><button type="button" class="btn ghost sm" data-stdsave>이 기준을 기본값으로 기억</button><button type="button" class="btn ghost sm" data-stdreset>처음 기준으로</button></div>' : ''}</details>
        ${fieldHTML(it, 'loc', `<input data-f="loc" value="${esc(it.loc)}" placeholder="예: B2 기계실, 102동 지하 PIT">`)}
        ${fieldHTML(it, 'val', `<input data-f="val" value="${esc(it.val)}" placeholder="${esc(it.k === 'etc' ? '측정값' : BYK[it.k].ph)}">`)}
        <div class="eq-judge"><span>판정</span><div class="seg sm">${[['', '표시 안 함'], ['ok', '적합'], ['ng', '부적합']].map(([v, l]) => `<label><input type="radio" name="j${i}" value="${v}" ${it.judge === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
        ${fieldHTML(it, 'note', `<textarea data-f="note" rows="2" placeholder="예: 환기팬 가동 후 작업, 측정 결과 작업일지에 기록">${esc(it.note)}</textarea>`)}
        <div class="eq-photo">${it.photo ? `<img src="${it.photo}" alt="측정 사진">` : '<div class="nophoto">사진 없음</div>'}
          <div class="row"><button type="button" class="btn sm primary" data-shot>${it.photo ? '다시 촬영' : '사진 촬영'}</button><button type="button" class="btn sm ghost" data-gal>앨범에서 선택</button>${it.photo ? '<button type="button" class="btn sm ghost" data-nophoto>사진 빼기</button>' : ''}</div></div>
      </section>`).join('') : '<p class="hint">위에서 측정한 장비를 체크하세요.</p>';
      $$('.eq', box).forEach(sec => {
        const it = t.items[+sec.dataset.i];
        $$('[data-f]', sec).forEach(el => el.oninput = () => {
          it[el.dataset.f] = el.value;
          if (el.dataset.f === 'name') $('.eq-h b', sec).textContent = `${$$('.eq', box).indexOf(sec) + 1}. ${el.value || '기타 장비'}`;
          later();
        });
        $$(`[name=j${sec.dataset.i}]`, sec).forEach(r => r.onchange = () => { it.judge = r.value; later(); });
        $$('[data-past]', sec).forEach(b => b.onclick = () => pickPast(it, b.dataset.past, v => {
          const el = $(`[data-f=${b.dataset.past}]`, sec); el.value = v; it[b.dataset.past] = v; later();
        }));
        const ss = $('[data-stdsave]', sec), sr = $('[data-stdreset]', sec);
        if (ss) ss.onclick = async () => { const map = await stdMap(); map[it.k] = it.std; await DB.put('kv', map, 'measStd'); toast('다음 측정부터 이 기준을 씁니다.'); };
        if (sr) sr.onclick = async () => {
          const map = await stdMap(); delete map[it.k]; await DB.put('kv', map, 'measStd');
          it.std = BYK[it.k].std; await save(t); drawEqs(); toast('처음 기준으로 되돌렸습니다.');
        };
        const take = async cap => {
          const file = await pickFile('image/*', cap); if (!file) return;
          it.photo = await readImage(file, 1400, 0.82); await save(t); drawEqs();
        };
        $('[data-shot]', sec).onclick = () => take('environment');
        $('[data-gal]', sec).onclick = () => take();
        const np = $('[data-nophoto]', sec);
        if (np) np.onclick = async () => { if (!confirm('이 사진을 뺄까요?')) return; it.photo = ''; await save(t); drawEqs(); };
      });
    }
    const fieldHTML = (it, f, input) => `<label class="eq-f"><span>${FIELD[f]} <button type="button" class="btn ghost sm" data-past="${f}">지난 ${FIELD[f]} 불러오기</button></span>${input}</label>`;
    drawEqs();

    $('#make').onclick = async () => {
      clearTimeout(timer);
      const sel = t.items.filter(x => x.on);
      if (!t.site) { toast('현장명을 입력하세요.'); f.site.focus(); return; }
      if (!sel.length) { toast('측정한 장비를 1개 이상 체크하세요.'); return; }
      const etcNo = sel.find(x => x.k === 'etc' && !x.name.trim());
      if (etcNo) { toast('기타 장비의 장비명을 입력하세요.'); return; }
      const empty = sel.filter(x => !x.val.trim()).map(x => x.name);
      if (empty.length && !confirm(`측정값이 비어 있습니다: ${empty.join(', ')}\n그대로 만들까요?`)) return;
      const btn = $('#make'); btn.disabled = true; btn.textContent = '만드는 중…';
      try {
        await save(t);
        await Registry.addSite(t.site);
        await libAdd(sel);
        const res = await build(t);
        t.done = true; await save(t);
        const name = fileName(t);
        $('#out').innerHTML = `<h2 class="h">미리보기 <small>(${res.pages.length}쪽)</small></h2>
          <div class="tbm-prev">${res.pages.map(p => `<img src="${p}" alt="장비측정 결과">`).join('')}</div>
          <div class="save-actions">
            <button class="btn primary" id="sv-pdf">PDF 저장</button>
            <button class="btn" id="sv-share">PDF 공유 (카카오톡·메일 등)</button>
            <button class="btn ghost" id="sv-jpg">이미지(JPG) 저장${res.pages.length > 1 ? ' — 한 장으로 이어붙임' : ''}</button>
          </div>`;
        $('#sv-pdf').onclick = () => downloadBlob(res.pdf, name + '.pdf');
        $('#sv-jpg').onclick = async () => downloadBlob(await dataUrlToBlob(res.image), name + '.jpg');
        $('#sv-share').onclick = () => shareFiles([new File([res.pdf], name + '.pdf', { type: 'application/pdf' })], name);
        $('#out').scrollIntoView({ behavior: 'smooth' });
        btn.textContent = '다시 만들기';
      } catch (e) {
        console.error(e); toast('결과지를 만들지 못했습니다: ' + e.message, 5000); btn.textContent = '결과지 만들기 (PDF·이미지)';
      }
      btn.disabled = false;
    };
  }
  const fileName = t => `장비측정_${(t.site || '현장').replace(/[\\/:*?"<>|]/g, '_')}_${(t.date || '').replace(/-/g, '')}`;

  // ---------- 결과지: A4 한 장에 장비 3개 ----------
  function pageHTML(t, rows, pno, total) {
    const sel = t.items.filter(x => x.on);
    const chk = EQUIP.filter(e => e.k !== 'etc').map(e => `${t.items.find(x => x.k === e.k).on ? '■' : '□'} ${e.n}`)
      .concat(t.items.find(x => x.k === 'etc').on ? [`■ 기타(${esc(t.items.find(x => x.k === 'etc').name)})`] : []);
    return `<div class="ms-page">
      <div class="ms-head"><img class="tb-logo" src="img/brand-logo.png" alt="사람인 안전지도사 사무소"><h1>장비측정 결과</h1></div>
      <table class="tb-t ms-info">
        <colgroup><col style="width:13%"><col style="width:37%"><col style="width:13%"><col></colgroup>
        <tr><th>현장명</th><td>${esc(t.site)}</td><th>측정일</th><td>${esc(fmtDay(t.date))}</td></tr>
        <tr><th>측정자</th><td>${esc(t.inspector || INSPECTOR)}</td><th>측정 장비</th><td>${sel.length}종</td></tr>
        <tr><th>측정 장비</th><td colspan="3" class="ms-chk">${chk.join('&nbsp;&nbsp; ')}</td></tr>
      </table>
      <div class="tb-sec">■ 장비측정</div>
      <table class="tb-t ms-t">
        <colgroup><col style="width:10%"><col style="width:20%"><col style="width:12%"><col style="width:13%"><col style="width:18%"><col></colgroup>
        <tr class="ms-th"><th>장비명</th><th>법적기준</th><th>측정장소</th><th>측정값</th><th>지도사항</th><th>사진</th></tr>
        ${rows.map(it => `<tr class="ms-row">
          <th class="ms-nm">${esc(it.name)}</th>
          <td class="ms-std">${lines(it.std)}</td>
          <td>${lines(it.loc)}</td>
          <td class="ms-val">${lines(it.val)}${it.judge ? `<div class="ms-j ${it.judge}">${JUDGE[it.judge]}</div>` : ''}</td>
          <td>${lines(it.note)}</td>
          <td class="ms-ph">${it.photo ? `<img src="${it.photo}">` : ''}</td></tr>`).join('')}
      </table>
      <div class="tb-foot"><span>사람인안전지도사사무소</span><span>${total > 1 ? `${pno} / ${total}쪽 · ` : ''}안전지도 앱으로 작성</span></div>
    </div>`;
  }
  async function build(t) {
    const sel = t.items.filter(x => x.on);
    const chunks = [];
    for (let i = 0; i < sel.length; i += PER_PAGE) chunks.push(sel.slice(i, i + PER_PAGE));
    const root = document.createElement('div');
    root.className = 'rp-root';
    document.body.appendChild(root);
    const pages = [], canvases = [];
    try {
      for (let p = 0; p < chunks.length; p++) {
        root.innerHTML = pageHTML(t, chunks[p], p + 1, chunks.length);
        const page = $('.ms-page', root);
        await Promise.all([...root.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 4000); })));
        // 사진은 크기를 맞추기 전까지 숨겨 둔다 (원본 크기로 칸이 늘어나는 것 방지)
        const photos = $$('.ms-ph img', page);
        photos.forEach(img => { img.style.display = 'none'; });
        // 행 높이: 남은 높이를 장비 3칸으로 고르게 (장비가 적어도 칸 크기는 같게 → 위에서부터 채움)
        const tbl = $('.ms-t', page), head = $('.ms-th', page), foot = $('.tb-foot', page);
        const avail = foot.offsetTop - tbl.offsetTop - head.offsetHeight - 8;
        const rowH = Math.floor(avail / PER_PAGE);
        $$('.ms-row', page).forEach(r => { r.style.height = rowH + 'px'; });
        // 글씨가 칸을 넘치면 조금씩 줄인다
        for (let fs = 13.5; [...$$('.ms-row', page)].some(r => r.offsetHeight > rowH + 1) && fs > 8.5; fs -= 0.5) tbl.style.fontSize = fs + 'px';
        // 사진: 칸에 비율대로 맞춘다 (html2canvas는 object-fit을 지원하지 않음)
        $$('.ms-ph', page).forEach(cell => {
          const img = $('img', cell); if (!img || !img.naturalWidth) return;
          const bw = cell.clientWidth - 10, bh = rowH - 12;
          const s = Math.min(bw / img.naturalWidth, bh / img.naturalHeight);
          img.style.width = Math.round(img.naturalWidth * s) + 'px';
          img.style.height = Math.round(img.naturalHeight * s) + 'px';
          img.style.display = 'inline-block';
        });
        const c = await html2canvas(page, { scale: 2, backgroundColor: '#ffffff', logging: false, scrollX: -window.scrollX, scrollY: -window.scrollY });
        canvases.push(c);
        pages.push(c.toDataURL('image/jpeg', 0.9));
      }
    } finally {
      root.remove();
    }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    pages.forEach((img, i) => { if (i) pdf.addPage(); pdf.addImage(img, 'JPEG', 0, 0, 210, 297); });
    // 이미지: 여러 쪽이면 세로로 이어붙여 한 파일로
    let image = pages[0];
    if (canvases.length > 1) {
      const W = canvases[0].width, gap = 16;
      const H = canvases.reduce((h, c) => h + c.height, 0) + gap * (canvases.length - 1);
      const s = Math.min(1, 12000 / H); // 너무 긴 이미지는 줄인다
      const big = document.createElement('canvas');
      big.width = Math.round(W * s); big.height = Math.round(H * s);
      const ctx = big.getContext('2d');
      ctx.fillStyle = '#c8ccd0'; ctx.fillRect(0, 0, big.width, big.height);
      let y = 0;
      for (const c of canvases) { ctx.drawImage(c, 0, Math.round(y * s), Math.round(c.width * s), Math.round(c.height * s)); y += c.height + gap; }
      image = big.toDataURL('image/jpeg', 0.88);
    }
    return { pdf: pdf.output('blob'), image, pages };
  }

  return { list, create, view: view_, card, build, EQUIP };
})();
