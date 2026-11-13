// 중처법 관리체계점검: 「건설업 안전보건관리체계 컨설팅 매뉴얼」(고용노동부, 2024.3)의
// 6개 실행전략 · 21개 세부전략 · 49개 세부항목을 체크리스트로 점검하고 지도요원·현장소장 서명을 받아 PDF·쪽별 이미지로 저장한다.
const Sapa = (() => {
  // g: 실행전략, s: 세부전략, items: [번호, 세부항목, 점검 포인트[]]
  const LAW = {
    '1-1': '영 제4조 제3호', '1-2': '영 제4조 제3호', '1-3': '영 제4조 제3호', '1-4': '영 제4조 제3호',
    '1-5': '영 제4조 제7호', '1-6': '법 제4조 제1항 제3호',
    '2-1': '영 제4조 제8호', '2-2': '법 제4조 제1항 제2호', '2-3': '영 제4조 제8호',
    '3-1': '영 제4조 제1호', '3-2': '영 제4조 제2·5·6호', '3-3': '영 제4조 제4호', '3-4': '영 제4조 제4호',
    '4-1': '영 제4조 제7호', '4-2': '영 제4조 제7호', '4-3': '영 제5조 제2항 제3·4호',
    '5-1': '영 제4조 제9호, 법 제5조', '5-2': '영 제4조 제9호, 법 제5조', '5-3': '영 제4조 제9호, 법 제5조', '5-4': '영 제4조 제9호, 법 제5조',
    '6-1': '영 제4조 제5호, 영 제5조 제2항'
  };
  const GROUPS = [
    { g: '1. 위험요인의 파악 및 개선', subs: [
      { s: '1-1', n: '위험성평가 이행·절차의 적합성', items: [
        ['1-1-①', '위험성평가를 실시하고 종사자를 참여시킵니다.', ['위험성평가 지침·매뉴얼 마련, 절차별 책임자·역할 명확화', '현장별·공종별 위험성평가 실시 후 기록·보존', '종사자 참여(노사협의체, 합동점검, 명일 위험작업회의, 교육 등)', '아차사고·산재사고를 위험성평가에 반영']],
        ['1-1-②', '위험성평가 결과를 공유하고 위험성 감소대책을 실행합니다.', ['위험성평가 결과를 종사자에게 공유(TBM·게시 등)', '작업자·관리자·안전보건담당자가 함께 감소대책 이행']],
        ['1-1-③', '위험성평가를 통한 유해·위험요인 개선여부를 주기적으로 점검합니다.', ['종사자 의견을 들어 개선 여부를 반기 1회 이상 점검', '미이행 시 필요한 조치 및 절차(기준·방법·지침) 적정성 검토']]] },
      { s: '1-2', n: '10대 고위험 기계·장비 안전관리', items: [
        ['1-2-①', '고위험 기계·장비에 대한 표준 작업계획서를 작성합니다.', ['본사에 건설기계·장비 담당 팀 또는 담당자 지정', '기계·장비 관리대장 표준양식 마련·현장 제공', '고위험 기계·장비 표준작업계획서 마련']],
        ['1-2-②', '작업계획서를 작업자에게 공유하고 그에 따른 대책을 실천합니다.', ['관리감독자가 작업계획서 작성, 원하청 현장소장·안전관리자 검토', '작업허가 대상 작업은 안전작업허가서(PTW) 작성·확인', 'TBM에서 모든 작업자가 작업계획서 확인, 계획서대로 작업']]] },
      { s: '1-3', n: '3대 임시가설물 안전관리', items: [
        ['1-3-①', '비계, 거푸집·동바리, 흙막이 등 3대 가설구조물의 구조안정성을 검토한 후 시공계획서 및 시공상세도를 작성하고 검토합니다.', ['본사에 가설구조물 담당 팀 또는 담당자 지정', '착수 전 공종별 시공계획서·시공상세도 작성 및 본사 보고']],
        ['1-3-②', '시공상세도에 따라 설치하고, 이상 유무를 주기적으로 확인합니다.', ['작업 전 특별교육 실시', '조립도에 따른 조립 여부, 변위·침하 확인', '이상 발견 시 작업중지·대피, 필요 시 구조안정성 평가', '흙막이 계측장치 설치 및 주기적 확인']]] },
      { s: '1-4', n: '핵심 위험요인 현장점검', items: [
        ['1-4-①', '2개월에 1회 이상 협력업체와 함께 합동안전점검을 실시합니다.', ['합동안전점검 지침·표준양식 마련', '원청·협력업체 현장소장, 관리자, 근로자 함께 참여', '향후 2개월 공정에 따른 안전조치 논의']],
        ['1-4-②', '도급인(안전보건총괄책임자: 원청 현장소장)은 2일에 1회 현장 순회점검을 실시합니다.', ['순회점검 시 확인할 위험요인 제시', '당일·명일 작업장 대상 점검, 급박한 위험 시 즉시 작업중지', '확인된 위험요인은 작업보다 우선하여 개선']],
        ['1-4-③', '현장관리자는 작업실시 전·중·후 안전점검을 실시합니다.', ['작업 전 안전조치 이행 확인', '작업 중 안전한 방법으로 수행되는지 확인', '작업 후 안전시설 임의 해체 여부 확인']]] },
      { s: '1-5', n: '아차사고 신고제도 운영', items: [
        ['1-5-①', '큰 사고로 이어질 수 있었던 아차사고를 신고할 수 있도록 제도를 마련하고, 기록하여 개선대책을 수립합니다.', ['SNS·앱·전화·신고함 등 신고 수단 마련, 본사 직접 신고 절차', '신고된 위험요인 즉시 개선, 신고·처리 현황 관리', '포상제도 운영, 위험성평가에 활용']]] },
      { s: '1-6', n: '시정명령에 대한 후속조치', items: [
        ['1-6-①', '정부‧지자체의 시정지시 사항은 신속하게 개선합니다.', ['고용노동부·지자체·공단 감독·점검 지적사항 신속 개선']],
        ['1-6-②', '시정지시 내용과 개선조치 결과는 모든 현장에 전파합니다.', ['현장관리자는 지시 내용·개선 결과를 본사에 보고', '본사는 모든 현장에 알리고 현장별 자체 점검']]] }
    ] },
    { g: '2. 비상조치 계획', subs: [
      { s: '2-1', n: '비상조치계획', items: [
        ['2-1-①', '위험요인별 재해발생 시나리오 및 비상조치계획을 수립합니다.', ['위험요인별 재해 발생 시나리오 작성', '작업중지 → 대피 → 위험요인 제거 순서, 구호·추가피해 방지 포함', '비상조치계획 종사자 전원 공유']],
        ['2-1-②', '위험요인별 사전 사고징후 발견 시나리오 및 조치계획을 수립합니다.', ['사고징후 발견 시나리오 및 조치계획 수립', '관리감독자 등 현장관리자 사고징후 숙지']],
        ['2-1-③', '주기적으로 비상훈련을 실시하고 수립한 비상조치계획대로 작동하는지 점검합니다.', ['구성원별 역할·대피방법 교육', '정기 훈련 실시, 평가 후 계획 보완', '본사의 훈련·조치·개선 이행 점검']]] },
      { s: '2-2', n: '산업재해 발생에 따른 조치', items: [
        ['2-2-①', '산업재해가 발생하면, 신속하게 보고하고 긴급조치를 실시합니다.', ['본사·현장관리자 즉시 보고, 구호조치(CPR 등)', '재발방지대책 이행 전까지 작업중지', '조치 절차 사내규정 문서화']],
        ['2-2-②', '산업재해에 대한 재발방지대책을 마련합니다.', ['경위 조사, 의견 청취 후 재발방지대책 수립', '원인·대책 본사 보고 및 모든 현장 전파', '대책 이행 여부 확인']]] },
      { s: '2-3', n: '근로자 작업중지권 활성화', items: [
        ['2-3-①', '근로자 작업중지를 활성화 할 수 있도록 제도를 마련합니다.', ['급박한 위험 시 작업중지·대피 및 보고 절차', '작업중지권 사전 교육·TBM 공유', '작업중지 발생·조치 현황 관리']]] }
    ] },
    { g: '3. 경영자 리더십', subs: [
      { s: '3-1', n: '안전보건경영방침과 목표의 설정', items: [
        ['3-1-①', '안전보건경영방침을 수립하고 목표를 설정합니다.', ['구체적·실질적인 경영방침과 목표 수립']],
        ['3-1-②', '안전보건경영방침과 목표를 알립니다.', ['모든 현장·구성원 게시, 협력업체·고객에게도 공지']],
        ['3-1-③', '매년 안전보건계획을 수립합니다.', ['연간 안전보건계획 이사회 승인 및 이행']]] },
      { s: '3-2', n: '안전보건 조직 및 인력 운영', items: [
        ['3-2-①', '안전보건업무를 총괄하여 지원·관리 역할을 수행하는 조직을 둡니다.', ['전체 사업 총괄 안전보건조직, 경영책임자 직속 배치', '전문 인력으로 구성']],
        ['3-2-②', '안전보건업무 관련 조직별 업무분장을 명확히 합니다.', ['본사·현장 안전보건조직도 및 업무분장표']],
        ['3-2-③', '안전보건 인력을 배치합니다.', ['현장별 안전보건관리책임자·관리감독자 권한·예산 부여', '법령 기준 이상의 안전관리자·보건관리자 배치']]] },
      { s: '3-3', n: '안전보건 예산의 편성과 배정', items: [
        ['3-3-①', '안전보건조치에 필요한 예산은 본사 차원에서 지원합니다.', ['안전보건 인건비·조치 예산 산정 및 편성', '산업안전보건관리비 목적 외 사용 방지', '예산 집행 관리']]] },
      { s: '3-4', n: '그 밖의 안전경영에 관한 사항', items: [
        ['3-4-①', '필요에 따라 외부 전문기관을 활용합니다.', ['전문성이 필요한 분야 외부 전문기관 활용']],
        ['3-4-②', '본사 차원의 안전보건관리규정을 작성·제공합니다.', ['전사 안전보건관리규정 및 현장별 표준 규정', '구성원별 권한·책임, 활동 시기·절차·방법 규정']]] }
    ] },
    { g: '4. 종사자 참여 및 교육', subs: [
      { s: '4-1', n: '작업 전 안전회의(TBM) 운영', items: [
        ['4-1-①', '명일 위험작업 안전회의를 실시합니다.', ['명일 위험작업별 위험요인·안전조치 파악', '혼재작업 위험 시 작업 조정']],
        ['4-1-②', '모든 종사자가 참여하는 작업 전 안전회의(TBM)를 매일 실시합니다.', ['모든 구성원 참여, 형식적이지 않게', '위험성평가 결과에 따른 안전조치 확인']]] },
      { s: '4-2', n: '다양한 의견청취 절차 마련', items: [
        ['4-2-①', '다양한 방법의 의견청취 절차를 마련합니다.', ['누구나 자유롭게 의견 제시할 수 있는 다양한 방법']],
        ['4-2-②', '정기적인 노사협의체를 통해 종사자의 의견을 수렴합니다.', ['노사협의체 적정 구성·정기 개최(매월·격월)', '논의사항 서면 정리·공개']],
        ['4-2-③', '종사자의 의견에 따라 개선방안을 마련하여 이행하는지 점검합니다.', ['개선방안 마련·이행 여부 반기 1회 점검']]] },
      { s: '4-3', n: '현장관리자 등에 대한 안전교육', items: [
        ['4-3-①', '안전보건관리책임자(현장소장), 안전관리자, 관리감독자에 대한 사내교육을 정기적으로 실시합니다.', ['연간 교육계획 수립, 사고사례·취약시기 자료 활용', '긴급조치(CPR 등) 교육']],
        ['4-3-②', '안전보건관리책임자(현장소장), 안전관리자, 관리감독자(공사·공무팀장 등)에 대해 법령에 따른 직무교육을 실시합니다.', ['안전보건관리책임자·안전·보건관리자 직무교육(2년 주기)', '관리감독자 정기교육(연 16시간)']],
        ['4-3-③', '교육이 제대로 이행되고 있는지 주기적으로 점검합니다.', ['법령 교육 실시 여부 점검, 누락 원인 파악', '점검 결과 경영자 보고, 예산·인력 조치']]] }
    ] },
    { g: '5. 협력업체 관리 및 지원', subs: [
      { s: '5-1', n: '협력업체 안전수준 확인 및 정보제공', items: [
        ['5-1-①', '협력업체를 선정할 때는 안전수준을 확인합니다.', ['선정 시 안전보건 관리수준 평가', '최근 3년 사망사고 발생 업체 확인']],
        ['5-1-②', '협력업체에게 안전보건 관련 정보를 제공합니다.', ['방침·목표·계획, 위험요인·작업계획 등 정보 제공']],
        ['5-1-③', '협력업체 종사자에 대한 의견수렴 체계를 확인합니다.', ['노사협의체·아차사고·작업중지·TBM 참여 확인', '의견 개선방안 이행 정기 점검']]] },
      { s: '5-2', n: '협력업체 안전교육 지원', items: [
        ['5-2-①', '협력업체가 유해·위험작업별 특별교육을 적절히 실시하는지 확인합니다.', ['특별교육 대상 작업, 시간·내용·강사자격 확인']],
        ['5-2-②', '협력업체가 안전보건교육을 실시할 수 있도록 장소와 자료를 제공합니다.', ['교육 장소·시설 제공, 표준 교재 배포', '필수교육 미이수자 작업 배제']]] },
      { s: '5-3', n: '공사기간 및 공사비용 보장', items: [
        ['5-3-①', '발주자와 도급계약 체결 전 공사기간의 적절성, 공사기간 연장 조항 유무 확인 등을 꼼꼼히 검토합니다.', ['공사기간 적정성 판단기준, 공기연장·간접비 조항 검토']],
        ['5-3-②', '협력업체와의 하도급계약 체결 시 합리적인 공사기간을 제시하고, 공사기간 연장 사유를 명시합니다.', ['합리적 공사기간 제시, 위험 공법 강요 금지']],
        ['5-3-③', '협력업체의 공사기간 연장에 대해 합리적인 판단 절차와 기준을 통해 수용 여부를 결정합니다.', ['공기연장 건의 절차 마련, 협력업체 귀책 아닌 연장 시 보장']]] },
      { s: '5-4', n: '혼재작업 조정', items: [
        ['5-4-①', '각 협력업체 간 혼재작업이 이루어지지 않도록 일정을 조정합니다.', ['수급인별 작업 장소·시기·내용 파악 및 조정']],
        ['5-4-②', '안전보건조정자의 작업 시기·내용 조정에 따릅니다.', ['분리발주 공사(합계 50억 이상) 안전보건조정자 조율 협조']]] }
    ] },
    { g: '6. 평가 및 개선', subs: [
      { s: '6-1', n: '안전보건활동 평가·점검 및 개선', items: [
        ['6-1-①', '안전보건관계자의 업무수행의 적정여부를 평가합니다.', ['안전보건관리책임자 등 평가항목 마련, 반기 1회 이상 평가', '평가결과 근무성적 반영, 우수자 포상']],
        ['6-1-②', '유해·위험작업에 관한 안전보건교육 실시여부를 점검합니다.', ['특별교육·MSDS교육 등 실시 여부 점검, 결과 보고', '미실시 교육 즉시 이수 조치']],
        ['6-1-③', '안전보건관리체계를 점검하고 개선합니다.', ['실행계획·내부규정 이행 점검(전문가·실무자 의견)', '결과 보고, 예산·인력 배정 개선 및 공유']]] }
    ] }
  ];
  const ALL = GROUPS.flatMap(g => g.subs.flatMap(s => s.items.map(([no, t, pts]) => ({ no, t, pts, s: s.s }))));
  const PAGES = [[0, 1], [2, 3], [4, 5]]; // 쪽별 실행전략
  // 이행여부: o 이행(○), t 보완 필요(△), x 미이행(×), '' 해당없음(공백)
  const MARKS = [['o', '○', '이행'], ['t', '△', '보완'], ['x', '×', '미이행'], ['', '', '해당없음']];
  const SYM = { o: '○', t: '△', x: '×', '': '' };
  const LEGEND = '○ 이행 · △ 보완 필요 · × 미이행 · 공백 해당없음';
  const mk = v => (v === 'o' || v === 't' || v === 'x') ? v : '';
  const tallyTxt = vals => `이행 ${vals.filter(v => mk(v) === 'o').length} · 보완 ${vals.filter(v => mk(v) === 't').length} · 미이행 ${vals.filter(v => mk(v) === 'x').length}`;
  const pad2 = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const fmtDay = ymd => { const [y, m, d] = String(ymd || '').split('-'); return y ? `${y}. ${+m}. ${+d}.` : ''; };
  const save = t => { t.updated = Date.now(); return DB.put('sessions', t); };
  const all = async () => (await DB.all('sessions').catch(() => [])).filter(x => x.kind === 'sapa').sort((a, b) => b.created - a.created);
  const lines = s => esc(s || '').replace(/\n/g, '<br>');
  const INSPECTOR_NAME = String(INSPECTOR).split(' ').pop();
  const vals = t => ALL.map(it => (t.v[it.no] || {}).m);

  // ---------- 목록 ----------
  function card(t) {
    return `<a class="card" href="#/z/${t.id}">
      <b><span class="cat c-sapa">중처법</span>${esc(t.site || '(현장명 없음)')}</b>
      <span>${esc(fmtDay(t.date))} · 현장소장 ${esc(t.boss || '-')}</span>
      <span class="badge ${t.done ? 'ok' : ''}">${t.done ? '완료' : '작성 중'} · ${tallyTxt(vals(t))} / ${ALL.length}개 · 서명 ${(t.sigI ? 1 : 0) + (t.sigB ? 1 : 0)}/2</span></a>`;
  }
  async function list() {
    const items = await all();
    view().innerHTML = `<div class="bar"><h1>중처법 관리체계점검</h1><a class="btn primary" href="#/sapa/new">＋ 점검 시작</a></div>
      <p class="hint">고용노동부 「건설업 안전보건관리체계 컨설팅 매뉴얼」(2024)의 6개 실행전략·${ALL.length}개 세부항목을 체크리스트로 점검하고, 지도요원·현장소장 서명을 받아 PDF와 쪽별 이미지로 저장합니다.</p>
      ${items.length ? `<div class="cards">${items.map(t => `<div class="rec">${card(t)}<div class="row"><button class="btn ghost sm" data-del="${t.id}">삭제</button></div></div>`).join('')}</div>` : '<p class="hint">아직 점검 기록이 없습니다.</p>'}`;
    $$('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('이 점검 기록을 삭제할까요? (저장해 둔 PDF는 지워지지 않습니다)')) return;
      await DB.del('sessions', b.dataset.del); list();
    });
  }
  // 같은 현장의 지난 점검(산안법·중처법)에서 현장소장 이름
  const lastBoss = async site => ((await DB.all('sessions').catch(() => [])).filter(x => (x.kind === 'sapa' || x.kind === 'law') && x.boss && Registry.norm(x.site) === Registry.norm(site)).sort((a, b) => b.created - a.created)[0] || {}).boss || '';
  async function create(siteArg) {
    const site = siteArg ? decodeURIComponent(siteArg) : '';
    const reg = site ? await Registry.site(site) : null;
    const t = { id: uid(10), kind: 'sapa', created: Date.now(), done: false, site: reg ? reg.name : site, date: today(), inspector: INSPECTOR_NAME, boss: site ? await lastBoss(site) : '', v: {}, sigI: '', sigB: '' };
    await save(t);
    location.replace(`#/z/${t.id}`);
  }

  // ---------- 점검 화면 ----------
  async function view_(id) {
    const t = await DB.get('sessions', id);
    if (!t || t.kind !== 'sapa') { view().innerHTML = '<p>점검 기록을 찾을 수 없습니다.</p><a class="btn" href="#/sapa">점검 목록</a>'; return; }
    t.v = t.v || {};
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = setTimeout(() => save(t), 400); };
    const markUI = v => `<div class="lw-mkg sp-mkg">${MARKS.map(([k, s, l]) => `<button type="button" data-v="${k}" class="${mk(v) === k ? 'on' : ''}">${s ? `<i>${s}</i>` : ''}${l}</button>`).join('')}</div>`;
    const cls = v => ({ o: 'on', t: 'tri', x: 'bad' }[mk(v)] || '');
    view().innerHTML = `<div class="bar"><h1>중처법 관리체계점검</h1><a class="btn ghost sm" href="#/sapa">목록</a></div>
      <form class="form" id="zf">
        <label>현장명 <input name="site" required value="${esc(t.site)}" placeholder="현장명 입력 또는 검색 (초성 검색 가능)"></label>
        <div class="grid3"><label>점검일 <input name="date" type="date" value="${esc(t.date)}"></label>
          <label>지도요원 <input value="${esc(t.inspector || INSPECTOR_NAME)}" readonly class="fixed"></label>
          <label>현장소장 <input name="boss" value="${esc(t.boss)}" placeholder="현장소장 이름"></label></div>
      </form>
      <div class="bar lw-bar"><h2 class="h">안전보건관리체계 세부항목 <small>(${ALL.length}개)</small></h2><span class="lw-count" id="cnt"></span></div>
      <p class="hint">항목마다 이행여부를 고르세요: <b>○ 이행</b>, <b>△ 보완</b>(보완 필요), <b>× 미이행</b>, <b>해당없음</b>(공백). <b>점검 포인트</b>를 누르면 매뉴얼의 확인사항이 나옵니다.</p>
      ${GROUPS.map(g => `<section class="sp-g"><h3 class="sp-gh">${esc(g.g)}</h3>
        ${g.subs.map(s => `<div class="sp-s"><div class="sp-sh"><b>${s.s}</b> ${esc(s.n)} <small>${esc(LAW[s.s])}</small></div>
          <ol class="lw-list">${s.items.map(([no, tx, pts]) => { const v = t.v[no] || {}; return `<li class="lw-it ${cls(v.m)}" data-no="${no}">
            ${markUI(v.m)}
            <div class="lw-body"><div class="lw-tx"><b>${no}</b> ${esc(tx)}</div>
              <details class="sp-pts"><summary>점검 포인트</summary><ul>${pts.map(p => `<li>${esc(p)}</li>`).join('')}</ul></details>
              <input class="lw-note" placeholder="비고 (확인 내용·보완사항)" value="${esc(v.n || '')}"></div></li>`; }).join('')}</ol></div>`).join('')}
      </section>`).join('')}
      <h2 class="h">서명</h2>
      <div class="lw-sigs">
        <section class="lw-sig" id="sgI"><input type="hidden" name="name" value="${esc(t.inspector || INSPECTOR_NAME)}">
          <div class="sigwrap"><span>지도요원 <b>${esc(t.inspector || INSPECTOR_NAME)}</b> 서명</span><canvas class="sigpad"></canvas><button type="button" class="btn ghost sm" data-clr>다시 쓰기</button></div></section>
        <section class="lw-sig" id="sgB"><input type="hidden" name="name" value="${esc(t.boss)}">
          <div class="sigwrap"><span>현장소장 <b class="bossname">${esc(t.boss || '(이름 입력)')}</b> 서명</span><canvas class="sigpad"></canvas><button type="button" class="btn ghost sm" data-clr>다시 쓰기</button></div></section>
      </div>
      <div class="row center"><button class="btn big primary" id="make">결과지 만들기 (PDF ${PAGES.length}쪽·이미지 ${PAGES.length}장)</button></div>
      <div id="out"></div>`;
    const f = $('#zf');
    const count = () => { $('#cnt').textContent = tallyTxt(vals(t)); };
    count();
    siteField(f.site, async () => {
      t.site = f.site.value.trim();
      if (!f.boss.value.trim()) { const b = await lastBoss(t.site); if (b) { f.boss.value = b; f.boss.dispatchEvent(new Event('input')); } }
      later();
    });
    f.site.addEventListener('input', () => { t.site = f.site.value.trim(); later(); });
    f.date.onchange = () => { t.date = f.date.value; later(); };
    $$('.lw-it[data-no]').forEach(li => {
      const no = li.dataset.no, val = () => (t.v[no] = t.v[no] || { m: '', n: '' });
      $$('.lw-mkg [data-v]', li).forEach(b => b.onclick = () => {
        val().m = b.dataset.v;
        $$('.lw-mkg [data-v]', li).forEach(x => x.classList.toggle('on', x.dataset.v === mk(val().m)));
        li.className = 'lw-it ' + cls(val().m);
        count(); later();
      });
      $('.lw-note', li).oninput = e => { val().n = e.target.value; later(); };
    });
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
      if (!t.boss) { toast('현장소장 이름을 입력하세요.'); f.boss.focus(); return; }
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
          <div class="tbm-prev">${res.pages.map(p => `<img src="${p}" alt="중처법 관리체계점검 결과">`).join('')}</div>
          <div class="save-actions">
            <button class="btn primary" id="sv-pdf">PDF 저장 (${N}쪽)</button>
            <button class="btn" id="sv-share">PDF 공유 (카카오톡·메일 등)</button>
            ${res.pages.map((_, i) => `<button class="btn ghost" data-jpg="${i}">${i + 1}쪽 이미지(JPG) 저장</button>`).join('')}
            <button class="btn ghost" id="sv-imgshare">이미지 ${N}장 공유</button>
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
  const fileName = t => `중처법관리체계점검_${(t.site || '현장').replace(/[\\/:*?"<>|]/g, '_')}_${(t.date || '').replace(/-/g, '')}`;

  // ---------- 결과지 ----------
  const sigImg = g => g ? `<img src="${Sig.toImage(g, 400, 160)}">` : '';
  function pageHTML(t, p) {
    const total = PAGES.length;
    const top = p === 0 ? `
      <div class="lw-top">
        <div class="tb-title"><img class="tb-logo" src="img/brand-logo.png" alt="사람인 안전지도사 사무소"><h1>중대재해처벌법 안전보건관리체계 점검표</h1>
          <div class="lw-info">현장명: <b>${esc(t.site)}</b> &nbsp;·&nbsp; 점검일: <b>${esc(fmtDay(t.date))}</b> &nbsp;·&nbsp; <b>${tallyTxt(vals(t))}</b> / ${ALL.length}개</div></div>
        <table class="lw-sign"><tr><th>구분</th><th>성명</th><th>서명</th></tr>
          <tr><th>지도요원</th><td>${esc(t.inspector || INSPECTOR_NAME)}</td><td class="lw-sg">${sigImg(t.sigI)}</td></tr>
          <tr><th>현장소장</th><td>${esc(t.boss)}</td><td class="lw-sg">${sigImg(t.sigB)}</td></tr></table>
      </div>` : `<div class="lw-top2"><b>중대재해처벌법 안전보건관리체계 점검표</b><span>${esc(t.site)} · ${esc(fmtDay(t.date))}</span></div>`;
    const rows = PAGES[p].map(gi => GROUPS[gi]).map(g => `<tr class="sp-grow"><td colspan="5">${esc(g.g)}</td></tr>` +
      g.subs.map(s => s.items.map(([no, tx], k) => {
        const v = t.v[no] || {};
        return `<tr>${k === 0 ? `<td class="sp-sub" rowspan="${s.items.length}"><b>${s.s}</b><br>${esc(s.n)}<div class="sp-law">${esc(LAW[s.s])}</div></td>` : ''}
          <td class="c sp-no">${no}</td><td>${esc(tx)}</td><td class="c lw-mk">${SYM[mk(v.m)]}</td><td class="lw-ntc">${lines(v.n)}</td></tr>`;
      }).join('')).join('')).join('');
    return `<div class="lw-page">${top}
      <table class="tb-t lw-t sp-t">
        <colgroup><col style="width:17%"><col style="width:8%"><col style="width:45%"><col style="width:8%"><col></colgroup>
        <tr><th>실행전략</th><th>번호</th><th>세부항목</th><th>이행<br>여부</th><th>비고</th></tr>
        ${rows}
      </table>
      <div class="tb-foot"><span>사람인안전지도사사무소 · 지도요원 ${esc(t.inspector || INSPECTOR_NAME)} · 출처: 고용노동부 컨설팅 매뉴얼(2024)</span><span>${LEGEND} &nbsp;|&nbsp; ${p + 1} / ${total}쪽</span></div>
    </div>`;
  }
  async function build(t) {
    const root = document.createElement('div');
    root.className = 'rp-root';
    document.body.appendChild(root);
    const pages = [];
    try {
      for (let p = 0; p < PAGES.length; p++) {
        root.innerHTML = pageHTML(t, p);
        const page = $('.lw-page', root), tbl = $('.lw-t', page), foot = $('.tb-foot', page);
        await Promise.all([...root.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 4000); })));
        const room = () => foot.offsetTop - tbl.offsetTop - 6;
        let fs = 12.5;
        tbl.style.fontSize = fs + 'px';
        while (tbl.offsetHeight > room() && fs > 8) { fs -= 0.5; tbl.style.fontSize = fs + 'px'; }
        const rows = $$('tr', tbl).filter(r => !r.querySelector('th') && !r.classList.contains('sp-grow')), extra = room() - tbl.offsetHeight;
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

  return { list, create, view: view_, card, build, ALL };
})();
