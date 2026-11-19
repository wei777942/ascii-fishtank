# Connection timing: tank peer registration, can page open -> broker registered -> dialed -> offer reaches tank.
# (The WebRTC data channel itself cannot open in this sandbox: Chrome policy forbids non-proxied UDP.)
import sys, json, time, statistics
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "https://wei777942.github.io/ascii-fishtank/"
runs = int(sys.argv[2]) if len(sys.argv) > 2 else 3
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
SPY = """window.__ev=[];let _P;Object.defineProperty(window,'Peer',{configurable:true,get(){return _P},set(v){_P=v;
  const e=v.prototype.emit;v.prototype.emit=function(n,...a){__ev.push([n,performance.timeOrigin+performance.now()]);return e.call(this,n,...a)};
  const c=v.prototype.connect;v.prototype.connect=function(...a){__ev.push(['dial',performance.timeOrigin+performance.now()]);return c.apply(this,a)}}});"""
ICE_PROBE = """async(cfg)=>{const t0=performance.now();const pc=new RTCPeerConnection(cfg);pc.createDataChannel('x');let first=null,n=0;
  const done=new Promise(r=>{pc.onicecandidate=e=>{if(e.candidate){n++;if(first==null)first=performance.now()-t0}else r()};setTimeout(r,15000)});
  await pc.setLocalDescription(await pc.createOffer());await done;const t=performance.now()-t0;pc.close();return {first_candidate_ms:first&&Math.round(first),gather_complete_ms:Math.round(t),candidates:n}}"""
def ms(a, b): return None if a is None or b is None else round(b - a)
def first(ev, name, after=0):
    for n, t in ev:
        if n == name and t >= after: return t
    return None
res = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for r in range(runs):
        tctx = b.new_context(viewport={"width": 1280, "height": 800}); tctx.add_init_script(SPY); tank = tctx.new_page()
        t_load = time.time() * 1000; tank.goto(url); tank.wait_for_timeout(2500)
        t_menu = time.time() * 1000
        tank.click("#bMenu"); tank.wait_for_timeout(100); tank.click("#bCan")
        for _ in range(100):
            if tank.evaluate("()=>!!(__tank.remote.peer&&__tank.remote.peer.open)"): break
            tank.wait_for_timeout(50)
        t_ready = time.time() * 1000
        tev = tank.evaluate("()=>__ev"); t_open = first(tev, 'open')
        link = tank.evaluate("()=>__tank.canLink()")
        cctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent=UA); cctx.add_init_script(SPY); can = cctx.new_page()
        t_can = time.time() * 1000; can.goto(link)
        for _ in range(200):
            if tank.evaluate("()=>__ev.some(e=>e[0]==='connection')"): break
            can.wait_for_timeout(50)
        cev = can.evaluate("()=>__ev"); tev = tank.evaluate("()=>__ev")
        res.append({
            "tank_peer_open_after_page_load_ms": ms(t_load, t_open),
            "qr_room_ready_after_menu_tap_ms": max(0, ms(t_menu, t_open) or 0) if t_open and t_open > t_menu else 0,
            "can_registered_on_broker_ms": ms(t_can, first(cev, 'open')),
            "can_dialed_ms": ms(t_can, first(cev, 'dial')),
            "offer_reached_tank_ms": ms(t_can, first(tev, 'connection', t_can)),
        })
        cctx.close(); tctx.close()
    pg = b.new_page(); pg.goto(url)
    import re
    old = {"iceServers": [{"urls": "stun:stun.l.google.com:19302"}, {"urls": ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478", "turn:eu-0.turn.peerjs.com:3478?transport=tcp", "turn:us-0.turn.peerjs.com:3478?transport=tcp"], "username": "peerjs", "credential": "peerjsp"}]}
    new = {"iceServers": [{"urls": "stun:stun.l.google.com:19302"}, {"urls": ["turn:us-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478?transport=tcp"], "username": "peerjs", "credential": "peerjsp"}], "iceCandidatePoolSize": 2}
    ice = {"v10_config": pg.evaluate(ICE_PROBE, old), "v11_config": pg.evaluate(ICE_PROBE, new)}
    b.close()
keys = res[0].keys()
summary = {k: {"median": statistics.median([x[k] for x in res if x[k] is not None]) if any(x[k] is not None for x in res) else None, "runs": [x[k] for x in res]} for k in keys}
print(json.dumps({"url": url, "summary": summary, "ice_gathering_in_sandbox": ice}, indent=1))
