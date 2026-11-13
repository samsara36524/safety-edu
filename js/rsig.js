// 원격서명: 점검내용·점검사진(4장 이내)을 담은 서명 링크를 등록된 담당자에게 문자(SMS)로 보내고,
// 담당자는 자기 폰에서 내용·사진을 확인한 뒤 넓은 서명칸에 서명해 제출한다.
// 제출하면 '기술지도보고서 첨부용 서명' 이미지를 지정한 이메일로 보낸다(메일 앱 공유 창 + 받는 주소 복사).
// 지도요원은 받은 서명 이미지를 기록에 넣어 사진·서명이 담긴 확인서(PDF·이미지)를 만들 수 있다.
const Rsig = (() => {
  const MAXP = 4;
  const EMAIL0 = 'adlibservice@gmail.com';
  const LABEL = '기술지도보고서 첨부용 서명';
  const pad2 = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const fmtDay = ymd => { const [y, m, d] = String(ymd || '').split('-'); return y ? `${y}. ${+m}. ${+d}.` : ''; };
  const save = t => { t.updated = Date.now(); return DB.put('sessions', t); };
  const all = async () => (await DB.all('sessions').catch(() => [])).filter(x => x.kind === 'rsig').sort((a, b) => b.created - a.created);
  const lines = s => esc(s || '').replace(/\n/g, '<br>');
  const emailOf = async () => (await DB.get('kv', 'rsigEmail').catch(() => null)) || EMAIL0;
  const telNum = t => String(t || '').replace(/[^\d+]/g, '');
  // 담당자 휴대폰 끝 4자리 확인값: 원래 숫자는 링크에 넣지 않고 바꾼 값(해시)만 담는다
  async function last4Hash(id, four) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`safety-edu-rs:${id}:${four}`));
    return [...new Uint8Array(buf)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------- 목록 ----------
  function card(t) {
    const st = t.sigImg ? '서명 받음' : t.sentAt ? '서명 요청함' : '작성 중';
    return `<a class="card" href="#/v/${t.id}">
      <b><span class="cat c-rsig">원격</span>${esc(t.site || '(현장명 없음)')}</b>
      <span>${esc(fmtDay(t.date))} · ${esc(t.to && t.to.name ? t.to.name : '담당자 미지정')}</span>
      <span class="badge ${t.sigImg ? 'ok' : ''}">${st} · 사진 ${(t.photos || []).length}장</span></a>`;
  }
  async function list() {
    const items = await all();
    view().innerHTML = `<div class="bar"><h1>원격서명</h1><a class="btn primary" href="#/rsig/new">＋ 서명 요청</a></div>
      <p class="hint">점검내용과 점검사진(4장 이내)을 담은 서명 링크를 담당자에게 문자로 보냅니다. 담당자가 자기 폰에서 확인하고 서명해 제출하면, <b>${LABEL}</b> 이미지가 지정한 이메일로 전달됩니다.</p>
      ${items.length ? `<div class="cards">${items.map(t => `<div class="rec">${card(t)}<div class="row"><button class="btn ghost sm" data-del="${t.id}">삭제</button></div></div>`).join('')}</div>` : '<p class="hint">아직 원격서명 기록이 없습니다.</p>'}`;
    $$('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('이 원격서명 기록을 삭제할까요?')) return;
      await DB.del('sessions', b.dataset.del); list();
    });
  }
  async function create(siteArg) {
    const site = siteArg ? decodeURIComponent(siteArg) : '';
    const reg = site ? await Registry.site(site) : null;
    const t = { id: uid(10), kind: 'rsig', created: Date.now(), done: false, site: reg ? reg.name : site, date: today(), memo: '', photos: [], to: { name: '', tel: '' }, email: await emailOf(), sentAt: 0, sigImg: '' };
    await save(t);
    location.replace(`#/v/${t.id}`);
  }

  // 링크에 담을 작은 사진 (확인용)
  const thumb = src => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 260 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const w = c.toDataURL('image/webp', 0.45); // WebP가 같은 화질에 더 작다 (지원 안 하면 JPEG)
      resolve(w.startsWith('data:image/webp') ? w : c.toDataURL('image/jpeg', 0.42));
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
  async function linkOf(t) {
    const p = (await Promise.all((t.photos || []).map(thumb))).filter(Boolean);
    const four = telNum(t.to.tel).slice(-4);
    const code = await Codec.pack({ v: 1, y: 'rs', i: t.id, n: t.site, d: t.date, c: t.memo, p, nm: t.to.name, e: t.email, h4: await last4Hash(t.id, four) });
    return `${APP_URL}#/rs/${code}`;
  }

  // ---------- 요청 화면 (지도요원) ----------
  async function view_(id) {
    const t = await DB.get('sessions', id);
    if (!t || t.kind !== 'rsig') { view().innerHTML = '<p>원격서명 기록을 찾을 수 없습니다.</p><a class="btn" href="#/rsig">원격서명 목록</a>'; return; }
    t.photos = t.photos || []; t.to = t.to || { name: '', tel: '' };
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = setTimeout(() => save(t), 400); };
    view().innerHTML = `<div class="bar"><h1>원격서명</h1><a class="btn ghost sm" href="#/rsig">목록</a></div>
      <form class="form" id="rf">
        <label>현장명 <input name="site" required value="${esc(t.site)}" placeholder="현장명 입력 또는 검색 (초성 검색 가능)"></label>
        <label>점검일 <input name="date" type="date" value="${esc(t.date)}"></label>
        <label>점검내용 <small>(서명자에게 보여 줄 내용)</small><textarea name="memo" rows="4" placeholder="예: 3층 슬래브 단부 안전난간 설치 확인, 개구부 덮개 보완 지도">${esc(t.memo)}</textarea></label>
      </form>
      <h2 class="h">점검사진 <small id="pcnt">(${t.photos.length}/${MAXP}장)</small></h2>
      <div class="rs-photos" id="rph"></div>
      <div class="row"><button type="button" class="btn sm primary" id="pcam">사진 촬영</button><button type="button" class="btn sm" id="pgal">앨범에서 선택</button></div>
      <h2 class="h">서명할 담당자</h2>
      <div id="rto"></div>
      <div class="grid2"><label class="rs-l">이름 <input id="to-name" value="${esc(t.to.name)}" placeholder="담당자 이름"></label><label class="rs-l">휴대폰 <input id="to-tel" type="tel" inputmode="tel" value="${esc(t.to.tel)}" placeholder="010-0000-0000"></label></div>
      <label class="rs-l">서명 이미지를 받을 이메일 <input id="to-mail" type="email" value="${esc(t.email)}" placeholder="${EMAIL0}"></label>
      <div class="rs-send">
        <button class="btn big primary" id="sms">📱 문자로 서명 링크 보내기</button>
        <div class="row center"><button class="btn sm ghost" id="lshare">다른 앱으로 보내기</button><button class="btn sm ghost" id="lcopy">링크 복사</button></div>
        <p class="hint" id="lmsg">${t.sentAt ? `서명 요청을 보냈습니다 (${esc(Report.fmtDate(new Date(t.sentAt).toISOString()))}).` : ''}</p>
      </div>
      <h2 class="h">받은 서명</h2>
      <p class="hint">담당자가 제출하면 <b>${LABEL}</b> 이미지가 이메일로 옵니다. 그 이미지를 넣으면 점검내용·사진·서명이 담긴 확인서를 만들 수 있습니다.</p>
      <div id="rsig-in"></div>
      <div class="row"><button class="btn" id="sigin">받은 서명 이미지 넣기</button><button class="btn primary" id="make">확인서 만들기 (PDF·이미지)</button></div>
      <div id="out"></div>`;
    const f = $('#rf');
    siteField(f.site, async () => { t.site = f.site.value.trim(); later(); drawTo(); });
    f.site.addEventListener('input', () => { t.site = f.site.value.trim(); later(); });
    f.date.onchange = () => { t.date = f.date.value; later(); };
    f.memo.oninput = () => { t.memo = f.memo.value; later(); };
    // 사진
    const drawPh = () => {
      $('#pcnt').textContent = `(${t.photos.length}/${MAXP}장)`;
      $('#rph').innerHTML = t.photos.map((p, i) => `<figure><img src="${p}" alt="점검사진 ${i + 1}"><button type="button" class="pdel" data-pd="${i}" title="빼기">✕</button><figcaption>사진 ${i + 1}</figcaption></figure>`).join('') || '<p class="hint">점검사진이 없습니다.</p>';
      $$('[data-pd]').forEach(b => b.onclick = async () => { t.photos.splice(+b.dataset.pd, 1); await save(t); drawPh(); });
    };
    const addPh = async (cam) => {
      if (t.photos.length >= MAXP) { toast(`점검사진은 ${MAXP}장까지입니다.`); return; }
      const files = await pickFiles('image/*', !cam, cam ? 'environment' : undefined);
      for (const file of files.slice(0, MAXP - t.photos.length)) t.photos.push(await readImage(file, 1600, 0.85));
      if (files.length > MAXP) toast(`${MAXP}장까지만 넣었습니다.`);
      await save(t); drawPh();
    };
    $('#pcam').onclick = () => addPh(true);
    $('#pgal').onclick = () => addPh(false);
    drawPh();
    // 담당자: 이 현장 등록 인원 중 전화번호가 있는 사람
    const tn = $('#to-name'), tt = $('#to-tel'), tm = $('#to-mail');
    const drawTo = async () => {
      const st = t.site ? await Registry.site(t.site) : null;
      const ppl = st ? Object.keys(st.people || {}).map(n => [n, (st.tels || {})[n] || '']) : [];
      const withTel = ppl.filter(p => p[1]);
      $('#rto').innerHTML = withTel.length ? `<p class="hint">이 현장 등록 인원 <small>(누르면 이름·번호가 들어갑니다)</small></p><div class="people">${withTel.map(([n, tel]) => `<button type="button" class="pchip ${t.to.name === n ? 'done' : ''}" data-tn="${esc(n)}" data-tt="${esc(tel)}">${esc(n)} <small>${esc(tel)}</small></button>`).join('')}</div>`
        : `<p class="hint">${t.site ? '이 현장에 전화번호가 등록된 인원이 없습니다. 아래에 직접 넣거나 현장·근로자에서 등록하세요.' : '현장을 고르면 등록된 담당자가 나옵니다.'}</p>`;
      $$('[data-tn]').forEach(b => b.onclick = () => { tn.value = b.dataset.tn; tt.value = b.dataset.tt; syncTo(); drawTo(); });
    };
    const syncTo = () => { t.to = { name: tn.value.trim(), tel: Registry.fmtTel(tt.value) || tt.value.trim() }; t.email = tm.value.trim() || EMAIL0; later(); };
    tn.oninput = tt.oninput = syncTo;
    tm.oninput = () => { syncTo(); DB.put('kv', t.email, 'rsigEmail').catch(() => {}); };
    drawTo();
    // 보내기
    const check = () => {
      if (!t.site) { toast('현장명을 입력하세요.'); return false; }
      if (!t.memo.trim() && !t.photos.length) { toast('점검내용이나 점검사진을 넣으세요.'); return false; }
      if (!t.to.name) { toast('서명할 담당자 이름을 넣으세요.'); tn.focus(); return false; }
      if (telNum(t.to.tel).length < 4) { toast('담당자 휴대폰 번호를 넣으세요. (링크를 열 때 끝 4자리로 확인합니다)'); tt.focus(); return false; }
      return true;
    };
    let link = '';
    const prep = async () => { link = await linkOf(t); return link; };
    const msgText = () => `[원격서명 요청] ${t.site} ${fmtDay(t.date)} 점검 결과입니다. 아래 링크에서 내용과 사진을 확인하고 서명해 주세요. (${LABEL})\n링크를 열고 본인 휴대폰 번호 끝 4자리를 넣으면 서명 화면이 열립니다.\n`;
    const sent = async how => { t.sentAt = Date.now(); await save(t); $('#lmsg').textContent = `${how} 서명 요청을 보냈습니다. 담당자가 제출하면 ${t.email}로 서명 이미지가 옵니다.`; };
    $('#sms').onclick = async () => {
      syncTo(); if (!check()) return;
      if (!t.to.tel) { toast('담당자 휴대폰 번호를 넣으세요.'); tt.focus(); return; }
      await prep();
      // 문자 앱을 담당자 번호·내용이 채워진 상태로 연다
      location.href = `sms:${telNum(t.to.tel)}?body=${encodeURIComponent(msgText() + link)}`;
      sent('문자로');
    };
    $('#lshare').onclick = async () => { syncTo(); if (!check()) return; await prep(); if (await shareLink('원격서명 요청', msgText(), link)) sent('공유로'); };
    $('#lcopy').onclick = async () => { syncTo(); if (!check()) return; await prep(); if (await copyText(msgText() + link)) sent('복사한 링크로'); };
    // 받은 서명
    const drawSig = () => { $('#rsig-in').innerHTML = t.sigImg ? `<div class="rs-sigbox"><img src="${t.sigImg}" alt="받은 서명"><button type="button" class="btn ghost sm" id="sigx">빼기</button></div>` : ''; const x = $('#sigx'); if (x) x.onclick = async () => { t.sigImg = ''; await save(t); drawSig(); }; };
    drawSig();
    $('#sigin').onclick = async () => {
      const file = await pickFile('image/*'); if (!file) return;
      t.sigImg = await readImage(file, 1400, 0.9); t.done = true; await save(t); drawSig(); toast('받은 서명을 넣었습니다.');
    };
    $('#make').onclick = async () => {
      syncTo();
      if (!t.sigImg && !confirm('받은 서명이 없습니다. 서명 칸을 비운 채로 확인서를 만들까요?')) return;
      const btn = $('#make'), label = btn.textContent; btn.disabled = true; btn.textContent = '만드는 중…';
      try {
        await save(t); await Registry.addSite(t.site);
        const img = await build(t), name = `원격서명확인서_${(t.site || '현장').replace(/[\\/:*?"<>|]/g, '_')}_${(t.date || '').replace(/-/g, '')}`;
        const { jsPDF } = window.jspdf; const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true }); pdf.addImage(img, 'JPEG', 0, 0, 210, 297);
        const pdfFile = new File([pdf.output('blob')], name + '.pdf', { type: 'application/pdf' }), jpgFile = await toFile(img, name + '.jpg');
        $('#out').innerHTML = `<div class="tbm-prev"><img src="${img}" alt="원격서명 확인서"></div>
          <div class="save-actions"><button class="btn primary" id="sv-pdf">PDF 저장</button><button class="btn" id="sv-share">PDF 공유</button><button class="btn ghost" id="sv-jpg">이미지(JPG) 저장</button></div>`;
        $('#sv-pdf').onclick = () => downloadBlob(pdfFile, pdfFile.name);
        $('#sv-share').onclick = () => shareFiles([pdfFile], name);
        $('#sv-jpg').onclick = () => downloadBlob(jpgFile, jpgFile.name);
        $('#out').scrollIntoView({ behavior: 'smooth' });
      } catch (e) { console.error(e); toast('확인서를 만들지 못했습니다: ' + e.message, 5000); }
      btn.disabled = false; btn.textContent = label;
    };
  }

  // 확인서 (A4 한 장): 점검내용·사진 2x2·서명
  async function build(t) {
    const root = document.createElement('div'); root.className = 'rp-root'; document.body.appendChild(root);
    try {
      const ph = t.photos || [];
      root.innerHTML = `<div class="lw-page rs-page">
        <div class="lw-top"><div class="tb-title"><img class="tb-logo" src="img/brand-logo.png" alt="사람인 안전지도사 사무소"><h1>원격서명 확인서</h1><div class="lw-info"><b>${LABEL}</b></div></div></div>
        <table class="tb-t rs-info"><colgroup><col style="width:16%"><col style="width:34%"><col style="width:16%"><col></colgroup>
          <tr><th>현장명</th><td>${esc(t.site)}</td><th>점검일</th><td>${esc(fmtDay(t.date))}</td></tr>
          <tr><th>지도요원</th><td>${esc(INSPECTOR)}</td><th>서명자</th><td>${esc(t.to.name)}${t.to.tel ? ` <small>(${esc(t.to.tel)})</small>` : ''}</td></tr>
          <tr><th>점검내용</th><td colspan="3" class="rs-memo">${lines(t.memo)}</td></tr></table>
        <div class="tb-sec">■ 점검사진</div>
        <div class="rs-pgrid">${[0, 1, 2, 3].map(i => `<div class="rs-pc">${ph[i] ? `<img src="${ph[i]}">` : ''}<span>사진 ${i + 1}</span></div>`).join('')}</div>
        <div class="tb-sec">■ 서명 <small>※ ${LABEL}</small></div>
        <div class="rs-sg">${t.sigImg ? `<img src="${t.sigImg}">` : '<span class="hint">(서명)</span>'}</div>
        <div class="tb-foot"><span>사람인안전지도사사무소 · 지도요원 ${esc(INSPECTOR.split(' ').pop())}</span><span>원격서명 · 안전지도 앱으로 작성</span></div>
      </div>`;
      const page = $('.rs-page', root);
      await Promise.all([...root.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 4000); })));
      // 사진·서명 크기 맞추기 (html2canvas는 object-fit 미지원)
      $$('.rs-pc img, .rs-sg img', page).forEach(img => {
        const box = img.parentElement, bw = box.clientWidth - 8, bh = box.clientHeight - (box.classList.contains('rs-pc') ? 24 : 8);
        const s = Math.min(bw / (img.naturalWidth || 1), bh / (img.naturalHeight || 1));
        img.style.width = Math.round(img.naturalWidth * s) + 'px'; img.style.height = Math.round(img.naturalHeight * s) + 'px';
      });
      const c = await html2canvas(page, { scale: 2, backgroundColor: '#ffffff', logging: false, scrollX: -window.scrollX, scrollY: -window.scrollY });
      return c.toDataURL('image/jpeg', 0.9);
    } finally { root.remove(); }
  }

  // ---------- 서명자 화면 (담당자 폰) ----------
  async function signer(code) {
    let p;
    try { p = await Codec.unpack(code); } catch (e) { view().innerHTML = '<p class="err">링크가 올바르지 않습니다. 받은 문자의 링크 전체를 눌러 주세요.</p>'; return; }
    if (!p || p.y !== 'rs') { view().innerHTML = '<p class="err">원격서명 링크가 아닙니다.</p>'; return; }
    // 휴대폰 끝 4자리 확인 (한 번 맞히면 이 링크는 브라우저를 닫을 때까지 다시 묻지 않음)
    const OKK = 'rsok:' + p.i;
    let passed = false; try { passed = sessionStorage.getItem(OKK) === '1'; } catch (e) { passed = false; }
    if (p.h4 && !passed) {
      view().innerHTML = `<section class="lockbox rs-gate">
        <img src="icons/app-192.png" alt="">
        <h1>원격서명</h1>
        <p class="lock-org">${esc(p.n || '')} · ${LABEL}</p>
        <p><b>${esc(p.nm || '담당자')}</b> 님, 본인 <b>휴대폰 번호 끝 4자리</b>를 입력하세요.</p>
        <input id="rs4" type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="숫자 4자리" aria-label="휴대폰 번호 끝 4자리">
        <p class="hint" id="rs4msg">예: 010-1234-<b>5678</b> → 5678</p>
      </section>`;
      const inp = $('#rs4'), msg = $('#rs4msg');
      setTimeout(() => inp.focus(), 50);
      inp.oninput = async () => {
        inp.value = inp.value.replace(/\D/g, '').slice(0, 4);
        if (inp.value.length < 4) return;
        if (await last4Hash(p.i, inp.value) === p.h4) {
          try { sessionStorage.setItem(OKK, '1'); } catch (e) { /* 저장 불가 */ }
          signer(code);
        } else {
          msg.textContent = '번호가 맞지 않습니다. 문자를 받은 휴대폰 번호의 끝 4자리를 입력하세요.';
          inp.value = ''; inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake');
        }
      };
      return;
    }
    view().innerHTML = `<section class="rs-sign">
      <h1>원격서명</h1>
      <p class="rs-label">✍ ${LABEL}</p>
      <table class="rs-t"><tr><th>현장명</th><td>${esc(p.n)}</td></tr><tr><th>점검일</th><td>${esc(fmtDay(p.d))}</td></tr><tr><th>지도요원</th><td>${esc(INSPECTOR)}</td></tr></table>
      ${p.c ? `<h2 class="h">점검내용</h2><div class="rs-c">${lines(p.c)}</div>` : ''}
      ${(p.p || []).length ? `<h2 class="h">점검사진 <small>(누르면 크게)</small></h2><div class="rs-photos">${p.p.map((s, i) => `<figure><img src="${s}" data-big="${i}" alt="점검사진 ${i + 1}"><figcaption>사진 ${i + 1}</figcaption></figure>`).join('')}</div>` : ''}
      <label class="confirm"><input type="checkbox" id="rs-ok"><span>위 점검내용과 사진을 확인했습니다.</span></label>
      <label class="rs-l">성명 <input id="rs-name" value="${esc(p.nm || '')}" placeholder="성명"></label>
      <div class="sigwrap rs-wrap"><span>서명 <small>(${LABEL} · 칸 안에 크게 서명)</small></span><canvas class="sigpad rs-pad"></canvas><button type="button" class="btn ghost sm" data-clr>다시 쓰기</button></div>
      <button class="btn big primary" id="rs-submit">서명 제출</button>
      <div id="rs-done"></div>
    </section>`;
    $$('[data-big]').forEach(img => img.onclick = () => modal(`<img src="${img.src}" style="width:100%;height:auto">`, { wide: true }));
    const pad = Sig.pad($('.rs-pad'));
    $('[data-clr]').onclick = () => pad.clear();
    const email = p.e || EMAIL0;
    $('#rs-submit').onclick = () => {
      const name = $('#rs-name').value.trim();
      if (!$('#rs-ok').checked) { toast('점검내용과 사진을 확인하고 체크해 주세요.'); return; }
      if (!name) { toast('성명을 입력하세요.'); $('#rs-name').focus(); return; }
      if (pad.isEmpty()) { toast('서명칸에 서명해 주세요.'); return; }
      // 서명 이미지 (바로 만들어 공유 창을 연다: 휴대폰은 누른 직후에만 공유 창을 열 수 있음)
      const file = sigFile(pad.code(), name, p);
      try { navigator.clipboard && navigator.clipboard.writeText(email); } catch (e) { /* 무시 */ }
      showDone(file, email, name, p);
      sendMail(file, email, name, p);
    };
  }
  // 서명 이미지 PNG: 흰 바탕에 서명 + 아래 한 줄 표기
  function sigFile(code, name, p) {
    const W = 1000, H = 520, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    const sc = document.createElement('canvas'); sc.width = 920; sc.height = 420;
    Sig.draw(sc, Sig.decode(code)); x.drawImage(sc, 40, 20);
    x.fillStyle = '#555'; x.font = '22px sans-serif'; x.textAlign = 'center';
    x.fillText(`${LABEL} · ${p.n || ''} · ${name} · ${fmtDay(new Date().toISOString().slice(0, 10))}`, W / 2, H - 22);
    const b64 = c.toDataURL('image/png').split(',')[1], bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const safe = s => String(s || '').replace(/[\\/:*?"<>|\s]/g, '_');
    return new File([u], `서명_${safe(p.n)}_${safe(name)}.png`, { type: 'image/png' });
  }
  async function sendMail(file, email, name, p) {
    const title = `[${LABEL}] ${p.n || ''} ${name}`;
    if (navigator.canShare && navigator.share) {
      let ok = false; try { ok = navigator.canShare({ files: [file] }); } catch (e) { ok = false; }
      if (ok) { try { await navigator.share({ files: [file], title, text: `받는 사람: ${email}\n${title}` }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    }
    downloadBlob(file, file.name);
    toast(`서명 이미지를 저장했습니다. 메일 앱에서 ${email}로 첨부해 보내 주세요.`, 5000);
  }
  function showDone(file, email, name, p) {
    $('#rs-submit').classList.add('hide');
    const url = URL.createObjectURL(file);
    $('#rs-done').innerHTML = `<div class="rs-ok">
      <h2>✔ 서명했습니다</h2>
      <img src="${url}" alt="서명 이미지">
      <p>메일 앱(Gmail 등)을 골라 <b>${esc(email)}</b>로 보내 주세요. 받는 주소는 복사되어 있어 받는 사람 칸에 붙여넣으면 됩니다.</p>
      <div class="row center"><button class="btn primary" id="rs-again">📧 이메일로 보내기</button><button class="btn" id="rs-copy">주소 복사</button><button class="btn ghost" id="rs-save">서명 이미지 저장</button></div>
      <p class="hint">공유 창이 안 열리면 [서명 이미지 저장] 후 메일에 첨부해 보내 주세요.</p></div>`;
    $('#rs-again').onclick = () => sendMail(file, email, name, p);
    $('#rs-copy').onclick = () => copyText(email);
    $('#rs-save').onclick = () => downloadBlob(file, file.name);
  }

  return { list, create, view: view_, card, signer };
})();
