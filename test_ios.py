import sys, json, math
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
out = sys.argv[2] if len(sys.argv) > 2 else "/workspace/fishtank/shots"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
res = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA, locale="zh-TW")
    ctx.add_init_script("document.addEventListener('DOMContentLoaded',()=>{document.body.classList.add('menu');window.__menuPin=1})")  # v8: buttons live behind ≡; pin the menu open for older tests
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: m.type == "error" and errs.append("console: " + m.text))
    pg.goto(url); pg.wait_for_timeout(700)
    pg.screenshot(path=f"{out}/t0_intro.png")
    pos = lambda: pg.evaluate("()=>__tank.fish.map(f=>[+f.x.toFixed(1),+f.y.toFixed(1)])")
    pg.wait_for_timeout(3500); a = pos(); pg.screenshot(path=f"{out}/t1.png")
    pg.wait_for_timeout(1500); bpos = pos(); pg.screenshot(path=f"{out}/t2.png")
    res["moved_px"] = [round(math.hypot(x1-x0, y1-y0), 1) for (x0, y0), (x1, y1) in zip(a, bpos)]
    # knock near the middle-ish fish: tap at the first fish position
    fx, fy = bpos[0]
    tx, ty = max(30, min(360, fx + 10)), max(120, min(700, fy))
    if ty < 400: tx = min(tx, 200)   # v9: keep clear of the top-right dropdown menu
    before = pg.evaluate(f"()=>__tank.fish.map(f=>Math.hypot(f.x-{tx},f.y-{ty}))")
    pg.touchscreen.tap(tx, ty); pg.wait_for_timeout(80)
    st = pg.evaluate("()=>__tank.fish.map(f=>+f.startle.toFixed(2))")
    pg.wait_for_timeout(600)
    pg.screenshot(path=f"{out}/t3_knock.png")
    after = pg.evaluate(f"()=>__tank.fish.map(f=>Math.hypot(f.x-{tx},f.y-{ty}))")
    res["knock_startle"] = st
    res["knock_dist_before"] = [round(v) for v in before]; res["knock_dist_after"] = [round(v) for v in after]
    res["fled_count"] = sum(1 for x, y in zip(before, after) if y > x)
    # feed via button
    pg.wait_for_timeout(1500)
    pg.tap("#bFeed"); pg.wait_for_timeout(300)
    res["food_after_button"] = pg.evaluate("()=>__tank.food.length")
    def fooddist():
        return pg.evaluate("()=>{const F=__tank.food;if(!F.length)return null;return __tank.fish.map(f=>Math.min(...F.map(p=>Math.hypot(p.x-f.x,p.y-f.y))))}")
    pg.evaluate("()=>__tank.fish.forEach(f=>f.hunger=50)")
    d0 = fooddist(); pg.wait_for_timeout(1500); d1 = fooddist(); pg.screenshot(path=f"{out}/t4_feed.png")
    res["food_dist_t0"] = d0 and [round(v) for v in d0]; res["food_dist_t1"] = d1 and [round(v) for v in d1]
    pg.wait_for_timeout(5000)
    res["food_left_after_6s"] = pg.evaluate("()=>__tank.food.length")
    res["hunger_after"] = pg.evaluate("()=>__tank.fish.map(f=>Math.round(f.hunger))")
    # long-press feed with mouse-like pointer (touch long press via CDP)
    cdp = ctx.new_cdp_session(pg)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": 200, "y": 400}]})
    pg.wait_for_timeout(600)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    pg.wait_for_timeout(100)
    res["food_after_longpress"] = pg.evaluate("()=>__tank.food.length")
    # status panel
    pg.tap("#bInfo"); pg.wait_for_timeout(200); pg.screenshot(path=f"{out}/t5_panel.png")
    res["panel_text"] = pg.inner_text("#panel")[:120]
    pg.tap("#panel")
    # dirty water + change
    pg.evaluate("()=>{__tank.S().dirt=0.8}"); pg.wait_for_timeout(500); pg.screenshot(path=f"{out}/t6_dirty.png")
    pg.tap("#bWater"); pg.wait_for_timeout(3000)
    res["dirt_after_change"] = round(pg.evaluate("()=>__tank.S().dirt"), 3)
    # pixel style
    pg.tap("#bStyle"); pg.wait_for_timeout(1200); pg.screenshot(path=f"{out}/t7_pixel.png")
    pg.tap("#bStyle"); pg.wait_for_timeout(200)
    # hungry look
    pg.evaluate("()=>__tank.fish.forEach((f,i)=>{f.hunger=i<2?10:80; if(i==2){f.hunger=2;f.sick=true}})"); pg.wait_for_timeout(1200)
    pg.screenshot(path=f"{out}/t8_hungry.png")
    pg.evaluate("()=>__tank.fish.forEach(f=>{f.hunger=85;f.sick=false})"); pg.wait_for_timeout(9000)
    pg.screenshot(path=f"{out}/v1.png")
    # scroll check
    res["scrollY"] = pg.evaluate("()=>{window.scrollTo(0,500);return window.scrollY}")
    res["sw"] = pg.evaluate("()=>navigator.serviceWorker.getRegistration().then(r=>!!r)")
    res["saved"] = pg.evaluate("()=>!!localStorage.getItem('fishtank.v1')")
    res["errors"] = errs
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
