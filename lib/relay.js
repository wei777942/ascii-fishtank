// v12 relay: tiny JSON messages over ntfy.sh — plain HTTPS POST to publish, WebSocket (SSE fallback) to subscribe.
// No account. The topic is the unguessable room, so only someone holding the QR link can join.
// ntfy.sh anonymous limits are per IP: 60 requests burst, refilled 1 per 5 s, and 250 messages/day.
// v14: everything sent within a 1.2 s window is merged into one post (feeds add up, one knock), and each side keeps a
// token bucket (burst 30, +1 per 5 s = ntfy's own refill). v13's bucket (burst 24, +1 per 10 s) emptied after ~20 s of
// shaking or button use and then let only one post through every 10 s — the can felt dead even though it detected every shake.
(function () {
  const HOST = 'ntfy.sh', GAP = 1200, BURST = 30, REFILL = 5000;   // ≥1.2 s between posts (merge window)
  class Relay {
    constructor(topic, id, h) { this.topic = topic; this.id = id; this.h = h || {}; this.q = []; this.lastPost = 0; this.gap = GAP; this.fails = 0; this.mode = 'ws'; this.open = false; this.posts = 0; this.subs = 0; this.tok = BURST; this.tokT = Date.now(); }
    start() { this.stopped = false; this._sub(); }
    stop() { this.stopped = true; clearTimeout(this.rt); try { this.ws && this.ws.close(); } catch (e) {} try { this.es && this.es.close(); } catch (e) {} this.ws = this.es = null; this.open = false; }
    _st(s) { try { this.h.onStatus && this.h.onStatus(s); } catch (e) {} }
    _up() { this.fails = 0; if (!this.open) { this.open = true; this._st('open'); } }
    _down(opened) {
      this.open = false; if (this.stopped) return;
      this.fails++; if (!opened && this.fails >= 2 && this.mode === 'ws' && window.EventSource) this.mode = 'sse';   // WebSocket blocked: use SSE
      this._st('retry'); clearTimeout(this.rt);
      this.rt = setTimeout(() => this._sub(), Math.min(20000, 400 * Math.pow(2, Math.min(6, this.fails - 1))));
    }
    _sub() {
      clearTimeout(this.rt); if (this.stopped) return;
      if (this.mode === 'ws') {
        let ws, opened = false;
        this.subs++; try { ws = new WebSocket(`wss://${HOST}/${this.topic}/ws`); } catch (e) { return this._down(false); }
        this.ws = ws;
        ws.onopen = () => { opened = true; this._up(); };
        ws.onmessage = e => this._in(e.data);
        ws.onclose = () => { if (this.ws !== ws) return; this.ws = null; this._down(opened); };
      } else {
        this.subs++; const es = new EventSource(`https://${HOST}/${this.topic}/sse`); this.es = es;
        es.onopen = () => this._up();
        es.onmessage = e => this._in(e.data);
        es.onerror = () => { if (this.es !== es) return; if (this.open) { this.open = false; this._st('retry'); } };   // EventSource reconnects by itself
      }
    }
    _in(raw) {
      let m, d; try { m = JSON.parse(raw); } catch (e) { return; }
      if (!m || m.event !== 'message' || typeof m.message !== 'string' || m.message.length > 600) return;
      try { d = JSON.parse(m.message); } catch (e) { return; }
      if (!d || typeof d !== 'object' || typeof d.f !== 'string' || d.f === this.id) return;   // ignore our own echo
      try { this.h.onMessage && this.h.onMessage(d); } catch (e) {}
    }
    send(d) {                                    // queued + paced; feeds merge, only the newest state is kept
      d = Object.assign({}, d, { f: this.id });
      if (d.t === 'feed') { const p = this.q.find(x => x.t === 'feed'); if (p) { p.n = Math.min(8, (p.n || 1) + (d.n || 1)); if (d.x != null) p.x = d.x; return; } }
      if (d.t === 'knock' && this.q.some(x => x.t === 'knock')) return;
      if (d.t === 'state') { const i = this.q.findIndex(x => x.t === 'state'); if (i >= 0) { this.q[i] = d; return; } }
      if (d.t === 'hello') { if (this.q.some(x => x.t === 'hello')) return; }
      this.q.push(d); this._pump();
    }
    _tokens() { const now = Date.now(), k = Math.floor((now - this.tokT) / REFILL); if (k > 0) { this.tok = Math.min(BURST, this.tok + k); this.tokT += k * REFILL; } if (this.tok >= BURST) this.tokT = now; return this.tok; }
    _pump() {
      if (this.pt || !this.q.length) return;
      const now = Date.now(), tok = this._tokens();
      // the merge window widens smoothly as tokens run low (1.2 s → 5 s), so heavy use settles at ntfy's refill rate instead of hitting a wall
      const gap = Math.max(this.gap, GAP + Math.pow(1 - tok / BURST, 2) * (REFILL - GAP));
      const wait = tok >= 1 ? Math.max(0, this.lastPost + gap - now) : this.tokT + REFILL - now;
      this.pt = setTimeout(() => {
        this.pt = 0; if (this._tokens() < 1) return this._pump();
        const d = this.q.shift(); if (d) { this.tok--; this.lastPost = Date.now(); this._post(d); } this._pump();
      }, Math.max(0, wait));
    }
    get queued() { return this.q.length; }
    _post(d, keepalive) {
      this.posts++;
      return fetch(`https://${HOST}/${this.topic}?cache=no&firebase=no`, { method: 'POST', body: JSON.stringify(d), keepalive: !!keepalive, mode: 'cors', credentials: 'omit' })
        .then(r => {
          if (r.status === 429) { this.gap = 5000; clearTimeout(this.gt); this.gt = setTimeout(() => { this.gap = GAP; this.gt = 0; }, 60000); this._st('limit'); }
          else if (r.ok && this.gap > GAP && !this.gt) this.gap = GAP;
          return r.ok;
        }).catch(() => false);
    }
    beacon(d) { return this._post(Object.assign({}, d, { f: this.id }), true); }   // leaving the page: send right away
  }
  window.Relay = Relay;
})();
