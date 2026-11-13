// 기기 간 정보 합치기(최신화): 같은 와이파이의 스마트폰·갤럭시 탭끼리 서로 QR을 한 번씩 찍어 바로 연결하고
// 현장·근로자·전화번호·이전 서명·공통 항목·내가 추가한 자료(선택: 교육·점검 기록)를 양쪽에 합친다.
// 같은 항목은 더 최근에 고친 쪽을 따르고, 삭제한 현장·기록은 다른 기기에서도 지운다.
// 서버 없이 두 기기가 직접 주고받는다(WebRTC). 연결이 안 되면 파일로 주고받을 수 있다.
const Sync = (() => {
  const LIBS = ['tbmLib', 'measLib', 'measStd', 'lawXCommon'];
  const CHUNK = 60000;

  // ---------- 보낼 내용 ----------
  async function bundle(withRecords) {
    const kv = {};
    for (const k of ['registry', 'tombs', ...LIBS]) {
      const v = await DB.get('kv', k).catch(() => null);
      if (v != null) kv[k] = v;
    }
    return {
      app: 'safety-edu', v: 1, at: Date.now(), withRecords: !!withRecords, kv,
      topics: await DB.all('topics').catch(() => []),
      sessions: withRecords ? await DB.all('sessions').catch(() => []) : []
    };
  }

  // ---------- 합치기 ----------
  const t0 = x => Math.max(x && x.updated || 0, x && x.created || 0);
  function mergeRegistry(a, b, st) {
    a = a || { sites: {} }; b = b || { sites: {} };
    const out = Object.assign({}, a, { sites: {}, del: {} });
    for (const src of [a.del || {}, b.del || {}]) for (const [k, v] of Object.entries(src)) out.del[k] = Math.max(out.del[k] || 0, v);
    const keys = new Set([...Object.keys(a.sites || {}), ...Object.keys(b.sites || {})]);
    for (const k of keys) {
      const sa = (a.sites || {})[k], sb = (b.sites || {})[k];
      let s, isNew = false, isUpd = false;
      if (sa && sb) {
        const [nw, od] = (sb.updated || 0) > (sa.updated || 0) ? [sb, sa] : [sa, sb];
        s = Object.assign({}, od, nw);
        s.pdel = {};
        for (const src of [sa.pdel || {}, sb.pdel || {}]) for (const [n, v] of Object.entries(src)) s.pdel[n] = Math.max(s.pdel[n] || 0, v);
        s.people = {};
        for (const src of [sa.people || {}, sb.people || {}]) for (const [n, v] of Object.entries(src)) s.people[n] = Math.max(s.people[n] || 0, v);
        for (const [n, v] of Object.entries(s.pdel)) if ((s.people[n] || 0) <= v) delete s.people[n];
        s.tels = Object.assign({}, od.tels || {}, nw.tels || {});
        for (const n of Object.keys(s.tels)) if (!(n in s.people)) delete s.tels[n];
        isUpd = JSON.stringify(sa) !== JSON.stringify(s);
      } else {
        s = JSON.parse(JSON.stringify(sa || sb));
        isNew = !sa;
      }
      if (t0(s) <= (out.del[k] || 0)) { if (sa) st.sitesDel++; continue; } // 삭제된 현장
      if (isNew) st.sitesNew++;
      if (isUpd) st.sitesUpd++;
      out.sites[k] = s;
    }
    // 이름별 이전 서명: 합쳐서 최근 5개
    out.sigs = {};
    for (const src of [a.sigs || {}, b.sigs || {}]) for (const [n, list] of Object.entries(src)) {
      const m = new Map((out.sigs[n] || []).map(x => [x.g, x]));
      for (const x of list) { const o = m.get(x.g); if (!o || x.at > o.at) m.set(x.g, x); }
      out.sigs[n] = [...m.values()].sort((p, q) => q.at - p.at).slice(0, 5);
    }
    const before = Object.values(a.sigs || {}).reduce((s, l) => s + l.length, 0), after = Object.values(out.sigs).reduce((s, l) => s + l.length, 0);
    st.sigs += Math.max(0, after - before);
    return out;
  }
  async function merge(b) {
    if (!b || b.app !== 'safety-edu') throw new Error('안전지도 정보가 아닙니다.');
    const st = { sitesNew: 0, sitesUpd: 0, sitesDel: 0, sigs: 0, recNew: 0, recUpd: 0, recDel: 0, topics: 0, items: 0 };
    const kv = b.kv || {};
    // 현장·근로자·서명
    const reg = mergeRegistry(await DB.get('kv', 'registry').catch(() => null), kv.registry, st);
    await DB.put('kv', reg, 'registry');
    Registry.reload();
    // 삭제 기록(교육·점검 기록)
    const tombs = Object.assign({}, (await DB.get('kv', 'tombs').catch(() => null)) || {});
    for (const [id, v] of Object.entries(kv.tombs || {})) tombs[id] = Math.max(tombs[id] || 0, v);
    await DB.put('kv', tombs, 'tombs');
    // 공통 항목·목록
    const tbm = (await DB.get('kv', 'tbmLib').catch(() => null)) || [];
    for (const x of kv.tbmLib || []) { const o = tbm.find(y => y.h === x.h); if (!o) { tbm.push(x); st.items++; } else { o.n = Math.max(o.n || 0, x.n || 0); if ((x.at || 0) > (o.at || 0)) { o.m = x.m; o.at = x.at; } } }
    await DB.put('kv', tbm.sort((p, q) => (q.n || 0) - (p.n || 0)).slice(0, 200), 'tbmLib');
    const ml = (await DB.get('kv', 'measLib').catch(() => null)) || {};
    for (const [k, e] of Object.entries(kv.measLib || {})) {
      const o = ml[k] || (ml[k] = { loc: [], val: [], note: [] });
      for (const f of ['loc', 'val', 'note']) { const add = (e[f] || []).filter(v => !(o[f] || []).includes(v)); st.items += add.length; o[f] = [...(o[f] || []), ...add].slice(0, 30); }
    }
    await DB.put('kv', ml, 'measLib');
    if (kv.measStd) await DB.put('kv', Object.assign({}, kv.measStd, (await DB.get('kv', 'measStd').catch(() => null)) || {}), 'measStd');
    if (kv.lawXCommon) {
      const lx = (await DB.get('kv', 'lawXCommon').catch(() => null)) || [];
      for (const x of kv.lawXCommon) if (!lx.some(y => y.id === x.id || (y.t || '').trim() === (x.t || '').trim())) { lx.push(x); st.items++; }
      await DB.put('kv', lx.slice(0, 20), 'lawXCommon');
    }
    // 내가 추가한 교육자료
    let topicsChanged = false;
    for (const t of b.topics || []) {
      const o = await DB.get('topics', t.id).catch(() => null);
      if (!o || (t.updated || 0) > (o.updated || 0)) { await DB.put('topics', t); st.topics++; topicsChanged = true; }
    }
    // 교육·점검 기록
    for (const s of b.sessions || []) {
      if ((tombs[s.id] || 0) >= t0(s)) continue;
      const o = await DB.get('sessions', s.id).catch(() => null);
      if (!o) { await DB.put('sessions', s); st.recNew++; continue; }
      const [nw, od] = t0(s) > t0(o) ? [s, o] : [o, s];
      const m = Object.assign({}, nw);
      if (Array.isArray(o.workers) || Array.isArray(s.workers)) { // 서명은 양쪽 것을 모두 남긴다
        const ws = [...(nw.workers || [])];
        for (const w of od.workers || []) if (!ws.some(x => x.name === w.name && x.at === w.at)) ws.push(w);
        m.workers = ws.sort((p, q) => (p.at || 0) - (q.at || 0));
      }
      if (JSON.stringify(m) !== JSON.stringify(o)) { await DB.put('sessions', m); st.recUpd++; }
    }
    // 다른 기기에서 지운 기록은 여기서도 지운다
    for (const [id, v] of Object.entries(kv.tombs || {})) {
      const o = await DB.get('sessions', id).catch(() => null);
      if (o && t0(o) <= v) { await DB.del('sessions', id); st.recDel++; }
    }
    if (topicsChanged && typeof loadTopics === 'function') await loadTopics().catch(() => {});
    return st;
  }
  const statText = s => {
    const p = [];
    if (s.sitesNew) p.push(`새 현장 ${s.sitesNew}곳`);
    if (s.sitesUpd) p.push(`현장 정보 최신화 ${s.sitesUpd}곳`);
    if (s.sitesDel) p.push(`삭제된 현장 ${s.sitesDel}곳 반영`);
    if (s.sigs) p.push(`이전 서명 ${s.sigs}개`);
    if (s.recNew) p.push(`새 기록 ${s.recNew}건`);
    if (s.recUpd) p.push(`기록 최신화 ${s.recUpd}건`);
    if (s.recDel) p.push(`삭제된 기록 ${s.recDel}건 반영`);
    if (s.topics) p.push(`교육자료 ${s.topics}건`);
    if (s.items) p.push(`목록 항목 ${s.items}개`);
    return p.length ? p.join(', ') : '새로 받은 내용 없음 (이미 최신)';
  };

  // ---------- 같은 와이파이: QR로 연결 ----------
  const newPC = () => new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  const gathered = pc => new Promise(r => {
    if (pc.iceGatheringState === 'complete') { r(); return; }
    const t = setTimeout(r, 3500);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); r(); } });
  });
  // 연결 QR을 작게: SDP에서 꼭 필요한 값(ICE 아이디·암호, 인증서 지문, 주소 후보)만 뽑고, 받는 쪽에서 다시 조립한다
  function shrink(sdp) {
    const get = re => (sdp.match(re) || [])[1] || '';
    const fp = get(/a=fingerprint:sha-256 ([0-9A-F:]+)/i).split(':').map(h => parseInt(h, 16));
    const c = [];
    for (const line of sdp.split(/\r?\n/)) {
      const m = line.match(/^a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ (host|srflx)/i);
      if (!m) continue;
      if (c.some(x => x[0] === m[1] && x[1] === +m[2])) continue;
      c.push([m[1], +m[2], m[3][0]]); // [주소, 포트, h/s]
    }
    // 실제 내부 주소(IPv4)를 앞에, mDNS(.local)·외부 주소는 뒤에
    const rank = x => (/^\d+\.\d+\.\d+\.\d+$/.test(x[0]) && x[2] === 'h' ? 0 : x[2] === 'h' ? 1 : 2);
    c.sort((p, q) => rank(p) - rank(q));
    return { u: get(/a=ice-ufrag:(\S+)/), p: get(/a=ice-pwd:(\S+)/), f: Codec.b64u.enc(Uint8Array.from(fp)), st: get(/a=setup:(\S+)/), c: c.slice(0, 6) };
  }
  function expand(o) {
    const fp = [...Codec.b64u.dec(o.f)].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(':');
    const cand = o.c.map((x, i) => `a=candidate:${i + 1} 1 udp ${x[2] === 'h' ? 2122260223 - i : 1686052607 - i} ${x[0]} ${x[1]} typ ${x[2] === 'h' ? 'host' : 'srflx'}${x[2] === 's' ? ' raddr 0.0.0.0 rport 0' : ''} generation 0`);
    return ['v=0', 'o=- 4611731400430051336 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=extmap-allow-mixed', 'a=msid-semantic: WMS',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0', ...cand,
      `a=ice-ufrag:${o.u}`, `a=ice-pwd:${o.p}`, 'a=ice-options:trickle', `a=fingerprint:sha-256 ${fp}`, `a=setup:${o.st || 'actpass'}`,
      'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', ''].join('\r\n');
  }
  // 크롬은 카메라 권한이 있을 때만 실제 내부 주소를 연결 후보로 쓴다 → QR을 만드는 동안 카메라를 잠깐 켠다
  async function revealIP() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      return () => s.getTracks().forEach(t => t.stop());
    } catch (e) { return () => {}; }
  }
  // 두 기기가 서로 내용을 보내고, 받은 내용을 합친다
  function run(pc, ch, ui, withRecords) {
    let parts = [], total = 0, got = 0, myDone = false, peerStats = null, myStats = null, finished = false, started = false;
    const finish = () => {
      if (finished || !myDone || !peerStats) return;
      finished = true;
      ui.done(myStats, peerStats);
      setTimeout(() => { try { ch.close(); pc.close(); } catch (e) { /* 무시 */ } }, 1500);
    };
    const waitLow = () => new Promise(r => { if (ch.bufferedAmount < 1 << 20) { r(); return; } ch.bufferedAmountLowThreshold = 1 << 19; ch.onbufferedamountlow = () => { ch.onbufferedamountlow = null; r(); }; });
    ch.onopen = async () => {
      if (started) return; started = true;
      ui.status('연결되었습니다. 정보를 주고받는 중…');
      const str = JSON.stringify(await bundle(withRecords));
      const n = Math.ceil(str.length / CHUNK);
      ch.send(JSON.stringify({ k: 'h', n }));
      for (let i = 0; i < n; i++) {
        await waitLow();
        ch.send(JSON.stringify({ k: 'c', i, d: str.slice(i * CHUNK, (i + 1) * CHUNK) }));
        ui.send(Math.round((i + 1) / n * 100));
      }
    };
    ch.onmessage = async e => {
      let msg; try { msg = JSON.parse(e.data); } catch (err) { return; }
      if (msg.k === 'h') { total = msg.n; parts = new Array(total); got = 0; }
      else if (msg.k === 'c') {
        if (parts[msg.i] == null) got++;
        parts[msg.i] = msg.d;
        ui.recv(Math.round(got / total * 100));
        if (got === total) {
          ui.status('받은 정보를 합치는 중…');
          try { myStats = await merge(JSON.parse(parts.join(''))); } catch (err) { ui.fail('합치지 못했습니다: ' + err.message); return; }
          myDone = true;
          ch.send(JSON.stringify({ k: 'm', s: myStats }));
          finish();
        }
      } else if (msg.k === 'm') { peerStats = msg.s; finish(); }
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') ui.fail('연결하지 못했습니다. 두 기기가 같은 와이파이에 있는지 확인하거나, 아래 [파일로 주고받기]를 이용하세요.'); };
  }

  // ---------- QR로 옮기기 (네트워크 없이 화면 QR 여러 장) ----------
  // 보내는 쪽은 정보를 여러 장 QR로 나눠 차례로 보여 주고, 받는 쪽은 카메라로 모두 모아 합친다.
  // QR로는 기록·사진은 빼고 현장·근로자·전화번호·손으로 쓴 이전 서명·공통 항목·자료 글만 보낸다.
  const FRAME = 560; // QR 한 장에 담는 글자 수 (잘 읽히는 크기)
  async function qrFrames() {
    const b = await bundle(false);
    const reg = b.kv.registry;
    if (reg && reg.sigs) for (const n of Object.keys(reg.sigs)) {
      reg.sigs[n] = reg.sigs[n].filter(x => !Sig.isImg(x.g)).slice(0, 3); // 사진 서명은 크기가 커서 제외, 사람당 최근 3개
      if (!reg.sigs[n].length) delete reg.sigs[n];
    }
    b.topics = (b.topics || []).map(t => {
      const c = {};
      for (const [k, v] of Object.entries(t)) if (!(typeof v === 'string' && v.startsWith('data:')) && k !== 'pages') c[k] = v; // 그림 빼고
      return c;
    });
    b.qr = true;
    const text = await Codec.pack(b);
    const id = uid(4), n = Math.ceil(text.length / FRAME);
    return Array.from({ length: n }, (_, i) => `SJ|${id}|${i}|${n}|${text.slice(i * FRAME, (i + 1) * FRAME)}`);
  }
  // 받는 쪽: 읽은 QR 글자를 넣으면 모아서, 다 모이면 onDone(합칠 묶음)
  function receiver(onProgress, onDone) {
    let id = null, parts = [], got = 0, n = 0, done = false;
    return text => {
      if (done || typeof text !== 'string' || !text.startsWith('SJ|')) return;
      const m = text.match(/^SJ\|(\w+)\|(\d+)\|(\d+)\|([\s\S]*)$/);
      if (!m) return;
      if (m[1] !== id) { id = m[1]; n = +m[3]; parts = new Array(n); got = 0; }
      const i = +m[2];
      if (parts[i] == null) { parts[i] = m[4]; got++; onProgress(got, n, parts); }
      if (got === n) { done = true; Codec.unpack(parts.join('')).then(onDone).catch(e => onProgress(-1, n, null, e)); }
    };
  }
  function qrSend(frames) {
    let i = 0, ms = 450, timer = 0;
    const svgs = frames.map(f => QR.svg(f, 6));
    const m = modal(`<h2>QR로 보내기</h2>
      <p class="hint">받는 기기에서 <b>[QR로 받기]</b>를 누르고 이 화면을 비추세요. QR이 차례로 바뀌며, 받는 쪽이 다 모을 때까지 계속 반복됩니다. <b>화면 밝기를 최대로</b> 해 주세요.</p>
      <div class="qtx-box"><div class="qtx-qr"></div><div class="qtx-no"></div></div>
      <div class="row center"><span class="hint">속도</span><div class="seg sm"><label><input type="radio" name="qsp" value="800"><span>느리게</span></label><label><input type="radio" name="qsp" value="450" checked><span>보통</span></label><label><input type="radio" name="qsp" value="250"><span>빠르게</span></label></div></div>
      <p class="hint">QR ${frames.length}장 · 한 바퀴 약 ${Math.ceil(frames.length * 0.45)}초. 받는 쪽에 '완료'가 뜨면 닫으세요.</p>`, { wide: true, onClose: () => clearTimeout(timer) });
    const qr = $('.qtx-qr', m.el), no = $('.qtx-no', m.el);
    const tick = () => { qr.innerHTML = svgs[i]; no.textContent = `${i + 1} / ${frames.length}`; i = (i + 1) % frames.length; timer = setTimeout(tick, ms); };
    $$('[name=qsp]', m.el).forEach(r => r.onchange = () => { ms = +r.value; });
    tick();
  }
  function qrRecv(onMerged) {
    const m = modal(`<h2>QR로 받기</h2>
      <p class="hint">보내는 기기의 바뀌는 QR을 카메라로 비추고 그대로 기다리세요. 다 모이면 자동으로 합칩니다.</p>
      <video class="scan" muted></video>
      <div class="sy-bar"><span>받기</span><i><b class="qrx-bar"></b></i></div><p class="hint qrx-msg">QR을 찾는 중…</p>`, { wide: true, onClose: () => sc.stop() });
    const bar = $('.qrx-bar', m.el), msg = $('.qrx-msg', m.el);
    const feed = receiver((got, n, parts, err) => {
      if (got < 0) { msg.textContent = '받은 정보를 읽지 못했습니다: ' + (err && err.message); return; }
      bar.style.width = Math.round(got / n * 100) + '%';
      const miss = parts.map((p, i) => p == null ? i + 1 : 0).filter(Boolean);
      msg.textContent = `${got} / ${n}장 받음${miss.length && miss.length <= 8 ? ` · 남은 장: ${miss.join(', ')}` : ''}`;
    }, async b => {
      sc.stop();
      msg.textContent = '받은 정보를 합치는 중…';
      try { const st = await merge(b); m.close(); onMerged(st); }
      catch (e) { msg.textContent = '합치지 못했습니다: ' + e.message; }
    });
    const sc = QR.scan($('video', m.el), feed, true);
    sc.start().catch(e => { m.close(); toast('카메라를 열 수 없습니다: ' + e.message, 4000); });
    return feed;
  }

  // ---------- 화면 ----------
  async function page() {
    view().innerHTML = `<div class="bar"><h1>기기 간 정보 합치기</h1><a class="btn ghost sm" href="#/sites">현장·근로자</a></div>
      <p class="hint">같은 와이파이에 있는 스마트폰과 갤럭시 탭의 <b>현장·근로자·전화번호·이전 서명·공통 항목·내가 추가한 자료</b>를 서로 합쳐 양쪽을 최신으로 맞춥니다. 같은 항목은 더 최근에 고친 쪽을 따르고, 한쪽에서 지운 현장·기록은 다른 쪽에서도 지웁니다.</p>
      <section class="sy-box sy-main">
        <h2 class="h">QR로 옮기기 <small>(추천 · 와이파이·인터넷 필요 없음)</small></h2>
        <ol class="sy-steps"><li><b>보내는 기기</b>에서 [QR로 보내기]를 누르면 QR이 차례로 바뀌며 나옵니다.</li><li><b>받는 기기</b>에서 [QR로 받기]를 누르고 그 화면을 비추면, 다 모은 뒤 자동으로 합칩니다.</li><li>양쪽을 똑같이 맞추려면 <b>반대 방향으로 한 번 더</b> 합니다.</li></ol>
        <div class="row"><button class="btn primary" id="qx-send">QR로 보내기</button><button class="btn primary" id="qx-recv">QR로 받기</button></div>
        <p class="hint">QR로는 현장·근로자·전화번호·손으로 쓴 이전 서명·공통 항목·내가 추가한 자료(글)를 옮깁니다. 교육·점검 기록과 사진(촬영 서명 포함)은 아래 연결이나 파일로 옮기세요.</p>
        <p class="hint" id="qx-msg"></p>
      </section>
      <label class="confirm"><input type="checkbox" id="sy-rec" checked><span>교육·TBM·점검 기록도 함께 합치기 <small>(아래 연결·파일 방식, 사진이 많으면 시간이 더 걸립니다)</small></span></label>
      <section class="sy-box">
        <h2 class="h">같은 와이파이에서 바로 연결 <small>(기록·사진 포함)</small></h2>
        <ol class="sy-steps"><li><b>한 기기</b>에서 [① 연결 시작]을 누르면 QR이 나옵니다.</li><li><b>다른 기기</b>에서 [② QR 찍어 연결]로 그 QR을 찍으면, 그 기기에 답장 QR이 나옵니다.</li><li>처음 기기에서 [답장 QR 찍기]로 답장 QR을 찍으면 연결되어 자동으로 합칩니다.</li></ol>
        <div class="row"><button class="btn primary" id="sy-host">① 연결 시작</button><button class="btn" id="sy-join">② QR 찍어 연결</button></div>
        <div id="sy-area"></div>
      </section>
      <section class="sy-box">
        <h2 class="h">파일로 주고받기 <small>(연결이 안 될 때)</small></h2>
        <p class="hint">[내 정보 파일 보내기]로 만든 파일을 퀵쉐어·카카오톡 등으로 다른 기기에 보내고, 그 기기에서 [받은 파일 합치기]를 누르세요. 양쪽을 맞추려면 반대 방향으로도 한 번 더 합니다.</p>
        <div class="row"><button class="btn" id="sy-export" disabled>파일 준비 중…</button><button class="btn" id="sy-import">받은 파일 합치기</button></div>
        <p class="hint" id="sy-fmsg"></p>
      </section>`;
    const area = $('#sy-area');
    $('#qx-send').onclick = async () => {
      const b = $('#qx-send'); b.disabled = true; b.textContent = 'QR 만드는 중…';
      try {
        const frames = await qrFrames();
        if (frames.length > 200) toast(`QR이 ${frames.length}장이라 오래 걸립니다. 파일로 주고받기를 권합니다.`, 4500);
        qrSend(frames);
      } finally { b.disabled = false; b.textContent = 'QR로 보내기'; }
    };
    $('#qx-recv').onclick = () => qrRecv(st => {
      $('#qx-msg').innerHTML = `<b>✔ 합쳤습니다:</b> ${esc(statText(st))}<br>반대 방향도 맞추려면 이 기기에서 [QR로 보내기]를 누르세요.`;
      toast('받은 정보를 합쳤습니다.', 3000);
    });
    const rec = () => $('#sy-rec').checked;
    let pc = null;
    const ui = {
      status: t => { const s = $('#sy-st', area); if (s) s.textContent = t; },
      send: p => { const b = $('#sy-sb', area); if (b) b.style.width = p + '%'; },
      recv: p => { const b = $('#sy-rb', area); if (b) b.style.width = p + '%'; },
      done: (mine, peer) => {
        area.innerHTML = `<div class="sy-done"><b>✔ 합치기 완료</b><p>이 기기: ${esc(statText(mine))}</p><p>상대 기기: ${esc(statText(peer))}</p></div>`;
        toast('두 기기의 정보를 합쳤습니다.', 3000);
      },
      fail: t => { area.innerHTML = `<p class="err">${esc(t)}</p>`; try { pc && pc.close(); } catch (e) { /* 무시 */ } }
    };
    const progressHTML = `<p class="hint" id="sy-st">연결을 기다리는 중…</p>
      <div class="sy-bar"><span>보내기</span><i><b id="sy-sb"></b></i></div><div class="sy-bar"><span>받기</span><i><b id="sy-rb"></b></i></div>`;
    const scanQR = title => new Promise(resolve => {
      let done = false;
      const m = modal(`<h2>${esc(title)}</h2><p class="hint">상대 기기 화면의 QR을 비추세요.</p><video class="scan" muted></video>`, { wide: true, onClose: () => { sc.stop(); if (!done) resolve(null); } });
      const sc = QR.scan($('video', m.el), text => { done = true; sc.stop(); m.close(); resolve(text); });
      sc.start().catch(e => { m.close(); toast('카메라를 열 수 없습니다: ' + e.message, 4000); });
    });
    $('#sy-host').onclick = async () => {
      if (!('RTCPeerConnection' in window)) { ui.fail('이 브라우저는 기기 간 바로 연결을 지원하지 않습니다. 파일로 주고받으세요.'); return; }
      area.innerHTML = '<p class="hint">QR을 만드는 중…</p>';
      const stopCam = await revealIP();
      pc = newPC();
      const ch = pc.createDataChannel('sync', { ordered: true });
      run(pc, ch, ui, rec());
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      stopCam();
      const code = await Codec.pack(Object.assign({ y: 'so' }, shrink(pc.localDescription.sdp)));
      area.innerHTML = `<p class="hint">다른 기기에서 <b>[② QR 찍어 연결]</b>로 이 QR을 찍으세요.</p><div class="qrbox">${QR.svg(code)}</div>
        <div class="row center"><button class="btn primary" id="sy-ans">답장 QR 찍기</button></div>`;
      $('#sy-ans').onclick = async () => {
        const text = await scanQR('답장 QR 찍기'); if (!text) return;
        let o; try { o = await Codec.unpack(text); } catch (e) { toast('QR을 읽지 못했습니다.'); return; }
        if (!o || o.y !== 'sa') { toast('상대 기기의 답장 QR이 아닙니다.'); return; }
        area.innerHTML = progressHTML;
        try { await pc.setRemoteDescription({ type: 'answer', sdp: o.s || expand(o) }); } catch (e) { ui.fail('연결 정보를 읽지 못했습니다: ' + e.message); return; }
        setTimeout(() => { if (pc.connectionState !== 'connected' && $('#sy-st', area)) ui.fail('연결하지 못했습니다. 두 기기가 같은 와이파이에 있는지 확인하거나, 아래 [파일로 주고받기]를 이용하세요.'); }, 25000);
      };
    };
    $('#sy-join').onclick = async () => {
      if (!('RTCPeerConnection' in window)) { ui.fail('이 브라우저는 기기 간 바로 연결을 지원하지 않습니다. 파일로 주고받으세요.'); return; }
      const text = await scanQR('연결 QR 찍기'); if (!text) return;
      let o; try { o = await Codec.unpack(text); } catch (e) { toast('QR을 읽지 못했습니다.'); return; }
      if (!o || o.y !== 'so') { toast('상대 기기의 연결 QR이 아닙니다.'); return; }
      area.innerHTML = '<p class="hint">답장 QR을 만드는 중…</p>';
      const stopCam = await revealIP();
      pc = newPC();
      pc.ondatachannel = e => { area.innerHTML = progressHTML; run(pc, e.channel, ui, rec()); if (e.channel.readyState === 'open') e.channel.onopen(); };
      try { await pc.setRemoteDescription({ type: 'offer', sdp: o.s || expand(o) }); } catch (e) { stopCam(); ui.fail('연결 정보를 읽지 못했습니다: ' + e.message); return; }
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      stopCam();
      const code = await Codec.pack(Object.assign({ y: 'sa' }, shrink(pc.localDescription.sdp)));
      area.innerHTML = `<p class="hint">처음 기기에서 <b>[답장 QR 찍기]</b>로 이 QR을 찍으세요. 연결되면 자동으로 합칩니다.</p><div class="qrbox">${QR.svg(code)}</div>`;
    };
    // 파일로
    // 공유 창은 버튼을 누른 직후에만 열 수 있어 파일을 미리 만들어 둔다 (크롬이 공유를 허용하는 텍스트 파일 .txt)
    let expFile = null;
    const prep = async () => {
      const eb = $('#sy-export'); if (!eb) return;
      eb.disabled = true; eb.textContent = '파일 준비 중…'; expFile = null;
      const b = await bundle(rec());
      const d = new Date(), p = n => String(n).padStart(2, '0');
      const name = `안전지도_정보_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.txt`;
      expFile = new File([JSON.stringify(b)], name, { type: 'text/plain' });
      if (!$('#sy-export')) return;
      eb.disabled = false; eb.textContent = `내 정보 파일 보내기 (${expFile.size > 1048576 ? (expFile.size / 1048576).toFixed(1) + 'MB' : Math.ceil(expFile.size / 1024) + 'KB'})`;
    };
    $('#sy-rec').addEventListener('change', prep);
    prep();
    $('#sy-export').onclick = () => {
      if (!expFile) { toast('파일을 준비하고 있습니다. 잠시 후 다시 누르세요.'); return; }
      $('#sy-fmsg').textContent = '공유 창에서 퀵쉐어·카카오톡 등 보낼 곳을 고르세요.';
      shareFiles([expFile], expFile.name);
    };
    $('#sy-import').onclick = async () => {
      const f = await pickFile('.txt,.json,text/plain,application/json'); if (!f) return;
      try {
        const st = await merge(JSON.parse(await f.text()));
        $('#sy-fmsg').textContent = '✔ 합쳤습니다: ' + statText(st);
        toast('받은 정보를 합쳤습니다.', 3000);
      } catch (e) { $('#sy-fmsg').textContent = ''; toast('합치지 못했습니다: ' + e.message, 4500); }
    };
  }

  return { page, merge, bundle, statText, _run: run, _newPC: newPC, _shrink: shrink, _expand: expand, _qrFrames: qrFrames, _receiver: receiver };
})();
