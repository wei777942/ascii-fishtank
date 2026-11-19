# v13: phone-sent food spreads across the whole surface; 生物 / 佈置 separate; empty new tank; ten new creatures.
# Relay: real ntfy.sh by default; MOCK=1 (or automatic when the box's ntfy allowance is used up) swaps in mock_ntfy.
import sys, json, time, os, statistics, urllib.request
from playwright.sync_api import sync_playwright
import mock_ntfy
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
SH = "/workspace/fishtank/shots"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
R = {}; errs = []
def quota():
    try: return json.load(urllib.request.urlopen("https://ntfy.sh/v1/account", timeout=8))["stats"]["messages_remaining"]
    except Exception: return None
R["ntfy_remaining_before"] = quota()
MOCK = os.environ.get("MOCK") == "1" or (R["ntfy_remaining_before"] is not None and R["ntfy_remaining_before"] < 60)
R["relay"] = "mock_ntfy (box allowance used up)" if MOCK else "real ntfy.sh"
NEW = ['goldfish', 'seahorse', 'eel', 'octopus', 'squid', 'ray', 'shark', 'lionfish', 'starfish', 'snail']
def hook(pg, tag):
    pg.on("pageerror", lambda e: errs.append(f"{tag}: {e}")); pg.on("console", lambda m: m.type == "error" and errs.append(f"{tag}: {m.text}"))
def wait(pg, js, sec=10, arg=None):
    t0 = time.time()
    while time.time() - t0 < sec:
        if pg.evaluate(js, arg) if arg is not None else pg.evaluate(js): return round(time.time() - t0, 2)
        pg.wait_for_timeout(80)
    return None
