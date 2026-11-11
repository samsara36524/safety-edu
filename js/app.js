// 안전지도 앱 본체 (사람인안전지도사사무소)
const MAX_WORKERS = 6; // TBM 일지(A4 한 장) 작업자 칸
const EDU_MAX = 40; // 안전교육 서명 인원 (결과지는 쪽을 넘겨 이어짐)
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
const view = () => document.getElementById('view');
const APP_URL = location.href.split('#')[0].replace(/index\.html$/, '');
const uid = (n = 8) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
const STEPS = ['기본정보', '교육', '점검', '서명', '사진', '결과'];

const Store = { topics: [], byId: {} };

async function loadTopics() {
  const built = await fetch('data/topics.json?v=' + APP_VERSION, { cache: 'no-cache' }).then(r => r.json());
  let extra = [];
  try { const r = await fetch('data/extra.json'); if (r.ok) extra = await r.json(); } catch (e) { /* 없음 */ }
  extra.forEach(t => { t.extra = true; });
  let custom = [];
  try { custom = await DB.all('topics'); } catch (e) { /* 저장소 사용 불가 */ }
  custom.forEach(t => { t.custom = true; });
  Store.topics = [...built, ...extra, ...custom];
  Store.byId = Object.fromEntries(Store.topics.map(t => [t.id, t]));
}

