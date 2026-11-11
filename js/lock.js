// 6자리 비밀번호 잠금: 앱과 근로자 링크 모두 비밀번호가 맞아야 화면이 열린다.
// 비밀번호는 원문 대신 해시로만 저장·전달한다.
// 지도요원 기기: 처음 한 번 맞히면 이 기기를 기억해 다음부터는 바로 열린다 (설정에서 다시 잠글 수 있음).
// 근로자 링크 화면: 기기를 기억하지 않고, 브라우저를 닫을 때까지만 열린 상태를 유지한다.
const Lock = (() => {
  const DEFAULT = '3965f059f87382de6ba92ae43f451ac3c057f4aee90b1866c95027f2d084c8e4'; // 초기 비밀번호
  const KEY = 'unlock', DEVICE = 'unlockDevice';

  async function hash(pin) {
    const data = new TextEncoder().encode('safety-edu:' + pin);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // 이 기기(지도요원)의 현재 비밀번호 해시
  async function current() { return (await DB.get('kv', 'pin').catch(() => null)) || DEFAULT; }
  async function setPin(pin) {
    const h = await hash(pin);
    await DB.put('kv', h, 'pin'); remember(h);
    try { if (localStorage.getItem(DEVICE)) localStorage.setItem(DEVICE, h); } catch (e) { /* 저장 불가 */ }
  }
  const trusted = () => { try { return !!localStorage.getItem(DEVICE); } catch (e) { return false; } };
  // 이 기기 기억 지우기 (다음에 열 때 비밀번호를 다시 묻는다)
  function forget() {
    try { localStorage.removeItem(DEVICE); localStorage.removeItem('unlockKeep'); sessionStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
  }
  // 다른 앱(카메라 등)에 다녀오는 사이 앱이 닫혀도 30분 안이면 다시 묻지 않는다
  const KEEP = 'unlockKeep', KEEP_MS = 30 * 60 * 1000;
  function isOpen(h) {
    try {
      if (sessionStorage.getItem(KEY) === h) return true;
      if (localStorage.getItem(DEVICE) === h) { sessionStorage.setItem(KEY, h); return true; }
      const k = JSON.parse(localStorage.getItem(KEEP) || 'null');
      if (k && k.h === h && k.until > Date.now()) { sessionStorage.setItem(KEY, h); return true; }
    } catch (e) { /* 저장 불가 */ }
    return false;
  }
  function remember(h) { try { sessionStorage.setItem(KEY, h); } catch (e) { /* 저장 불가 */ } }
  // 화면을 벗어날 때 호출: 열린 상태를 30분 동안 기억
  function keep() {
    try { const h = sessionStorage.getItem(KEY); if (h) localStorage.setItem(KEEP, JSON.stringify({ h, until: Date.now() + KEEP_MS })); } catch (e) { /* 저장 불가 */ }
  }
  const valid = pin => /^\d{6}$/.test(pin);

  // 잠금 화면을 그리고, 맞으면 onOpen() 호출
  // persist: 맞히면 이 기기를 기억 (지도요원 앱 화면). 근로자 링크 화면은 false
  function gate(root, h, onOpen, persist = false) {
    document.body.classList.add('locked');
    root.innerHTML = `<section class="lockbox">
      <img src="icons/app-192.png" alt="">
      <h1>안전지도</h1>
      <p class="lock-org">사람인안전지도사사무소</p>
      <p>비밀번호 6자리를 입력하세요.</p>
      ${persist ? '<p class="hint">처음 한 번만 입력하면 이 기기에서는 다음부터 바로 열립니다.</p>' : ''}
      <form id="lockf">
        <input id="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" aria-label="비밀번호 6자리">
        <button class="btn big primary" type="submit">확인</button>
      </form>
      <p class="hint" id="lockmsg"></p>
    </section>`;
    const input = root.querySelector('#pin'), msg = root.querySelector('#lockmsg');
    setTimeout(() => input.focus(), 50);
    const check = async () => {
      const pin = input.value.trim();
      if (!valid(pin)) { msg.textContent = '숫자 6자리를 입력하세요.'; return; }
      if (await hash(pin) === h) {
        remember(h);
        if (persist) { try { localStorage.setItem(DEVICE, h); } catch (e) { /* 저장 불가 */ } }
        document.body.classList.remove('locked');
        onOpen();
      } else {
        msg.textContent = '비밀번호가 맞지 않습니다.';
        input.value = '';
        input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
        input.focus();
      }
    };
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 6);
      msg.textContent = '';
      if (input.value.length === 6) check();
    });
    root.querySelector('#lockf').onsubmit = e => { e.preventDefault(); check(); };
  }
  return { DEFAULT, hash, current, setPin, isOpen, gate, valid, keep, forget, trusted };
})();
