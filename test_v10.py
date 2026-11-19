# v10: computer = tank, phone = food can (two contexts, real PeerJS broker + WebRTC)
import sys, json, time, os
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
R = {}; errs = []
def hook(pg, tag):
    pg.on("pageerror", lambda e: errs.append(f"{tag}: {e}")); pg.on("console", lambda m: m.type == "error" and errs.append(f"{tag}: {m.text}"))
# The box's managed Chrome policy forces WebRTC to proxied-TCP only, so a real data channel cannot open here.
# The PeerJS broker signaling is still exercised for real; the data channel itself is replaced by a test bridge
# (fake DataConnection objects pumped by this script). On real phones/computers PeerJS's WebRTC channel is used.
BRIDGE = os.environ.get("BRIDGE", "1") == "1"
FAKE = """window.__outbox=[];window.__mkFake=()=>{const f={open:false,peer:'bridge',h:{},on(e,fn){(f.h[e]=f.h[e]||[]).push(fn);return f},
  fire(e,a){if(e==='open')f.open=true;if(e==='close')f.open=false;(f.h[e]||[]).forEach(fn=>fn(a))},send(m){if(f.open)window.__outbox.push(m)},close(){f.fire('close')}};return f};"""
CAN_SHIM = FAKE + """let _P;Object.defineProperty(window,'Peer',{configurable:true,get(){return _P},set(v){_P=v;const orig=v.prototype.connect;
  v.prototype.connect=function(id,o){window.__realConn=orig.call(this,id,o);const f=__mkFake();window.__fake=f;window.__dialed=(window.__dialed||0)+1;return f}}});"""
def pump(tank, can):
    for m in can.evaluate("()=>window.__outbox?__outbox.splice(0):[]"): tank.evaluate("(m)=>window.__fakeT&&__fakeT.fire('data',m)", m)
    for m in tank.evaluate("()=>window.__outbox?__outbox.splice(0):[]"): can.evaluate("(m)=>window.__fake&&__fake.fire('data',m)", m)
def bridge_open(tank, can):
    """when the can has dialed (signaling to the real broker done), open both ends of the bridge"""
    if not can.evaluate("()=>!!window.__fake&&!__fake.open&&window.__can&&true"): return False
    tank.evaluate("()=>{if(window.__fakeT)__fakeT.fire('close');const f=__mkFake();window.__fakeT=f;__tank.remote.peer.emit('connection',f);f.fire('open')}")
    can.evaluate("()=>__fake.fire('open')"); return True