// ---------- 공통 UI ----------
function toast(msg, ms = 2500) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms);
}
function modal(html, { onClose, wide } = {}) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="sheet ${wide ? 'wide' : ''}"><button class="x" aria-label="닫기">✕</button>${html}</div>`;
  document.body.appendChild(m);
  const close = () => { m.remove(); onClose && onClose(); };
  $('.x', m).onclick = close;
  m.addEventListener('click', e => { if (e.target === m) close(); });
  return { el: m, close };
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('복사했습니다.'); return true; }
  catch (e) {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    toast(ok ? '복사했습니다.' : '복사하지 못했습니다. 길게 눌러 직접 복사해 주세요.');
    return ok;
  }
}
async function shareLink(title, text, url) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  await copyText(`${text}\n${url}`);
  toast('링크를 복사했습니다. 카카오톡·문자에 붙여넣어 보내세요.', 4000);
  return true;
}
function readImage(file, max = 1600, q = 0.85) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', q));
      };
      img.onerror = reject; img.src = fr.result;
    };
    fr.onerror = reject; fr.readAsDataURL(file);
  });
}
function pickFile(accept, capture) {
  return new Promise(resolve => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; if (capture) i.capture = capture;
    i.onchange = () => resolve(i.files[0] || null);
    Keep.snapshot();
    i.click();
  });
}
function pickFiles(accept, multiple, capture) {
  return new Promise(resolve => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.multiple = !!multiple; if (capture) i.capture = capture;
    i.onchange = () => resolve([...i.files]);
    Keep.snapshot();
    i.click();
  });
}
const DEFAULT_WORKER = ['교육 내용을 듣고 이해했으며, 안전수칙을 지키겠습니다.'];
const dataUrlToBlob = d => fetch(d).then(r => r.blob());
const catClass = c => ({ '추락': 'c-fall', '충돌': 'c-hit', '맞음': 'c-hit', '붕괴': 'c-col', '화재': 'c-fire' }[String(c).split('·')[0]] || 'c-etc');

// ---------- 교육자료 표시 ----------
function topicHTML(t, opt = {}) {
  const imgOK = src => src && (src.startsWith('img/') || src.startsWith('data:'));
  return `<article class="topic">
    <h2 class="t-title"><span class="cat ${catClass(t.cat)}">${esc(t.cat)}</span>${esc(t.title)} <small>${esc(t.suffix || '')}</small></h2>
    ${t.desc ? `<p class="t-desc">${esc(t.desc).replace(/\n/g, '<br>')}</p>` : ''}
    ${Pages.viewHTML(t)}
    ${imgOK(t.photo) ? `<figure class="t-photo"><img src="${t.photo}" alt="" loading="lazy"><figcaption>${esc(t.photoCap || '')}</figcaption></figure>` : ''}
    ${t.cases && t.cases.length ? `<section class="t-sec cases"><h3>사고사례</h3><ol>${t.cases.map((c, i) => `<li><b>사례${i + 1}</b> ${esc(c)}</li>`).join('')}</ol></section>` : ''}
    ${imgOK(t.illust) ? `<figure class="t-illust"><img src="${t.illust}" alt="" loading="lazy">${(t.illustCap || []).length ? `<figcaption>${t.illustCap.map(esc).join('<br>')}</figcaption>` : ''}</figure>` : ''}
    ${t.rules && t.rules.length ? `<section class="t-sec rules"><h3>핵심 안전수칙</h3><ol>${t.rules.map((c, i) => `<li><b>예방${i + 1}</b> ${esc(c)}</li>`).join('')}</ol></section>` : ''}
    ${t.worker && t.worker.length ? `<section class="t-sec wrk"><h3>근로자는 이것만은 지켜야 합니다</h3><ol>${t.worker.map(c => `<li>${esc(c)}</li>`).join('')}</ol></section>` : ''}
    ${opt.links !== false ? `<div class="t-links">
      ${t.video ? `<a class="btn ghost" href="${esc(t.video)}" target="_blank" rel="noopener">▶ 교육 영상</a>` : ''}
      ${t.src && t.src.length ? `<a class="btn ghost" href="#/src/${t.id}">원본 자료</a>` : ''}
      ${opt.checklist !== false && t.checklist && t.checklist.length ? `<button class="btn ghost" data-cl="${t.id}">자율점검표</button>` : ''}
    </div>` : ''}
  </article>`;
}
function checklistHTML(t) {
  return `<h2>${esc(t.title)} 사고예방 자율점검표</h2>` + (t.checklist || []).map(sec => `
    <h3 class="cl-sec">${esc(sec.sec)}</h3>
    <ul class="cl-list">${sec.items.map(it => `<li class="${it.key ? 'key' : ''}"><b>${esc(it.n)}.</b> ${esc(it.t)}${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}</li>`).join('')}</ul>`).join('');
}
function bindTopicButtons(root, topics = []) {
  const find = id => topics.find(t => t.id === id) || Store.byId[id] || {};
  $$('[data-cl]', root).forEach(b => b.onclick = () => modal(checklistHTML(find(b.dataset.cl)), { wide: true }));
  $$('[data-slides]', root).forEach(b => b.onclick = () => Pages.show(find(b.dataset.slides).pages, 0));
  $$('.t-pages [data-slide]', root).forEach(img => img.onclick = () => Pages.show(find(img.closest('.t-pages').querySelector('[data-slides]').dataset.slides).pages, +img.dataset.slide));
}

const ICON = {"edu": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z\"/><path d=\"M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5z\"/><path d=\"M9 8h7M9 11.5h5\"/></svg>", "tbm": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"5\" y=\"4\" width=\"14\" height=\"17\" rx=\"2\"/><path d=\"M9 4V2.8h6V4\"/><path d=\"m8.5 12.5 2.3 2.3 4.7-4.8\"/></svg>", "meas": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"6\" y=\"2.5\" width=\"12\" height=\"19\" rx=\"2\"/><rect x=\"8.5\" y=\"5\" width=\"7\" height=\"5\" rx=\"1\"/><path d=\"M10 14.5h4M10 17.5h4\"/></svg>", "law": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z\"/><path d=\"m9 12 2 2 4-4\"/></svg>", "sapa": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 3v18M5 7h14\"/><path d=\"M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z\"/><path d=\"M8 21h8\"/></svg>", "sif": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z\"/><path d=\"M12 9v4M12 17h.01\"/></svg>", "site": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"9\" cy=\"8\" r=\"3.2\"/><path d=\"M3.5 20a5.5 5.5 0 0 1 11 0\"/><circle cx=\"17\" cy=\"9\" r=\"2.4\"/><path d=\"M15.5 14.2A4.5 4.5 0 0 1 21 18.5\"/></svg>", "rec": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"5\" rx=\"1.5\"/><path d=\"M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9\"/><path d=\"M10 13h4\"/></svg>", "set": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z\"/></svg>", "help": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.3-2.5 4\"/><path d=\"M12 17.3h.01\"/></svg>"};
// ---------- 앱 설치 (홈 화면에 등록) ----------
let installEvt = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; drawInstall(); });
window.addEventListener('appinstalled', () => { installEvt = null; drawInstall(); toast('홈 화면에 "안전지도" 앱을 등록했습니다.', 3500); });
function drawInstall() {
  const box = document.getElementById('install');
  if (!box) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (standalone()) { box.innerHTML = ''; return; }
  if (installEvt) {
    box.innerHTML = `<button class="install" id="inst"><img src="icons/app-192.png" alt=""><span><b>홈 화면에 앱 설치</b><small>아이콘을 눌러 바로 실행 · 인터넷 없이도 열림</small></span><em>설치</em></button>`;
    $('#inst').onclick = async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; drawInstall(); };
  } else if (ios) {
    box.innerHTML = `<p class="install-tip">홈 화면에 앱으로 등록: Safari 아래 <b>공유</b> 버튼 → <b>홈 화면에 추가</b></p>`;
  } else box.innerHTML = '';
}

// ---------- 화면: 홈 ----------
async function home() {
  const sessions = (await DB.all('sessions').catch(() => [])).sort((a, b) => b.created - a.created);
  const ongoing = sessions.filter(s => !s.done && !s.kind).slice(0, 5);
  const tbmOn = sessions.filter(s => !s.done && s.kind === 'tbm').slice(0, 5);
  const measOn = sessions.filter(s => !s.done && s.kind === 'meas').slice(0, 5);
  const lawOn = sessions.filter(s => !s.done && s.kind === 'law').slice(0, 5);
  const sapaOn = sessions.filter(s => !s.done && s.kind === 'sapa').slice(0, 5);
  const sifOn = sessions.filter(s => !s.done && s.kind === 'sif').slice(0, 5);
  const menu = [['#/topics', 'edu', '안전교육', '교육 시작·교육자료'], ['#/tbm', 'tbm', 'TBM 일지', '작업 전 안전점검회의'],
    ['#/meas', 'meas', '장비측정', '측정값·지도사항·사진'], ['#/law', 'law', '산안법 관리체계점검', '과태료 부과기준·서명'], ['#/sapa', 'sapa', '중처법 관리체계점검', '실행전략 세부항목·서명'], ['#/sif', 'sif', '고위험요인 평가', '공종·작업별 SIF 위험성평가'],
    ['#/sites', 'site', '현장·근로자', '현장·교육받은 사람'], ['#/records', 'rec', '기록', '지난 결과 다시 저장'],
    ['#/settings', 'set', '설정', '비밀번호·저장 폴더'], ['#/help', 'help', '사용 방법', '진행 순서 안내']];
  view().innerHTML = `
    <div class="home-brand"><img src="img/brand-logo.png" alt="사람인 안전지도사 사무소"></div>
    <div id="install"></div>
    <nav class="menu2">${menu.map(([h, i, t, d]) => `<a href="${h}"><i>${ICON[i]}</i><b>${t}</b><span>${d}</span></a>`).join('')}</nav>
    ${ongoing.length ? `<h2 class="h">진행 중인 교육</h2><div class="cards">${ongoing.map(sessionCard).join('')}</div>` : ''}
    ${tbmOn.length ? `<h2 class="h">진행 중인 TBM</h2><div class="cards">${tbmOn.map(TBM.card).join('')}</div>` : ''}
    ${measOn.length ? `<h2 class="h">작성 중인 장비측정</h2><div class="cards">${measOn.map(Meas.card).join('')}</div>` : ''}
    ${lawOn.length ? `<h2 class="h">작성 중인 산안법 관리체계점검</h2><div class="cards">${lawOn.map(Law.card).join('')}</div>` : ''}
    ${sapaOn.length ? `<h2 class="h">작성 중인 중처법 관리체계점검</h2><div class="cards">${sapaOn.map(Sapa.card).join('')}</div>` : ''}
    ${sifOn.length ? `<h2 class="h">작성 중인 고위험요인 평가</h2><div class="cards">${sifOn.map(Sif.card).join('')}</div>` : ''}`;
  drawInstall();
}
function sessionCard(s) {
  const n = s.workers.length;
  return `<a class="card" href="#/s/${s.id}/${s.step || 0}">
    <b>${esc(s.site || '(현장명 없음)')}</b>
    <span>${esc(Report.fmtDate(s.date))} · ${esc((s.topicData || []).map(t => t.title).join(', '))}</span>
    <span class="badge ${s.done ? 'ok' : ''}">${s.done ? '완료' : STEPS[s.step || 0] + ' 단계'} · 서명 ${n}명</span></a>`;
}

// ---------- 화면: 교육자료 목록/상세 ----------
function topicsList() {
  const groups = {};
  Store.topics.forEach(t => { const g = t.custom ? '내가 추가한 자료' : (t.extra ? '추가 자료' : String(t.cat).split('·')[0]); (groups[g] = groups[g] || []).push(t); });
  view().innerHTML = `
    <div class="bar"><h1>안전교육</h1></div>
    <a class="btn big primary block" href="#/new">＋ 안전교육 시작</a>
    <div class="subacts"><span>자료 추가</span><a class="btn sm" href="#/edit/newpages">페이지 자료(PDF·사진)</a><a class="btn sm" href="#/edit/new">직접 작성</a><button class="btn sm ghost" id="imp">가져오기</button><button class="btn sm ghost" id="exp">내보내기</button></div>
    ${Object.entries(groups).map(([g, list]) => `<h2 class="h">${esc(g)}</h2><div class="cards">${list.map(t => `
      <a class="card topic-card" href="#/topic/${t.id}">
        ${t.illust || (t.pages || [])[0] ? `<img src="${t.illust || t.pages[0].img}" alt="" loading="lazy">` : '<div class="noimg">자료</div>'}
        <div><b><span class="cat ${catClass(t.cat)}">${esc(t.cat)}</span>${esc(t.title)}</b><span>${t.pages && t.pages.length ? `페이지 자료 ${t.pages.length}쪽` : esc((t.rules || [])[0] || '')}</span></div></a>`).join('')}</div>`).join('')}`;
  $('#imp').onclick = importTopics;
  $('#exp').onclick = () => exportTopics(Store.topics.filter(t => t.custom));
}
function topicView(id) {
  const t = Store.byId[id];
  if (!t) { view().innerHTML = '<p>자료를 찾을 수 없습니다.</p>'; return; }
  view().innerHTML = `<div class="bar"><a class="btn ghost" href="#/topics">← 목록</a>
    <div class="row">${t.custom ? `<a class="btn ghost" href="#/edit/${t.id}">수정</a><button class="btn ghost" id="exp1">내보내기</button>` : ''}
    <a class="btn ghost" href="#/edit/new~${t.id}">복사해서 새 자료</a></div></div>
    ${topicHTML(t)}`;
  bindTopicButtons(view());
  if ($('#exp1')) $('#exp1').onclick = () => exportTopics([t]);
}
function srcView(id) {
  const t = Store.byId[id];
  view().innerHTML = `<div class="bar"><a class="btn ghost" href="#/topic/${id}">← ${esc(t ? t.title : '')}</a></div>
    <div class="src">${(t && t.src || []).map(s => `<img src="${s}" alt="원본" loading="lazy">`).join('')}</div>`;
}

// ---------- 확장: 교육자료 추가/수정 ----------
function checklistToText(cl) {
  return (cl || []).map(sec => `# ${sec.sec}\n` + sec.items.map(it => `${it.key ? '! ' : ''}${it.t}${it.note ? `\n* ${it.note.replace(/^\*\s*/, '')}` : ''}`).join('\n')).join('\n');
}
function textToChecklist(text) {
  const out = []; let sec = null, n = 0;
  for (const raw of String(text || '').split('\n')) {
    const l = raw.trim(); if (!l) continue;
    if (l.startsWith('#')) { sec = { sec: l.replace(/^#+\s*/, ''), items: [] }; out.push(sec); continue; }
    if (!sec) { sec = { sec: '점검', items: [] }; out.push(sec); }
    if ((l.startsWith('*') || l.startsWith('※')) && sec.items.length) {
      const it = sec.items[sec.items.length - 1];
      it.note = (it.note ? it.note + ' / ' : '') + l.replace(/^[*※]\s*/, '');
      continue;
    }
    const key = l.startsWith('!');
    const t = l.replace(/^!\s*/, '').replace(/^\d+(-\d+)?[.)]\s*/, '');
    sec.items.push(Object.assign({ n: String(++n), t }, key ? { key: true } : {}));
  }
  return out;
}
async function editor(arg) {
  let t, isNew = false;
  const pagesMode0 = arg === 'newpages';
  if (arg.startsWith('new')) {
    isNew = true;
    const from = arg.split('~')[1];
    t = from && Store.byId[from] ? JSON.parse(JSON.stringify(Store.byId[from])) : pagesMode0 ? { cat: '기타', suffix: '', pages: [] } : { cat: '추락', suffix: '작업 시 안전수칙' };
    if (from) t.title = (t.title || '') + ' (사본)';
    // 기본 자료의 그림 경로는 그대로 사용
    t.id = 'c-' + uid(6); delete t.extra; t.custom = true;
  } else {
    t = Store.byId[arg];
    if (!t || !t.custom) { view().innerHTML = '<p>수정할 수 없는 자료입니다. "복사해서 새 자료"를 이용하세요.</p>'; return; }
    t = JSON.parse(JSON.stringify(t));
  }
  const cats = [...new Set(Store.topics.map(x => x.cat))];
  t.pages = t.pages || [];
  const pagesMode = pagesMode0 || t.pages.length > 0;
  view().innerHTML = `<div class="bar"><a class="btn ghost" href="#/topics">← 목록</a><h1>${isNew ? (pagesMode ? '페이지 자료 등록' : '새 교육자료') : '교육자료 수정'}</h1></div>
  <form class="form" id="ef">
    <label>${pagesMode ? '자료 제목' : '작업명'} <input name="title" required value="${esc(t.title || '')}" placeholder="${pagesMode ? '예: 동절기 한랭질환 예방' : '예: 밀폐공간'}"></label>
    <fieldset><legend>교육 페이지 ${pagesMode ? '' : '<small>(선택)</small>'}</legend><div id="pg-box"></div></fieldset>
    ${pagesMode ? `<label>근로자 확인 항목 <small>(한 줄에 하나씩, 근로자가 체크하고 서명. 비우면 "${esc(DEFAULT_WORKER[0])}")</small><textarea name="worker" rows="3">${esc((t.worker || []).join('\n'))}</textarea></label>
    <details class="more"><summary>추가 정보 (선택: 재해유형·개요·핵심수칙·자율점검표 등)</summary>` : ''}
    <div class="grid2">
      <label>재해유형 <input name="cat" list="cats" value="${esc(t.cat)}" placeholder="추락·충돌·맞음·붕괴·화재 등"><datalist id="cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label>제목 뒤 문구 <input name="suffix" value="${esc(t.suffix || '')}"></label>
    </div>
    <label>개요 <textarea name="desc" rows="3">${esc(t.desc || '')}</textarea></label>
    <div class="grid2">
      <div class="imgpick"><span>대표 사진</span><img id="pv-photo" ${t.photo ? `src="${t.photo}"` : ''}><div class="row"><button type="button" class="btn ghost" data-pick="photo">사진 선택</button><button type="button" class="btn ghost" data-clear="photo">삭제</button></div></div>
      <div class="imgpick"><span>예방 그림</span><img id="pv-illust" ${t.illust ? `src="${t.illust}"` : ''}><div class="row"><button type="button" class="btn ghost" data-pick="illust">그림 선택</button><button type="button" class="btn ghost" data-clear="illust">삭제</button></div></div>
    </div>
    <label>사진 설명 <input name="photoCap" value="${esc(t.photoCap || '')}"></label>
    <label>사고사례 <small>(한 줄에 하나씩)</small><textarea name="cases" rows="3">${esc((t.cases || []).join('\n'))}</textarea></label>
    <label>그림 설명 <small>(한 줄에 하나씩)</small><textarea name="illustCap" rows="2">${esc((t.illustCap || []).join('\n'))}</textarea></label>
    <label>핵심 안전수칙 <small>(한 줄에 하나씩)</small><textarea name="rules" rows="3">${esc((t.rules || []).join('\n'))}</textarea></label>
    ${pagesMode ? '' : `<label>근로자는 이것만은 지켜야 합니다 <small>(한 줄에 하나씩, 근로자가 체크하는 항목)</small><textarea name="worker" rows="3">${esc((t.worker || []).join('\n'))}</textarea></label>`}
    <label>교육 영상 링크 <input name="video" type="url" value="${esc(t.video || '')}" placeholder="https://youtu.be/..."></label>
    <label>자율점검표
      <small># 으로 시작하면 구분, ! 로 시작하면 핵심항목, * 로 시작하면 바로 위 항목의 참고 설명</small>
      <textarea name="checklist" rows="12" placeholder="# 사전 확인&#10;! 작업계획서를 작성한다.&#10;* 2m 이상 작업 시&#10;# 작업 안전&#10;안전모를 착용한다.">${esc(checklistToText(t.checklist))}</textarea></label>
    ${pagesMode ? '</details>' : ''}
    <div class="row sticky-actions">
      <button class="btn primary" type="submit">저장</button>
      ${!isNew ? '<button class="btn danger" type="button" id="del">삭제</button>' : ''}
    </div>
  </form>`;
  const f = $('#ef');
  const drawPages = () => {
    $('#pg-box').innerHTML = Pages.editorHTML(t.pages);
    Pages.bindEditor($('#pg-box'), t.pages, drawPages, { pickFiles, readImage, toast });
  };
  drawPages();
  $$('[data-pick]', f).forEach(b => b.onclick = async () => {
    const file = await pickFile('image/*'); if (!file) return;
    t[b.dataset.pick] = await readImage(file, 1400, 0.82);
    $('#pv-' + b.dataset.pick).src = t[b.dataset.pick];
  });
  $$('[data-clear]', f).forEach(b => b.onclick = () => { t[b.dataset.clear] = ''; $('#pv-' + b.dataset.clear).removeAttribute('src'); });
  f.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(f);
    Object.assign(t, {
      title: fd.get('title').trim(), cat: fd.get('cat').trim() || '기타', suffix: fd.get('suffix').trim(),
      desc: fd.get('desc').trim(), photoCap: fd.get('photoCap').trim(), video: fd.get('video').trim(),
      cases: lines(fd.get('cases')), illustCap: lines(fd.get('illustCap')), rules: lines(fd.get('rules')),
      worker: lines(fd.get('worker')), checklist: textToChecklist(fd.get('checklist')), custom: true, updated: Date.now()
    });
    delete t.src;
    if (pagesMode && !t.pages.length) { toast('교육 페이지를 1쪽 이상 추가하세요.'); return; }
    if (!t.worker.length) {
      if (!pagesMode) { toast('근로자 확인 항목을 1개 이상 입력하세요.'); return; }
      t.worker = DEFAULT_WORKER.slice();
    }
    try { await DB.put('topics', t); } catch (err) { toast('저장하지 못했습니다(기기 저장 공간 부족 등): ' + err.message, 5000); return; }
    await loadTopics();
    toast('저장했습니다.');
    location.hash = '#/topic/' + t.id;
  };
  if ($('#del')) $('#del').onclick = async () => {
    if (!confirm('이 교육자료를 삭제할까요?')) return;
    await DB.del('topics', t.id); await loadTopics(); location.hash = '#/topics';
  };
}
async function exportTopics(list) {
  if (!list.length) { toast('내보낼 "내가 추가한 자료"가 없습니다.'); return; }
  const data = list.map(t => { const c = { ...t }; delete c.custom; return c; });
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const name = `안전교육자료_${list.length === 1 ? list[0].title : list.length + '건'}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  downloadBlob(blob, name);
}
async function importTopics() {
  const file = await pickFile('.json,application/json'); if (!file) return;
  try {
    let data = JSON.parse(await file.text());
    if (!Array.isArray(data)) data = [data];
    let n = 0;
    for (const t of data) {
      if (!t.title || !(Array.isArray(t.worker) || Array.isArray(t.pages))) continue;
      if (!Array.isArray(t.worker) || !t.worker.length) t.worker = DEFAULT_WORKER.slice();
      if (!t.id || Store.byId[t.id] && !Store.byId[t.id].custom) t.id = 'c-' + uid(6);
      t.custom = true; await DB.put('topics', t); n++;
    }
    await loadTopics(); toast(`${n}건을 가져왔습니다.`); topicsList();
  } catch (e) { toast('파일을 읽지 못했습니다: ' + e.message); }
}

// ---------- 교육 진행 ----------
async function newSession(siteArg) {
  const inspector = INSPECTOR;
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  const reg = siteArg ? await Registry.site(decodeURIComponent(siteArg)) : null;
  const s = { id: uid(10), created: Date.now(), site: reg ? reg.name : '', place: reg ? reg.place : '', inspector, date: d.toISOString().slice(0, 16), topics: [], topicData: [], judg: {}, workers: [], photo: '', step: 0, done: false };
  await DB.put('sessions', s);
  location.replace('#/s/' + s.id + '/0');
}
async function saveSession(s) { s.updated = Date.now(); await DB.put('sessions', s); }

async function sessionView(id, stepStr) {
  const s = await DB.get('sessions', id);
  if (!s) { view().innerHTML = '<p>교육 기록을 찾을 수 없습니다.</p><a class="btn" href="#/">처음으로</a>'; return; }
  const step = Math.min(5, +(stepStr || 0));
  if (s.step !== step) { s.step = step; await saveSession(s); }
  const steps = `<nav class="steps">${STEPS.map((n, i) => `<a href="#/s/${s.id}/${i}" class="${i === step ? 'on' : ''} ${i < step ? 'past' : ''}"><i>${i + 1}</i>${n}</a>`).join('')}</nav>`;
  view().innerHTML = steps + '<div id="stepbody"></div>';
  const body = $('#stepbody');
  const go = i => { location.hash = `#/s/${s.id}/${i}`; };
  const nav = (prev, next, nextLabel = '다음 →') => `<div class="row sticky-actions">${prev !== null ? `<button class="btn ghost" data-go="${prev}">← 이전</button>` : ''}<button class="btn primary" data-go="${next}">${nextLabel}</button></div>`;
  const bindNav = (before) => $$('[data-go]', body).forEach(b => b.onclick = async () => { if (before && (await before()) === false) return; go(+b.dataset.go); });

  if (step === 0) {
    const cats = {};
    Store.topics.forEach(t => { const g = t.custom ? '내가 추가한 자료' : String(t.cat).split('·')[0]; (cats[g] = cats[g] || []).push(t); });
    body.innerHTML = `<form class="form" id="f0">
      <label>현장명<input name="site" required value="${esc(s.site)}" placeholder="현장명 입력 또는 검색 (초성 검색 가능)"></label>
      <div class="grid2"><label>교육장소 <input name="place" value="${esc(s.place)}" placeholder="예: 3층 슬래브"></label>
      <label>교육일시 <input name="date" type="datetime-local" value="${esc(s.date)}"></label></div>
      <label>지도요원(점검자) <input value="${esc(INSPECTOR)}" readonly class="fixed"></label>
      <fieldset><legend>교육할 작업 선택 <small>(여러 개 선택 가능)</small></legend>
      ${Object.entries(cats).map(([g, list]) => `<div class="chk-group"><b>${esc(g)}</b>${list.map(t => `<label class="chip"><input type="checkbox" name="t" value="${t.id}" ${s.topics.includes(t.id) ? 'checked' : ''}><span>${esc(t.title)}</span></label>`).join('')}</div>`).join('')}
      </fieldset></form>` + nav(null, 1);
    const f0 = $('#f0');
    siteField(f0.site, st => { if (st.place) f0.place.value = st.place; });
    bindNav(async () => {
      const f = $('#f0'), fd = new FormData(f);
      if (!fd.get('site').trim()) { toast('현장명을 입력하세요.'); return false; }
      const ids = fd.getAll('t');
      if (!ids.length) { toast('교육할 작업을 1개 이상 선택하세요.'); return false; }
      if (s.workers.length && ids.join() !== s.topics.join() && !confirm('작업을 바꾸면 이미 받은 서명과 내용이 달라질 수 있습니다. 계속할까요?')) return false;
      Object.assign(s, { site: fd.get('site').trim(), place: fd.get('place').trim(), date: fd.get('date'), inspector: INSPECTOR, topics: ids });
      s.topicData = ids.map(i => JSON.parse(JSON.stringify(Store.byId[i])));
      await saveSession(s);
      await Registry.addSite(s.site, s.place);
    });
    return;
  }
  if (!s.topicData.length) { go(0); return; }

  if (step === 1) {
    body.innerHTML = `<div class="tabs">${s.topicData.map((t, i) => `<button class="tab ${i ? '' : 'on'}" data-i="${i}">${esc(t.title)}</button>`).join('')}</div>
      <div id="tcontent"></div>` + nav(0, 2);
    const show = i => { $('#tcontent').innerHTML = topicHTML(s.topicData[i]); bindTopicButtons($('#tcontent'), s.topicData); $$('.tab', body).forEach((b, k) => b.classList.toggle('on', k === i)); };
    $$('.tab', body).forEach(b => b.onclick = () => show(+b.dataset.i));
    show(0); bindNav();
    return;
  }

  if (step === 2) {
    const total = s.topicData.reduce((n, t) => n + (t.checklist || []).reduce((m, sec) => m + sec.items.length, 0), 0);
    body.innerHTML = `<p class="hint">각 항목을 <b>양호 / 미흡 / 해당없음</b> 으로 판정하세요. 미흡이면 메모와 사진을 남길 수 있습니다. 파란 글씨는 핵심 항목입니다.</p>
      <div class="progress"><span id="pg"></span></div>
      ${s.topicData.map(t => !(t.checklist || []).length ? `<section class="cl"><h2>${esc(t.title)}</h2><p class="hint">이 자료에는 자율점검표가 없습니다.</p></section>` : `<section class="cl" data-t="${t.id}">
        <div class="bar"><h2>${esc(t.title)} 자율점검표</h2><button class="btn ghost sm" data-allgood="${t.id}">미판정 → 모두 양호</button></div>
        ${t.checklist.map(sec => `<h3 class="cl-sec">${esc(sec.sec)}</h3>${sec.items.map(it => {
          const k = `${sec.sec}|${it.n}`; const j = ((s.judg[t.id] || {})[k]) || {};
          return `<div class="cl-item ${it.key ? 'key' : ''}" data-k="${esc(k)}">
            <div class="cl-text"><b>${esc(it.n)}.</b> ${esc(it.t)}${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}</div>
            <div class="judge">${['g', 'b', 'n'].map(v => `<button type="button" data-v="${v}" class="j-${v} ${j.v === v ? 'on' : ''}">${Report.JUDGE[v]}</button>`).join('')}</div>
            <div class="bad-extra ${j.v === 'b' ? '' : 'hide'}"><input class="memo" placeholder="미흡 내용·조치사항" value="${esc(j.memo || '')}">
              <button type="button" class="btn ghost sm ph">${j.photo ? '사진 변경' : '사진 첨부'}</button>${j.photo ? `<img class="thumb" src="${j.photo}">` : ''}</div>
          </div>`;
        }).join('')}`).join('')}
      </section>`).join('')}` + nav(1, 3);
    const upd = () => {
      const n = Object.values(s.judg).reduce((a, o) => a + Object.values(o).filter(x => x.v).length, 0);
      $('#pg').style.width = (total ? n / total * 100 : 100) + '%'; $('#pg').textContent = `${n} / ${total}`;
    };
    const J = (t, k) => { s.judg[t] = s.judg[t] || {}; return (s.judg[t][k] = s.judg[t][k] || {}); };
    $$('.cl-item', body).forEach(el => {
      const t = el.closest('.cl').dataset.t, k = el.dataset.k;
      $$('.judge button', el).forEach(b => b.onclick = async () => {
        const j = J(t, k); j.v = j.v === b.dataset.v ? undefined : b.dataset.v;
        $$('.judge button', el).forEach(x => x.classList.toggle('on', x.dataset.v === j.v));
        $('.bad-extra', el).classList.toggle('hide', j.v !== 'b');
        await saveSession(s); upd();
      });
      $('.memo', el).onchange = async e => { J(t, k).memo = e.target.value.trim(); await saveSession(s); };
      $('.ph', el).onclick = async () => {
        const file = await pickFile('image/*', 'environment'); if (!file) return;
        J(t, k).photo = await readImage(file, 1200, 0.8); await saveSession(s);
        sessionView(id, 2);
      };
    });
    $$('[data-allgood]', body).forEach(b => b.onclick = async () => {
      const t = s.topicData.find(x => x.id === b.dataset.allgood);
      t.checklist.forEach(sec => sec.items.forEach(it => { const j = J(t.id, `${sec.sec}|${it.n}`); if (!j.v) j.v = 'g'; }));
      await saveSession(s); sessionView(id, 2);
    });
    upd(); bindNav();
    return;
  }

  if (step === 3) {
    body.innerHTML = `<p class="hint">근로자 핵심수칙 확인과 서명을 받습니다(최대 ${EDU_MAX}명). 이 기기에서 바로 받거나, 근로자 폰으로 QR·링크를 보내세요.</p>
      <div class="sig-actions">
        <button class="btn primary" id="a-qr">현장 QR 보여주기</button>
        <button class="btn" id="a-scan">결과 QR 스캔</button>
        <button class="btn" id="a-remote">원격 링크 보내기</button>
        <button class="btn ghost" id="a-paste">결과 코드 붙여넣기</button>
      </div>
      <h2 class="h">서명 현황 <span id="cnt"></span></h2>
      <ol class="sig-list" id="sl"></ol>
      <h2 class="h">이 기기에서 서명 받기</h2>
      ${confirmOnceHTML(s.topicData.map(t => ({ title: `${t.title} — 근로자는 이것만은 지켜야 합니다`, items: (t.worker || []).map(esc) })))}
      <div id="known"></div>
      <div id="slots"></div>` + nav(2, 4);
    let render = () => {
      $('#cnt').textContent = `${s.workers.length}명`;
      $('#sl').innerHTML = s.workers.length ? s.workers.map((w, i) => `<li><img src="${Sig.toImage(w.sig, 250, 100)}"><div><b>${esc(w.name)}</b><span>${esc(w.via)} · ${esc(Report.fmtDate(new Date(w.at * 1000).toISOString()))}</span></div><button class="btn ghost sm" data-del="${i}">삭제</button></li>`).join('')
        : '<li class="empty">아직 받은 서명이 없습니다.</li>';
      $$('[data-del]', body).forEach(b => b.onclick = async () => {
        if (!confirm('이 서명을 삭제할까요?')) return;
        s.workers.splice(+b.dataset.del, 1); await saveSession(s); render();
      });
    };
    const full = () => { if (s.workers.length >= EDU_MAX) { toast(`서명은 ${EDU_MAX}명까지 받을 수 있습니다.`); return true; } return false; };
    $('#a-qr').onclick = async () => {
      if (full()) return;
      const url = await inviteLink(s, 'q');
      const m = modal(`<h2>근로자 QR</h2><p class="hint">근로자가 휴대폰 카메라로 아래 QR을 찍으면 교육 화면이 열립니다. 서명을 마치면 근로자 화면에 <b>결과 QR</b>이 나오니, [결과 QR 스캔]으로 받으세요.</p>
        <div class="qrbox">${QR.svg(url)}</div><div class="row center"><button class="btn ghost" id="cp">링크 복사</button></div>`, { wide: true });
      $('#cp', m.el).onclick = () => copyText(url);
    };
    $('#a-remote').onclick = async () => {
      if (full()) return;
      const url = await inviteLink(s, 'r');
      await shareLink('안전교육', `[안전교육] ${s.site} 안전교육 자료입니다. 끝까지 읽고 확인·서명한 뒤 '결과 보내기'로 회신해 주세요.`, url);
    };
    $('#a-scan').onclick = () => {
      if (full()) return;
      const m = modal(`<h2>결과 QR 스캔</h2><p class="hint">근로자 휴대폰에 표시된 결과 QR을 비추세요.</p><video class="scan" muted></video>`, { wide: true, onClose: () => sc.stop() });
      const sc = QR.scan($('video', m.el), async text => {
        sc.stop(); m.close();
        const r = await importCode(text, s.id); toast(r.msg, 3500);
        if (r.ok) { Object.assign(s, await DB.get('sessions', s.id)); render(); }
      });
      sc.start().catch(e => { m.close(); toast('카메라를 열 수 없습니다: ' + e.message, 4000); });
    };
    $('#a-paste').onclick = () => {
      const m = modal(`<h2>결과 코드 붙여넣기</h2><p class="hint">근로자가 보낸 결과 링크 전체나 코드를 붙여넣으세요.</p><textarea id="pc" rows="5"></textarea><div class="row"><button class="btn primary" id="pok">가져오기</button></div>`);
      $('#pok', m.el).onclick = async () => {
        const r = await importCode($('#pc', m.el).value, s.id); toast(r.msg, 3500);
        if (r.ok) { m.close(); Object.assign(s, await DB.get('sessions', s.id)); render(); }
      };
    };
    // 이 기기에서 여러 명 서명: 기본 4칸, [＋ 서명자 추가]로 늘림
    const known = await Registry.people(s.site);
    const slots = signSlots($('#slots'), {
      key: s.id, names: known, signed: () => s.workers.map(w => w.name), room: () => EDU_MAX - s.workers.length,
      onSave: async list => {
        const at = Math.floor(Date.now() / 1000);
        for (const x of list) s.workers.push({ name: x.name, sig: x.sig, at, via: x.reuse ? '현장(이전 서명)' : '현장(지도요원 기기)' });
        await saveSession(s);
        await Registry.addPeople(s.site, list.map(x => x.name));
        for (const x of list) await Registry.addSig(x.name, x.sig, s.site, at * 1000);
        render(); toast(`${list.map(x => x.name).join(', ')} 님 서명을 저장했습니다.`, 3000);
        return list;
      }
    });
    // 이 현장에 등록된 근로자: 누르면 빈 서명칸에 이름이 들어간다
    const renderKnown = () => {
      const done = new Set(s.workers.map(w => w.name));
      $('#known').innerHTML = known.length ? `<p class="hint">이 현장 등록 근로자 <small>(누르면 빈 서명칸에 이름이 들어갑니다)</small></p>
        <div class="people">${known.map(n => `<button class="pchip ${done.has(n) ? 'done' : ''}" data-n="${esc(n)}">${esc(n)}${done.has(n) ? ' ✔' : ''}</button>`).join('')}</div>` : '';
      $$('#known [data-n]').forEach(b => b.onclick = () => {
        if (done.has(b.dataset.n) && !confirm(`${b.dataset.n} 님은 이미 서명했습니다. 한 번 더 받을까요?`)) return;
        slots.fill(b.dataset.n);
      });
    };
    const render0 = render;
    render = () => { render0(); renderKnown(); };
    render(); bindNav();
    return;
  }

  if (step === 4) {
    body.innerHTML = `<p class="hint">교육 장면 사진 1장을 촬영하세요. (필수)</p>
      <div class="photo-area">${s.photo ? `<img src="${s.photo}">` : '<div class="nophoto">사진 없음</div>'}</div>
      <div class="row center"><button class="btn primary" id="shot">${s.photo ? '다시 촬영' : '사진 촬영'}</button><button class="btn ghost" id="gal">앨범에서 선택</button></div>` + nav(3, 5);
    const take = async cap => {
      const file = await pickFile('image/*', cap); if (!file) return;
      s.photo = await readImage(file, 1600, 0.85); await saveSession(s); sessionView(id, 4);
    };
    $('#shot').onclick = () => take('environment');
    $('#gal').onclick = () => take();
    bindNav(async () => true);
    return;
  }

  if (step === 5) {
    const total = s.topicData.reduce((n, t) => n + (t.checklist || []).reduce((m, sec) => m + sec.items.length, 0), 0);
    const judged = Object.values(s.judg).reduce((a, o) => a + Object.values(o).filter(x => x.v).length, 0);
    const bad = Object.values(s.judg).reduce((a, o) => a + Object.values(o).filter(x => x.v === 'b').length, 0);
    const warn = [];
    if (!s.photo) warn.push('교육사진이 없습니다. (필수)');
    if (!s.workers.length) warn.push('근로자 서명이 없습니다.');
    if (judged < total) warn.push(`점검표 ${total - judged}개 항목이 판정되지 않았습니다.`);
    const canDir = 'showDirectoryPicker' in window;
    const dir = canDir ? await DB.get('kv', 'dir').catch(() => null) : null;
    body.innerHTML = `<div class="summary">
        <div><b>${esc(s.site)}</b><span>${esc(Report.fmtDate(s.date))} · ${esc(INSPECTOR)}</span></div>
        <div class="stats"><span>작업 <b>${s.topicData.length}</b></span><span>판정 <b>${judged}/${total}</b></span><span>미흡 <b>${bad}</b></span><span>서명 <b>${s.workers.length}명</b></span><span>사진 <b>${s.photo ? 1 : 0}</b></span><span>일지 첨부 <b id="lgcnt">${(s.logs || []).length}쪽</b></span></div>
        ${warn.length ? `<ul class="warn">${warn.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      </div>
      <div id="logs"></div>
      <div class="row center"><button class="btn big primary" id="make" ${s.photo ? '' : 'disabled'}>결과 만들기</button></div>
      <div id="out"></div>` + `<div class="row sticky-actions"><button class="btn ghost" data-go="4">← 이전</button></div>`;
    bindNav();
    attachLogs($('#logs'), s, async () => { await saveSession(s); const c = $('#lgcnt'); if (c) c.textContent = `${s.logs.length}쪽`; });
    $('#make').onclick = async () => {
      const btn = $('#make'); btn.disabled = true; btn.textContent = '만드는 중…';
      try {
        const res = await Report.build(s);
        const folder = folderName(s);
        const files = [{ name: '안전교육결과.pdf', blob: res.pdf }];
        for (let i = 0; i < res.images.length; i++) files.push({ name: `페이지${String(i + 1).padStart(2, '0')}.jpg`, blob: await dataUrlToBlob(res.images[i]) });
        files.push({ name: '교육사진.jpg', blob: await dataUrlToBlob(s.photo) });
        s.done = true; await saveSession(s);
        $('#out').innerHTML = `<h2 class="h">결과 미리보기 <small>${files.length}개 파일 · 폴더명: ${esc(folder)}</small></h2>
          <div class="pages">${res.images.map((src, i) => `<a href="${src}" target="_blank" download="페이지${i + 1}.jpg"><img src="${src}"></a>`).join('')}</div>
          <h2 class="h">저장</h2>
          <div class="save-actions">
            ${canDir ? `<button class="btn primary" id="sv-dir">지정 폴더에 저장${dir ? ` <small>(${esc(dir.name)})</small>` : ''}</button>${dir ? '<button class="btn ghost" id="sv-dir2">다른 폴더 선택</button>' : ''}` : ''}
            <button class="btn ${canDir ? '' : 'primary'}" id="sv-zip">ZIP으로 저장 (다운로드 폴더)</button>
            <button class="btn" id="sv-share">공유 (드라이브·카톡 등)</button>
            <button class="btn ghost" id="sv-pdf">PDF만 저장</button>
          </div>
          ${canDir ? '' : '<p class="hint">이 기기의 브라우저는 폴더 지정 저장을 지원하지 않습니다. ZIP은 다운로드 폴더에 저장되며, [공유]로 구글드라이브·원드라이브의 원하는 폴더에 바로 올릴 수 있습니다.</p>'}`;
        if (canDir) {
          $('#sv-dir').onclick = () => saveToDir(folder, files, false);
          if ($('#sv-dir2')) $('#sv-dir2').onclick = () => saveToDir(folder, files, true);
        }
        $('#sv-zip').onclick = async () => {
          const zip = new JSZip(); const d = zip.folder(folder);
          files.forEach(f => d.file(f.name, f.blob));
          downloadBlob(await zip.generateAsync({ type: 'blob' }), folder + '.zip');
        };
        $('#sv-share').onclick = async () => {
          const fl = files.map(f => new File([f.blob], `${folder}_${f.name}`, { type: f.blob.type }));
          if (navigator.canShare && navigator.canShare({ files: fl })) {
            try { await navigator.share({ files: fl, title: folder }); } catch (e) { if (e.name !== 'AbortError') toast('공유 실패: ' + e.message); }
          } else toast('이 브라우저는 파일 공유를 지원하지 않습니다. ZIP으로 저장하세요.');
        };
        $('#sv-pdf').onclick = () => downloadBlob(res.pdf, folder + '.pdf');
        btn.textContent = '다시 만들기';
      } catch (e) {
        console.error(e); toast('결과를 만들지 못했습니다: ' + e.message, 5000); btn.textContent = '결과 만들기';
      }
      btn.disabled = false;
    };
  }
}
function folderName(s) {
  const d = new Date(s.date || Date.now()); const p = n => String(n).padStart(2, '0');
  return `안전교육_${(s.site || '현장').replace(/[\\/:*?"<>|]/g, '_')}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
function downloadBlob(blob, name) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
async function saveToDir(folder, files, pickNew) {
  try {
    let dir = pickNew ? null : await DB.get('kv', 'dir');
    if (!dir) { dir = await window.showDirectoryPicker({ id: 'safety-edu', mode: 'readwrite' }); await DB.put('kv', dir, 'dir'); }
    if ((await dir.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('폴더 권한이 없습니다.');
    const sub = await dir.getDirectoryHandle(folder, { create: true });
    for (const f of files) {
      const fh = await sub.getFileHandle(f.name, { create: true });
      const w = await fh.createWritable(); await w.write(f.blob); await w.close();
    }
    toast(`"${dir.name}/${folder}" 에 ${files.length}개 파일을 저장했습니다.`, 4500);
  } catch (e) { if (e.name !== 'AbortError') toast('저장 실패: ' + e.message, 4500); }
}

// ---------- 근로자 링크 (서버 없이 링크에 내용을 담는다) ----------
async function inviteLink(s, mode) {
  const builtin = s.topicData.filter(t => !t.custom).map(t => t.id);
  // 내가 추가한 자료는 글 내용만 링크에 담는다 (사진·그림 제외)
  const c = s.topicData.filter(t => t.custom).map(t => ({ i: t.id, ti: t.title, ca: t.cat, su: t.suffix, de: t.desc, cs: t.cases, ru: t.rules, wo: t.worker, v: t.video, pg: (t.pages || []).length }));
  // 이 현장에 등록된 근로자 이름(최근 40명)을 담아, 근로자가 자기 이름을 검색해 고를 수 있게 한다
  const w = (await Registry.people(s.site)).slice(0, 40);
  const k = await Lock.current();
  const code = await Codec.pack({ v: 1, s: s.id, n: s.site, p: s.place, d: s.date, t: builtin, c, m: mode, w, k });
  return `${APP_URL}#/w/${code}`;
}
// 이름에 맞는 과거 서명을 보여주고, 누르면 서명 칸에 불러온다. 불러온 서명 코드를 돌려주는 함수를 반환
function attachPastSigs(root, nameIn, pad) {
  const box = document.createElement('div');
  box.className = 'pastsig';
  $('.sigwrap', root).before(box);
  let used = null; // 불러온 과거 서명 코드 (새로 쓰기 시작하면 지움)
  const mark = () => $$('[data-g]', box).forEach(c => { c.checked = c.dataset.g === used; c.closest('.pitem').classList.toggle('on', c.checked); });
  $('canvas', root).addEventListener('pointerdown', () => { if (used) { pad.clear(); used = null; mark(); } }, true);
  $('[data-clr]', root).addEventListener('click', () => { used = null; mark(); });
  $('canvas', root).addEventListener('sigwidth', () => { used = null; mark(); }); // 굵기를 바꾸면 새 서명으로 저장
  const showPast = async () => {
    const name = nameIn.value.trim();
    const list = name ? await Registry.sigs(name) : [];
    if (used && !list.some(x => x.g === used)) { pad.clear(); used = null; }
    box.innerHTML = list.length ? `<span>${esc(name)} 님의 이전 서명 <small>(체크하면 서명칸에 불러옵니다)</small></span>
      <div class="pastlist">${list.map(x => `<div class="pitem"><label class="pchk"><input type="checkbox" data-g="${x.g}"><img src="${Sig.toImage(x.g, 250, 100)}" alt="이전 서명"><small>${esc(x.site || '')} · ${esc(Report.fmtDate(new Date(x.at).toISOString(), false))}</small></label><button type="button" class="pdel" data-rm="${x.g}" title="이 서명 삭제">✕</button></div>`).join('')}</div>` : '';
    $$('[data-g]', box).forEach(c => c.onchange = () => {
      if (c.checked) { pad.load(c.dataset.g); used = c.dataset.g; } else { pad.clear(); used = null; }
      mark();
    });
    $$('[data-rm]', box).forEach(b => b.onclick = async () => {
      if (!confirm('이 이전 서명을 삭제할까요?')) return;
      await Registry.removeSig(name, b.dataset.rm);
      showPast();
    });
    mark();
  };
  nameIn.addEventListener('input', showPast);
  nameIn.addEventListener('change', showPast);
  showPast();
  return () => used;
}
// ---------- 현장 등록·수정 창 ----------
// st가 있으면 수정, 없으면 새 등록. 저장하면 저장된 현장을 넘겨준다.
function siteForm(st, preName = '') {
  return new Promise(resolve => {
    const v = st || { name: preName }, oldName = st ? st.name : null;
    const m = modal(`<h2>${st ? '현장 정보 수정' : '새 현장 등록'}</h2><form class="form" id="sitef">
      <label>현장명 <input name="name" required value="${esc(v.name)}" placeholder="예: OO아파트 신축공사"></label>
      <label>시공사 <input name="client" value="${esc(v.client || '')}" placeholder="예: (주)OO건설"></label>
      <label>현장 주소 <input name="addr" value="${esc(v.addr || '')}" placeholder="예: 경기도 OO시 OO로 123"></label>
      <label>기본 장소 <small>(교육·TBM 장소로 자동 입력)</small><input name="place" value="${esc(v.place || '')}" placeholder="예: 현장 사무실 앞, 아침 조회장"></label>
      <div class="grid2"><label>현장 담당자 <input name="mgr" value="${esc(v.mgr || '')}" placeholder="예: 안전관리자 홍길동"></label>
        <label>연락처 <input name="tel" type="tel" value="${esc(v.tel || '')}" placeholder="010-0000-0000"></label></div>
      <label>메모 <textarea name="memo" rows="2" placeholder="예: 지도 주기, 공정 특이사항">${esc(v.memo || '')}</textarea></label>
      ${st ? '' : '<label>인원 <small>(선택 · 한 줄에 한 명씩 이름 전화번호)</small><textarea name="w" rows="3" placeholder="홍길동 010-1234-5678"></textarea></label>'}
      ${st ? '<p class="hint">현장명을 바꾸면 이 현장의 교육·TBM·장비측정 기록의 현장명도 함께 바뀝니다.</p>' : ''}
      <button class="btn primary big">${st ? '저장' : '등록'}</button></form>`, { onClose: () => resolve(null) });
    $('#sitef', m.el).onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target), data = Object.fromEntries(fd.entries());
      try {
        const saved = await Registry.saveSite(oldName, data);
        if (oldName && Registry.norm(oldName) !== Registry.norm(saved.name)) {
          for (const s of await DB.all('sessions').catch(() => [])) {
            if (Registry.norm(s.site) === Registry.norm(oldName)) { s.site = saved.name; await DB.put('sessions', s); }
          }
        }
        if (!st && data.w) await Registry.addPeople(saved.name, Registry.parsePeople(data.w));
        toast(st ? '현장 정보를 저장했습니다.' : `'${saved.name}' 현장을 등록했습니다.`);
        resolve(saved); m.el.remove();
      } catch (err) { toast(err.message, 3500); }
    };
    setTimeout(() => $('[name=name]', m.el).focus(), 50);
  });
}
const siteSub = st => [st.client, st.place || st.addr, `근로자 ${Object.keys(st.people || {}).length}명`].filter(Boolean).join(' · ');
// 등록 현장 고르기 창
function pickSite(onPick) {
  const m = modal(`<div class="bar"><h2>현장 선택</h2><button type="button" class="btn primary sm" id="ps-new">＋ 새 현장 등록</button></div>
    <input class="pp-q" id="ps-q" type="search" placeholder="현장명·시공사 검색 (초성 검색 가능)">
    <ul class="pp-list" id="ps-list"></ul>`, { wide: true });
  const q = $('#ps-q', m.el), ul = $('#ps-list', m.el);
  const draw = async () => {
    const list = (await Registry.sites()).filter(st => Search.match(st.name, q.value) || Search.match(st.client || '', q.value));
    ul.innerHTML = list.length ? list.map((st, i) => `<li><button type="button" class="pp-use" data-i="${i}"><b>${esc(st.name)}</b><br><small>${esc(siteSub(st))}</small></button></li>`).join('')
      : `<li class="hint">${q.value ? '검색 결과가 없습니다.' : '등록된 현장이 없습니다. 오른쪽 위 ＋ 새 현장 등록을 누르세요.'}</li>`;
    $$('[data-i]', ul).forEach(b => b.onclick = () => { m.el.remove(); onPick(list[+b.dataset.i]); });
  };
  q.oninput = draw;
  $('#ps-new', m.el).onclick = async () => { m.el.remove(); const st = await siteForm(null, q.value.trim()); if (st) onPick(st); };
  draw();
}
// 현장명 입력칸: 검색 + [현장 선택] [＋ 새 현장] 버튼 + 등록 여부 안내. onPick(st)는 등록 현장을 골랐을 때.
function siteField(input, onPick) {
  Search.attach(input, async q => (await Registry.sites()).filter(st => Search.match(st.name, q) || Search.match(st.client || '', q))
    .map(st => ({ value: st.name, sub: siteSub(st), st })), it => { info(); onPick && onPick(it.st); });
  const box = document.createElement('div');
  box.className = 'sitefield';
  box.innerHTML = `<span class="sf-info"></span><span class="row"><button type="button" class="btn sm" data-sf-pick>현장 선택</button><button type="button" class="btn sm ghost" data-sf-new>＋ 새 현장</button></span>`;
  (input.closest('label') || input.parentNode).after(box);
  const choose = st => { input.value = st.name; info(); onPick && onPick(st); };
  async function info() {
    const v = input.value.trim(), st = v ? await Registry.site(v) : null;
    const el = $('.sf-info', box);
    if (!v) { el.innerHTML = ''; return; }
    if (st) {
      el.innerHTML = `<span class="sf-ok">✔ 등록 현장</span> ${esc(siteSub(st))} <button type="button" class="linkbtn" data-sf-edit>정보 수정</button>`;
      $('[data-sf-edit]', el).onclick = async () => { const s2 = await siteForm(st); if (s2) choose(s2); };
    } else {
      el.innerHTML = `<span class="sf-new">등록되지 않은 현장</span> <button type="button" class="linkbtn" data-sf-reg>이 이름으로 등록</button>`;
      $('[data-sf-reg]', el).onclick = async () => { const s2 = await siteForm(null, v); if (s2) choose(s2); };
    }
  }
  $('[data-sf-pick]', box).onclick = () => pickSite(choose);
  $('[data-sf-new]', box).onclick = async () => { const st = await siteForm(null, ''); if (st) choose(st); };
  input.addEventListener('input', info);
  info();
  return { refresh: info };
}

// 이름 입력창에 등록 근로자 검색을 붙인다 (이미 서명한 사람은 표시만)
function attachNameSearch(input, names, signed = []) {
  if (!names || !names.length) return;
  const done = new Set(signed);
  input.placeholder = '이름 입력 또는 검색 (초성 검색 가능)';
  Search.attach(input, async q => names.filter(n => Search.match(n, q))
    .map(n => ({ value: n, sub: done.has(n) ? '이미 서명함' : '', disabled: done.has(n) })));
}
function workerConfirmHTML(topics) {
  return `<form class="form wform">
    ${topics.map((t, ti) => `<fieldset><legend>${esc(t.title)} — 근로자는 이것만은 지켜야 합니다</legend>
      ${(t.worker || []).map((w, i) => `<label class="confirm"><input type="checkbox" required data-c="${ti}-${i}"><span>${esc(w)}</span></label>`).join('')}</fieldset>`).join('')}
    <label>이름 <input name="name" required autocomplete="name" placeholder="성명"></label>
    <div class="sigwrap"><span>서명 <small>(아래 칸에 손가락으로 서명)</small></span><canvas class="sigpad"></canvas><button type="button" class="btn ghost sm" data-clr>다시 쓰기</button></div>
    <button class="btn big primary" type="submit">확인 및 서명 완료</button>
  </form>`;
}
function bindWorkerForm(root, pad, onDone) {
  $('[data-clr]', root).onclick = () => pad.clear();
  $('form', root).onsubmit = e => {
    e.preventDefault();
    const name = $('[name=name]', root).value.trim();
    if (!name) { toast('이름을 입력하세요.'); return; }
    if ($$('input[data-c]', root).some(c => !c.checked)) { toast('모든 항목을 확인(체크)해 주세요.'); return; }
    if (pad.isEmpty()) { toast('서명을 해 주세요.'); return; }
    onDone({ name, sig: Sig.encode(pad.strokes()) });
  };
}
async function workerView(code) {
  document.body.classList.add('worker');
  let p;
  try { p = await Codec.unpack(code); } catch (e) { view().innerHTML = `<p class="err">교육 링크가 올바르지 않습니다. (${esc(e.message)})</p>`; return; }
  if (p.y === 't') return TBM.workerView(p);
  const topics = [...(p.t || []).map(id => Store.byId[id]).filter(Boolean),
    ...(p.c || []).map(c => ({ id: c.i, title: c.ti, cat: c.ca, suffix: c.su, desc: c.de, cases: c.cs, rules: c.ru, worker: c.wo, video: c.v, pg: c.pg }))];
  const doneKey = 'done-' + p.s;
  let prev = null; try { prev = JSON.parse(localStorage.getItem(doneKey)); } catch (e) { /* 없음 */ }
  view().innerHTML = `<section class="hero small"><h1>안전교육</h1><p><b>${esc(p.n)}</b>${p.p ? ' · ' + esc(p.p) : ''}<br>${esc(Report.fmtDate(p.d))}</p>
      <p class="hint">${p.m === 'r' ? '아래 교육 내용을 끝까지 읽고, 맨 아래에서 확인·서명한 뒤 <b>결과 보내기</b>로 지도요원에게 회신해 주세요.' : '아래 교육 내용을 읽고, 맨 아래에서 확인·서명하세요.'}</p>
      ${prev ? '<button class="btn" id="again">이전에 제출한 결과 다시 보기</button>' : ''}</section>
    ${topics.map(t => topicHTML(t, { checklist: false }) + (t.pg ? `<p class="hint pg-note">「${esc(t.title)}」 교육자료 ${t.pg}쪽은 지도요원이 화면으로 설명합니다.</p>` : '')).join('')}
    <h2 class="h">확인 및 서명</h2>${workerConfirmHTML(topics)}
    <div id="wres"></div>`;
  const pad = Sig.pad($('canvas.sigpad'));
  attachNameSearch($('.wform [name=name]'), p.w);
  const showResult = async (url, name) => {
    const res = $('#wres');
    $('.wform').classList.add('hide');
    res.innerHTML = `<section class="result"><h2>✔ ${esc(name)} 님, 서명이 완료되었습니다.</h2>
      ${p.m === 'r' ? `<p>아래 <b>결과 보내기</b>를 눌러 교육을 보낸 지도요원에게 카카오톡·문자로 회신해 주세요.</p>
        <div class="row center"><button class="btn big primary" id="send">결과 보내기</button><button class="btn ghost" id="cpy">링크 복사</button></div>
        <p class="hint">지도요원과 함께 있다면 아래 QR을 보여줘도 됩니다.</p>`
      : `<p><b>이 화면의 QR을 지도요원에게 보여주세요.</b></p>`}
      <div class="qrbox">${QR.svg(url)}</div>
      ${p.m === 'r' ? '' : '<div class="row center"><button class="btn ghost" id="send">링크로 보내기</button></div>'}</section>`;
    $('#send').onclick = () => shareLink('안전교육 결과', `[안전교육 결과] ${p.n} — ${name} 확인·서명`, url);
    if ($('#cpy')) $('#cpy').onclick = () => copyText(url);
    res.scrollIntoView({ behavior: 'smooth' });
  };
  if ($('#again')) $('#again').onclick = () => showResult(prev.url, prev.name);
  bindWorkerForm(view(), pad, async ({ name, sig }) => {
    const r = await Codec.pack({ v: 1, s: p.s, n: name, a: Math.floor(Date.now() / 1000), g: sig, m: p.m });
    const url = `${APP_URL}#/r/${r}`;
    try { localStorage.setItem(doneKey, JSON.stringify({ url, name })); } catch (e) { /* 무시 */ }
    showResult(url, name);
  });
}

// 근로자 결과 가져오기 (QR 스캔·붙여넣기·링크 열기 공통)
async function importCode(text, expectId) {
  let r;
  try { r = await Codec.unpack(text); } catch (e) { return { ok: false, msg: '결과 코드를 읽지 못했습니다. ' + e.message }; }
  if (!r || !r.s || !r.g) return { ok: false, msg: '근로자 결과 코드가 아닙니다.' };
  if (expectId && r.s !== expectId) {
    const other = await DB.get('sessions', r.s);
    return { ok: false, msg: other ? `다른 교육(${other.site})의 결과입니다. 해당 교육에서 가져오세요.` : '이 교육의 결과가 아닙니다.' };
  }
  const s = await DB.get('sessions', r.s);
  if (!s) return { ok: false, notFound: true, msg: '이 기기에서 해당 교육을 찾을 수 없습니다.' };
  if (s.workers.some(w => w.name === r.n && w.at === r.a)) return { ok: false, msg: `${r.n} 님 서명은 이미 받았습니다.`, s };
  const maxW = s.kind === 'tbm' ? MAX_WORKERS : EDU_MAX;
  if (s.workers.length >= maxW) return { ok: false, msg: `서명은 ${maxW}명까지입니다.`, s };
  s.workers.push(Object.assign({ name: r.n, sig: r.g, at: r.a, via: r.m === 'r' ? '원격(링크)' : '현장(QR)' }, r.q ? { q: r.q } : {}));
  await Registry.addSig(r.n, r.g, s.site, r.a * 1000);
  await saveSession(s);
  await Registry.addPeople(s.site, [r.n]);
  return { ok: true, msg: `${r.n} 님 서명을 추가했습니다. (${s.workers.length}명)`, s };
}
async function importView(code) {
  const r = await importCode(code);
  const kakao = /KAKAOTALK/i.test(navigator.userAgent);
  const full = location.href;
  if (r.s) {
    const back = r.s.kind === 'tbm' ? '#/t/' + r.s.id + '/3' : '#/s/' + r.s.id + '/3';
    view().innerHTML = `<section class="result"><h2>${r.ok ? '✔ ' : ''}${esc(r.msg)}</h2><p>${esc(r.s.site)} · ${esc(Report.fmtDate(r.s.date))}</p>
      <a class="btn big primary" href="${back}">${r.s.kind === 'tbm' ? 'TBM으로' : '교육으로'} 이동</a></section>`;
    history.replaceState(null, '', back);
    return;
  }
  view().innerHTML = `<section class="result"><h2>${esc(r.msg)}</h2>
    ${r.notFound ? `<p>근로자의 서명 결과는 <b>교육을 진행한 지도요원 기기의 크롬(또는 설치한 안전지도 앱)</b>에서 열어야 저장됩니다.</p>
    ${kakao ? `<a class="btn big primary" href="kakaotalk://web/openExternal?url=${encodeURIComponent(full)}">크롬(외부 브라우저)으로 열기</a>` : ''}
    <p class="hint">열리지 않으면 아래 [코드 복사] 후, 앱의 해당 교육 → 서명 단계 → [결과 코드 붙여넣기]에 붙여넣으세요.</p>
    <div class="row center"><button class="btn" id="cp">코드 복사</button><a class="btn ghost" href="#/">처음으로</a></div>` : '<a class="btn" href="#/">처음으로</a>'}</section>`;
  if ($('#cp')) $('#cp').onclick = () => copyText(full);
}

// ---------- 현장·근로자 관리 ----------
const telHit = (st, n, q) => { const d = String(q || '').replace(/\D/g, ''); return d.length >= 3 && ((st.tels || {})[n] || '').replace(/\D/g, '').includes(d); };
// 인원 한 명 수정 창
function personForm(siteName, person, done) {
  Registry.tels(siteName).then(tels => {
    const m = modal(`<h2>인원 정보 수정</h2><form class="form" id="pf">
      <label>이름 <input name="n" required value="${esc(person)}"></label>
      <label>전화번호 <input name="t" type="tel" inputmode="tel" value="${esc(tels[person] || '')}" placeholder="010-0000-0000"></label>
      <button class="btn primary big">저장</button></form>`);
    $('#pf', m.el).onsubmit = async e => {
      e.preventDefault();
      try { await Registry.savePerson(siteName, person, e.target.n.value, e.target.t.value); m.close(); toast('저장했습니다.'); done(); }
      catch (err) { toast(err.message, 3500); }
    };
  });
}
// 여러 명 붙여넣기 (엑셀·카카오톡·문자에서 복사한 명단)
function pastePeople(siteName, done) {
  const m = modal(`<h2>여러 명 붙여넣기</h2>
    <p class="hint">한 줄에 한 명씩 <b>이름 전화번호</b>를 넣으세요. 엑셀 두 칸(이름·번호)을 복사해 붙여넣어도 됩니다. 번호는 없어도 됩니다.</p>
    <textarea id="pp-text" rows="8" placeholder="홍길동 010-1234-5678&#10;김철수 01098765432&#10;이영희"></textarea>
    <div id="pp-prev" class="hint"></div>
    <button class="btn primary big" id="pp-ok" disabled>추가</button>`, { wide: true });
  const ta = $('#pp-text', m.el), prev = $('#pp-prev', m.el), ok = $('#pp-ok', m.el);
  let list = [];
  ta.oninput = () => {
    list = Registry.parsePeople(ta.value);
    prev.innerHTML = list.length ? `<b>${list.length}명</b>: ${list.slice(0, 30).map(p => esc(p.name) + (p.tel ? ` <small>(${esc(p.tel)})</small>` : '')).join(', ')}${list.length > 30 ? ' …' : ''}` : '';
    ok.disabled = !list.length;
  };
  ok.onclick = async () => { await Registry.addPeople(siteName, list); m.close(); toast(`${list.length}명을 추가했습니다.`); done(); };
  setTimeout(() => ta.focus(), 50);
}
async function sitesView() {
  view().innerHTML = `<div class="bar"><h1>현장·근로자</h1><button class="btn primary" id="addsite">＋ 현장 등록</button></div>
    <p class="hint">관리 중인 현장과 현장별 인원(이름·전화번호)을 등록해 두면 안전교육·TBM·장비측정에서 바로 고를 수 있습니다. 교육받은 근로자는 이름이 자동으로 등록됩니다.</p>
    <input id="q" type="search" placeholder="현장명·시공사, 이름 또는 전화번호 검색 (초성 검색 가능)">
    <div id="slist" class="site-list"></div>`;
  const draw = async () => {
    const q = $('#q').value;
    const list = (await Registry.sites()).filter(st => Search.match(st.name, q) || Search.match(st.client || '', q) || Object.keys(st.people).some(n => Search.match(n, q) || telHit(st, n, q)));
    $('#slist').innerHTML = list.length ? list.map(st => {
      const people = Object.entries(st.people).sort((a, b) => b[1] - a[1]).map(e => e[0]);
      return `<section class="site" data-site="${esc(st.name)}">
        <div class="bar"><div><b>${esc(st.name)}</b><span class="hint">${esc([st.client, st.addr].filter(Boolean).join(' · '))}</span><span class="hint">${esc([st.place && '장소 ' + st.place, st.mgr, st.tel].filter(Boolean).join(' · '))}${st.place || st.mgr || st.tel ? ' · ' : ''}근로자 ${people.length}명 · 최근 ${esc(Report.fmtDate(new Date(st.updated).toISOString(), false))}</span>${st.memo ? `<span class="hint">메모: ${esc(st.memo)}</span>` : ''}</div>
          <div class="row"><a class="btn primary sm" href="#/new~${encodeURIComponent(st.name)}">이 현장 새 교육</a><a class="btn sm" href="#/tbm/new~${encodeURIComponent(st.name)}">이 현장 TBM</a><a class="btn sm" href="#/meas/new~${encodeURIComponent(st.name)}">이 현장 장비측정</a><a class="btn sm" href="#/law/new~${encodeURIComponent(st.name)}">이 현장 산안법 점검</a><a class="btn sm" href="#/sapa/new~${encodeURIComponent(st.name)}">이 현장 중처법 점검</a><a class="btn sm" href="#/sif/new~${encodeURIComponent(st.name)}">이 현장 고위험요인 평가</a><button class="btn ghost sm" data-editsite>수정</button><button class="btn ghost sm" data-delsite>삭제</button></div></div>
        <details class="pbox" ${q && people.some(n => Search.match(n, q) || telHit(st, n, q)) || people.length <= 8 ? 'open' : ''}><summary>인원 명단 <b>${people.length}명</b>${people.length ? ` · 전화번호 ${people.filter(n => (st.tels || {})[n]).length}명` : ''}</summary>
          ${people.length ? `<ul class="plist">${people.map(n => { const tel = (st.tels || {})[n]; return `<li class="${q && (Search.match(n, q) || telHit(st, n, q)) ? 'hit' : ''}"><b>${esc(n)}</b>${tel ? `<a href="tel:${esc(tel.replace(/-/g, ''))}">${esc(tel)}</a>` : '<span class="notel">번호 없음</span>'}<span class="pbtn"><button type="button" class="btn ghost sm" data-editp="${esc(n)}">수정</button><button type="button" class="btn ghost sm" data-delp="${esc(n)}" aria-label="${esc(n)} 삭제">✕</button></span></li>`; }).join('')}</ul>` : '<p class="hint">등록된 인원이 없습니다.</p>'}
          <div class="addp"><input class="ap-n" placeholder="이름"><input class="ap-t" type="tel" inputmode="tel" placeholder="전화번호 (선택)"><button class="btn sm primary" data-addp>추가</button></div>
          <div class="row"><button type="button" class="btn ghost sm" data-paste>여러 명 붙여넣기</button>${'contacts' in navigator && navigator.contacts.select ? '<button type="button" class="btn ghost sm" data-contacts>휴대폰 연락처에서 가져오기</button>' : ''}</div>
        </details>
      </section>`;
    }).join('') : '<p class="hint">등록된 현장이 없습니다.</p>';
    $$('#slist .site').forEach(el => {
      const name = el.dataset.site;
      $('[data-editsite]', el).onclick = async () => { if (await siteForm(await Registry.site(name))) draw(); };
      $('[data-delsite]', el).onclick = async () => {
        if (!confirm(`'${name}' 현장과 등록 근로자를 삭제할까요? (교육 기록은 남습니다)`)) return;
        await Registry.removeSite(name); draw();
      };
      $$('[data-delp]', el).forEach(b => b.onclick = async () => {
        if (!confirm(`${b.dataset.delp} 님을 이 현장 명단에서 삭제할까요?`)) return;
        await Registry.removePerson(name, b.dataset.delp); draw();
      });
      $$('[data-editp]', el).forEach(b => b.onclick = () => personForm(name, b.dataset.editp, draw));
      const inN = $('.ap-n', el), inT = $('.ap-t', el);
      const add = async () => {
        const n = inN.value.trim();
        if (!n) { toast('이름을 입력하세요.'); inN.focus(); return; }
        const st = await Registry.site(name);
        if (st.people[n] != null && !confirm(`${n} 님은 이미 명단에 있습니다. 전화번호를 바꿀까요?`)) return;
        await Registry.addPeople(name, [{ name: n, tel: inT.value }]);
        toast(`${n} 님을 추가했습니다.`); await draw();
        const again = $(`.site[data-site="${CSS.escape(name)}"] .ap-n`); if (again) again.focus();
      };
      $('[data-addp]', el).onclick = add;
      inN.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inT.focus(); } };
      inT.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
      $('[data-paste]', el).onclick = () => pastePeople(name, draw);
      const cb = $('[data-contacts]', el);
      if (cb) cb.onclick = async () => {
        try {
          const got = await navigator.contacts.select(['name', 'tel'], { multiple: true });
          const list = got.map(c => ({ name: (c.name || [])[0] || '', tel: (c.tel || [])[0] || '' })).filter(x => x.name.trim());
          if (!list.length) return;
          await Registry.addPeople(name, list); toast(`${list.length}명을 연락처에서 가져왔습니다.`); draw();
        } catch (e) { if (e.name !== 'AbortError') toast('연락처를 가져오지 못했습니다: ' + e.message, 4000); }
      };
    });
  };
  $('#q').oninput = draw;
  $('#addsite').onclick = async () => { if (await siteForm(null)) draw(); };
  draw();
}

// ---------- 기록·설정·도움말 ----------
async function records() {
  const list = (await DB.all('sessions')).filter(s => !s.kind).sort((a, b) => b.created - a.created);
  view().innerHTML = `<div class="bar"><h1>교육 기록</h1><div class="row"><a class="btn ghost" href="#/tbm">TBM 일지 기록 →</a><a class="btn ghost" href="#/meas">장비측정 기록 →</a><a class="btn ghost" href="#/law">산안법 관리체계점검 →</a><a class="btn ghost" href="#/sapa">중처법 관리체계점검 →</a><a class="btn ghost" href="#/sif">고위험요인 평가 →</a></div></div>
    ${list.length ? `<div class="cards">${list.map(s => `<div class="rec">${sessionCard(s)}<button class="btn ghost sm" data-del="${s.id}">삭제</button></div>`).join('')}</div>` : '<p class="hint">아직 기록이 없습니다.</p>'}`;
  $$('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('이 교육 기록을 삭제할까요? (저장해 둔 결과 파일은 지워지지 않습니다)')) return;
    await DB.del('sessions', b.dataset.del); records();
  });
}
async function settings() {
  const canDir = 'showDirectoryPicker' in window;
  const dir = canDir ? await DB.get('kv', 'dir').catch(() => null) : null;
  view().innerHTML = `<div class="bar"><h1>설정</h1></div>
    <h2 class="h">지도요원</h2><p><b>${esc(INSPECTOR)}</b> <small>(고정)</small></p>
    <h2 class="h">비밀번호</h2>
    <p class="hint">앱과 근로자 링크를 열 때 입력하는 숫자 6자리입니다. 바꾸면 이후 보내는 QR·링크부터 새 비밀번호가 적용되고, 이미 보낸 링크는 그때의 비밀번호를 씁니다.</p>
    <form class="form pinform" id="pinf">
      <label>현재 비밀번호 <input name="cur" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></label>
      <label>새 비밀번호 <input name="n1" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></label>
      <label>새 비밀번호 확인 <input name="n2" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></label>
      <button class="btn" type="submit">비밀번호 변경</button>
    </form>
    <h2 class="h">결과 저장 폴더</h2>
    ${canDir ? `<p>${dir ? `현재 폴더: <b>${esc(dir.name)}</b>` : '아직 지정하지 않았습니다.'}</p><button class="btn" id="pick">폴더 지정</button>`
      : '<p class="hint">이 기기의 브라우저는 폴더 지정을 지원하지 않습니다. 결과 화면에서 ZIP 저장(다운로드 폴더) 또는 공유(구글드라이브·원드라이브 등 원하는 폴더)를 이용하세요.</p>'}
    <h2 class="h">교육자료 백업</h2>
    <div class="row"><button class="btn ghost" id="exp">내가 추가한 자료 내보내기</button><button class="btn ghost" id="imp">가져오기</button></div>
    <h2 class="h">정보</h2><p class="hint">안전지도 v${APP_VERSION} · 사람인안전지도사사무소 · 교육자료 ${Store.topics.length}종 · 서버 없이 이 기기에만 기록이 저장됩니다. 기기를 바꾸거나 브라우저 데이터를 지우면 기록이 사라지므로, 결과는 반드시 저장해 두세요.</p>`;
  if ($('#pick')) $('#pick').onclick = async () => {
    try { const d = await window.showDirectoryPicker({ id: 'safety-edu', mode: 'readwrite' }); await DB.put('kv', d, 'dir'); settings(); } catch (e) { /* 취소 */ }
  };
  $('#exp').onclick = () => exportTopics(Store.topics.filter(t => t.custom));
  $('#imp').onclick = importTopics;
  $('#pinf').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, cur = f.cur.value.trim(), n1 = f.n1.value.trim(), n2 = f.n2.value.trim();
    if (await Lock.hash(cur) !== await Lock.current()) { toast('현재 비밀번호가 맞지 않습니다.'); return; }
    if (!Lock.valid(n1)) { toast('새 비밀번호는 숫자 6자리로 입력하세요.'); return; }
    if (n1 !== n2) { toast('새 비밀번호 확인이 일치하지 않습니다.'); return; }
    await Lock.setPin(n1);
    f.reset();
    toast('비밀번호를 변경했습니다. 잊지 않도록 따로 적어 두세요.', 4000);
  };
}
function help() {
  view().innerHTML = `<div class="bar"><h1>사용 방법</h1></div><article class="help">
  <h2>현장 교육</h2><ol>
    <li><b>새 교육 시작</b> → 현장명·장소·작업을 선택합니다.</li>
    <li><b>교육</b>: 사고사례·그림·핵심수칙으로 설명합니다. (탭에서 보여주기 좋음)</li>
    <li><b>점검</b>: 자율점검표 항목을 양호/미흡/해당없음으로 판정합니다.</li>
    <li><b>서명</b>: [현장 QR 보여주기] → 근로자가 폰 카메라로 QR을 찍고 확인·서명 → 근로자 화면의 결과 QR을 [결과 QR 스캔]으로 받습니다. 폰이 없는 근로자는 [이 기기에서 서명].</li>
    <li><b>사진</b>: 교육 장면 1장을 촬영합니다.</li>
    <li><b>결과</b>: PDF·페이지 이미지·교육사진이 한 폴더로 저장됩니다.</li></ol>
  <h2>원격 교육 (멀리 있는 근로자)</h2><ol>
    <li>서명 단계에서 <b>[원격 링크 보내기]</b> → 카카오톡·문자로 보냅니다.</li>
    <li>근로자는 링크를 열어 교육을 보고 서명한 뒤 <b>[결과 보내기]</b>로 지도요원에게 회신합니다.</li>
    <li>지도요원은 받은 결과 링크를 누르면 자동으로 서명이 추가됩니다. 카카오톡 안에서 열리면 [크롬으로 열기]를 누르세요. 안 되면 [결과 코드 붙여넣기]를 이용합니다.</li></ol>
  <h2>현장·근로자 검색</h2><ol>
    <li>교육한 현장과 서명한 근로자는 자동으로 등록됩니다. (홈 → <b>현장·근로자</b>에서 직접 등록·삭제도 가능)</li>
    <li>새 교육의 현장명 칸에 글자나 초성(예: ㅅㅇ)을 넣으면 등록된 현장이 나오고, 고르면 교육장소도 채워집니다.</li>
    <li>서명 단계의 <b>이 현장 등록 근로자</b> 이름을 누르면 이름이 입력된 서명 창이 열립니다. 이름 칸에서도 검색됩니다.</li>
    <li>QR·원격 링크를 받은 근로자도 자기 이름을 검색해서 고를 수 있습니다.</li></ol>
  <h2>TBM 일지</h2><ol>
    <li>홈 → <b>＋ TBM 시작</b> → 현장·작업명·작업내용, 양식(사진 포함/사진 없음), TBM 리더를 입력합니다. 같은 현장은 <b>지난 TBM 불러오기</b>로 한 번에 채웁니다.</li>
    <li><b>위험요인</b>: 잠재위험요인 3개와 대책을 목록에서 고르거나 직접 입력하고, 그중 1개를 중점위험으로 정합니다.</li>
    <li><b>안내</b>: 큰 글씨 화면으로 금일 작업과 위험요인을 설명합니다.</li>
    <li><b>서명</b>: TBM 리더 서명 후, 작업자 6명까지 QR 또는 이 기기에서 서명을 받습니다.</li>
    <li><b>사진</b>(사진 포함 양식만) → <b>결과</b>: A4 한 장 PDF를 저장·공유해 시공사에 전달합니다. 결재칸(관리감독자·안전보건관리책임자)은 비워 두어 수기로 결재합니다.</li></ol>
  <h2>고위험요인 평가</h2><ol>
    <li>홈 → <b>고위험요인 평가</b> → <b>＋ 평가 시작</b> → 현장명·평가일·현장소장 이름을 넣습니다.</li>
    <li><b>전체 검색</b>(작업·기인물·재해상세·대책, 초성 가능)이나 <b>공종 → 작업 → 단위작업</b> 선택, 재해종류·8대 위험요인·3대 사고유형 조건으로 고용노동부 SIF 평가표 항목을 찾습니다.</li>
    <li>필요한 항목을 <b>＋ 평가에 추가</b>(최대 14개)하고, 항목마다 해당여부·위험등급(상·중·하)·현장 추가대책을 적습니다.</li>
    <li>지도요원·현장소장 서명 후 <b>결과지 만들기</b> → 1~2쪽 PDF와 쪽별 이미지로 저장·공유합니다.</li></ol>
  <h2>중처법 관리체계점검</h2><ol>
    <li>홈 → <b>중처법 관리체계점검</b> → <b>＋ 점검 시작</b> → 현장명·점검일·현장소장 이름을 넣습니다.</li>
    <li>고용노동부 「건설업 안전보건관리체계 컨설팅 매뉴얼」(2024)의 6개 실행전략·49개 세부항목마다 이행여부(○ 이행 / △ 보완 / × 미이행 / 해당없음)를 고르고 비고를 적습니다. <b>점검 포인트</b>를 누르면 매뉴얼의 확인사항이 나옵니다.</li>
    <li>지도요원·현장소장 서명 후 <b>결과지 만들기</b> → 3쪽 PDF, 쪽별 이미지 3장으로 저장·공유합니다.</li></ol>
  <h2>산안법 관리체계점검</h2><ol>
    <li>홈 → <b>산안법 관리체계점검</b> → <b>＋ 점검 시작</b> → 현장명·점검일·현장소장 이름을 넣습니다. 같은 현장은 지난 점검의 현장소장 이름이 자동으로 들어갑니다.</li>
    <li>과태료 부과기준 38개 항목을 현장소장에게 설명하면서 <b>해당</b>하는 항목을 체크하고, 필요하면 비고를 적습니다.</li>
    <li>지도요원과 현장소장이 각각 서명합니다(이름별 이전 서명 불러오기 가능).</li>
    <li><b>결과지 만들기</b> → 2쪽 PDF 저장·공유, 1쪽·2쪽 이미지를 각각 저장하거나 2장을 함께 공유합니다.</li></ol>
  <h2>장비측정</h2><ol>
    <li>홈 → <b>장비측정</b> → <b>＋ 측정 기록</b> → 현장명·측정일을 넣고 측정한 장비를 체크합니다.</li>
    <li>체크한 장비마다 측정장소·측정값·판정·지도사항을 쓰고 사진을 찍습니다. <b>지난 ○○ 불러오기</b>로 전에 쓴 내용을 고를 수 있습니다(현장과 관계없이 공통).</li>
    <li><b>결과지 만들기</b> → A4 한 장에 장비 3개씩 PDF로 저장·공유하거나 이미지 1개로 저장합니다.</li></ol>
  <h2>페이지 자료 등록</h2><ol>
    <li>교육자료 → <b>[＋ 페이지 자료 등록]</b> → 제목을 넣고 <b>PDF 추가</b>(쪽마다 나뉨), <b>이미지 추가</b>(여러 장), <b>카메라로 촬영</b> 중에서 페이지를 넣습니다.</li>
    <li>↑↓로 순서를 바꾸고, 쪽마다 설명을 붙일 수 있습니다. 근로자 확인 항목과 자율점검표는 선택입니다.</li>
    <li>새 교육의 작업 선택에서 <b>내가 추가한 자료</b>로 고르면, 교육 단계에서 <b>▶ 전체화면으로 보기</b>로 넘겨 가며 설명합니다(좌우로 밀기, 화면 좌우 누르기).</li>
    <li>결과 PDF에는 교육한 페이지가 작은 그림으로 함께 들어갑니다. 원격 링크로는 페이지 그림이 전달되지 않습니다.</li></ol>
  <h2>교육자료 추가</h2><ol>
    <li>교육자료 → <b>[새 교육자료]</b> 또는 기존 자료에서 <b>[복사해서 새 자료]</b>.</li>
    <li>점검표는 줄마다 한 항목. <code># 구분</code>, <code>! 핵심항목</code>, <code>* 참고설명</code> 규칙을 씁니다.</li>
    <li>[내보내기]로 다른 지도요원에게 파일을 전달하고, 받은 쪽은 [가져오기] 합니다.</li></ol>
  <h2>비밀번호</h2><ol>
    <li>앱을 열 때와 근로자가 QR·링크로 들어올 때 숫자 6자리 비밀번호를 입력해야 화면이 보입니다. 근로자에게는 비밀번호를 말로 알려 주세요.</li>
    <li>한 번 입력하면 브라우저(앱)를 닫을 때까지 다시 묻지 않습니다.</li>
    <li>설정에서 바꿀 수 있습니다. 바꾼 비밀번호를 잊으면 이 기기의 기록을 열 수 없으니 꼭 적어 두세요.</li></ol>
  <h2>앱 설치 (홈 화면 등록)</h2><p>홈 화면의 <b>홈 화면에 앱 설치</b> 버튼을 누르거나, 크롬·삼성 인터넷 메뉴(⋮ 또는 ≡) → <b>홈 화면에 추가 / 앱 설치</b>를 누르면 휴대폰 홈 화면에 <b>안전지도</b> 아이콘이 생깁니다. 아이콘을 길게 누르면 <b>안전교육 시작</b>, <b>TBM 시작</b> 바로가기가 나옵니다. 설치 후에는 인터넷이 없어도 열립니다.</p>
  </article>`;
}

// ---------- 라우터 ----------
const routes = [
  [/^#?\/?$/, home], [/^#\/topics$/, topicsList], [/^#\/topic\/([^/]+)$/, topicView], [/^#\/src\/([^/]+)$/, srcView],
  [/^#\/edit\/(.+)$/, editor], [/^#\/new(?:~(.+))?$/, newSession], [/^#\/sites$/, sitesView], [/^#\/s\/([^/]+)(?:\/(\d))?$/, sessionView],
  [/^#\/records$/, records], [/^#\/settings$/, settings], [/^#\/help$/, help],
  [/^#\/w\/(.+)$/, workerView], [/^#\/r\/(.+)$/, importView],
  [/^#\/sif$/, Sif.list], [/^#\/sif\/new(?:~(.+))?$/, Sif.create], [/^#\/h\/([^/]+)$/, Sif.view],
  [/^#\/sapa$/, Sapa.list], [/^#\/sapa\/new(?:~(.+))?$/, Sapa.create], [/^#\/z\/([^/]+)$/, Sapa.view],
  [/^#\/law$/, Law.list], [/^#\/law\/new(?:~(.+))?$/, Law.create], [/^#\/l\/([^/]+)$/, Law.view],
  [/^#\/meas$/, Meas.list], [/^#\/meas\/new(?:~(.+))?$/, Meas.create], [/^#\/m\/([^/]+)$/, Meas.view],
  [/^#\/tbm$/, TBM.list], [/^#\/tbm\/new(?:~(.+))?$/, TBM.create], [/^#\/t\/([^/]+)(?:\/(\d))?$/, TBM.view],
];
// 비밀번호가 맞아야 화면을 연다. 근로자 링크는 링크를 만든 지도요원의 비밀번호를 쓴다.
async function needPin(h) {
  const wm = h.match(/^#\/w\/(.+)$/);
  if (wm) { try { return (await Codec.unpack(wm[1])).k || Lock.DEFAULT; } catch (e) { return Lock.DEFAULT; } }
  return Lock.current();
}
async function route() {
  const h = location.hash || '#/';
  document.body.classList.toggle('worker', h.startsWith('#/w/'));
  const pin = await needPin(h);
  if (!Lock.isOpen(pin)) { Lock.gate(view(), pin, route); return; }
  document.body.classList.remove('locked');
  $$('.nav a').forEach(a => a.classList.toggle('on', h === a.getAttribute('href') || (a.getAttribute('href') !== '#/' && h.startsWith(a.getAttribute('href')))));
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) {
      try { await fn(...m.slice(1)); } catch (e) { console.error(e); view().innerHTML = `<p class="err">오류: ${esc(e.message)}</p>`; }
      window.scrollTo(0, 0);
      Keep.restore();
      return;
    }
  }
  view().innerHTML = '<p>페이지를 찾을 수 없습니다.</p><a class="btn" href="#/">처음으로</a>';
}

(async function init() {
  try { await loadTopics(); } catch (e) { view().innerHTML = '<p class="err">교육자료를 불러오지 못했습니다. 인터넷 연결을 확인하세요.</p>'; return; }
  await Registry.backfill().catch(() => {});
  window.addEventListener('hashchange', route);
  const back = Keep.resumeHash(); // 다른 앱에 다녀오는 사이 앱이 닫혔으면 보던 화면으로
  if (back) location.replace(back); else route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
