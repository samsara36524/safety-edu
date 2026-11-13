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

  // ---------- 화면 ----------
  async function page() {
    view().innerHTML = `<div class="bar"><h1>기기 간 정보 합치기</h1><a class="btn ghost sm" href="#/sites">현장·근로자</a></div>
      <p class="hint">같은 와이파이에 있는 스마트폰과 갤럭시 탭의 <b>현장·근로자·전화번호·이전 서명·공통 항목·내가 추가한 자료</b>를 서로 합쳐 양쪽을 최신으로 맞춥니다. 같은 항목은 더 최근에 고친 쪽을 따르고, 한쪽에서 지운 현장·기록은 다른 쪽에서도 지웁니다.</p>
      <label class="confirm"><input type="checkbox" id="sy-rec" checked><span>교육·TBM·점검 기록도 함께 합치기 <small>(사진이 많으면 시간이 더 걸립니다)</small></span></label>
      <section class="sy-box">
        <h2 class="h">같은 와이파이에서 바로 연결</h2>
        <ol class="sy-steps"><li><b>한 기기</b>에서 [① 연결 시작]을 누르면 QR이 나옵니다.</li><li><b>다른 기기</b>에서 [② QR 찍어 연결]로 그 QR을 찍으면, 그 기기에 답장 QR이 나옵니다.</li><li>처음 기기에서 [답장 QR 찍기]로 답장 QR을 찍으면 연결되어 자동으로 합칩니다.</li></ol>
        <div class="row"><button class="btn primary" id="sy-host">① 연결 시작</button><button class="btn" id="sy-join">② QR 찍어 연결</button></div>
        <div id="sy-area"></div>
      </section>
      <section class="sy-box">
        <h2 class="h">파일로 주고받기 <small>(연결이 안 될 때)</small></h2>
        <p class="hint">[내 정보 파일 보내기]로 만든 파일을 퀵쉐어·카카오톡 등으로 다른 기기에 보내고, 그 기기에서 [받은 파일 합치기]를 누르세요. 양쪽을 맞추려면 반대 방향으로도 한 번 더 합니다.</p>
        <div class="row"><button class="btn" id="sy-export">내 정보 파일 보내기</button><button class="btn" id="sy-import">받은 파일 합치기</button></div>
        <p class="hint" id="sy-fmsg"></p>
      </section>`;
    const area = $('#sy-area');
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
      pc = newPC();
      const ch = pc.createDataChannel('sync', { ordered: true });
      run(pc, ch, ui, rec());
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      const code = await Codec.pack({ y: 'so', s: pc.localDescription.sdp });
      area.innerHTML = `<p class="hint">다른 기기에서 <b>[② QR 찍어 연결]</b>로 이 QR을 찍으세요.</p><div class="qrbox">${QR.svg(code)}</div>
        <div class="row center"><button class="btn primary" id="sy-ans">답장 QR 찍기</button></div>`;
      $('#sy-ans').onclick = async () => {
        const text = await scanQR('답장 QR 찍기'); if (!text) return;
        let o; try { o = await Codec.unpack(text); } catch (e) { toast('QR을 읽지 못했습니다.'); return; }
        if (!o || o.y !== 'sa') { toast('상대 기기의 답장 QR이 아닙니다.'); return; }
        area.innerHTML = progressHTML;
        await pc.setRemoteDescription({ type: 'answer', sdp: o.s });
        setTimeout(() => { if (pc.connectionState !== 'connected' && $('#sy-st', area)) ui.fail('연결하지 못했습니다. 두 기기가 같은 와이파이에 있는지 확인하거나, 아래 [파일로 주고받기]를 이용하세요.'); }, 25000);
      };
    };
    $('#sy-join').onclick = async () => {
      if (!('RTCPeerConnection' in window)) { ui.fail('이 브라우저는 기기 간 바로 연결을 지원하지 않습니다. 파일로 주고받으세요.'); return; }
      const text = await scanQR('연결 QR 찍기'); if (!text) return;
      let o; try { o = await Codec.unpack(text); } catch (e) { toast('QR을 읽지 못했습니다.'); return; }
      if (!o || o.y !== 'so') { toast('상대 기기의 연결 QR이 아닙니다.'); return; }
      area.innerHTML = '<p class="hint">답장 QR을 만드는 중…</p>';
      pc = newPC();
      pc.ondatachannel = e => { area.innerHTML = progressHTML; run(pc, e.channel, ui, rec()); if (e.channel.readyState === 'open') e.channel.onopen(); };
      await pc.setRemoteDescription({ type: 'offer', sdp: o.s });
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      const code = await Codec.pack({ y: 'sa', s: pc.localDescription.sdp });
      area.innerHTML = `<p class="hint">처음 기기에서 <b>[답장 QR 찍기]</b>로 이 QR을 찍으세요. 연결되면 자동으로 합칩니다.</p><div class="qrbox">${QR.svg(code)}</div>`;
    };
    // 파일로
    $('#sy-export').onclick = async () => {
      const b = await bundle(rec());
      const d = new Date(), p = n => String(n).padStart(2, '0');
      const name = `안전지도_정보_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
      const file = new File([JSON.stringify(b)], name, { type: 'application/json' });
      $('#sy-fmsg').textContent = `파일을 만들었습니다 (${(file.size / 1048576).toFixed(1)}MB). 공유 창에서 보낼 곳을 고르세요.`;
      shareFiles([file], name);
    };
    $('#sy-import').onclick = async () => {
      const f = await pickFile('.json,application/json'); if (!f) return;
      try {
        const st = await merge(JSON.parse(await f.text()));
        $('#sy-fmsg').textContent = '✔ 합쳤습니다: ' + statText(st);
        toast('받은 정보를 합쳤습니다.', 3000);
      } catch (e) { $('#sy-fmsg').textContent = ''; toast('합치지 못했습니다: ' + e.message, 4500); }
    };
  }

  return { page, merge, bundle, statText, _run: run, _newPC: newPC };
})();