def mk(b, w, h, phone, angle=None):
    kw = dict(viewport={"width": w, "height": h})
    if phone: kw.update(device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
    c = b.new_context(**kw)
    if angle is not None: c.add_init_script("Object.defineProperty(screen,'orientation',{configurable:true,get(){return {angle:%d,type:'x',addEventListener(){}}}})" % angle)
    if MOCK: mock_ntfy.install(c)
    return c
POS = "()=>__tank.food.map(p=>+(p.x/innerWidth).toFixed(2))"
def feeds(tank, can, tag, action, times=3):
    xs = []
    for i in range(times):
        tank.evaluate("()=>{__tank.food.length=0;__tank.fish.forEach(f=>f.hunger=100)}")
        action(i)
        wait(tank, "()=>__tank.food.length>0", 8); tank.wait_for_timeout(250)
        xs.append(tank.evaluate(POS)); can.wait_for_timeout(1100)
    flat = [x for r in xs for x in r]
    return {"per_send": xs, "min": min(flat) if flat else None, "max": max(flat) if flat else None,
            "mean": round(statistics.mean(flat), 2) if flat else None, "left_third": sum(x < 1/3 for x in flat), "mid_third": sum(1/3 <= x < 2/3 for x in flat), "right_third": sum(x >= 2/3 for x in flat)}
ORI = "([b,g])=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:0,beta:b,gamma:g}))"
SHAKE = "()=>window.dispatchEvent(new DeviceMotionEvent('devicemotion',{acceleration:{x:22,y:9,z:6},accelerationIncludingGravity:{x:22,y:18,z:6},interval:16}))"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    # ---------- 1. clean profile: empty tank + hint ----------
    tctx = mk(b, 1280, 800, False); tank = tctx.new_page(); hook(tank, "tank")
    toasts = []
    tank.expose_function("__toastSpy", lambda s: toasts.append(s))
    tank.add_init_script("new MutationObserver(()=>{const t=document.getElementById('toast');if(t&&t.textContent)window.__toastSpy(t.textContent)}).observe(document,{subtree:true,childList:true,characterData:true})")
    tank.goto(url); tank.wait_for_timeout(5200)
    R["empty"] = tank.evaluate("()=>({fish:__tank.fish.length,decor:__tank.decor.length,bubbles:__tank.bubbles.length,saved_fish:JSON.parse(localStorage.getItem('fishtank.v1')).fish.length,hint_btn_on_screen:[...document.querySelectorAll('button')].some(b=>b.offsetParent&&/加魚/.test(b.innerText))})")
    R["empty_hint_toasts"] = sorted(set(toasts))
    tank.screenshot(path=f"{SH}/v13-empty.png")
    # ---------- 2. phone feeds spread (desktop landscape tank 1280x800) ----------
    tank.click("#bMenu"); tank.wait_for_timeout(150); tank.click("#bCan"); tank.wait_for_timeout(600)
    link = tank.evaluate("()=>__tank.canLink()")
    tank.click("#bMenu"); tank.wait_for_timeout(200)
    res = {}
    for name, (w, h, ang, held) in {"phone_portrait": (390, 844, 0, (30, 4)), "phone_landscape": (844, 390, 90, (0, -80))}.items():
        cctx = mk(b, w, h, True, ang); can = cctx.new_page(); hook(can, name); can.goto(link)
        res[name + "_connected_s"] = wait(can, "()=>window.__can&&__can.ready", 20)
        can.tap("#start"); can.wait_for_timeout(300)
        can.evaluate(ORI, list(held)); can.wait_for_timeout(100)   # held normally (landscape: gamma ≈ -80°, the old far-left case)
        res[name + "_tilt_state"] = can.evaluate("()=>({motionOn:__can.motionOn,tiltX:__can.tiltX,pouring:__can.pouring})")
        res[name + "_button"] = feeds(tank, can, name, lambda i: can.tap("#bFeed"))
        res[name + "_shake"] = feeds(tank, can, name, lambda i: can.evaluate(SHAKE), 2)
        cctx.close(); tank.wait_for_timeout(1500)
    # deliberate sideways pour steers (landscape phone, screen angle 90): beta ±30 = right/left edge down, gamma 30 = tipped forward
    cctx = mk(b, 844, 390, True, 90); can = cctx.new_page(); hook(can, "pour"); can.goto(link); wait(can, "()=>window.__can&&__can.ready", 20)
    can.tap("#start"); can.wait_for_timeout(300)
    for side, beta in (("pour_right", 30), ("pour_left", -30)):
        tank.evaluate("()=>{__tank.food.length=0}")
        can.evaluate(ORI, [beta, 30]); st = can.evaluate("()=>({tiltX:__can.tiltX,pouring:__can.pouring})")
        wait(tank, "()=>__tank.food.length>=3", 8); can.evaluate(ORI, [0, -80]); tank.wait_for_timeout(600)
        xs = tank.evaluate(POS); res[side] = {"state": st, "x": xs, "mean": round(statistics.mean(xs), 2) if xs else None}
        can.wait_for_timeout(1200)
    tank.wait_for_timeout(300); tank.evaluate("()=>{__tank.food.length=0}")
    can.tap("#bFeed"); wait(tank, "()=>__tank.food.length>0", 8); tank.wait_for_timeout(900)
    tank.screenshot(path=f"{SH}/v13-feed.png")
    cctx.close()
    R["desktop_tank_1280x800"] = res
    # ---------- 3. iPhone landscape tank 844x390 ----------
    t2ctx = mk(b, 844, 390, True); t2 = t2ctx.new_page(); hook(t2, "tank844"); t2.goto(url); t2.wait_for_timeout(3500)
    t2.evaluate("()=>{__tank.setMenu(true);__tank.openCanPanel()}"); t2.wait_for_timeout(500); link2 = t2.evaluate("()=>__tank.canLink()"); t2.evaluate("()=>{__tank.setMenu(false)}"); t2.click("#bMenu"); t2.click("#bMenu")
    cctx = mk(b, 844, 390, True, 90); can = cctx.new_page(); hook(can, "can->844"); can.goto(link2); wait(can, "()=>window.__can&&__can.ready", 20)
    can.tap("#start"); can.evaluate(ORI, [0, -80]); can.wait_for_timeout(200)
    R["iphone_landscape_tank_844x390"] = {"button": feeds(t2, can, "844", lambda i: can.tap("#bFeed")), "shake": feeds(t2, can, "844", lambda i: can.evaluate(SHAKE), 2)}
    t2.evaluate("()=>{__tank.food.length=0}"); can.tap("#bFeed"); wait(t2, "()=>__tank.food.length>0", 8); t2.wait_for_timeout(900)
    t2.screenshot(path=f"{SH}/v13-feed-iphone-landscape.png")
    cctx.close(); t2ctx.close()
    # ---------- 4. 生物 / 佈置 as separate ≡ entries (iPhone 390x844 and desktop) ----------
    for tag, (w, h, phone) in {"phone": (390, 844, True), "desktop": (1280, 800, False)}.items():
        c = mk(b, w, h, phone); pg = c.new_page(); hook(pg, "menu-" + tag); pg.goto(url); pg.wait_for_timeout(3800)
        tap = pg.tap if phone else pg.click
        tap("#bMenu"); pg.wait_for_timeout(200)
        r = {"menu_items": pg.evaluate("()=>[...document.querySelectorAll('#bar button')].filter(b=>b.offsetParent).map(b=>b.innerText.trim())")}
        tap("#bLife"); pg.wait_for_timeout(300)
        r["life_open"] = pg.evaluate("()=>({tab:__tank.edit&&__tank.edit.tab,picker:getComputedStyle(document.getElementById('ePalC')).display,decorPal:getComputedStyle(document.getElementById('ePalD')).display,decorTab:getComputedStyle(document.getElementById('eTabD')).display,menuBtn:getComputedStyle(document.getElementById('bMenu')).display,names_in_picker:/[\\u4e00-\\u9fff]/.test(document.getElementById('ePalC').innerText),picker_count:document.querySelectorAll('#ePalC button[data-sp]').length})")
        n0 = pg.evaluate("()=>__tank.fish.length")
        tap("#ePalC button[data-sp='clown']"); pg.wait_for_timeout(120)
        r["fish_added"] = pg.evaluate("()=>__tank.fish.length") - n0
        r["new_fish_enters_from_edge"] = pg.evaluate("()=>{const f=__tank.fish[__tank.fish.length-1];return {enter:f.enter,x:Math.round(f.x),W:innerWidth}}")
        pg.wait_for_timeout(1500); pg.screenshot(path=f"{SH}/v13-creatures{'' if phone else '-desktop'}.png")
        pg.wait_for_timeout(7500); r["no_auto_close_after_9s"] = pg.evaluate("()=>!!__tank.edit")
        tap("#bMenu"); pg.wait_for_timeout(250); r["menu_btn_closes_life"] = pg.evaluate("()=>!__tank.edit&&!document.body.classList.contains('menu')")
        r["hint_gone_after_fish"] = pg.evaluate("()=>__tank.fish.length>0")
        tap("#bMenu"); pg.wait_for_timeout(200); tap("#bDecor"); pg.wait_for_timeout(300)
        r["decor_open"] = pg.evaluate("()=>({tab:__tank.edit&&__tank.edit.tab,picker:getComputedStyle(document.getElementById('ePalC')).display,decorPal:getComputedStyle(document.getElementById('ePalD')).display,lifeTab:getComputedStyle(document.getElementById('eTabC')).display})")
        IDX = pg.evaluate("()=>{let bi=0,bd=1e9;__tank.decor.forEach((d,i)=>{const v=Math.abs(d.x-innerWidth/2);if(d.type!=='rock'&&v<bd){bd=v;bi=i}});return bi}")
        d = pg.evaluate("(i)=>{const d=__tank.decor[i];const b=__tank.rockBox(d);return {x:d.x,cy:(b.y0+b.y1)/2}}", IDX)
        S = "()=>__tank.edit.sel?+(__tank.edit.sel.s||1).toFixed(3):null"
        if phone:
            pg.evaluate("(i)=>__tank.selectDecor(__tank.decor[i])", IDX); pg.wait_for_timeout(150)
            s0 = pg.evaluate(S); btns = pg.evaluate("()=>[...document.querySelectorAll('#eSel button')].map(b=>b.innerText.trim())")
            plus = pg.locator("#eSel button", has_text="＋").first
            if plus.count(): plus.tap(); pg.wait_for_timeout(150)
            r["resize"] = {"start": s0, "after_plus": pg.evaluate(S), "sel_buttons": btns}
        else:
            pg.mouse.click(d["x"], d["cy"]); pg.wait_for_timeout(200); s0 = pg.evaluate(S); pg.mouse.move(d["x"], d["cy"])
            for _ in range(5): pg.mouse.wheel(0, -100); pg.wait_for_timeout(60)
            s1 = pg.evaluate(S)
            h_ = pg.evaluate("()=>__tank.handlePos(__tank.edit.sel)"); pg.mouse.move(h_["x"], h_["y"]); pg.mouse.down(); pg.mouse.move(h_["x"] + 40, h_["y"] - 60, steps=8); pg.mouse.up(); pg.wait_for_timeout(150)
            r["resize"] = {"start": s0, "after_wheel_up": s1, "after_handle_drag": pg.evaluate(S)}
        pg.screenshot(path=f"{SH}/v13-decor{'' if phone else '-desktop'}.png")
        pg.wait_for_timeout(8500); r["decor_no_auto_close"] = pg.evaluate("()=>!!__tank.edit")
        tap("#bMenu"); pg.wait_for_timeout(250); r["menu_btn_closes_decor"] = pg.evaluate("()=>!__tank.edit")
        R["menus_" + tag] = r; c.close()
    # ---------- 5. ten new creatures ----------
    c = mk(b, 1280, 800, False); pg = c.new_page(); hook(pg, "new"); pg.goto(url); pg.wait_for_timeout(3800)
    pg.click("#bMenu"); pg.wait_for_timeout(150); pg.click("#bLife"); pg.wait_for_timeout(250)
    for k in NEW:
        pg.click(f"#ePalC button[data-sp='{k}']"); pg.wait_for_timeout(60); pg.click(f"#ePalC button[data-sp='{k}']"); pg.wait_for_timeout(60)
    pg.evaluate("()=>__tank.fish.forEach(f=>{f.growth=0.9})")
    pg.wait_for_timeout(9000)
    R["new_counts"] = pg.evaluate("(ks)=>Object.fromEntries(ks.map(k=>[k,__tank.fish.filter(f=>f.sp===k).length]))", NEW)
    R["new_positions"] = pg.evaluate("(ks)=>Object.fromEntries(ks.map(k=>{const f=__tank.fish.find(f=>f.sp===k);return [k,{x:+(f.x/innerWidth).toFixed(2),y:+((f.y-__tank.geo().surfaceY)/(__tank.geo().sandY-__tank.geo().surfaceY)).toFixed(2),mode:f.mode||'',face:f.face}]}))", NEW)
    pg.screenshot(path=f"{SH}/v13-new-creatures.png")
    R["picker_has_all_20"] = pg.evaluate("()=>document.querySelectorAll('#ePalC button[data-sp]').length")
    R["breed_pairs_found"] = pg.evaluate("(ks)=>ks.filter(k=>{const l=__tank.fish.filter(f=>f.sp===k);l.forEach(f=>{f.hunger=90;f.mood=90;f.sick=false;f.bt=0});return !!__tank.findPair(l,Date.now())})", NEW)
    # hunger/feeding: hungry new creatures eat
    pg.click("#bMenu"); pg.wait_for_timeout(200)
    pg.evaluate("()=>{__tank.fish.forEach(f=>{f.hunger=40});for(let i=0;i<40;i++)__tank.dropFood(innerWidth*(0.05+0.9*i/40),1)}"); pg.wait_for_timeout(14000)
    R["new_ate"] = pg.evaluate("(ks)=>ks.filter(k=>__tank.fish.some(f=>f.sp===k&&f.hunger>40))", NEW)
    # save/load
    pg.evaluate("()=>window.dispatchEvent(new Event('pagehide'))"); pg.reload(); pg.wait_for_timeout(3000)
    R["after_reload_counts"] = pg.evaluate("(ks)=>Object.fromEntries(ks.map(k=>[k,__tank.fish.filter(f=>f.sp===k).length]))", NEW)
    # pixel style renders all
    pg.evaluate("()=>__tank.setMenu(true)"); pg.click("#bStyle"); pg.wait_for_timeout(2500); pg.screenshot(path="/tmp/v13-pixel.png"); pg.click("#bStyle") if pg.is_visible("#bStyle") else None
    # 100 cap with all species
    pg.evaluate("()=>{const ks=Object.keys(__tank.S?{}:{});}")
    R["cap"] = pg.evaluate("()=>{const ks=[...document.querySelectorAll('#ePalC button[data-sp]')].map(b=>b.dataset.sp);let i=0,g=0;while(__tank.fish.length<100&&g++<400)__tank.addCreature(ks[i++%ks.length]);const r=__tank.addCreature('eel');return {count:__tank.fish.length,extra_refused:r==null}}")
    c.close()
    # ---------- 6. fps at 100 creatures (all 20 species), iPhone viewport ----------
    FPS = """(sec)=>new Promise(r=>{const ts=[];const t0=performance.now();(function k(t){ts.push(t);if(t-t0<sec*1000)requestAnimationFrame(k);else{const d=ts.slice(1).map((v,i)=>v-ts[i]).sort((a,b)=>a-b);r({fps:+(d.length/((ts[ts.length-1]-ts[0])/1000)).toFixed(1),p95_ms:+d[Math.floor(d.length*.95)].toFixed(1)})}})(t0)})"""
    for style in ("ascii", "pixel"):
        c = mk(b, 390, 844, True); pg = c.new_page(); hook(pg, "fps"); pg.goto(url); pg.wait_for_timeout(3500)
        pg.evaluate("()=>{const ks=[...document.querySelectorAll('#ePalC button[data-sp]')].map(b=>b.dataset.sp);let i=0,g=0;while(__tank.fish.length<100&&g++<400)__tank.addCreature(ks[i++%ks.length]);__tank.fish.forEach(f=>f.growth=0.5+Math.random()*0.5)}")
        if style == "pixel": pg.evaluate("()=>__tank.setMenu(true)"); pg.tap("#bStyle"); pg.evaluate("()=>__tank.setMenu(false)")
        pg.wait_for_timeout(4000)
        cdp = c.new_cdp_session(pg); cdp.send("Performance.enable")
        m0 = {x["name"]: x["value"] for x in cdp.send("Performance.getMetrics")["metrics"]}
        f = pg.evaluate(FPS, 5)
        m1 = {x["name"]: x["value"] for x in cdp.send("Performance.getMetrics")["metrics"]}
        R["fps_100_" + style] = {"count": pg.evaluate("()=>__tank.fish.length"), **f, "main_thread_ms_per_frame": round((m1["TaskDuration"] - m0["TaskDuration"]) * 1000 / max(1, f["fps"] * 5), 2)}
        c.close()
    R["ntfy_remaining_after"] = quota(); R["mock_messages"] = len(mock_ntfy.LOG)
    R["errors"] = errs
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
