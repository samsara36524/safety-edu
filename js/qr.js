// QR 만들기(qrcode-generator)와 카메라로 QR 읽기(BarcodeDetector 또는 jsQR)
const QR = (() => {
  function svg(text, cell = 6) {
    const q = qrcode(0, 'L');
    q.addData(text, 'Byte');
    q.make();
    return q.createSvgTag({ cellSize: cell, margin: 4, scalable: true });
  }

  // 카메라 스캔: 결과 문자열을 resolve. stop() 으로 중단.
  function scan(video, onResult) {
    let stream, stopped = false, detector = null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    async function start() {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
      });
      video.srcObject = stream;
      video.setAttribute('playsinline', '');
      await video.play();
      if ('BarcodeDetector' in window) {
        try {
          const fmts = await BarcodeDetector.getSupportedFormats();
          if (fmts.includes('qr_code')) detector = new BarcodeDetector({ formats: ['qr_code'] });
        } catch (e) { detector = null; }
      }
      tick();
    }
    async function tick() {
      if (stopped) return;
      try {
        if (video.readyState >= 2) {
          let text = null;
          if (detector) {
            const r = await detector.detect(video);
            if (r.length) text = r[0].rawValue;
          } else {
            const w = video.videoWidth, h = video.videoHeight, s = Math.min(1, 1280 / Math.max(w, h));
            canvas.width = w * s; canvas.height = h * s;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
            if (r) text = r.data;
          }
          if (text) { onResult(text); return; }
        }
      } catch (e) { /* 다음 프레임에서 재시도 */ }
      setTimeout(tick, 150);
    }
    function stop() {
      stopped = true;
      if (stream) stream.getTracks().forEach(t => t.stop());
    }
    return { start, stop };
  }

  return { svg, scan };
})();
