// 서명 패드: 획을 좌표로 기록하고, QR/링크에 담을 수 있게 작은 바이트로 인코딩한다.
// 붓펜 효과: 점마다 굵기 변화(1~15단계)를 함께 기록하고, 전체 굵기(1~5)는 서명자가 고른다.
//  - 펜(S펜 등): 누르는 힘(필압)으로 굵기 결정
//  - 손가락: 천천히 쓰면 굵게, 빠르게 쓰면 가늘게 (붓처럼)
//  - 획의 시작과 끝은 가늘게 모아 붓끝 느낌을 낸다
const Sig = (() => {
  const GW = 250, GH = 100; // 좌표 격자 (가로 250 x 세로 100). 세로 화면의 넓은 서명칸은 세로를 최대 160까지 늘린다(gh)
  const GHMAX = 160;
  const WMIN = 1, WMAX = 15; // 굵기 단계
  // 전체 굵기 5단계(가늘게~굵게)의 기준 굵기(격자 단위). 붓펜처럼 변화 폭은 작게.
  const BASE = [0, 1.0, 1.4, 1.9, 2.5, 3.2];
  const WDEF = 3;
  const unitW = (lv, w) => BASE[w || WDEF] * (0.6 + lv / WMAX * 0.6); // 기준의 약 0.64 ~ 1.2배
  const KEY = 'sigWidth';
  const INK = '#111'; // 서명 잉크: 검정
  const savedW = () => { try { const v = +localStorage.getItem(KEY); return v >= 1 && v <= 5 ? v : WDEF; } catch (e) { return WDEF; } };

  function pad(canvas) {
    let strokes = [], cur = null, last = null, raf = 0, sp = null;
    strokes.w = savedW(); strokes.gh = GH;
    // 서명칸 비율에 맞춰 세로 격자 크기를 정한다 (빈 칸일 때만 바꿈)
    const setGh = () => {
      const r = canvas.getBoundingClientRect();
      if (r.width > 0) strokes.gh = Math.max(GH, Math.min(GHMAX, Math.round((GW - 1) * r.height / r.width) + 1));
    };
    // 굵기 선택 버튼 (서명 칸 바로 아래)
    const bar = document.createElement('div');
    bar.className = 'sigw';
    bar.innerHTML = '<span>굵기</span>' + [1, 2, 3, 4, 5].map(n =>
      `<button type="button" data-w="${n}" title="${['', '아주 가늘게', '가늘게', '보통', '굵게', '아주 굵게'][n]}"><i style="height:${[0, 2, 3, 4, 6, 8][n]}px"></i></button>`).join('');
    canvas.after(bar);
    const clr = canvas.parentNode && canvas.parentNode.querySelector('[data-clr]');
    if (clr) bar.append(clr); // '다시 쓰기'를 같은 줄 오른쪽에
    const markW = () => bar.querySelectorAll('[data-w]').forEach(b => b.classList.toggle('on', +b.dataset.w === strokes.w));
    bar.querySelectorAll('[data-w]').forEach(b => b.onclick = () => {
      strokes.w = +b.dataset.w;
      try { localStorage.setItem(KEY, strokes.w); } catch (e) { /* 저장 불가 */ }
      markW(); redraw();
      canvas.dispatchEvent(new Event('sigwidth'));
    });
    markW();
    function fit() {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      if (!strokes.length) setGh();
      redraw();
    }
    const redraw = () => draw(canvas, strokes);
    const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; redraw(); }); };
    function xy(e) {
      const r = canvas.getBoundingClientRect();
      return {
        gx: Math.max(0, Math.min(GW - 1, (e.clientX - r.left) / r.width * (GW - 1))),
        gy: Math.max(0, Math.min(strokes.gh - 1, (e.clientY - r.top) / r.height * (strokes.gh - 1))),
        t: e.timeStamp
      };
    }
    // 필압이 실제로 들어오는지 (손가락 터치는 대개 0.5·1 고정값)
    const realPressure = e => (e.pointerType === 'pen' && e.pressure > 0) || (e.pressure > 0 && e.pressure !== 0.5 && e.pressure !== 1);
    function level(e, p) {
      let target;
      const speedLv = () => {
        if (!last) return 9;
        const dt = Math.max(1, p.t - last.t);
        const v = Math.hypot(p.gx - last.gx, p.gy - last.gy) / dt; // 격자/ms
        return WMAX - v * 10;
      };
      if (realPressure(e)) {
        const pl = WMIN + 1 + Math.pow(e.pressure, 0.8) * (WMAX - 2);
        target = e.pointerType === 'pen' ? pl * 0.8 + speedLv() * 0.2 : (pl + speedLv()) / 2;
      } else target = speedLv();
      target = Math.max(WMIN + 1, Math.min(WMAX, target));
      const prev = last ? last.lv : target;
      return prev * 0.65 + target * 0.35; // 굵기를 부드럽게 바꾼다
    }
    // 손떨림·터치 오차를 걸러 부드럽게: 위치를 살짝 뒤따르게 하고(안정화), 너무 촘촘한 점은 합친다.
    // 좌표는 소수 그대로 두고 저장할 때만 반올림한다.
    const MIN_D = 1.2; // 이 거리(격자)보다 가까운 점은 합침
    function add(e) {
      const p = xy(e);
      p.lv = level(e, p);
      if (!sp) sp = { x: p.gx, y: p.gy };
      else { sp.x += (p.gx - sp.x) * 0.45; sp.y += (p.gy - sp.y) * 0.45; }
      const q = [sp.x, sp.y, p.lv];
      const l = cur[cur.length - 1];
      if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) >= MIN_D) cur.push(q);
      else l[2] = (l[2] + q[2]) / 2;
      last = p;
    }
    // 손을 뗀 위치까지 획을 이어 준다 (안정화로 생긴 지연 보정)
    function finish() {
      if (!cur || !last) return;
      const l = cur[cur.length - 1];
      if (l && Math.hypot(last.gx - l[0], last.gy - l[1]) >= 0.6) cur.push([last.gx, last.gy, last.lv]);
    }
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault(); canvas.setPointerCapture(e.pointerId);
      cur = []; last = null; sp = null; strokes.push(cur); add(e); later();
    });
    canvas.addEventListener('pointermove', e => {
      if (!cur) return; e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      (evs.length ? evs : [e]).forEach(add);
      later();
    });
    const end = () => { finish(); cur = null; last = null; sp = null; later(); };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.style.touchAction = 'none';
    requestAnimationFrame(fit);
    window.addEventListener('resize', fit);
    return {
      clear() { const w = strokes.w; strokes = []; strokes.w = w; setGh(); redraw(); },
      load(code) { const d = decode(code); strokes = d; strokes.w = d.w || WDEF; strokes.gh = d.gh || GH; markW(); redraw(); },
      isEmpty() { return strokes.reduce((n, s) => n + s.length, 0) < 3; },
      strokes() { const r = strokes.map(s => simplify(s, 0.35)); r.w = strokes.w; r.gh = strokes.gh; return r; }
    };
  }

  // 그리기: 굵기 정보가 있으면 붓 효과, 없으면(예전 서명) 일정한 선
  function draw(canvas, strokes, color = INK) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const gh = strokes.gh || GH;
    const sc = Math.min(canvas.width / (GW - 1), canvas.height / (gh - 1)); // 비율 유지
    const ox = (canvas.width - sc * (GW - 1)) / 2, oy = (canvas.height - sc * (gh - 1)) / 2;
    const sx = sc, sy = sc, u = sc; // 격자 1칸의 화면 크기
    ctx.fillStyle = color; ctx.strokeStyle = color;
    for (const s of strokes) {
      if (!s.length) continue;
      if (s[0].length < 3) { // 예전 서명
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, canvas.width / 110);
        ctx.beginPath();
        s.forEach(([x, y], i) => i ? ctx.lineTo(ox + x * sx, oy + y * sy) : ctx.moveTo(ox + x * sx, oy + y * sy));
        if (s.length === 1) ctx.lineTo(ox + s[0][0] * sx + 0.5, oy + s[0][1] * sy + 0.5);
        ctx.stroke();
        continue;
      }
      brush(ctx, s, sx, sy, u, strokes.w, ox, oy);
    }
  }
  // 점 사이를 부드러운 곡선(캣멀-롬)으로 잇고, 굵기가 변하는 원을 촘촘히 찍어 펜 획을 만든다
  // 펜 서명 모양: 획 시작은 둥글고 도톰하게, 끝은 길게 가늘어지며 빠져나가게(삐침)
  function brush(ctx, s, sx, sy, u, w, ox = 0, oy = 0) {
    const n = s.length;
    const P = s.map(([x, y]) => [ox + x * sx, oy + y * sy]);
    // 획 길이(격자 단위)를 따라 끝부분 가늘기 계산
    const acc = [0];
    for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
    const total = acc[n - 1] || 0;
    const tail = Math.min(total * 0.45, Math.max(6, total * 0.22)); // 끝 22% (최소 6칸) 동안 가늘어짐
    const R = s.map(([, , lv], i) => {
      const left = total - acc[i];
      const tTail = tail > 0 && left < tail ? 0.18 + 0.82 * Math.pow(left / tail, 0.75) : 1; // 끝으로 갈수록 0.18배까지
      const tHead = i === 0 ? 0.95 : 1;
      return Math.max(0.35, unitW(lv, w) * u * 0.5 * tTail * tHead);
    });
    ctx.beginPath();
    const dot = (x, y, r) => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); };
    if (n === 1) { dot(P[0][0], P[0][1], Math.max(R[0], unitW(s[0][2], w) * u * 0.5)); ctx.fill(); return; }
    for (let i = 0; i < n - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || P[i + 1];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const step = Math.max(0.5, Math.min(R[i], R[i + 1]) * 0.35);
      const m = Math.max(1, Math.ceil(len / step));
      const seg = cmr(p0, p1, p2, p3);
      for (let j = 0; j <= m; j++) {
        const t = j / m, [x, y] = seg(t);
        dot(x, y, R[i] + (R[i + 1] - R[i]) * t);
      }
    }
    ctx.fill();
  }

  // 구심(centripetal) 캣멀-롬 곡선: 점 간격이 고르지 않아도 꼬임·튀어나옴 없이 둥글게 잇는다
  function cmr(p0, p1, p2, p3) {
    const d = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
    const t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const L = (a, b, ta, tb, t) => [a[0] + (b[0] - a[0]) * (t - ta) / (tb - ta), a[1] + (b[1] - a[1]) * (t - ta) / (tb - ta)];
    return u => {
      const t = t1 + (t2 - t1) * u;
      const A1 = L(p0, p1, 0, t1, t), A2 = L(p1, p2, t1, t2, t), A3 = L(p2, p3, t2, t3, t);
      const B1 = L(A1, A2, 0, t2, t), B2 = L(A2, A3, t1, t3, t);
      return L(B1, B2, t1, t2, t);
    };
  }

  // Ramer–Douglas–Peucker 단순화 (굵기가 크게 바뀌는 점도 남긴다)
  function simplify(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const d = (p, a, b) => {
      const [x, y] = p, [x1, y1] = a, [x2, y2] = b;
      const A = x - x1, B = y - y1, C = x2 - x1, D = y2 - y1;
      const len = C * C + D * D;
      let t = len ? (A * C + B * D) / len : 0;
      t = Math.max(0, Math.min(1, t));
      const dx = x1 + t * C - x, dy = y1 + t * D - y;
      const dw = p.length > 2 ? (p[2] - (a[2] + t * (b[2] - a[2]))) * 0.45 : 0;
      return Math.sqrt(dx * dx + dy * dy + dw * dw);
    };
    let max = 0, idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const v = d(pts[i], pts[0], pts[pts.length - 1]);
      if (v > max) { max = v; idx = i; }
    }
    if (max > eps) {
      const l = simplify(pts.slice(0, idx + 1), eps), r = simplify(pts.slice(idx), eps);
      return l.slice(0, -1).concat(r);
    }
    return [pts[0], pts[pts.length - 1]];
  }

  // 획 → 바이트(가변 길이 정수 + 지그재그 차분) → base64url
  // 새 형식: [0, 3(버전), 전체 굵기, 획수, (점수, (dx, dy, 굵기)...)...]  ← 첫 값 0으로 예전 형식과 구분
  //  버전 3은 좌표를 0.5칸 단위로 더 세밀하게 저장한다. (버전 2: 1칸 단위, 버전 1: 전체 굵기 없음 → 보통)
  //  버전 4는 세로 격자 크기(gh, 넓은 서명칸)를 전체 굵기 다음에 담는다.
  function encode(strokes) {
    const out = [];
    const vint = v => { while (v > 127) { out.push((v & 127) | 128); v >>>= 7; } out.push(v); };
    const zz = v => (v << 1) ^ (v >> 31);
    const brushy = strokes.some(s => s.some(p => p.length > 2));
    const k = brushy ? 2 : 1; // 버전 3은 좌표 2배
    const gh = Math.max(GH, Math.min(GHMAX, Math.round(strokes.gh || GH)));
    if (brushy) { vint(0); vint(gh > GH ? 4 : 3); vint(strokes.w || WDEF); if (gh > GH) vint(gh); }
    vint(strokes.length);
    for (const s of strokes) {
      vint(s.length);
      let px = 0, py = 0;
      for (const p of s) {
        const x = Math.round(p[0] * k), y = Math.round(p[1] * k);
        vint(zz(x - px)); vint(zz(y - py)); px = x; py = y;
        if (brushy) vint(Math.max(WMIN, Math.min(WMAX, Math.round(p[2] || 8))));
      }
    }
    return Codec.b64u.enc(Uint8Array.from(out));
  }
  function decode(str) {
    const b = Codec.b64u.dec(str); let i = 0;
    const vint = () => { let v = 0, sh = 0, c; do { c = b[i++]; v |= (c & 127) << sh; sh += 7; } while (c & 128); return v >>> 0; };
    const unzz = v => (v >>> 1) ^ -(v & 1);
    let n = vint(), brushy = false, w = WDEF, sc = 1, gh = GH;
    if (n === 0 && i < b.length) { const ver = vint(); if (ver >= 2) w = vint(); if (ver >= 3) sc = 2; if (ver >= 4) gh = vint(); n = vint(); brushy = true; } // 새 형식
    const strokes = [];
    strokes.w = Math.max(1, Math.min(5, w));
    strokes.gh = Math.max(GH, Math.min(GHMAX, gh));
    for (let k = 0; k < n; k++) {
      const m = vint(), s = []; let px = 0, py = 0;
      for (let j = 0; j < m; j++) {
        px += unzz(vint()); py += unzz(vint());
        s.push(brushy ? [px / sc, py / sc, vint()] : [px, py]);
      }
      strokes.push(s);
    }
    return strokes;
  }

  // 서명 이미지(PNG data URL) 만들기
  function toImage(code, w = 500, h = 200) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c, decode(code));
    return c.toDataURL('image/png');
  }

  return { pad, encode, decode, draw, toImage };
})();
