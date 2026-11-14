import sys, json
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
R = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.goto(url); pg.wait_for_timeout(4500)
    cdp = ctx.new_cdp_session(pg)
    def ctap(x, y, hold=50):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]}); pg.wait_for_timeout(hold)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); pg.wait_for_timeout(80)
    vis = "()=>{const v=id=>{const e=document.getElementById(id);return !!e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0};return {bar:v('bar'),tilt:v('bTilt'),menu:v('bMenu')}}"
    R["version"] = pg.evaluate("()=>[...document.scripts].map(s=>s.src).find(s=>s.includes('app.js'))")
    R["closed_default"] = pg.evaluate(vis)
    R["menu_glow"] = pg.evaluate("()=>{const s=getComputedStyle(document.getElementById('bMenu'));return s.boxShadow+'|'+s.textShadow}")
    pg.screenshot(path="/workspace/fishtank/shots/v8-closed.png")
    # glass tap + long-press feed while closed
    r0 = len(pg.evaluate("()=>__tank.ripples")); ctap(150, 450); R["glass_tap_closed_ripple"] = len(pg.evaluate("()=>__tank.ripples")) > r0
    pg.evaluate("()=>__tank.food.length=0"); ctap(220, 380, hold=700); pg.wait_for_timeout(100)
    R["longpress_feed_closed"] = pg.evaluate("()=>__tank.food.length")
    pg.wait_for_timeout(1200)
    # tap ≡ (real touch on its box) -> opens; must not knock
    bx = pg.evaluate("()=>{const r=document.getElementById('bMenu').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}")
    r0 = len(pg.evaluate("()=>__tank.ripples")); ctap(*bx); pg.wait_for_timeout(250)
    R["open_after_tap"] = pg.evaluate(vis)
    R["menu_tap_no_knock"] = len(pg.evaluate("()=>__tank.ripples")) == r0
    R["tilt_beside_menu"] = pg.evaluate("()=>{const a=document.getElementById('bTilt').getBoundingClientRect(),m=document.getElementById('bMenu').getBoundingClientRect();return a.right<=m.left&&Math.abs(a.top-m.top)<4}")
    pg.wait_for_timeout(400)
    pg.screenshot(path="/workspace/fishtank/shots/v8-open.png")
    # feed from menu
    pg.evaluate("()=>__tank.food.length=0"); pg.tap("#bFeed"); pg.wait_for_timeout(150)
    R["feed_from_menu"] = pg.evaluate("()=>__tank.food.length")
    R["still_open_after_feed"] = pg.evaluate(vis)["bar"]
    # glass tap while open
    r0 = len(pg.evaluate("()=>__tank.ripples")); ctap(150, 300); R["glass_tap_open_ripple"] = len(pg.evaluate("()=>__tank.ripples")) > r0
    # tap ≡ again -> hides
    ctap(*bx); pg.wait_for_timeout(250); R["closed_after_second_tap"] = pg.evaluate(vis)
    # auto-collapse after ~8s idle
    ctap(*bx); pg.wait_for_timeout(9800); R["auto_collapsed_8s"] = not pg.evaluate(vis)["bar"]
    # panel open: no collapse
    ctap(*bx); pg.wait_for_timeout(200); pg.tap("#bInfo"); pg.wait_for_timeout(9800)
    R["panel_open_keeps_menu"] = pg.evaluate(vis)["bar"] and pg.evaluate("()=>getComputedStyle(document.getElementById('panel')).display") == "block"
    pg.tap("#panel"); pg.wait_for_timeout(200)
    # edit mode: ebar usable, no collapse; ≡ hidden while editing; menu back after 完成
    pg.tap("#bDecor"); pg.wait_for_timeout(9800)
    R["edit_ebar_visible_after_10s"] = pg.evaluate("()=>getComputedStyle(document.getElementById('ebar')).display!=='none'")
    R["edit_menu_btn_hidden"] = not pg.evaluate(vis)["menu"]
    pg.tap("#eDone"); pg.wait_for_timeout(300); R["after_edit"] = pg.evaluate(vis)
    # animation moving
    pos0 = pg.evaluate("()=>__tank.fish.map(f=>[f.x,f.y])"); pg.wait_for_timeout(2500); pos1 = pg.evaluate("()=>__tank.fish.map(f=>[f.x,f.y])")
    R["animation_moving"] = sum(abs(a[0]-c[0])+abs(a[1]-c[1]) > 2 for a, c in zip(pos0, pos1))
    pg.reload(); pg.wait_for_timeout(1500); R["closed_after_reload"] = not pg.evaluate(vis)["bar"]
    R["errors"] = errs
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
