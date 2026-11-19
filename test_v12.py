# v12: computer = tank, phone = food can — REAL ntfy.sh relay between two browser contexts (no test bridge, no fakes)
import sys, json, time, statistics
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
RUNS = int(sys.argv[2]) if len(sys.argv) > 2 else 3
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
R = {}; errs = []; relay_hosts = set(); NT = {"post": 0, "ws": 0}
def hook(pg, tag):
    pg.on("pageerror", lambda e: errs.append(f"{tag}: {e}")); pg.on("console", lambda m: m.type == "error" and errs.append(f"{tag}: {m.text}"))
    def rq(r):
        if "ntfy.sh" in r.url: relay_hosts.add(r.url.split('/')[2]); NT["post"] += r.method == "POST"
    def ws(w):
        relay_hosts.add("ws:" + w.url.split('/')[2]); NT["ws"] += 1
    pg.on("request", rq); pg.on("websocket", ws)
def wait(pg, js, sec=20):
    t0 = time.time()
    while time.time() - t0 < sec:
        if pg.evaluate(js): return round(time.time() - t0, 2)
        pg.wait_for_timeout(100)
    return None
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    tctx = b.new_context(viewport={"width": 1280, "height": 800})
    tank = tctx.new_page(); hook(tank, "tank")
    t0 = time.time(); tank.goto(url)
    R["tank_relay_open_after_load_s"] = wait(tank, "()=>!!(window.__tank&&__tank.remote.relay&&__tank.remote.relay.open)", 15)
    tank.wait_for_timeout(1500)
    R["first_load_no_qr"] = tank.evaluate("()=>({panel_hidden:getComputedStyle(document.getElementById('canPanel')).display==='none',no_qr_canvas:!document.getElementById('canQR'),menu_closed:!document.body.classList.contains('menu'),indicator_hidden:getComputedStyle(document.getElementById('canLive')).display==='none',no_peerjs:!window.Peer})")
    save0 = tank.evaluate("()=>localStorage.getItem('fishtank.v1')")
    tank.click("#bMenu"); tank.wait_for_timeout(150)
    R["menu_has_item"] = tank.inner_text("#bCan")
    tank.click("#bCan"); tank.wait_for_timeout(200)
    tank.click("#bCan"); tank.wait_for_timeout(200); R["item_again_closes_qr"] = tank.evaluate("()=>getComputedStyle(document.getElementById('canPanel')).display") == "none"
    tank.click("#bCan"); tank.wait_for_timeout(200); tank.click("#bMenu"); tank.wait_for_timeout(200)
    R["menu_button_closes_qr"] = tank.evaluate("()=>getComputedStyle(document.getElementById('canPanel')).display==='none'&&!document.body.classList.contains('menu')")
    tank.click("#bMenu"); tank.wait_for_timeout(150); tank.click("#bCan"); tank.wait_for_timeout(300)
    R["panel"] = tank.evaluate("()=>({shown:getComputedStyle(document.getElementById('canPanel')).display,room:__tank.remote.room,link:__tank.canLink(),status:document.getElementById('canStatus').innerText,qr_dark_px:(()=>{const c=document.getElementById('canQR').getContext('2d').getImageData(0,0,400,400).data;let n=0;for(let i=0;i<c.length;i+=4)if(c[i]<50)n++;return n})()})")
    R["room_len"] = len(R["panel"]["room"])
    R["panel_glow"] = tank.evaluate("()=>{const s=getComputedStyle(document.getElementById('canPanel'));return s.boxShadow+'|'+s.textShadow}")
    tank.screenshot(path="/workspace/fishtank/shots/v12-tank-qr.png")
    link = R["panel"]["link"]
    cctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
    # ---- timing: open the can page -> 已連線 (fresh page each run) ----
    runs = []
    for i in range(RUNS):
        can = cctx.new_page(); hook(can, f"can{i}")
        t0 = time.time(); can.goto(link)
        wall = wait(can, "()=>window.__can&&__can.ready", 40)
        runs.append({"wall_from_goto_s": wall, "page_reported_ms": can.evaluate("()=>window.__connectMs"), "status": can.inner_text("#status")})
        if i == 0: R["can_url"] = can.url; R["qr_panel_auto_closed"] = wait(tank, "()=>getComputedStyle(document.getElementById('canPanel')).display==='none'", 5) is not None
        if i < RUNS - 1: can.close(); tank.wait_for_timeout(2500)
    R["connect_runs"] = runs
    ok = [r["page_reported_ms"] for r in runs if r["page_reported_ms"]]
    R["connect_median_ms"] = statistics.median(ok) if ok else None
    R["tank_indicator_on"] = tank.evaluate("()=>document.getElementById('canLive').classList.contains('on')")
    R["tank_phones"] = tank.evaluate("()=>__tank.remote.cans.size")
    R["tank_panel_status"] = tank.evaluate("()=>{const e=document.getElementById('canStatus');return e?e.innerText:null}")
    can.tap("#start"); can.wait_for_timeout(2800)
    R["can_status_detail"] = can.inner_text("#status")
    can.screenshot(path="/workspace/fishtank/shots/v12-can.png")
    # ---- feed (button) ----
    tank.evaluate("()=>{__tank.food.length=0;__tank.fish.forEach(f=>f.hunger=100)}"); tank.wait_for_timeout(1000)
    t = time.time(); can.tap("#bFeed")
    R["button_feed_arrived_s"] = wait(tank, "()=>__tank.food.length>0", 8); tank.wait_for_timeout(400); R["button_pellets"] = tank.evaluate("()=>__tank.food.length")
    tank.wait_for_timeout(500); tank.screenshot(path="/workspace/fishtank/shots/v12-fed.png")
    # ---- shake ----
    tank.wait_for_timeout(1000); tank.evaluate("()=>{__tank.food.length=0;__tank.fish.forEach(f=>f.hunger=100)}")
    can.evaluate("()=>window.dispatchEvent(new DeviceMotionEvent('devicemotion',{acceleration:{x:22,y:9,z:6},accelerationIncludingGravity:{x:22,y:18,z:6},interval:16}))")
    R["shake_feed_arrived_s"] = wait(tank, "()=>__tank.food.length>0", 8)
    # ---- rapid shaking is merged (fewer posts) ----
    tank.wait_for_timeout(1200); tank.evaluate("()=>{__tank.food.length=0;__tank.fish.forEach(f=>f.hunger=100)}")
    posts0 = len(can.evaluate("()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('ntfy.sh/')).map(e=>e.name)"))
    for _ in range(8):
        can.evaluate("()=>window.dispatchEvent(new DeviceMotionEvent('devicemotion',{acceleration:{x:22,y:9,z:6},interval:16}))"); can.wait_for_timeout(460)
    tank.wait_for_timeout(2500)
    R["shake_8x_posts"] = len(can.evaluate("()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('ntfy.sh/')).map(e=>e.name)")) - posts0
    R["shake_8x_pellets"] = tank.evaluate("()=>__tank.food.length")
    # ---- knock ----
    r0 = tank.evaluate("()=>__tank.ripples.length")
    can.tap("#bKnock"); R["knock_arrived_s"] = wait(tank, f"()=>__tank.ripples.length>{r0}", 8); R["knock_startled"] = tank.evaluate("()=>__tank.fish.filter(f=>f.startle>0).length")
    # ---- water ----
    tank.evaluate("()=>{__tank.S().dirt=0.8}"); tank.wait_for_timeout(1000)
    can.tap("#bWater"); R["water_change_s"] = wait(tank, "()=>__tank.S().dirt<0.3", 10); R["dirt_after"] = round(tank.evaluate("()=>__tank.S().dirt"), 2)
    R["can_status_after_water"] = (can.wait_for_timeout(5000), can.inner_text("#status"))[1]
    # ---- privacy / save ----
    R["can_ctx_storage_empty"] = can.evaluate("()=>localStorage.length") == 0
    R["tank_save_still_tank_only"] = tank.evaluate("()=>!!localStorage.getItem('fishtank.v1')")
    # ---- tank reload: same room, phone reconnects by itself ----
    tank.reload(); t = time.time()
    R["after_reload_no_qr"] = tank.evaluate("()=>getComputedStyle(document.getElementById('canPanel')).display==='none'&&!document.getElementById('canQR')")
    R["tank_reload_same_room"] = wait(tank, "()=>window.__tank&&__tank.remote.room", 10) is not None and tank.evaluate("()=>__tank.remote.room") == R["panel"]["room"]
    R["can_sees_tank_gone"] = None
    R["can_reconnected_after_tank_reload_s"] = wait(tank, "()=>__tank.remote.cans.size>0", 40)
    R["can_ready_after_tank_reload"] = wait(can, "()=>__can.ready", 15) is not None
    tank.evaluate("()=>__tank.food.length=0"); can.wait_for_timeout(600); can.tap("#bFeed")
    R["feed_after_tank_reload_s"] = wait(tank, "()=>__tank.food.length>0", 8)
    # ---- phone closes -> tank forgets it ----
    can.close(); R["tank_sees_phone_leave_s"] = wait(tank, "()=>!document.getElementById('canLive').classList.contains('on')", 15)
    R["relay_hosts"] = sorted(relay_hosts); R["ntfy_requests"] = NT
    R["errors"] = errs
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