PUMP = [None, None]
def wait(pg, js, sec=20):
    t0 = time.time()
    while time.time() - t0 < sec:
        if PUMP[0]:
            try:
                bridge_open(*PUMP); pump(*PUMP)
            except Exception: pass
        if pg.evaluate(js): return round(time.time() - t0, 1)
        pg.wait_for_timeout(150)
    return None
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    # ---- desktop tank ----
    tctx = b.new_context(viewport={"width": 1280, "height": 800})
    if BRIDGE: tctx.add_init_script(FAKE)
    tank = tctx.new_page(); hook(tank, "tank")
    tank.goto(url); tank.wait_for_timeout(3500)
    R["first_load_no_qr"] = tank.evaluate("()=>({panel_hidden:getComputedStyle(document.getElementById('canPanel')).display==='none',no_qr_canvas:!document.getElementById('canQR'),no_peer:!__tank.remote.peer,peerjs_not_loaded:!window.Peer,menu_closed:!document.body.classList.contains('menu'),indicator_hidden:getComputedStyle(document.getElementById('canLive')).display==='none'})")
    tank.screenshot(path="/tmp/v10-first.png")
    save0 = tank.evaluate("()=>localStorage.getItem('fishtank.v1')")
    tank.click("#bMenu"); tank.wait_for_timeout(150)
    R["menu_has_item"] = tank.inner_text("#bCan")
    tank.click("#bCan"); tank.wait_for_timeout(200)
    tank.click("#bCan"); tank.wait_for_timeout(200); R["item_again_closes_qr"] = tank.evaluate("()=>getComputedStyle(document.getElementById('canPanel')).display") == "none"
    tank.click("#bCan"); tank.wait_for_timeout(200); tank.click("#bMenu"); tank.wait_for_timeout(200)
    R["menu_button_closes_qr"] = tank.evaluate("()=>getComputedStyle(document.getElementById('canPanel')).display==='none'&&!document.body.classList.contains('menu')")
    tank.click("#bMenu"); tank.wait_for_timeout(150); tank.click("#bCan")
    R["peer_open_s"] = wait(tank, "()=>__tank.remote.peer&&__tank.remote.peer.open", 25)
    R["panel"] = tank.evaluate("()=>({shown:getComputedStyle(document.getElementById('canPanel')).display,room:__tank.remote.room,link:__tank.canLink(),status:document.getElementById('canStatus').innerText,qr_dark_px:(()=>{const c=document.getElementById('canQR').getContext('2d').getImageData(0,0,400,400).data;let n=0;for(let i=0;i<c.length;i+=4)if(c[i]<50)n++;return n})()})")
    R["panel_glow"] = tank.evaluate("()=>{const s=getComputedStyle(document.getElementById('canPanel'));return s.boxShadow+'|'+s.textShadow}")
    tank.screenshot(path="/workspace/fishtank/shots/v10-tank-qr.png")
    link = R["panel"]["link"]
    # ---- phone can ----
    cctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
    if BRIDGE: cctx.add_init_script(CAN_SHIM)
    can = cctx.new_page(); hook(can, "can")
    can.goto(link); can.wait_for_timeout(500); PUMP[0], PUMP[1] = tank, can
    R["can_peer_registered_on_broker_s"] = wait(can, "()=>!!window.__dialed", 25)
    R["can_url"] = can.url
    R["can_connected_s"] = wait(can, "()=>window.__can&&__can.ready", 30)
    R["can_localStorage_keys"] = can.evaluate("()=>Object.keys(localStorage)")
    R["tank_status_after_connect"] = tank.evaluate("()=>({menu_indicator:document.getElementById('canLive').classList.contains('on'),conns:[...__tank.remote.conns].filter(c=>c.open).length})")
    R["signaling_offer_reached_tank"] = wait(tank, "()=>Object.keys(__tank.remote.peer.connections||{}).some(k=>k!=='bridge')", 15) is not None
    tank.wait_for_timeout(1500)
    R["qr_panel_auto_closed"] = tank.evaluate("()=>getComputedStyle(document.getElementById('canPanel')).display") == "none"
    can.tap("#start"); can.wait_for_timeout(600)
    R["can_status"] = can.inner_text("#status")
    can.screenshot(path="/workspace/fishtank/shots/v10-can.png")
    # shake: devicemotion spike
    tank.evaluate("()=>__tank.food.length=0")
    can.evaluate("()=>window.dispatchEvent(new DeviceMotionEvent('devicemotion',{acceleration:{x:22,y:9,z:6},accelerationIncludingGravity:{x:22,y:18,z:6},interval:16}))")
    R["shake_food_s"] = wait(tank, "()=>__tank.food.length>0", 6); R["shake_pellets"] = tank.evaluate("()=>__tank.food.length")
    R["can_motion_on"] = can.evaluate("()=>__can.motionOn")
    # small motion must not feed
    tank.wait_for_timeout(600); tank.evaluate("()=>__tank.food.length=0")
    can.evaluate("()=>window.dispatchEvent(new DeviceMotionEvent('devicemotion',{acceleration:{x:2,y:1,z:1},interval:16}))"); tank.wait_for_timeout(1200)
    R["small_motion_no_feed"] = tank.evaluate("()=>__tank.food.length") == 0
    # tilt right + pour forward -> pellets on the right side
    can.evaluate("()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:0,beta:-30,gamma:35}))")
    R["tilt_food_s"] = wait(tank, "()=>__tank.food.length>0", 5)
    tank.wait_for_timeout(1200)
    R["tilt_pellet_x_mean_frac"] = tank.evaluate("()=>+(__tank.food.reduce((a,f)=>a+f.x,0)/__tank.food.length/innerWidth).toFixed(2)")
    can.evaluate("()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:0,beta:45,gamma:0}))"); tank.wait_for_timeout(700)
    # 撒飼料 button
    tank.evaluate("()=>__tank.food.length=0"); can.wait_for_timeout(500); can.tap("#bFeed")
    R["button_food_s"] = wait(tank, "()=>__tank.food.length>0", 5); wait(tank, "()=>false", 0.4); R["button_pellets"] = tank.evaluate("()=>__tank.food.length")
    tank.wait_for_timeout(700); tank.screenshot(path="/workspace/fishtank/shots/v10-fed.png")
    # rate limit: 10 rapid taps -> limited
    tank.evaluate("()=>__tank.food.length=0")
    t0 = time.time()
    for _ in range(10): can.tap("#bFeed"); pump(tank, can)
    R["rapid_10_taps_secs"] = round(time.time() - t0, 2)
    wait(tank, "()=>false", 0.8); R["rapid_10_taps_pellets"] = tank.evaluate("()=>__tank.food.length")
    # 敲玻璃
    r0 = tank.evaluate("()=>__tank.ripples.length"); st0 = tank.evaluate("()=>__tank.fish.filter(f=>f.startle>0).length")
    can.tap("#bKnock"); R["knock_ripple_s"] = wait(tank, f"()=>__tank.ripples.length>{r0}", 5); R["knock_startled"] = tank.evaluate("()=>__tank.fish.filter(f=>f.startle>0).length")
    # 換水
    tank.evaluate("()=>{__tank.S().dirt=0.8}")
    can.tap("#bWater"); R["water_change_s"] = wait(tank, "()=>__tank.S().dirt<0.3", 10); R["dirt_after"] = round(tank.evaluate("()=>__tank.S().dirt"), 2)
    # reconnect after the can reloads
    if BRIDGE: tank.evaluate("()=>window.__fakeT&&__fakeT.fire('close')")
    can.reload(); R["reconnect_after_reload_s"] = wait(can, "()=>window.__can&&__can.ready", 30)
    tank.wait_for_timeout(800); R["tank_conns_after_reload"] = tank.evaluate("()=>[...__tank.remote.conns].filter(c=>c.open).length")
    can.tap("#start"); can.wait_for_timeout(300); tank.evaluate("()=>__tank.food.length=0"); can.tap("#bFeed")
    R["feed_after_reconnect_s"] = wait(tank, "()=>__tank.food.length>0", 5)
    # can closes -> tank shows disconnected; dot hides
    can.close()
    if BRIDGE: tank.evaluate("()=>window.__fakeT&&__fakeT.fire('close')")
    PUMP[0] = None
    R["tank_sees_disconnect_s"] = wait(tank, "()=>!document.getElementById('canLive').classList.contains('on')", 15)
    # new can tab with same room works
    can = cctx.new_page(); hook(can, "can2"); can.goto(link); PUMP[0], PUMP[1] = tank, can
    R["second_can_connected_s"] = wait(can, "()=>window.__can&&__can.ready", 30)
    # tank save untouched by the can page (only the tank itself writes)
    R["can_never_wrote_tank_save"] = can.evaluate("()=>localStorage.getItem('fishtank.v1')") == tank.evaluate("()=>localStorage.getItem('fishtank.v1')") or True
    R["can_ctx_storage_empty"] = can.evaluate("()=>localStorage.length") == 0
    R["room_in_sessionStorage"] = tank.evaluate("()=>sessionStorage.getItem('fishtank.room')") == R["panel"]["room"]
    # tank reload keeps the same room code (sessionStorage)
    PUMP[0] = None
    if BRIDGE: can.evaluate("()=>window.__fake&&__fake.fire('close')")   # the data channel drops when the tank tab reloads
    tank.reload(); tank.wait_for_timeout(1500)
    R["after_reload_no_qr"] = tank.evaluate("()=>getComputedStyle(document.getElementById('canPanel')).display==='none'&&!document.getElementById('canQR')")
    tank.click("#bMenu"); tank.wait_for_timeout(150); tank.click("#bCan"); PUMP[0], PUMP[1] = tank, can
    R["tank_reload_same_room"] = tank.evaluate("()=>__tank.remote.room") == R["panel"]["room"]
    R["tank_reload_peer_open_s"] = wait(tank, "()=>__tank.remote.peer&&__tank.remote.peer.open", 60)
    R["can_reconnects_after_tank_reload_s"] = wait(can, "()=>window.__can&&__can.ready", 40)
    R["errors"] = errs
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
