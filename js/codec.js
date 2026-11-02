// 링크/QR에 담을 데이터를 짧게 압축·복원한다. (서버 없이 주고받기 위함)
const Codec = (() => {
  const b64u = {
    enc(bytes) {
      let s = '';
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    dec(str) {
      str = str.replace(/-/g, '+').replace(/_/g, '/');
      while (str.length % 4) str += '=';
      const s = atob(str), out = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
      return out;
    }
  };
  const canZip = typeof CompressionStream !== 'undefined';

  async function pipe(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }

  // 객체 → 문자열 (앞 글자 z: 압축, j: 비압축)
  async function pack(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    if (canZip) {
      const z = await pipe(raw, new CompressionStream('deflate-raw'));
      if (z.length < raw.length) return 'z' + b64u.enc(z);
    }
    return 'j' + b64u.enc(raw);
  }

  async function unpack(str) {
    str = String(str || '').trim();
    // 전체 링크를 붙여넣은 경우 코드만 추출
    const m = str.match(/#\/[a-z]\/([A-Za-z0-9_\-]+)/);
    if (m) str = m[1];
    const kind = str[0], body = b64u.dec(str.slice(1));
    let raw = body;
    if (kind === 'z') {
      if (!canZip) throw new Error('이 브라우저는 압축 해제를 지원하지 않습니다. 크롬에서 열어 주세요.');
      raw = await pipe(body, new DecompressionStream('deflate-raw'));
    } else if (kind !== 'j') throw new Error('올바른 코드가 아닙니다.');
    return JSON.parse(new TextDecoder().decode(raw));
  }

  return { pack, unpack, b64u };
})();
