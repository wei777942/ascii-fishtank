// v12 phone food can: talks to the tank through the ntfy.sh relay (HTTPS + WebSocket, no account). Never reads or writes the tank's localStorage save.
(() => {
  const $ = id => document.getElementById(id);
  const room = (new URLSearchParams(location.search).get('can') || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32);
  const CAN = [
    '<span class="lid">  .------.  </span>',
    '<span class="lid"> (________) </span>',
    ' |  <span class="dots">:  :</span>  | ',
    ' |  <span class="lbl">FISH</span>  | ',
    ' |  <span class="lbl">FOOD</span>  | ',
    ' |  <span class="dots">:  :</span>  | ',
    " '--------' "].join('\n');
  $('can').innerHTML = CAN;

  let relay = null, ready = false, lastFeed = 0, lastKnock = 0, lastWater = 0, tiltX = 0, motionOn = false, pouring = false, ac = null, helloT = 0, helloN = 0, detailT = 0;
  const id = (() => { const A = 'abcdefghjkmnpqrstuvwxyz23456789', u = new Uint32Array(8); crypto.getRandomValues(u); return 'c' + [...u].map(v => A[v % A.length]).join(''); })();
  const status = (t, cls) => { const el = $('status'); el.textContent = t; el.className = cls || ''; };

  // ---------- connection ----------
  let t0 = performance.now(), tick = 0, phase = '';
  function progress(ph, cls) {                // visible progress with elapsed seconds
    phase = ph; clearInterval(tick);
    const show = () => status(`${ph}　${((performance.now() - t0) / 1000).toFixed(1)} 秒`, cls);
    show(); tick = setInterval(() => { if (!ready) show(); else clearInterval(tick); }, 250);
  }
  function hello(fresh) {                     // say hello; repeat (slowly) until the tank answers
    clearTimeout(helloT); if (fresh) helloN = 0;
    if (!relay || !relay.open) return;
    relay.send({ t: 'hello' }); helloN++;
    if (!ready && helloN === 3) progress('找不到魚缸，請確認電腦上的魚缸頁面開著…（2/3）', 'bad');
    helloT = setTimeout(() => { if (!ready) hello(); }, [2500, 4000, 6000, 10000, 15000][helloN - 1] || 30000);
  }
  function lost(msg) { ready = false; t0 = performance.now(); clearTimeout(detailT); progress(msg, 'bad'); }
  function onMessage(d) {
    if (d.f !== 'T') return;
    if (d.t === 'state' && (d.to === id || d.to === '*')) {
      clearTimeout(helloT);
      const detail = () => status(`已連線 ✓　魚 ${d.n} 隻・飽足 ${d.hunger}%・水質 ${d.clean}%`, 'ok');
      if (!ready) {
        ready = true; clearInterval(tick); window.__connectMs = Math.round(performance.now() - t0);
        status(`已連線 ✓（${(window.__connectMs / 1000).toFixed(1)} 秒）`, 'ok');
        clearTimeout(detailT); detailT = setTimeout(detail, 2500);
      } else { clearTimeout(detailT); detail(); }
    } else if (d.t === 'here') { hello(true); }                     // tank page reloaded
    else if (d.t === 'bye') { lost('魚缸頁面關閉了，等待重新開啟…'); }
  }
  function connect() {
    if (!room) { status('沒有房間碼，請重新掃描魚缸上的 QR', 'bad'); return; }
    if (!window.Relay || !window.WebSocket || !window.crypto) { status('無法載入連線元件，請檢查網路', 'bad'); return; }
    progress('連線伺服器中…（1/3）');
    relay = new Relay('fishtank-' + room, id, {
      onMessage,
      onStatus: st => {
        if (st === 'open') { if (!ready) progress('尋找魚缸中…（2/3）'); hello(true); }       // also re-syncs after a reconnect
        else if (st === 'retry') { if (ready) lost('網路中斷，重新連線中…'); else progress('網路中斷，重新連線中…（1/3）', 'bad'); }
        else if (st === 'limit') { clearInterval(tick); status('今天的免費傳送次數用完了（ntfy.sh 限制），請稍後再試', 'bad'); }
      }
    });
    relay.start();
  }
  setInterval(() => { if (ready && relay && document.visibilityState === 'visible') relay.send({ t: 'ping' }); }, 4 * 60000);
  addEventListener('pagehide', () => { if (relay && ready) relay.beacon({ t: 'bye' }); });
  function send(msg) {
    if (!ready || !relay) { status('還沒連上魚缸…', 'bad'); setTimeout(() => { if (!ready) progress(phase, ''); }, 1200); return false; }
    relay.send(msg); return true;
  }

  // ---------- feedback ----------
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
  function pourFx(n) {
    const can = $('can'); can.classList.add('pour'); clearTimeout(pourFx.t); pourFx.t = setTimeout(() => can.classList.remove('pour'), 420);
    const r = can.getBoundingClientRect(), area = $('area').getBoundingClientRect();
    for (let i = 0; i < 3 + n * 2; i++) {
      const p = document.createElement('span'); p.className = 'pel'; p.textContent = Math.random() < 0.5 ? '∴' : '.';
      p.style.left = (r.left - area.left + r.width * 0.15 + Math.random() * 20) + 'px'; p.style.top = (r.top - area.top + r.height * 0.1) + 'px';
      p.style.setProperty('--dx', (Math.random() * 60 - 50 + tiltX * 40) + 'px'); p.style.animationDelay = (i * 0.04) + 's';
      $('area').appendChild(p); setTimeout(() => p.remove(), 1400);
    }
  }
  function shakeFx() { const can = $('can'); can.classList.remove('shake'); void can.offsetWidth; can.classList.add('shake'); }
  // same sprinkle as the tank (flakes shaken from a tube): highpassed 3–8 kHz noise grains with a gentle fade
  function sprinkle() {
    if (!ac || ac.state !== 'running') return;
    const t0 = ac.currentTime + 0.005, len = 0.45 + Math.random() * 0.3, sr = ac.sampleRate, n = Math.floor(sr * (len + 0.05));
    const buf = ac.createBuffer(1, n, sr), d = buf.getChannelData(0);
    for (let t = 0; t < len; t += 0.004 + Math.random() * 0.012) {
      const env = Math.min(1, t / 0.06) * Math.pow(1 - t / len, 1.5), a = env * (0.3 + Math.random() * 0.7);
      const i0 = Math.floor(t * sr), gl = Math.floor(sr * (0.002 + Math.random() * 0.004));
      for (let i = 0; i < gl && i0 + i < n; i++) d[i0 + i] += (Math.random() * 2 - 1) * a * Math.sin(Math.PI * i / gl);
    }
    const src = ac.createBufferSource(); src.buffer = buf;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 8000;
    const g = ac.createGain(); g.gain.value = 0.16 * 0.55;
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(ac.destination); src.start(t0);
  }

  // ---------- actions ----------
  function feed(n) {
    const now = performance.now(); if (now - lastFeed < 450) return false; lastFeed = now;
    if (!send({ t: 'feed', n, x: motionOn ? tiltX : null })) return false;
    pourFx(n); buzz(15 + n * 10); sprinkle(); return true;
  }
  $('bFeed').addEventListener('click', () => feed(3));
  $('bKnock').addEventListener('click', () => { const now = performance.now(); if (now - lastKnock < 400) return; lastKnock = now; if (send({ t: 'knock' })) { buzz(25); shakeFx(); } });
  $('bWater').addEventListener('click', () => { const now = performance.now(); if (now - lastWater < 2500) return; lastWater = now; if (send({ t: 'water' })) { buzz([20, 60, 20]); status('換水中…', 'ok'); } });

  // ---------- motion: shake spikes and tilting forward ----------
  let lastMag = null;
  function onMotion(e) {
    let mag = null;
    const a = e.acceleration;
    if (a && a.x != null) mag = Math.hypot(a.x, a.y || 0, a.z || 0);
    else {
      const g = e.accelerationIncludingGravity; if (!g || g.x == null) return;
      const m = Math.hypot(g.x, g.y || 0, g.z || 0); mag = lastMag == null ? 0 : Math.abs(m - lastMag) * 2.2 + Math.abs(m - 9.81); lastMag = m;
    }
    if (mag != null) motionOn = true;
    if (mag > 14) { const n = Math.max(1, Math.min(5, Math.round((mag - 9) / 6))); if (feed(n)) shakeFx(); }
  }
  function onOrient(e) {
    if (e.gamma != null) { tiltX = Math.max(-1, Math.min(1, e.gamma / 40)); motionOn = true; }
    if (e.beta != null) pouring = e.beta < -12;      // phone tipped forward past flat, like pouring from a can
    $('can').classList.toggle('pour', pouring);
  }
  setInterval(() => { if (pouring) feed(1); }, 520);

  // ---------- start: iOS needs a tap for motion permission and audio ----------
  async function start() {
    $('start').style.display = 'none';
    try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) { ac = new AC(); ac.resume(); } } catch (e) {}
    let ok = true;
    try { if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') ok = (await DeviceMotionEvent.requestPermission()) === 'granted'; } catch (e) { ok = false; }
    try { if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') await DeviceOrientationEvent.requestPermission(); } catch (e) {}
    if (ok) { window.addEventListener('devicemotion', onMotion); window.addEventListener('deviceorientation', onOrient); }
    else $('hint').textContent = '動作感測沒有開啟，請用下面的「撒飼料」按鈕';
  }
  $('start').addEventListener('click', start, { once: true });
  window.__can = { get ready() { return ready; }, feed, get motionOn() { return motionOn; }, room, id, get relay() { return relay; } };
  connect();
})();
