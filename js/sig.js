// 서명 패드: 획을 좌표로 기록하고, QR/링크에 담을 수 있게 작은 바이트로 인코딩한다.
const Sig = (() => {
  const GW = 250, GH = 100; // 좌표 격자 (가로 250 x 세로 100)

  function pad(canvas) {
    const ctx = canvas.getContext('2d');
    let strokes = [], cur = null;
    function fit() {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      redraw();
    }
    function pt(e) {
      const r = canvas.getBoundingClientRect();
      return [
        Math.max(0, Math.min(GW - 1, Math.round((e.clientX - r.left) / r.width * (GW - 1)))),
        Math.max(0, Math.min(GH - 1, Math.round((e.clientY - r.top) / r.height * (GH - 1))))
      ];
    }
    function redraw() { draw(canvas, strokes); }
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault(); canvas.setPointerCapture(e.pointerId);
      cur = [pt(e)]; strokes.push(cur); redraw();
    });
    canvas.addEventListener('pointermove', e => {
      if (!cur) return; e.preventDefault();
      const p = pt(e), l = cur[cur.length - 1];
      if (p[0] !== l[0] || p[1] !== l[1]) { cur.push(p); redraw(); }
    });
    const end = () => { cur = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.style.touchAction = 'none';
    requestAnimationFrame(fit);
    window.addEventListener('resize', fit);
    return {
      clear() { strokes = []; redraw(); },
      isEmpty() { return strokes.reduce((n, s) => n + s.length, 0) < 3; },
      strokes() { return strokes.map(s => simplify(s, 0.7)); },
      ctx
    };
  }

  function draw(canvas, strokes, color = '#111') {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sx = canvas.width / (GW - 1), sy = canvas.height / (GH - 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, canvas.width / 110);
    for (const s of strokes) {
      ctx.beginPath();
      s.forEach(([x, y], i) => i ? ctx.lineTo(x * sx, y * sy) : ctx.moveTo(x * sx, y * sy));
      if (s.length === 1) ctx.lineTo(s[0][0] * sx + 0.5, s[0][1] * sy + 0.5);
      ctx.stroke();
    }
  }

  // Ramer–Douglas–Peucker 단순화
  function simplify(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const d = (p, a, b) => {
      const [x, y] = p, [x1, y1] = a, [x2, y2] = b;
      const A = x - x1, B = y - y1, C = x2 - x1, D = y2 - y1;
      const len = C * C + D * D;
      let t = len ? (A * C + B * D) / len : 0;
      t = Math.max(0, Math.min(1, t));
      const dx = x1 + t * C - x, dy = y1 + t * D - y;
      return Math.sqrt(dx * dx + dy * dy);
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
  function encode(strokes) {
    const out = [];
    const vint = v => { while (v > 127) { out.push((v & 127) | 128); v >>>= 7; } out.push(v); };
    const zz = v => (v << 1) ^ (v >> 31);
    vint(strokes.length);
    for (const s of strokes) {
      vint(s.length);
      let px = 0, py = 0;
      for (const [x, y] of s) { vint(zz(x - px)); vint(zz(y - py)); px = x; py = y; }
    }
    return Codec.b64u.enc(Uint8Array.from(out));
  }
  function decode(str) {
    const b = Codec.b64u.dec(str); let i = 0;
    const vint = () => { let v = 0, sh = 0, c; do { c = b[i++]; v |= (c & 127) << sh; sh += 7; } while (c & 128); return v >>> 0; };
    const unzz = v => (v >>> 1) ^ -(v & 1);
    const n = vint(), strokes = [];
    for (let k = 0; k < n; k++) {
      const m = vint(), s = []; let px = 0, py = 0;
      for (let j = 0; j < m; j++) { px += unzz(vint()); py += unzz(vint()); s.push([px, py]); }
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
