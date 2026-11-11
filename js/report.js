// 교육 결과 보고서: A4 페이지를 화면 밖에서 그려 이미지로 만들고, PDF로 묶는다.
const Report = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const JUDGE = { g: '양호', b: '미흡', n: '해당없음' };

  function fmtDate(iso, withTime = true) {
    if (!iso) return '';
    const d = new Date(iso);
    const p = n => String(n).padStart(2, '0');
    const s = `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())}.`;
    return withTime ? `${s} ${p(d.getHours())}:${p(d.getMinutes())}` : s;
  }

  // html2canvas 에서 <ol> 번호가 어긋나므로 번호를 직접 붙인다
  const list = arr => (arr || []).map((r, i) => `<div class="rp-li"><span>${i + 1}.</span><span>${esc(r)}</span></div>`).join('');

  class Flow {
    constructor(root, title) { this.root = root; this.title = title; this.pages = []; this.newPage(); }
    newPage() {
      const page = document.createElement('div');
      page.className = 'rp-page';
      page.innerHTML = `<div class="rp-top"><img class="rp-logo" src="img/brand-logo.png" alt="사람인 안전지도사 사무소"><span>안전교육 결과 · ${esc(this.title)}</span></div><div class="rp-body"></div><div class="rp-foot"><span>사람인안전지도사사무소</span><span class="rp-pno"></span></div>`;
      this.root.appendChild(page);
      this.pages.push(page);
      this.body = page.querySelector('.rp-body');
      return this.body;
    }
    over() { return this.body.scrollHeight > this.body.clientHeight + 1; }
    // 블록 추가: 넘치면 새 페이지로
    add(html) {
      const el = typeof html === 'string' ? Object.assign(document.createElement('div'), { innerHTML: html }).firstElementChild : html;
      this.body.appendChild(el);
      if (this.over() && this.body.children.length > 1) { el.remove(); this.newPage().appendChild(el); }
      return el;
    }
    // 표 추가: 행 단위로 페이지를 나눈다
    table(headHTML, rows, caption) {
      let t = null;
      const start = (cont) => {
        if (caption) this.add(`<div class="rp-cap">${esc(caption)}${cont ? ' (계속)' : ''}</div>`);
        t = this.add(`<table class="rp-table"><thead>${headHTML}</thead><tbody></tbody></table>`);
      };
      start(false);
      for (const r of rows) {
        const tr = Object.assign(document.createElement('tbody'), { innerHTML: r }).firstElementChild;
        t.tBodies[0].appendChild(tr);
        if (this.over()) {
          tr.remove();
          if (!t.tBodies[0].rows.length) t.remove();
          this.newPage(); start(true);
          t.tBodies[0].appendChild(tr);
        }
      }
    }
  }

  function checklistRows(topic, judg) {
    const rows = [];
    for (const sec of topic.checklist || []) {
      sec.items.forEach((it, i) => {
        const k = `${sec.sec}|${it.n}`;
        const j = (judg && judg[k]) || {};
        const mark = v => j.v === v ? '<b class="rp-mark">✔</b>' : '';
        rows.push(`<tr>
          <td class="rp-sec ${i ? 'cont' : ''}">${i ? '' : esc(sec.sec)}</td>
          <td class="rp-item ${it.key ? 'key' : ''}">${esc(it.n)}. ${esc(it.t)}${it.note ? `<div class="rp-note">${esc(it.note)}</div>` : ''}${j.memo ? `<div class="rp-memo">▶ ${esc(j.memo)}</div>` : ''}</td>
          <td class="rp-j">${mark('g')}</td><td class="rp-j bad">${mark('b')}</td><td class="rp-j">${mark('n')}</td>
        </tr>`);
      });
    }
    return rows;
  }

  async function build(session) {
    const root = document.createElement('div');
    root.className = 'rp-root';
    document.body.appendChild(root);
    const topics = session.topicData;
    const flow = new Flow(root, session.site || '');
    try {
      // 1. 교육 개요
      flow.add(`<h1 class="rp-h1">안전교육 결과</h1>`);
      flow.add(`<table class="rp-info">
        <tr><th>현장명</th><td>${esc(session.site)}</td><th>교육장소</th><td>${esc(session.place)}</td></tr>
        <tr><th>교육일시</th><td>${esc(fmtDate(session.date))}</td><th>지도요원(점검자)</th><td>${esc(INSPECTOR)}</td></tr>
        <tr><th>교육내용</th><td colspan="3">${topics.map(t => `[${esc(t.cat)}] ${esc(t.title)} ${esc(t.suffix || '')}`).join('<br>')}</td></tr>
        <tr><th>참석인원</th><td colspan="3">${session.workers.length}명</td></tr>
      </table>`);
      const sigRows = [];
      for (let i = 0; i < Math.max(6, session.workers.length); i++) {
        const w = session.workers[i];
        sigRows.push(`<tr class="rp-sigrow"><td>${i + 1}</td><td>${w ? esc(w.name) : ''}</td>
          <td class="rp-sigcell">${w ? `<img src="${Sig.toImage(w.sig, 400, 160)}">` : ''}</td>
          <td>${w ? esc(w.via) : ''}</td><td>${w ? esc(fmtDate(new Date(w.at * 1000).toISOString())) : ''}</td></tr>`);
      }
      flow.table(`<tr><th style="width:7%">번호</th><th style="width:20%">성명</th><th>서명</th><th style="width:15%">확인방식</th><th style="width:22%">확인일시</th></tr>`,
        sigRows, '교육 참석자 확인 및 서명 (아래 교육 내용을 교육받고 확인하였습니다)');
      flow.add(`<div class="rp-cap">교육 내용</div>`);
      for (const t of topics) {
        const np = (t.pages || []).length;
        flow.add(`<div class="rp-box"><div class="rp-box-t"><span class="rp-cat">${esc(t.cat)}</span>${esc(t.title)}${(t.rules || []).length ? ' — 핵심 안전수칙' : ''}${np ? ` <small>(교육자료 ${np}쪽)</small>` : ''}</div>
          ${list(t.rules)}<div class="rp-box-t2">${np ? '근로자 확인 항목' : '근로자는 이것만은 지켜야 합니다'}</div>${list(t.worker)}</div>`);
      }

      // 2. 작업별 자율점검표 (원본 양식)
      // 페이지 자료: 교육한 페이지를 작게 (한 줄에 3쪽)
      for (const t of topics) {
        const pages = t.pages || [];
        if (!pages.length) continue;
        flow.newPage();
        flow.add(`<h2 class="rp-h2"><span class="rp-cat">${esc(t.cat)}</span>${esc(t.title)} 교육자료 (${pages.length}쪽)</h2>`);
        for (let i = 0; i < pages.length; i += 3) {
          flow.add(`<div class="rp-pages">${pages.slice(i, i + 3).map((p, k) => `<figure><img src="${p.img}"><figcaption>${i + k + 1}쪽${p.cap ? ' · ' + esc(p.cap) : ''}</figcaption></figure>`).join('')}</div>`);
        }
      }

      for (const t of topics) {
        if (!(t.checklist || []).length) continue;
        flow.newPage();
        flow.add(`<h2 class="rp-h2"><span class="rp-cat">${esc(t.cat)}</span>${esc(t.title)} 사고예방 자율점검표</h2>`);
        flow.add(`<div class="rp-meta"><span>점검자: <b>${esc(INSPECTOR)}</b></span><span>점검일자: <b>${esc(fmtDate(session.date, false))}</b></span><span>점검장소: <b>${esc(session.place || session.site)}</b></span></div>`);
        const judg = (session.judg || {})[t.id] || {};
        flow.table(`<tr><th style="width:12%">구분</th><th>자율점검 항목</th><th class="rp-jh">양호</th><th class="rp-jh">미흡</th><th class="rp-jh">해당<br>없음</th></tr>`,
          checklistRows(t, judg));
        const vals = Object.values(judg);
        const cnt = v => vals.filter(x => x.v === v).length;
        flow.add(`<div class="rp-sum">판정 결과 — 양호 ${cnt('g')} · 미흡 ${cnt('b')} · 해당없음 ${cnt('n')}</div>`);
        flow.add(`<div class="rp-worker"><div class="rp-box-t2">근로자는 이것만은 지켜야 합니다</div>${list(t.worker)}</div>`);
      }

      // 3. 교육사진 및 미흡사항 사진
      flow.newPage();
      flow.add(`<h2 class="rp-h2">교육 사진</h2>`);
      if (session.photo) {
        flow.add(`<figure class="rp-photo"><img src="${session.photo}"><figcaption>${esc(session.site)} · ${esc(fmtDate(session.date))}</figcaption></figure>`);
      }
      const bad = [];
      for (const t of topics) {
        const judg = (session.judg || {})[t.id] || {};
        for (const [k, j] of Object.entries(judg)) if (j.photo) bad.push({ t, k, j });
      }
      if (bad.length) {
        flow.add(`<h2 class="rp-h2">미흡사항 사진</h2>`);
        for (const b of bad) {
          flow.add(`<figure class="rp-photo small"><img src="${b.j.photo}"><figcaption>[${esc(b.t.title)}] ${esc(b.k.split('|')[1])}번 항목${b.j.memo ? ' — ' + esc(b.j.memo) : ''}</figcaption></figure>`);
        }
      }

      // 쪽번호
      flow.pages.forEach((p, i) => { p.querySelector('.rp-pno').textContent = `${i + 1} / ${flow.pages.length}`; });
      // 그림 로딩 대기 (img.decode()는 화면 밖에서 멈출 수 있어 load 이벤트 + 시간 제한 사용)
      await Promise.all([...root.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => {
        img.onload = img.onerror = r; setTimeout(r, 4000);
      })));

      const images = [];
      for (const p of flow.pages) {
        const c = await html2canvas(p, { scale: 2, backgroundColor: '#ffffff', logging: false, scrollX: -window.scrollX, scrollY: -window.scrollY, useCORS: true });
        images.push(c.toDataURL('image/jpeg', 0.88));
      }
      // 교육일지·점검일지 등 첨부 쪽
      images.push(...await logPageImages(session.logs, `안전교육 결과 · ${session.site || ''} · 첨부`));
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
      images.forEach((src, i) => { if (i) pdf.addPage(); pdf.addImage(src, 'JPEG', 0, 0, 210, 297); });
      return { pdf: pdf.output('blob'), images };
    } finally {
      root.remove();
    }
  }

  return { build, fmtDate, JUDGE };
})();
