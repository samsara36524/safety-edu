// 관리체계 점검: 건설현장이 갖춰야 할 안전보건 관리체계를 과태료 부과기준(법 제175조)으로 현장소장에게 설명하고
// 해당 여부를 체크·서명받아 2쪽 PDF와 쪽별 이미지 2장으로 저장한다.
const Law = (() => {
  // 과태료 부과기준 요약 (금액: 만원, 1차·2차·3차 위반). pen: 금액 대신 벌칙 문구
  const ITEMS = [
    { t: '안전보건관리책임자를 선임하지 않은 경우', law: '제15조', f: ['500', '500', '500'] },
    { t: '관리감독자에게 직무관련 안전·보건업무를 수행하도록 하지 않은 경우', law: '제16조', f: ['300', '400', '500'] },
    { t: '안전관리자를 선임하지 않은 경우', law: '제17조', f: ['500', '500', '500'] },
    { t: '보건관리자를 선임하지 않은 경우', law: '제18조', f: ['500', '500', '500'] },
    { t: '산업안전보건위원회를 구성하지 않은 경우', n: '*제75조에 따라 노사협의체를 구성한 경우 예외', law: '제24조', f: ['500', '500', '500'] },
    { t: '안전보건관리규정을 작성하지 않은 경우', law: '제25조', f: ['150', '300', '500'] },
    { t: '정기안전보건교육을 하지 않은 경우\n(교육대상 근로자 1명당)', law: '제29조\n1항', f: ['10', '20', '50'] },
    { t: '정기안전보건교육을 하지 않은 경우\n(교육대상 관리감독자 1명당)', law: '제29조\n1항', f: ['50', '250', '500'] },
    { t: '채용 시와 작업내용 변경 시 교육 미실시한 경우\n(교육대상 근로자 1명당)', n: '*건설일용근로자 기초안전보건교육 이수 시 채용 시 교육 예외', law: '제29조\n2항', f: ['10', '20', '50'] },
    { t: '유해·위험작업 시 특별교육을 추가로 하지 않은 경우\n(교육대상 근로자 1명당)', n: '*특별교육을 실시한 경우 채용 시와 작업내용 변경 시 교육을 실시한 것으로 본다', law: '제29조\n3항', f: ['50', '100', '150'] },
    { t: '일용근로자 채용 시 기초안전보건교육을 이수하도록 하지 않은 경우(근로자 1명당)', law: '제31조', f: ['10', '20', '50'] },
    { t: '안전보건관리책임자 직무교육 미이수 경우', law: '제32조\n1항1호', f: ['500', '500', '500'] },
    { t: '안전관리자, 보건관리자 직무교육 미이수 경우', law: '제32조\n1항2,3호', f: ['500', '500', '500'] },
    { t: '법령의 요지 및 안전보건관리규정을 미게시, 미비치 경우', n: '*안전보건관리규정: 상시근로자 수 100명 이상 시', law: '제34조', f: ['50', '250', '500'] },
    { t: '안전보건표지 설치·부착하지 않은 경우(1개소당)', law: '제37조', f: ['10', '30', '50'] },
    { t: '제38조(안전조치), 제39조(보건조치) 위반하여 사망 시\n제38조(안전조치), 제39조(보건조치) 위반 시', law: '제38조\n제39조', pen: '-7년 이하의 징역 또는 1억원 이하 벌금(제167조)\n-5년 이하의 징역 또는 5천만원 이하 벌금(제168조)' },
    { t: '근로자가 제38조(안전조치), 제39조(보건조치)에 따른 필요조치 위반 시', law: '제40조', f: ['5', '10', '15'] },
    { t: '유해위험방지계획서 미제출, 변경하지 않은 경우\n유해위험방지계획서, 심사결과서 갖추어 두지 않을 시\n자격이 있는 자의 의견을 듣지 않고 작성·제출 시', law: '제42조', f: ['1,000\n300\n30', '1,000\n600\n150', '1,000\n1,000\n300'] },
    { t: '안전보건개선계획 수립·시행하지 않은 경우', law: '제49조', f: ['1,000', '1,000', '1,000'] },
    { t: '중대재해 발생사실 미보고 및 거짓보고한 경우', law: '제54조', f: ['3,000', '3,000', '3,000'] },
    { t: '산업재해를 보고하지 않은 경우\n산업재해를 거짓으로 보고한 경우', law: '제57조', f: ['700\n1,500', '1,000\n1,500', '1,500\n1,500'] },
    { t: '안전보건총괄책임자를 지정하지 않은 경우', law: '제62조', f: ['500', '500', '500'] },
    { t: '도급인의 안전조치 및 보건조치 위반하여 사망 시\n도급인의 안전조치 및 보건조치 위반 시', law: '제63조', pen: '-7년 이하의 징역 또는 1억원 이하 벌금(제167조)\n-3년 이하의 징역 또는 3천만원 이하 벌금(제169조)' },
    { t: '도급에 따른 산업재해 예방조치 위반 시', n: '[안전보건협의체 구성·운영, 순회점검, 합동점검, 위생시설 협조 등]', law: '제64조', pen: '-500만원 이하의 벌금(제172조)' },
    { t: '안전보건조정자를 두지 않은 경우', law: '제68조', f: ['500', '500', '500'] },
    { t: '산업안전보건관리비를 도급금액(사업비)에 전액 미계상\n50% 이상 100% 미만을 계상하지 않은 경우\n50% 미만을 계상하지 않은 경우', law: '제72조', f: ['1,000\n100\n100', '1,000\n300\n200', '1,000\n600\n500'] },
    { t: '산업안전보건관리비 사용명세서 미작성 경우\n공사종료 후 1년간 보존하지 않은 경우\n다른 목적으로 사용한 경우(1천만원 이상 경우)', law: '제72조\n4항, 5항', f: ['100\n100\n1,000', '500\n200\n1,000', '1,000\n300\n1,000'] },
    { t: '재해예방전문지도기관의 지도를 받지 않은 경우', law: '제73조', f: ['200', '250', '300'] },
    { t: '특수형태근로종사자 안전조치 및 보건조치를 하지 않은 경우', law: '제77조\n1항', f: ['500', '700', '1,000'] },
    { t: '특수형태근로종사자 최초 노무제공 시 교육 미실시 경우(1인당)\n특수형태근로종사자 특별교육 미실시 경우(1인당)', law: '제77조\n2항', f: ['10\n50', '20\n100', '50\n150'] },
    { t: '타워크레인 등록업자로 하여금 설치·해체하게 하지 않은 경우', law: '제82조', pen: '-3년 이하의 징역 또는 3천만원 이하의 벌금(제169조)' },
    { t: '제공받은 물질안전보건자료를 게시하지 않거나 갖추어 두지 않은 경우(작업장 1개소당)', law: '제114조\n1항', f: ['100', '200', '500'] },
    { t: '물질안전보건자료를 제공받지 못하여 게시하지 않거나 갖추어 두지 않은 경우(작업장 1개소당)', law: '제114조\n1항', f: ['10', '20', '50'] },
    { t: '물질안전보건자료 관련 근로자교육 등 미조치\n(교육대상 근로자 1명당)', law: '제114조\n3항', f: ['50', '100', '500'] },
    { t: '물질안전보건자료 사용·운송 용기에 경고표시 미조치', law: '제115조\n1,2항', f: ['50', '100', '300'] },
    { t: '용기 및 포장의 경고표시 제거 경우·훼손한 경우', law: '제115조\n1,2항', f: ['10', '20', '50'] },
    { t: '근로감독관 검사·점검 등을 거부·방해·기피 시', law: '제155조', f: ['1,000', '1,000', '1,000'] },
    { t: '서류를 보존하지 아니한 자 (*대부분 3년)', n: '[산업재해기록, 관리책임자·안전 및 보건관리자·관리감독자 선임, 안전조치, 작업환경측정, 건강진단서류 등]', law: '제164조', pen: '-300만원 이하의 과태료(제175조)' }
  ];
  const PAGE1 = 18; // 1쪽: 1~18, 2쪽: 19~38
  const pad2 = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const fmtDay = ymd => { const [y, m, d] = String(ymd || '').split('-'); return y ? `${y}. ${+m}. ${+d}.` : ''; };
  const save = t => { t.updated = Date.now(); return DB.put('sessions', t); };
  const all = async () => (await DB.all('sessions').catch(() => [])).filter(x => x.kind === 'law').sort((a, b) => b.created - a.created);
  const lines = s => esc(s || '').replace(/\n/g, '<br>');
  const INSPECTOR_NAME = String(INSPECTOR).split(' ').pop(); // '이남석'

  // ---------- 목록 ----------
  function card(t) {
    const n = t.chk.filter(Boolean).length;
    return `<a class="card" href="#/l/${t.id}">
      <b><span class="cat c-law">체계</span>${esc(t.site || '(현장명 없음)')}</b>
      <span>${esc(fmtDay(t.date))} · 현장소장 ${esc(t.boss || '-')}</span>
      <span class="badge ${t.done ? 'ok' : ''}">${t.done ? '완료' : '작성 중'} · 해당 ${n}개 / ${ITEMS.length}개 · 서명 ${(t.sigI ? 1 : 0) + (t.sigB ? 1 : 0)}/2</span></a>`;
  }
  async function list() {
    const items = await all();
    view().innerHTML = `<div class="bar"><h1>관리체계 점검</h1><a class="btn primary" href="#/law/new">＋ 점검 시작</a></div>
      <p class="hint">건설현장이 지켜야 할 안전보건 관리체계를 과태료 부과기준(법 제175조)으로 현장소장에게 설명하고, 해당 여부를 체크한 뒤 지도요원·현장소장 서명을 받아 2쪽 PDF와 이미지 2장으로 저장합니다.</p>
      ${items.length ? `<div class="cards">${items.map(t => `<div class="rec">${card(t)}<div class="row"><button class="btn ghost sm" data-del="${t.id}">삭제</button></div></div>`).join('')}</div>` : '<p class="hint">아직 점검 기록이 없습니다.</p>'}`;
    $$('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('이 점검 기록을 삭제할까요? (저장해 둔 PDF는 지워지지 않습니다)')) return;
      await DB.del('sessions', b.dataset.del); list();
    });
  }
  // 같은 현장의 지난 점검에서 현장소장 이름을 가져온다
  const lastBoss = async site => ((await all()).find(x => x.boss && Registry.norm(x.site) === Registry.norm(site)) || {}).boss || '';
  async function create(siteArg) {
    const site = siteArg ? decodeURIComponent(siteArg) : '';
    const reg = site ? await Registry.site(site) : null;
    const t = {
      id: uid(10), kind: 'law', created: Date.now(), done: false,
      site: reg ? reg.name : site, date: today(), inspector: INSPECTOR_NAME, boss: site ? await lastBoss(site) : '',
      chk: ITEMS.map(() => false), note: ITEMS.map(() => ''), sigI: '', sigB: ''
    };
    await save(t);
    location.replace(`#/l/${t.id}`);
  }

  // ---------- 점검 화면 ----------
  async function view_(id) {
    const t = await DB.get('sessions', id);
    if (!t || t.kind !== 'law') { view().innerHTML = '<p>점검 기록을 찾을 수 없습니다.</p><a class="btn" href="#/law">점검 목록</a>'; return; }
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = setTimeout(() => save(t), 400); };
    const amt = it => it.pen ? `<span class="lw-pen">${lines(it.pen)}</span>` : `<span class="lw-f">${['1차', '2차', '3차'].map((k, i) => `<span><small>${k}</small>${lines(it.f[i])}</span>`).join('')}</span>`;
    view().innerHTML = `<div class="bar"><h1>관리체계 점검</h1><a class="btn ghost sm" href="#/law">목록</a></div>
      <form class="form" id="lf">
        <label>현장명 <input name="site" required value="${esc(t.site)}" placeholder="현장명 입력 또는 검색 (초성 검색 가능)"></label>
        <div class="grid3"><label>점검일 <input name="date" type="date" value="${esc(t.date)}"></label>
          <label>지도요원 <input value="${esc(t.inspector || INSPECTOR_NAME)}" readonly class="fixed"></label>
          <label>현장소장 <input name="boss" value="${esc(t.boss)}" placeholder="현장소장 이름"></label></div>
      </form>
      <div class="bar lw-bar"><h2 class="h">과태료 부과기준 요약 <small>(법 제175조 · 금액 단위 만원)</small></h2><span class="lw-count" id="cnt"></span></div>
      <p class="hint">현장소장에게 항목을 설명하면서 <b>해당</b>하는 항목을 체크하세요. 필요하면 비고를 적습니다.</p>
      <ol class="lw-list">${ITEMS.map((it, i) => `<li class="lw-it ${t.chk[i] ? 'on' : ''}" data-i="${i}">
        <label class="lw-chk"><input type="checkbox" ${t.chk[i] ? 'checked' : ''}><span>해당</span></label>
        <div class="lw-body"><div class="lw-tx"><b>${i + 1}.</b> ${lines(it.t)}</div>${it.n ? `<div class="lw-n">${esc(it.n)}</div>` : ''}
          <div class="lw-meta"><span class="lw-law">${esc(it.law.replace(/\n/g, ' '))}</span>${amt(it)}</div>
          <input class="lw-note" placeholder="비고 (선택)" value="${esc(t.note[i] || '')}"></div>
      </li>`).join('')}</ol>
      <h2 class="h">서명</h2>
      <div class="lw-sigs">
        <section class="lw-sig" id="sgI"><input type="hidden" name="name" value="${esc(t.inspector || INSPECTOR_NAME)}">
          <div class="sigwrap"><span>지도요원 <b>${esc(t.inspector || INSPECTOR_NAME)}</b> 서명</span><canvas class="sigpad"></canvas><button type="button" class="btn ghost sm" data-clr>다시 쓰기</button></div></section>
        <section class="lw-sig" id="sgB"><input type="hidden" name="name" value="${esc(t.boss)}">
          <div class="sigwrap"><span>현장소장 <b class="bossname">${esc(t.boss || '(이름 입력)')}</b> 서명</span><canvas class="sigpad"></canvas><button type="button" class="btn ghost sm" data-clr>다시 쓰기</button></div></section>
      </div>
      <div class="row center"><button class="btn big primary" id="make">결과지 만들기 (PDF 2쪽·이미지 2장)</button></div>
      <div id="out"></div>`;
    const f = $('#lf');
    const count = () => { $('#cnt').textContent = `해당 ${t.chk.filter(Boolean).length}개 / ${ITEMS.length}개`; };
    count();
    siteField(f.site, async () => {
      t.site = f.site.value.trim();
      if (!f.boss.value.trim()) { const b = await lastBoss(t.site); if (b) { f.boss.value = b; f.boss.dispatchEvent(new Event('input')); } }
      later();
    });
    f.site.addEventListener('input', () => { t.site = f.site.value.trim(); later(); });
    f.date.onchange = () => { t.date = f.date.value; later(); };
    $$('.lw-it').forEach(li => {
      const i = +li.dataset.i;
      $('input[type=checkbox]', li).onchange = e => { t.chk[i] = e.target.checked; li.classList.toggle('on', e.target.checked); count(); later(); };
      $('.lw-note', li).oninput = e => { t.note[i] = e.target.value; later(); };
    });

    // 서명 2개 (이름별 이전 서명 불러오기)
    const sigBox = (id, key) => {
      const root = $('#' + id), pad = Sig.pad($('canvas', root)), nameIn = $('[name=name]', root);
      if (t[key]) setTimeout(() => pad.load(t[key]), 60);
      const getUsed = attachPastSigs(root, nameIn, pad);
      $('[data-clr]', root).addEventListener('click', () => { pad.clear(); t[key] = ''; later(); });
      const store = () => { t[key] = getUsed() || (pad.isEmpty() ? '' : Sig.encode(pad.strokes())); later(); };
      $('canvas', root).addEventListener('pointerup', () => setTimeout(store, 30));
      $('canvas', root).addEventListener('sigwidth', () => setTimeout(store, 30));
      root.addEventListener('click', e => { if (e.target.closest('[data-g]')) setTimeout(store, 30); });
      return { pad, store };
    };
    const sI = sigBox('sgI', 'sigI'), sB = sigBox('sgB', 'sigB');
    f.boss.addEventListener('input', () => {
      t.boss = f.boss.value.trim();
      $('#sgB .bossname').textContent = t.boss || '(이름 입력)';
      const hn = $('#sgB [name=name]'); hn.value = t.boss; hn.dispatchEvent(new Event('input')); // 이전 서명 목록 갱신
      later();
    });

    $('#make').onclick = async () => {
      clearTimeout(timer);
      sI.store(); sB.store(); clearTimeout(timer);
      if (!t.site) { toast('현장명을 입력하세요.'); f.site.focus(); return; }
      if (!t.boss) { toast('현장소장 이름을 입력하세요.'); f.boss.focus(); return; }
      const miss = [!t.sigI && '지도요원', !t.sigB && '현장소장'].filter(Boolean);
      if (miss.length && !confirm(`${miss.join('·')} 서명이 없습니다. 서명 칸을 비운 채로 만들까요?`)) return;
      const btn = $('#make'); btn.disabled = true; btn.textContent = '만드는 중…';
      try {
        await save(t);
        await Registry.addSite(t.site);
        const at = Date.now();
        if (t.sigI) await Registry.addSig(t.inspector || INSPECTOR_NAME, t.sigI, t.site, at);
        if (t.sigB) await Registry.addSig(t.boss, t.sigB, t.site, at);
        const res = await build(t);
        t.done = true; await save(t);
        const name = fileName(t);
        $('#out').innerHTML = `<h2 class="h">미리보기 <small>(2쪽)</small></h2>
          <div class="tbm-prev">${res.pages.map(p => `<img src="${p}" alt="관리체계 점검 결과">`).join('')}</div>
          <div class="save-actions">
            <button class="btn primary" id="sv-pdf">PDF 저장 (2쪽)</button>
            <button class="btn" id="sv-share">PDF 공유 (카카오톡·메일 등)</button>
            <button class="btn ghost" id="sv-jpg1">1쪽 이미지(JPG) 저장</button>
            <button class="btn ghost" id="sv-jpg2">2쪽 이미지(JPG) 저장</button>
            <button class="btn ghost" id="sv-imgshare">이미지 2장 공유</button>
          </div>`;
        const imgFile = async i => new File([await dataUrlToBlob(res.pages[i])], `${name}_${i + 1}쪽.jpg`, { type: 'image/jpeg' });
        $('#sv-pdf').onclick = () => downloadBlob(res.pdf, name + '.pdf');
        $('#sv-jpg1').onclick = async () => downloadBlob(await imgFile(0), `${name}_1쪽.jpg`);
        $('#sv-jpg2').onclick = async () => downloadBlob(await imgFile(1), `${name}_2쪽.jpg`);
        const share = async files => {
          if (navigator.canShare && navigator.canShare({ files })) {
            try { await navigator.share({ files, title: name }); } catch (e) { if (e.name !== 'AbortError') toast('공유 실패: ' + e.message); }
          } else toast('이 브라우저는 파일 공유를 지원하지 않습니다. 저장 버튼을 이용하세요.');
        };
        $('#sv-share').onclick = () => share([new File([res.pdf], name + '.pdf', { type: 'application/pdf' })]);
        $('#sv-imgshare').onclick = async () => share([await imgFile(0), await imgFile(1)]);
        $('#out').scrollIntoView({ behavior: 'smooth' });
        btn.textContent = '다시 만들기';
      } catch (e) {
        console.error(e); toast('결과지를 만들지 못했습니다: ' + e.message, 5000); btn.textContent = '결과지 만들기 (PDF 2쪽·이미지 2장)';
      }
      btn.disabled = false;
    };
  }
  const fileName = t => `관리체계점검_${(t.site || '현장').replace(/[\\/:*?"<>|]/g, '_')}_${(t.date || '').replace(/-/g, '')}`;

  // ---------- 결과지 (A4 2쪽) ----------
  function rowsHTML(t, from, to) {
    return ITEMS.slice(from, to).map((it, k) => {
      const i = from + k;
      const amt = it.pen ? `<td colspan="4" class="lw-penc">${lines(it.pen)}${t.note[i] ? `<div class="lw-nt">${esc(t.note[i])}</div>` : ''}</td>`
        : `${it.f.map(v => `<td class="c">${lines(v)}</td>`).join('')}<td class="lw-ntc">${esc(t.note[i] || '')}</td>`;
      return `<tr><td class="c">${i + 1}</td><td>${lines(it.t)}${it.n ? `<div class="lw-sub">${esc(it.n)}</div>` : ''}</td><td class="c">${lines(it.law)}</td>${amt}<td class="c lw-mk">${t.chk[i] ? '✔' : ''}</td></tr>`;
    }).join('');
  }
  const head = `<colgroup><col style="width:5%"><col style="width:39%"><col style="width:9%"><col style="width:6.5%"><col style="width:6.5%"><col style="width:6.5%"><col style="width:19%"><col style="width:8.5%"></colgroup>
    <tr><th rowspan="2">NO</th><th rowspan="2">위반행위 세부내용</th><th rowspan="2">관련법</th><th colspan="3">과태료 금액 (만원)</th><th rowspan="2">비고</th><th rowspan="2">해당<br>여부</th></tr>
    <tr><th class="lw-sm">1차위반</th><th class="lw-sm">2차위반</th><th class="lw-sm">3차위반</th></tr>`;
  const sigImg = g => g ? `<img src="${Sig.toImage(g, 400, 160)}">` : '';
  function pageHTML(t, p) {
    const n = t.chk.filter(Boolean).length;
    const top = p === 0 ? `
      <div class="lw-top">
        <div class="tb-title"><img class="tb-logo" src="img/brand-logo.png" alt="사람인 안전지도사 사무소"><h1>과태료 부과기준 요약 (법 제175조)</h1>
          <div class="lw-info">현장명: <b>${esc(t.site)}</b> &nbsp;·&nbsp; 점검일: <b>${esc(fmtDay(t.date))}</b> &nbsp;·&nbsp; 해당 <b>${n}</b>개 / ${ITEMS.length}개</div></div>
        <table class="lw-sign"><tr><th>구분</th><th>성명</th><th>서명</th></tr>
          <tr><th>지도요원</th><td>${esc(t.inspector || INSPECTOR_NAME)}</td><td class="lw-sg">${sigImg(t.sigI)}</td></tr>
          <tr><th>현장소장</th><td>${esc(t.boss)}</td><td class="lw-sg">${sigImg(t.sigB)}</td></tr></table>
      </div>` : `<div class="lw-top2"><b>과태료 부과기준 요약 (법 제175조)</b><span>${esc(t.site)} · ${esc(fmtDay(t.date))}</span></div>`;
    return `<div class="lw-page">${top}
      <table class="tb-t lw-t">${head}${p === 0 ? rowsHTML(t, 0, PAGE1) : rowsHTML(t, PAGE1, ITEMS.length)}</table>
      <div class="tb-foot"><span>사람인안전지도사사무소 · 지도요원 ${esc(t.inspector || INSPECTOR_NAME)}</span><span>${p + 1} / 2쪽 · 안전지도 앱으로 작성</span></div>
    </div>`;
  }
  async function build(t) {
    const root = document.createElement('div');
    root.className = 'rp-root';
    document.body.appendChild(root);
    const pages = [];
    try {
      for (let p = 0; p < 2; p++) {
        root.innerHTML = pageHTML(t, p);
        const page = $('.lw-page', root), tbl = $('.lw-t', page), foot = $('.tb-foot', page);
        await Promise.all([...root.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 4000); })));
        // 표가 쪽을 넘치면 글씨를 줄이고, 남으면 행 높이를 늘려 쪽을 채운다
        const room = () => foot.offsetTop - tbl.offsetTop - 6;
        let fs = 12;
        tbl.style.fontSize = fs + 'px';
        while (tbl.offsetHeight > room() && fs > 8) { fs -= 0.5; tbl.style.fontSize = fs + 'px'; }
        const rows = $$('tr', tbl).slice(2), extra = room() - tbl.offsetHeight;
        if (extra > 0) rows.forEach(r => { r.style.height = (r.offsetHeight + Math.floor(extra / rows.length)) + 'px'; });
        const c = await html2canvas(page, { scale: 2, backgroundColor: '#ffffff', logging: false, scrollX: -window.scrollX, scrollY: -window.scrollY });
        pages.push(c.toDataURL('image/jpeg', 0.9));
      }
    } finally {
      root.remove();
    }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    pages.forEach((img, i) => { if (i) pdf.addPage(); pdf.addImage(img, 'JPEG', 0, 0, 210, 297); });
    return { pdf: pdf.output('blob'), pages };
  }

  return { list, create, view: view_, card, build, ITEMS };
})();
