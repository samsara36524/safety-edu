// TBM(작업 전 안전점검회의) 일지: 기본정보 → 위험요인 3개 → 안내 → 리더·작업자 서명 → 사진(선택 양식) → A4 한 장 PDF
// 기록은 교육 기록과 같은 저장소(sessions)에 kind: 'tbm' 으로 저장한다.
const TBM = (() => {
  const STEPS = ['기본정보', '위험요인', '안내', '서명', '사진', '결과'];
  const LEADER0 = { org: '사람인안전지도사사무소', pos: '지도요원', name: '이남석' };
  const APPROVERS = ['관리감독자', '안전보건관리책임자'];
  const WEATHER = ['맑음', '구름', '흐림', '비', '눈', '바람', '안개', '폭염', '한파'];
  // 근로자 안전의식 자가진단 (TBM 근로자 안전의식 자가진단 체크리스트)
  const SELF = [
    ['위험인지', '금일 작업에 대한 위험요인과 안전대책에 대해 대화하고 숙지하였다.'],
    ['위험인지', '금일 작업(혹은 유사작업)에서 발생한 안전사고 발생 사례를 공유받았다.'],
    ['위험인지', '금일 작업 내용, 작업방법, 작업 물량(범위) 및 필요한 안전보호구를 잘 알고 있다.'],
    ['개인안전', '음주, 발열, 약물복용 등으로 금일 작업에 적합한 건강상태인지 확인하였다.'],
    ['개인안전', '개인보호구를 지급받고 점검하였다.'],
    ['개인안전', '현장 위험요인 및 불안전한 상태 발견 시 멈추고, 확인하고, 생각한 후 작업하도록 하였다.'],
    ['개인안전', '비상시 행동요령을 숙지하였다.'],
    ['올바른 TBM 정착', 'TBM 중 작업자가 제기한 불만사항, 질문, 제안 사항을 검토하고 반영한지 확인하였다.']
  ];
  const CIRC = ['①', '②', '③'];
  const ANS = { y: '네', n: '아니요', x: '해당없음' };
  const pad2 = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const nowHM = (add = 0) => { const d = new Date(Date.now() + add * 60000); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  function fmtDay(ymd) {
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-').map(Number);
    const w = '일월화수목금토'[new Date(y, m - 1, d).getDay()];
    return `${y}년 ${m}월 ${d}일 (${w})`;
  }
  const when = t => `${fmtDay(t.date)} ${t.start || ''}${t.end ? ' ~ ' + t.end : ''}`;
  const save = t => { t.updated = Date.now(); return DB.put('sessions', t); };
  const all = async () => (await DB.all('sessions').catch(() => [])).filter(x => x.kind === 'tbm').sort((a, b) => b.created - a.created);

  // ---------- 위험요인 목록: 내가 쓴 것 + 기본 교육자료 사고사례 ----------
  async function libAdd(haz) {
    const lib = (await DB.get('kv', 'tbmLib').catch(() => null)) || [];
    for (const z of haz) {
      if (!z.h) continue;
      const it = lib.find(x => x.h === z.h);
      if (it) { it.m = z.m || it.m; it.n++; it.at = Date.now(); } else lib.push({ h: z.h, m: z.m, n: 1, at: Date.now() });
    }
    await DB.put('kv', lib.sort((a, b) => b.n - a.n || b.at - a.at).slice(0, 200), 'tbmLib');
  }
  async function libItems() {
    const mine = ((await DB.get('kv', 'tbmLib').catch(() => null)) || []).map(x => ({ h: x.h, m: x.m, g: '내가 쓴 위험요인', tag: `${x.n}회` }));
    const base = [];
    for (const t of Store.topics) (t.cases || []).forEach((c, i) => base.push({ h: c, m: (t.rules || [])[i] || (t.rules || [])[0] || '', g: t.title, tag: t.cat, alt: t.rules || [] }));
    return [...mine, ...base];
  }
  function pickHazard(onPick) {
    const m = modal(`<h2>위험요인 고르기</h2>
      <input class="hz-q" placeholder="검색 (예: 비계, 추락, ㅂㄱ)">
      <div class="hz-list"></div>`, { wide: true });
    const q = $('.hz-q', m.el), box = $('.hz-list', m.el);
    let items = [];
    const draw = () => {
      // 작업명·위험요인이 검색어(또는 초성)로 시작하는 것을 위로
      const qn = q.value.replace(/\s+/g, '').toLowerCase();
      const starts = s => { const v = String(s).replace(/\s+/g, '').toLowerCase(); return v.startsWith(qn) || Search.chosung(v).startsWith(qn); };
      const rank = x => !qn ? 0 : starts(x.g) ? 0 : starts(x.h) ? 1 : 2;
      const list = items.map((x, i) => [x, i]).filter(([x]) => Search.match(x.h + ' ' + x.g + ' ' + (x.tag || ''), q.value))
        .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([x]) => x).slice(0, 80);
      let g = null;
      box.innerHTML = list.length ? list.map((x, i) => `${x.g !== g ? `<h3>${esc(g = x.g)}</h3>` : ''}<button type="button" data-i="${items.indexOf(x)}"><b>${esc(x.h)}</b><span>대책: ${esc(x.m || '-')}</span></button>`).join('') : '<p class="hint">찾는 위험요인이 없습니다. 창을 닫고 직접 입력하세요.</p>';
      $$('[data-i]', box).forEach(b => b.onclick = () => { m.close(); onPick(items[+b.dataset.i]); });
    };
    libItems().then(x => { items = x; draw(); });
    q.addEventListener('input', draw);
    setTimeout(() => q.focus(), 50);
  }

  // ---------- 목록 ----------
  function card(t) {
    const steps = t.photoMode === false ? STEPS.filter(x => x !== '사진') : STEPS;
    return `<a class="card" href="#/t/${t.id}/${t.step || 0}">
      <b><span class="cat c-tbm">TBM</span>${esc(t.site || '(현장명 없음)')}</b>
      <span>${esc(when(t))} · ${esc(t.work || '')}</span>
      <span class="badge ${t.done ? 'ok' : ''}">${t.done ? '완료' : STEPS[t.step || 0] + ' 단계'} · 서명 ${t.workers.length}/${MAX_WORKERS} · ${t.photoMode === false ? '사진 없는 양식' : '사진 포함 양식'}</span></a>`;
  }
  async function list() {
    const items = await all();
    view().innerHTML = `<div class="bar"><h1>TBM 일지</h1><a class="btn primary" href="#/tbm/new">＋ TBM 시작</a></div>
      <p class="hint">작업 전 안전점검회의(TBM) 결과를 기록하고, 작업자 서명과 사진을 받아 A4 한 장 PDF로 시공사에 전달합니다.</p>
      ${items.length ? `<div class="cards">${items.map(t => `<div class="rec">${card(t)}<div class="row"><button class="btn ghost sm" data-copy="${t.id}">이 내용으로 새 TBM</button><button class="btn ghost sm" data-del="${t.id}">삭제</button></div></div>`).join('')}</div>` : '<p class="hint">아직 TBM 기록이 없습니다.</p>'}`;
    $$('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('이 TBM 기록을 삭제할까요? (저장해 둔 PDF는 지워지지 않습니다)')) return;
      await DB.del('sessions', b.dataset.del); list();
    });
    $$('[data-copy]').forEach(b => b.onclick = async () => create(null, await DB.get('sessions', b.dataset.copy)));
  }

  // 지난 TBM에서 다시 쓸 내용
  const carry = p => ({
    place: p.place, work: p.work, detail: p.detail, ra: p.ra, photoMode: p.photoMode, self: p.self,
    haz: (p.haz || []).map(z => ({ h: z.h, m: z.m, ok: 'y', fix: '' })), focus: p.focus, notice: p.notice, leader: Object.assign({}, p.leader, { sig: '' }) // 리더 서명은 매번 새로 (서명 창에서 이전 서명을 한 번에 불러올 수 있음)
  });
  async function create(siteArg, from) {
    const leader = (await DB.get('kv', 'tbmLeader').catch(() => null)) || LEADER0;
    const site = from ? from.site : siteArg ? decodeURIComponent(siteArg) : '';
    const reg = site ? await Registry.site(site) : null;
    const t = {
      id: uid(10), kind: 'tbm', created: Date.now(), step: 0, done: false,
      site: reg ? reg.name : site, place: reg ? reg.place : '', date: today(), start: nowHM(), end: nowHM(10), weather: '맑음',
      work: '', detail: '', ra: 'y', photoMode: true, self: false,
      haz: [0, 1, 2].map(() => ({ h: '', m: '', ok: 'y', fix: '' })), focus: 0,
      notice: '', check: '', opinion: '', after: '',
      leader: Object.assign({}, leader, { sig: '' }), workers: [], photo: ''
    };
    if (from) Object.assign(t, carry(from));
    await save(t);
    location.replace(`#/t/${t.id}/0`);
  }

  // ---------- 진행 화면 ----------
  async function view_(id, stepStr) {
    const t = await DB.get('sessions', id);
    if (!t || t.kind !== 'tbm') { view().innerHTML = '<p>TBM 기록을 찾을 수 없습니다.</p><a class="btn" href="#/tbm">TBM 목록</a>'; return; }
    let step = Math.min(5, +(stepStr || 0));
    if (step === 4 && t.photoMode === false) step = 5;
    if (t.step !== step) { t.step = step; await save(t); }
    const shown = STEPS.map((n, i) => [n, i]).filter(([, i]) => !(i === 4 && t.photoMode === false));
    view().innerHTML = `<nav class="steps tbm-steps">${shown.map(([n, i], k) => `<a href="#/t/${t.id}/${i}" class="${i === step ? 'on' : ''} ${i < step ? 'past' : ''}"><i>${k + 1}</i>${n}</a>`).join('')}</nav><div id="stepbody"></div>`;
    const body = $('#stepbody');
    const go = i => { location.hash = `#/t/${t.id}/${i}`; };
    const prevOf = i => (i === 5 && t.photoMode === false ? 3 : i - 1);
    const nextOf = i => (i === 3 && t.photoMode === false ? 5 : i + 1);
    const nav = (prev, next, label = '다음 →') => `<div class="row sticky-actions">${prev !== null ? `<button class="btn ghost" data-go="${prev}">← 이전</button>` : ''}${next !== null ? `<button class="btn primary" data-go="${next}">${label}</button>` : ''}</div>`;
    const bindNav = before => $$('[data-go]', body).forEach(b => b.onclick = async () => { if (before && (await before(+b.dataset.go)) === false) return; go(+b.dataset.go); });

    // 0. 기본정보
    if (step === 0) {
      const prev = (await all()).find(x => x.id !== t.id && x.site && x.site === t.site);
      body.innerHTML = `<form class="form" id="f0">
        <label>현장명<input name="site" required value="${esc(t.site)}" placeholder="현장명 입력 또는 검색 (초성 검색 가능)"></label>
        <div id="prevbox"></div>
        <div class="grid2"><label>TBM 장소 <input name="place" value="${esc(t.place)}" placeholder="예: 아침 조회장, B3 UPS실"></label>
          <label>날씨 <input name="weather" list="wlist" value="${esc(t.weather)}"><datalist id="wlist">${WEATHER.map(w => `<option value="${w}">`).join('')}</datalist></label></div>
        <div class="grid3"><label>TBM 날짜 <input name="date" type="date" value="${esc(t.date)}"></label>
          <label>시작 <input name="start" type="time" value="${esc(t.start)}"></label>
          <label>종료 <input name="end" type="time" value="${esc(t.end)}"></label></div>
        <label>작업명 <input name="work" value="${esc(t.work)}" placeholder="예: 소방시설(기계·전기) 설치공사"></label>
        <label>금일 작업내용 <textarea name="detail" rows="3" placeholder="예: 102동 지상 21층~최상층 입상배관 양중 및 설치">${esc(t.detail)}</textarea></label>
        <fieldset><legend>위험성평가</legend><div class="seg">
          <label><input type="radio" name="ra" value="y" ${t.ra !== 'n' ? 'checked' : ''}><span>실시</span></label>
          <label><input type="radio" name="ra" value="n" ${t.ra === 'n' ? 'checked' : ''}><span>미실시</span></label></div></fieldset>
        <fieldset><legend>양식</legend><div class="seg">
          <label><input type="radio" name="pm" value="1" ${t.photoMode !== false ? 'checked' : ''}><span>사진 포함 양식</span></label>
          <label><input type="radio" name="pm" value="0" ${t.photoMode === false ? 'checked' : ''}><span>사진 없는 양식</span></label></div>
          <label class="confirm"><input type="checkbox" name="self" ${t.self ? 'checked' : ''}><span>작업자 안전의식 자가진단(8문항)도 받기</span></label></fieldset>
        <fieldset><legend>TBM 리더</legend><div class="grid3">
          <label>소속 <input name="lorg" value="${esc(t.leader.org)}"></label>
          <label>직책 <input name="lpos" value="${esc(t.leader.pos)}"></label>
          <label>성명 <input name="lname" required value="${esc(t.leader.name)}"></label></div>
          <p class="hint">바꾼 리더 정보는 다음 TBM에도 그대로 쓰입니다. 서명은 서명 단계에서 받습니다.</p></fieldset>
      </form>` + nav(null, 1);
      const f = $('#f0');
      const drawPrev = async () => {
        const p = (await all()).find(x => x.id !== t.id && Registry.norm(x.site) === Registry.norm(f.site.value) && f.site.value.trim());
        $('#prevbox').innerHTML = p ? `<div class="prevtbm"><span>이 현장의 지난 TBM: <b>${esc(fmtDay(p.date))}</b> · ${esc(p.work || '')}</span><button type="button" class="btn sm" id="loadprev">지난 TBM 불러오기</button></div>` : '';
        if (p) $('#loadprev').onclick = async () => {
          Object.assign(t, carry(p), { site: f.site.value.trim() });
          await save(t); toast('지난 TBM 내용을 불러왔습니다. 위험요인도 함께 채웠습니다.'); view_(t.id, 0);
        };
      };
      siteField(f.site, st => { if (st.place && !f.place.value) f.place.value = st.place; drawPrev(); });
      f.site.addEventListener('input', drawPrev);
      if (prev || t.site) drawPrev();
      bindNav(async () => {
        const fd = new FormData(f);
        if (!fd.get('site').trim()) { toast('현장명을 입력하세요.'); return false; }
        if (!fd.get('lname').trim()) { toast('TBM 리더 성명을 입력하세요.'); return false; }
        const lname = fd.get('lname').trim();
        if (lname !== t.leader.name) t.leader.sig = '';
        Object.assign(t, {
          site: fd.get('site').trim(), place: fd.get('place').trim(), weather: fd.get('weather').trim(), date: fd.get('date'),
          start: fd.get('start'), end: fd.get('end'), work: fd.get('work').trim(), detail: fd.get('detail').trim(), ra: fd.get('ra'),
          photoMode: fd.get('pm') === '1', self: !!fd.get('self')
        });
        Object.assign(t.leader, { org: fd.get('lorg').trim(), pos: fd.get('lpos').trim(), name: lname });
        await save(t);
        await DB.put('kv', { org: t.leader.org, pos: t.leader.pos, name: t.leader.name }, 'tbmLeader');
        await Registry.addSite(t.site, t.place);
      });
      return;
    }

    // 1. 위험요인 3개 + 중점위험 + 안전조치 확인
    if (step === 1) {
      body.innerHTML = `<p class="hint">금일 작업의 <b>잠재위험요인 3개</b>와 대책을 넣고, 그중 1개를 <b>중점위험요인</b>으로 고르세요. 대책은 <b>제거 → 대체 → 통제</b> 순서로 고려합니다.</p>
        ${t.haz.map((z, i) => `<section class="hz" data-i="${i}">
          <div class="bar"><h2>${CIRC[i]} 잠재위험요인</h2><button type="button" class="btn sm" data-pick="${i}">목록에서 고르기</button></div>
          <textarea class="hz-h" rows="2" placeholder="예: 말비계 발판에 자재를 올려놓아 걸려 넘어져 떨어짐">${esc(z.h)}</textarea>
          <label>대책 <textarea class="hz-m" rows="2" placeholder="예: 말비계 상부 발판에 자재·공구 적재 금지">${esc(z.m)}</textarea></label>
          <div class="hz-opts">
            <label class="chip"><input type="radio" name="focus" value="${i}" ${t.focus === i ? 'checked' : ''}><span>★ 중점위험으로 선정</span></label>
            <span class="hz-ok">작업 전 조치 <label class="chip"><input type="radio" name="ok${i}" value="y" ${z.ok !== 'n' ? 'checked' : ''}><span>예</span></label><label class="chip"><input type="radio" name="ok${i}" value="n" ${z.ok === 'n' ? 'checked' : ''}><span>아니오</span></label></span>
          </div>
          <input class="hz-fix ${z.ok === 'n' ? '' : 'hide'}" placeholder="'아니오'인 경우 조치 내용" value="${esc(z.fix || '')}">
        </section>`).join('')}` + nav(0, 2);
      const read = () => $$('.hz', body).forEach(sec => {
        const i = +sec.dataset.i, z = t.haz[i];
        z.h = $('.hz-h', sec).value.trim(); z.m = $('.hz-m', sec).value.trim();
        z.ok = $(`[name=ok${i}]:checked`, sec).value; z.fix = $('.hz-fix', sec).value.trim();
      });
      $$('.hz', body).forEach(sec => {
        const i = +sec.dataset.i;
        $$(`[name=ok${i}]`, sec).forEach(r => r.onchange = () => $('.hz-fix', sec).classList.toggle('hide', r.value !== 'n' || !r.checked));
      });
      $$('[data-pick]', body).forEach(b => b.onclick = () => pickHazard(it => {
        const sec = b.closest('.hz');
        $('.hz-h', sec).value = it.h; $('.hz-m', sec).value = it.m || '';
        if (it.alt && it.alt.length > 1) toast('대책은 자료의 안전수칙에서 가져왔습니다. 현장에 맞게 고치세요.', 3500);
      }));
      bindNav(async to => {
        read();
        const fc = $('[name=focus]:checked', body);
        t.focus = fc ? +fc.value : 0;
        if (to > 1) {
          if (t.haz.some(z => !z.h || !z.m)) { toast('위험요인 3개와 대책을 모두 입력하세요.'); await save(t); return false; }
          await libAdd(t.haz);
        }
        await save(t);
      });
      return;
    }

    // 2. 안내 (큰 글씨 화면) + 전달사항
    if (step === 2) {
      body.innerHTML = `<div class="bar"><p class="hint">작업자에게 이 화면을 보여주며 설명하세요.</p><button class="btn primary" id="fs">▶ 전체화면</button></div>
        <section class="brief" id="brief">${briefHTML(t)}</section>
        <form class="form" id="f2">
          <label>전달사항 <small>(금일 작업 안내, 작업구역·휴식시간, 비상연락 등)</small><textarea name="notice" rows="3">${esc(t.notice)}</textarea></label>
          <label>작업 전 일일 안전점검 결과 <small>(조치되지 않은 사항, 작업자 TBM 숙지 여부 등)</small><textarea name="check" rows="2">${esc(t.check)}</textarea></label>
        </form>` + nav(1, 3);
      $('#fs').onclick = () => {
        const el = $('#brief');
        el.classList.add('full');
        const exit = () => { el.classList.remove('full'); document.removeEventListener('fullscreenchange', onfs); };
        const onfs = () => { if (!document.fullscreenElement) exit(); };
        if (el.requestFullscreen) el.requestFullscreen().then(() => document.addEventListener('fullscreenchange', onfs)).catch(() => {});
        el.onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else exit(); };
      };
      $('#f2').notice.oninput = e => { t.notice = e.target.value; };
      bindNav(async () => { const f = $('#f2'); t.notice = f.notice.value.trim(); t.check = f.check.value.trim(); await save(t); });
      return;
    }

    // 3. 서명 (TBM 리더 + 작업자 6명)
    if (step === 3) {
      body.innerHTML = `<h2 class="h">TBM 리더 확인</h2>
        <div class="leader" id="leader"></div>
        <h2 class="h">작업자 서명 <span id="cnt"></span></h2>
        <p class="hint">작업자 ${MAX_WORKERS}명까지 서명을 받습니다. 작업자는 폰으로 QR을 찍어 위험요인·대책을 확인하고 서명합니다.${t.self ? ' 자가진단 8문항도 함께 답합니다.' : ''}</p>
        <div class="sig-actions">
          <button class="btn primary" id="a-qr">현장 QR 보여주기</button>
          <button class="btn" id="a-scan">결과 QR 스캔</button>
          <button class="btn" id="a-dev">이 기기에서 서명</button>
          <button class="btn ghost" id="a-paste">결과 코드 붙여넣기</button>
        </div>
        <ol class="sig-list" id="sl"></ol>
        <div id="known"></div>` + nav(2, nextOf(3));
      const drawLeader = () => {
        const L = t.leader;
        $('#leader').innerHTML = `<div><b>${esc(L.name)}</b><span>${esc([L.org, L.pos].filter(Boolean).join(' · '))}</span></div>
          ${L.sig ? `<img src="${Sig.toImage(L.sig, 250, 100)}" alt="리더 서명">` : '<span class="nosig">서명 전</span>'}
          <button class="btn ${L.sig ? 'ghost' : 'primary'} sm" id="lsign">${L.sig ? '다시 서명' : '리더 서명'}</button>`;
        $('#lsign').onclick = () => {
          const m = modal(`<h2>TBM 리더 서명</h2><form class="form wform">
            <label>성명 <input name="name" value="${esc(L.name)}" readonly class="fixed"></label>
            <div class="sigwrap"><span>서명</span><canvas class="sigpad"></canvas><button type="button" class="btn ghost sm" data-clr>다시 쓰기</button></div>
            <button class="btn big primary" type="submit">서명 저장</button></form>`, { wide: true });
          const pad = Sig.pad($('canvas', m.el));
          const getUsed = attachPastSigs(m.el, $('[name=name]', m.el), pad);
          bindWorkerForm(m.el, pad, async ({ sig }) => {
            const used = getUsed();
            L.sig = used || sig;
            await save(t);
            await Registry.addSig(L.name, L.sig, t.site, Date.now());
            m.close(); drawLeader(); toast('리더 서명을 저장했습니다.');
          });
        };
      };
      drawLeader();
      const render = async () => {
        $('#cnt').textContent = `${t.workers.length} / ${MAX_WORKERS}`;
        $('#sl').innerHTML = t.workers.length ? t.workers.map((w, i) => `<li><img src="${Sig.toImage(w.sig, 250, 100)}"><div><b>${esc(w.name)}</b><span>${esc(w.via)} · ${esc(Report.fmtDate(new Date(w.at * 1000).toISOString()))}${w.q ? ' · 자가진단 ' + esc(selfSummary(w.q)) : ''}</span></div><button class="btn ghost sm" data-del="${i}">삭제</button></li>`).join('')
          : '<li class="empty">아직 받은 서명이 없습니다.</li>';
        $$('[data-del]', body).forEach(b => b.onclick = async () => {
          if (!confirm('이 서명을 삭제할까요?')) return;
          t.workers.splice(+b.dataset.del, 1); await save(t); render();
        });
        const known = await Registry.people(t.site);
        const done = new Set(t.workers.map(w => w.name));
        $('#known').innerHTML = known.length ? `<h2 class="h">이 현장 등록 근로자 <small>(누르면 바로 서명)</small></h2>
          <div class="people">${known.map(n => `<button class="pchip ${done.has(n) ? 'done' : ''}" data-n="${esc(n)}">${esc(n)}${done.has(n) ? ' ✔' : ''}</button>`).join('')}</div>` : '';
        $$('#known [data-n]').forEach(b => b.onclick = () => {
          if (done.has(b.dataset.n)) { toast(`${b.dataset.n} 님은 이미 서명했습니다.`); return; }
          devSign(b.dataset.n);
        });
      };
      const full = () => { if (t.workers.length >= MAX_WORKERS) { toast(`서명은 ${MAX_WORKERS}명까지 받을 수 있습니다.`); return true; } return false; };
      const reload = async () => { Object.assign(t, await DB.get('sessions', t.id)); render(); };
      $('#a-qr').onclick = async () => {
        if (full()) return;
        const url = await inviteLink(t);
        const m = modal(`<h2>작업자 QR</h2><p class="hint">작업자가 휴대폰 카메라로 QR을 찍으면 TBM 화면이 열립니다. 서명을 마치면 작업자 화면에 <b>결과 QR</b>이 나오니, [결과 QR 스캔]으로 받으세요.</p>
          <div class="qrbox">${QR.svg(url)}</div><div class="row center"><button class="btn ghost" id="cp">링크 복사</button></div>`, { wide: true });
        $('#cp', m.el).onclick = () => copyText(url);
      };
      $('#a-scan').onclick = () => {
        if (full()) return;
        const m = modal(`<h2>결과 QR 스캔</h2><p class="hint">작업자 휴대폰에 표시된 결과 QR을 비추세요.</p><video class="scan" muted></video>`, { wide: true, onClose: () => sc.stop() });
        const sc = QR.scan($('video', m.el), async text => {
          sc.stop(); m.close();
          const r = await importCode(text, t.id); toast(r.msg, 3500);
          if (r.ok) reload();
        });
        sc.start().catch(e => { m.close(); toast('카메라를 열 수 없습니다: ' + e.message, 4000); });
      };
      $('#a-paste').onclick = () => {
        const m = modal(`<h2>결과 코드 붙여넣기</h2><p class="hint">작업자 결과 링크 전체나 코드를 붙여넣으세요.</p><textarea id="pc" rows="5"></textarea><div class="row"><button class="btn primary" id="pok">가져오기</button></div>`);
        $('#pok', m.el).onclick = async () => {
          const r = await importCode($('#pc', m.el).value, t.id); toast(r.msg, 3500);
          if (r.ok) { m.close(); reload(); }
        };
      };
      const devSign = async (preName = '') => {
        if (full()) return;
        const known = await Registry.people(t.site);
        const m = modal(`<h2>작업자 확인 및 서명</h2>${workerFormHTML(t.haz, t.focus, t.self)}`, { wide: true });
        const pad = Sig.pad($('canvas', m.el));
        const nameIn = $('[name=name]', m.el);
        nameIn.value = preName;
        attachNameSearch(nameIn, known, t.workers.map(w => w.name));
        const getUsed = attachPastSigs(m.el, nameIn, pad);
        bindWorkerForm(m.el, pad, async ({ name, sig }) => {
          if (t.workers.some(w => w.name === name) && !confirm(`${name} 님은 이미 서명했습니다. 한 번 더 받을까요?`)) return;
          const used = getUsed();
          const reuse = !!used && (await Registry.sigs(name)).some(x => x.g === used);
          if (reuse) sig = used;
          const at = Math.floor(Date.now() / 1000);
          const q = t.self ? readSelf(m.el) : '';
          t.workers.push(Object.assign({ name, sig, at, via: reuse ? '현장(이전 서명)' : '현장(지도요원 기기)' }, q ? { q } : {}));
          await save(t);
          await Registry.addPeople(t.site, [name]);
          await Registry.addSig(name, sig, t.site, at * 1000);
          m.close(); render(); toast(`${name} 님 서명을 저장했습니다.`);
        });
      };
      $('#a-dev').onclick = () => devSign();
      render(); bindNav();
      return;
    }

    // 4. 사진 (사진 포함 양식)
    if (step === 4) {
      body.innerHTML = `<p class="hint">TBM 장면 사진 1장을 촬영하세요. (사진 포함 양식은 필수)</p>
        <div class="photo-area">${t.photo ? `<img src="${t.photo}">` : '<div class="nophoto">사진 없음</div>'}</div>
        <div class="row center"><button class="btn primary" id="shot">${t.photo ? '다시 촬영' : '사진 촬영'}</button><button class="btn ghost" id="gal">앨범에서 선택</button></div>` + nav(3, 5);
      const take = async cap => {
        const file = await pickFile('image/*', cap); if (!file) return;
        t.photo = await readImage(file, 1600, 0.85); await save(t); view_(t.id, 4);
      };
      $('#shot').onclick = () => take('environment');
      $('#gal').onclick = () => take();
      bindNav();
      return;
    }

    // 5. 결과
    if (step === 5) {
      const warn = [];
      if (t.photoMode !== false && !t.photo) warn.push('TBM 사진이 없습니다. (사진 포함 양식은 필수)');
      if (!t.leader.sig) warn.push('TBM 리더 서명이 없습니다.');
      if (!t.workers.length) warn.push('작업자 서명이 없습니다.');
      if (t.haz.some(z => !z.h)) warn.push('잠재위험요인이 3개 모두 입력되지 않았습니다.');
      const blocked = t.photoMode !== false && !t.photo;
      body.innerHTML = `<div class="summary">
          <div><b>${esc(t.site)}</b><span>${esc(when(t))} · ${esc(t.work)}</span></div>
          <div class="stats"><span>양식 <b>${t.photoMode === false ? '사진 없음' : '사진 포함'}</b></span><span>위험요인 <b>${t.haz.filter(z => z.h).length}/3</b></span><span>리더 서명 <b>${t.leader.sig ? '✔' : '—'}</b></span><span>작업자 <b>${t.workers.length}/${MAX_WORKERS}</b></span></div>
          ${warn.length ? `<ul class="warn">${warn.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
        </div>
        <form class="form" id="f5">
          <label>근로자 의견 <small>(선택)</small><textarea name="opinion" rows="2">${esc(t.opinion)}</textarea></label>
          <label>작업 후 종료 미팅 (중점대책의 실효성) <small>(비우면 PDF에 수기용 빈칸)</small><textarea name="after" rows="2">${esc(t.after)}</textarea></label>
        </form>
        <div class="row center"><button class="btn big primary" id="make" ${blocked ? 'disabled' : ''}>TBM 일지 PDF 만들기</button></div>
        <div id="out"></div>` + nav(prevOf(5), null);
      bindNav(async () => { const f = $('#f5'); t.opinion = f.opinion.value.trim(); t.after = f.after.value.trim(); await save(t); });
      $('#make').onclick = async () => {
        const btn = $('#make'); btn.disabled = true; btn.textContent = '만드는 중…';
        try {
          const f = $('#f5'); t.opinion = f.opinion.value.trim(); t.after = f.after.value.trim();
          const res = await build(t);
          t.done = true; await save(t);
          const name = fileName(t);
          $('#out').innerHTML = `<h2 class="h">미리보기</h2><div class="tbm-prev"><img src="${res.image}" alt="TBM 일지"></div>
            <div class="save-actions">
              <button class="btn primary" id="sv-pdf">PDF 저장</button>
              <button class="btn" id="sv-share">PDF 공유 (카카오톡·메일 등)</button>
              <button class="btn ghost" id="sv-jpg">이미지(JPG) 저장</button>
            </div>
            <p class="hint">시공사는 PDF를 출력해 결재칸(관리감독자·안전보건관리책임자)에 수기로 결재합니다.</p>`;
          $('#sv-pdf').onclick = () => downloadBlob(res.pdf, name + '.pdf');
          $('#sv-jpg').onclick = async () => downloadBlob(await dataUrlToBlob(res.image), name + '.jpg');
          $('#sv-share').onclick = async () => {
            const file = new File([res.pdf], name + '.pdf', { type: 'application/pdf' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              try { await navigator.share({ files: [file], title: name }); } catch (e) { if (e.name !== 'AbortError') toast('공유 실패: ' + e.message); }
            } else toast('이 브라우저는 파일 공유를 지원하지 않습니다. PDF 저장을 이용하세요.');
          };
          btn.textContent = '다시 만들기';
        } catch (e) {
          console.error(e); toast('PDF를 만들지 못했습니다: ' + e.message, 5000); btn.textContent = 'TBM 일지 PDF 만들기';
        }
        btn.disabled = false;
      };
    }
  }
  const fileName = t => `TBM일지_${(t.site || '현장').replace(/[\\/:*?"<>|]/g, '_')}_${(t.date || '').replace(/-/g, '')}${t.start ? '-' + t.start.replace(':', '') : ''}`;

  // 안내 화면 (큰 글씨)
  function briefHTML(t) {
    return `<h2>${esc(t.site)} <small>${esc(when(t))}</small></h2>
      ${t.work || t.detail ? `<div class="b-work"><b>금일 작업</b><p>${esc(t.work)}${t.detail ? '<br>' + esc(t.detail).replace(/\n/g, '<br>') : ''}</p></div>` : ''}
      <ol class="b-haz">${t.haz.map((z, i) => `<li class="${t.focus === i ? 'focus' : ''}">${t.focus === i ? '<em>★ 중점위험</em>' : ''}<b>${CIRC[i]} ${esc(z.h || '(미입력)')}</b><span>대책: ${esc(z.m || '')}</span></li>`).join('')}</ol>
      ${t.notice ? `<div class="b-work"><b>전달사항</b><p>${esc(t.notice).replace(/\n/g, '<br>')}</p></div>` : ''}`;
  }

  // ---------- 작업자 확인 양식 ----------
  function workerFormHTML(haz, focus, self) {
    return `<form class="form wform">
      <fieldset><legend>금일 위험요인과 대책 — 확인하고 체크하세요</legend>
        ${haz.map((z, i) => `<label class="confirm"><input type="checkbox" required data-c="${i}"><span><b>${CIRC[i]} ${esc(z.h)}</b>${focus === i ? ' <em class="fx">★중점</em>' : ''}<br><small>대책: ${esc(z.m)}</small></span></label>`).join('')}
      </fieldset>
      ${self ? `<fieldset class="selfchk"><legend>안전의식 자가진단</legend>
        ${SELF.map(([g, q], i) => `<div class="sq"><span><small>${esc(g)}</small> ${i + 1}. ${esc(q)}</span><div class="seg sm">${Object.entries(ANS).map(([v, l]) => `<label><input type="radio" name="sq${i}" value="${v}" required><span>${l}</span></label>`).join('')}</div></div>`).join('')}
      </fieldset>` : ''}
      <label>이름 <input name="name" required autocomplete="name" placeholder="성명"></label>
      <div class="sigwrap"><span>서명 <small>(아래 칸에 손가락으로 서명)</small></span><canvas class="sigpad"></canvas><button type="button" class="btn ghost sm" data-clr>다시 쓰기</button></div>
      <button class="btn big primary" type="submit">확인 및 서명 완료</button>
    </form>`;
  }
  const readSelf = root => SELF.map((_, i) => ($(`[name=sq${i}]:checked`, root) || {}).value || '-').join('');
  function selfSummary(q) {
    const no = [...q].map((v, i) => v === 'n' ? i + 1 : 0).filter(Boolean);
    return no.length ? `'아니요' ${no.join('·')}번` : '이상 없음';
  }

  async function inviteLink(t) {
    // QR이 너무 촘촘해지지 않도록 이름은 최근 20명만 담는다
    const w = (await Registry.people(t.site)).slice(0, 20);
    const k = await Lock.current();
    const code = await Codec.pack({ v: 1, y: 't', s: t.id, n: t.site, p: t.place, d: t.date, st: t.start, j: t.work, c: t.detail, h: t.haz.map(z => [z.h, z.m]), f: t.focus, o: t.notice, q: t.self ? 1 : 0, m: 'q', w, k });
    return `${APP_URL}#/w/${code}`;
  }
  // 작업자 폰 화면
  function workerView(p) {
    const haz = (p.h || []).map(([h, m]) => ({ h, m }));
    const t = { site: p.n, date: p.d, start: p.st, work: p.j, detail: p.c, haz, focus: p.f, notice: p.o };
    const doneKey = 'done-' + p.s;
    let prev = null; try { prev = JSON.parse(localStorage.getItem(doneKey)); } catch (e) { /* 없음 */ }
    view().innerHTML = `<section class="hero small"><h1>TBM (작업 전 안전점검회의)</h1><p><b>${esc(p.n)}</b>${p.p ? ' · ' + esc(p.p) : ''}<br>${esc(when(t))}</p>
        <p class="hint">금일 작업과 위험요인을 확인하고, 맨 아래에서 체크·서명하세요.</p>
        ${prev ? '<button class="btn" id="again">이전에 제출한 결과 다시 보기</button>' : ''}</section>
      <section class="brief">${briefHTML(t)}</section>
      <h2 class="h">확인 및 서명</h2>${workerFormHTML(haz, p.f, !!p.q)}
      <div id="wres"></div>`;
    const pad = Sig.pad($('canvas.sigpad'));
    attachNameSearch($('.wform [name=name]'), p.w);
    const showResult = (url, name) => {
      $('.wform').classList.add('hide');
      $('#wres').innerHTML = `<section class="result"><h2>✔ ${esc(name)} 님, 서명이 완료되었습니다.</h2>
        <p><b>이 화면의 QR을 지도요원에게 보여주세요.</b></p><div class="qrbox">${QR.svg(url)}</div>
        <div class="row center"><button class="btn ghost" id="send">링크로 보내기</button></div></section>`;
      $('#send').onclick = () => shareLink('TBM 서명 결과', `[TBM 서명] ${p.n} — ${name}`, url);
      $('#wres').scrollIntoView({ behavior: 'smooth' });
    };
    if ($('#again')) $('#again').onclick = () => showResult(prev.url, prev.name);
    bindWorkerForm(view(), pad, async ({ name, sig }) => {
      const r = { v: 1, s: p.s, n: name, a: Math.floor(Date.now() / 1000), g: sig, m: 'q' };
      if (p.q) r.q = readSelf(view());
      const url = `${APP_URL}#/r/${await Codec.pack(r)}`;
      try { localStorage.setItem(doneKey, JSON.stringify({ url, name })); } catch (e) { /* 무시 */ }
      showResult(url, name);
    });
  }

  // ---------- PDF: A4 한 장 ----------
  const lines = s => esc(s || '').replace(/\n/g, '<br>');
  function pageHTML(t) {
    const L = t.leader;
    const chk = on => on ? '■' : '□';
    const slots = Array.from({ length: MAX_WORKERS }, (_, i) => t.workers[i]);
    const sigCell = w => w ? `<td class="tb-nm">${esc(w.name)}</td><td class="tb-sg"><img src="${Sig.toImage(w.sig, 400, 160)}"></td>` : '<td class="tb-nm"></td><td class="tb-sg"></td>';
    const selfNotes = t.self ? t.workers.filter(w => w.q).map(w => `${esc(w.name)}: ${esc(selfSummary(w.q))}`) : [];
    return `<div class="tb-page">
      <div class="tb-head">
        <div class="tb-title"><img class="tb-logo" src="img/brand-logo.png" alt="사람인 안전지도사 사무소"><h1>작업 전 안전점검회의(TBM) 일지</h1></div>
        <table class="tb-appr"><tr><th rowspan="2" class="tb-apl">결<br>재</th>${APPROVERS.map(a => `<th>${a}</th>`).join('')}</tr><tr>${APPROVERS.map(() => '<td></td>').join('')}</tr></table>
      </div>
      <table class="tb-t">
        <colgroup><col style="width:15%"><col style="width:35%"><col style="width:15%"><col style="width:35%"></colgroup>
        <tr><th>TBM 일시</th><td>${esc(when(t))}</td><th>날씨</th><td>${esc(t.weather)}</td></tr>
        <tr><th>현장명</th><td>${esc(t.site)}</td><th>TBM 장소</th><td>${esc(t.place)}</td></tr>
        <tr><th>작업명</th><td colspan="3">${esc(t.work)}</td></tr>
        <tr><th>작업내용</th><td colspan="3">${lines(t.detail)}</td></tr>
        <tr><th>위험성평가</th><td>${chk(t.ra !== 'n')} 실시 &nbsp; ${chk(t.ra === 'n')} 미실시</td><th>참석인원</th><td>${t.workers.length}명</td></tr>
      </table>
      <table class="tb-t">
        <colgroup><col style="width:37%"><col style="width:33%"><col style="width:13%"><col></colgroup>
        <tr><th>잠재위험요인</th><th>대책 <small>※ 제거 → 대체 → 통제 순서 고려</small></th><th>작업 전<br>안전조치</th><th>'아니오'인 경우<br>조치 내용</th></tr>
        ${t.haz.map((z, i) => `<tr><td>${CIRC[i]} ${esc(z.h)}</td><td>${CIRC[i]} ${esc(z.m)}</td><td class="c">${chk(z.ok !== 'n')} 예<br>${chk(z.ok === 'n')} 아니오</td><td>${esc(z.ok === 'n' ? z.fix : '')}</td></tr>`).join('')}
      </table>
      <table class="tb-t">
        <colgroup><col style="width:15%"><col style="width:10%"><col></colgroup>
        <tr><th rowspan="2">중점<br>위험요인</th><th>선정</th><td class="tb-focus">${esc((t.haz[t.focus] || {}).h)}</td></tr>
        <tr><th>대책</th><td class="tb-focus">${esc((t.haz[t.focus] || {}).m)}</td></tr>
      </table>
      ${t.photoMode !== false ? `<table class="tb-t">
        <colgroup><col style="width:13%"><col style="width:37%"><col style="width:13%"><col></colgroup>
        <tr><th>전달사항</th><td class="tb-txt">${lines(t.notice)}</td><th>일일 안전점검<br>결과</th><td class="tb-txt">${lines(t.check)}</td></tr>
        <tr><th>근로자 의견</th><td class="tb-txt">${lines(t.opinion)}</td><th>작업 후<br>종료 미팅</th><td class="tb-txt">${lines(t.after)}<div class="tb-sub">중점대책의 실효성</div></td></tr>
      </table>` : `<table class="tb-t tb-fill">
        <colgroup><col style="width:15%"><col></colgroup>
        <tr><th>전달사항</th><td class="tb-txt">${lines(t.notice)}</td></tr>
        <tr><th>일일 안전점검<br>결과</th><td class="tb-txt">${lines(t.check)}</td></tr>
        <tr><th>근로자 의견</th><td class="tb-txt">${lines(t.opinion)}</td></tr>
        <tr><th>작업 후<br>종료 미팅</th><td class="tb-txt">${lines(t.after)}<div class="tb-sub">중점대책의 실효성</div></td></tr>
      </table>`}
      <table class="tb-t tb-leader">
        <colgroup><col style="width:15%"><col><col style="width:22%"></colgroup>
        <tr><th>TBM 리더 확인</th><td>소속: <b>${esc(L.org)}</b> &nbsp; 직책: <b>${esc(L.pos)}</b> &nbsp; 성명: <b>${esc(L.name)}</b></td><td class="tb-sg">${L.sig ? `<img src="${Sig.toImage(L.sig, 400, 160)}">` : '(서명)'}</td></tr>
      </table>
      ${t.photoMode !== false ? `<div class="tb-sec">■ TBM 사진</div><div class="tb-photo">${t.photo ? `<img src="${t.photo}">` : ''}</div>` : ''}
      <div class="tb-sec">■ 참석자 확인 <small>※ TBM 내용을 듣고 위험요인과 대책을 확인하였습니다</small></div>
      <table class="tb-t tb-att">
        <colgroup>${'<col style="width:12%"><col style="width:21.33%">'.repeat(3)}</colgroup>
        <tr>${'<th>성명</th><th>서명</th>'.repeat(3)}</tr>
        <tr>${slots.slice(0, 3).map(sigCell).join('')}</tr>
        <tr>${slots.slice(3, 6).map(sigCell).join('')}</tr>
      </table>
      ${selfNotes.length ? `<div class="tb-self">안전의식 자가진단(8문항): ${selfNotes.join(' / ')}</div>` : ''}
      <div class="tb-foot"><span>사람인안전지도사사무소</span><span>안전지도 앱으로 작성</span></div>
    </div>`;
  }
  async function build(t) {
    const root = document.createElement('div');
    root.className = 'rp-root';
    root.innerHTML = pageHTML(t);
    document.body.appendChild(root);
    try {
      const page = $('.tb-page', root);
      await Promise.all([...root.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 4000); })));
      // 넘치면 글씨를 조금씩 줄인다
      const H = 1123;
      for (let fs = 12.5; page.scrollHeight > H && fs > 9; fs -= 0.5) page.style.fontSize = fs + 'px';
      // 사진: 남은 칸에 비율대로 맞춘다 (html2canvas는 object-fit을 지원하지 않음)
      const box = $('.tb-photo', page), img = box && $('img', box);
      if (img && img.naturalWidth) {
        const bw = box.clientWidth - 8, bh = box.clientHeight - 8;
        const s = Math.min(bw / img.naturalWidth, bh / img.naturalHeight);
        img.style.width = Math.round(img.naturalWidth * s) + 'px';
        img.style.height = Math.round(img.naturalHeight * s) + 'px';
      }
      const c = await html2canvas(page, { scale: 2, backgroundColor: '#ffffff', logging: false, scrollX: -window.scrollX, scrollY: -window.scrollY });
      const image = c.toDataURL('image/jpeg', 0.9);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
      pdf.addImage(image, 'JPEG', 0, 0, 210, 297);
      return { pdf: pdf.output('blob'), image };
    } finally {
      root.remove();
    }
  }

  return { list, create, view: view_, card, workerView, build };
})();
