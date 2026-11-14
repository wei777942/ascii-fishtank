import sys, json
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
IOS_SHIM = """(()=>{window.__permCalls=0;window.__iosGranted=false;let inG=false;
  for(const ev of ['pointerdown','pointerup','click','touchend']) window.addEventListener(ev,()=>{inG=true;setTimeout(()=>inG=false,0)},true);
  DeviceMotionEvent.requestPermission=()=>{window.__permCalls++; if(window.__iosGranted) return Promise.resolve('granted'); if(!inG) return Promise.reject(new DOMException('needs gesture','NotAllowedError')); window.__iosGranted=true; return Promise.resolve('granted')};
  DeviceOrientationEvent.requestPermission=()=>Promise.resolve('granted');})()"""
R = {}
def tiltev(pg, gamma):
    pg.evaluate("(g)=>{if(window.__iosGranted===false)return;window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:0,beta:60,gamma:g}));window.dispatchEvent(new DeviceMotionEvent('devicemotion',{acceleration:{x:0,y:0,z:0},accelerationIncludingGravity:{x:g/10,y:-9,z:0}}))}", gamma)
def state(pg): return pg.evaluate("()=>__tank.tilt")
def stream(pg, gamma, ms):
    for _ in range(ms // 100): tiltev(pg, gamma); pg.wait_for_timeout(100)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for mode in ("ios", "plain"):
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
        ctx.add_init_script("document.addEventListener('DOMContentLoaded',()=>{document.body.classList.add('menu');window.__menuPin=1})")  # v8: buttons live behind ≡; pin the menu open for older tests
        if mode == "ios": ctx.add_init_script(IOS_SHIM)
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
        pg.goto(url); pg.wait_for_timeout(1500)
        r = {"label0": pg.inner_text("#bTilt"), "visible": pg.is_visible("#bTilt")}
        stream(pg, 35, 600); r["before_enable_x"] = round(state(pg)["x"], 2)
        if mode == "ios" or not state(pg)["on"]:
            pg.tap("#bTilt"); pg.wait_for_timeout(300)
        r["label_on"] = pg.inner_text("#bTilt")
        stream(pg, 35, 1500); s1 = state(pg); r["on_tilt_x"] = round(s1["x"], 2); r["on_slosh"] = round(s1["slosh"], 3)
        fx0 = pg.evaluate("()=>__tank.fish.reduce((a,f)=>a+f.x,0)/__tank.fish.length")
        stream(pg, 35, 2000)
        r["fish_drift_right"] = round(pg.evaluate("()=>__tank.fish.reduce((a,f)=>a+f.x,0)/__tank.fish.length") - fx0, 1)
        pg.tap("#bTilt"); pg.wait_for_timeout(100); r["label_off"] = pg.inner_text("#bTilt")
        stream(pg, 35, 2500); s2 = state(pg); r["off_tilt_x"] = round(s2["x"], 3); r["off_slosh"] = round(s2["slosh"], 4)
        if mode == "ios":
            pg.screenshot(path="/tmp/tilt_off.png")
            # turn back on, reload: iOS shim forgets permission -> should show 點此啟用, then first tap re-enables
            pg.tap("#bTilt"); pg.wait_for_timeout(200); r["label_on_again"] = pg.inner_text("#bTilt")
            pg.reload(); pg.wait_for_timeout(1500)
            r["dbg_reload"] = pg.evaluate("()=>({t:__tank.tilt, g:window.__iosGranted, calls:window.__permCalls, act:navigator.userActivation&&navigator.userActivation.isActive})")
            r["after_reload_label"] = pg.inner_text("#bTilt"); r["pref_saved"] = pg.evaluate("()=>JSON.parse(localStorage.getItem('fishtank.v1')).tiltOn")
            stream(pg, -35, 600); r["reload_not_reacting_yet"] = round(state(pg)["x"], 2)
            pg.touchscreen.tap(200, 400); pg.wait_for_timeout(300)
            r["after_first_touch_label"] = pg.inner_text("#bTilt")
            stream(pg, -35, 1500); r["after_regrant_x"] = round(state(pg)["x"], 2)
            pg.evaluate("()=>__tank.fish.forEach((f,i)=>{f.growth=[1,0.55,0.95,0.2,0.85][i%5];f.lastStage=9})")
            stream(pg, -30, 5000)
            pg.screenshot(path="/workspace/fishtank/shots/v4.png")
            # off persists across reload
            pg.tap("#bTilt"); pg.wait_for_timeout(100); pg.reload(); pg.wait_for_timeout(1200)
            r["off_after_reload_label"] = pg.inner_text("#bTilt")
        r["errors"] = errs
        R[mode] = r
        ctx.close()
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
