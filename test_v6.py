import sys, json, time
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
R = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.add_init_script("""(()=>{window.__blur=0;const d=Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype,'shadowBlur');
      Object.defineProperty(CanvasRenderingContext2D.prototype,'shadowBlur',{set(v){if(v>0)window.__blur++;d.set.call(this,v)},get(){return d.get.call(this)}});})()""")
    pg.goto(url); pg.wait_for_timeout(4500)
    R["version"] = pg.evaluate("()=>[...document.scripts].map(s=>s.src).find(s=>s.includes('app.js'))")
    R["default_off"] = pg.evaluate("()=>__tank.S().autoFeed")
    # --- toggle in 狀態 panel ---
    pg.tap("#bInfo"); pg.wait_for_timeout(200)
    R["label_off"] = pg.inner_text("#pAuto")
    pg.tap("#pAuto"); pg.wait_for_timeout(200)
    R["panel_still_open"] = pg.evaluate("()=>getComputedStyle(document.getElementById('panel')).display") == "block"
    R["label_on"] = pg.inner_text("#pAuto")
    R["btn_glow"] = pg.evaluate("()=>{const s=getComputedStyle(document.getElementById('pAuto'));return s.boxShadow+'|'+s.textShadow}")
    pg.wait_for_timeout(2200)
    pg.screenshot(path="/workspace/fishtank/shots/v6-status.png")
    pg.tap("#pAuto"); pg.wait_for_timeout(150); R["label_off_again"] = pg.inner_text("#pAuto")
    pg.tap("#pAuto"); pg.wait_for_timeout(150)
    pg.reload(); pg.wait_for_timeout(1500)
    R["persisted_on"] = pg.evaluate("()=>__tank.S().autoFeed")
    pg.tap("#bInfo"); pg.wait_for_timeout(200); R["label_after_reload"] = pg.inner_text("#pAuto"); pg.tap("#panel"); pg.wait_for_timeout(200)
    # --- live auto feed: force hunger low ---
    pg.wait_for_timeout(2500)
    pg.evaluate("()=>{__tank.food.length=0;__tank.S().autoT=0;__tank.fish.forEach(f=>{f.hunger=25})}")
    t0 = time.time(); fired = False
    while time.time() - t0 < 5:
        if pg.evaluate("()=>__tank.food.length") > 0: fired = True; break
        pg.wait_for_timeout(100)
    R["pellets_dropped"] = pg.evaluate("()=>__tank.food.length")
    R["toast"] = pg.inner_text("#toast")
    pg.wait_for_timeout(900)
    pg.screenshot(path="/workspace/fishtank/shots/v6.png")
    pos0 = pg.evaluate("()=>__tank.fish.map(f=>[f.x,f.y])")
    pg.wait_for_timeout(12000)
    pos1 = pg.evaluate("()=>__tank.fish.map(f=>[f.x,f.y])")
    R["animation_moving"] = sum(abs(a[0]-b2[0])+abs(a[1]-b2[1]) > 2 for a, b2 in zip(pos0, pos1))
    R["avg_hunger_after_eating"] = pg.evaluate("()=>Math.round(__tank.fish.reduce((a,f)=>a+f.hunger,0)/__tank.fish.length)")
    R["food_left"] = pg.evaluate("()=>__tank.food.length")
    # cooldown: still hungry-ish but must not fire again immediately
    pg.evaluate("()=>{__tank.food.length=0;__tank.fish.forEach(f=>{f.hunger=25})}"); pg.wait_for_timeout(3500)
    R["cooldown_no_respam"] = pg.evaluate("()=>__tank.food.length") == 0
    # manual feeding still works
    pg.tap("#bFeed"); pg.wait_for_timeout(200); R["manual_feed_pellets"] = pg.evaluate("()=>__tank.food.length")
    # --- offline sim: 20h away ---
    def offline(on, hours=20):
        global pg
        st = pg.evaluate("()=>JSON.stringify(__tank.S())"); pg.close()
        st = json.loads(st); st["autoFeed"] = on; st["dirt"] = 0.1; st["t"] = int(time.time()*1000) - hours*3600*1000
        for f in st["fish"]: f["hunger"] = 90; f["sick"] = False
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
        pg.add_init_script("localStorage.setItem('fishtank.v1', %s)" % json.dumps(json.dumps(st)))
        pg.goto(url); pg.wait_for_timeout(1200)
        return pg.evaluate("()=>({min:Math.round(Math.min(...__tank.fish.map(f=>f.hunger))),avg:Math.round(__tank.fish.reduce((a,f)=>a+f.hunger,0)/__tank.fish.length),sick:__tank.fish.filter(f=>f.sick).length,dirt:+__tank.S().dirt.toFixed(2),feeds:__tank.autoFeeds})")
    R["shadowBlur_nonzero_sets"] = pg.evaluate("()=>window.__blur")
    R["offline_20h_on"] = offline(True)
    pg.wait_for_timeout(3500); R["offline_toast"] = pg.inner_text("#toast")
    R["offline_20h_off"] = offline(False)
    pg.wait_for_timeout(3500); R["offline_toast_off"] = pg.inner_text("#toast")
    R["errors"] = errs
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
