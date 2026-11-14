import sys, json
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
out = "/workspace/fishtank/shots"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
R = {}
V1 = {"v":1,"t":0,"dirt":0.2,"style":"ascii","seen":3,"motion":False,"fish":[{"sp":"clown","name":"阿青","hunger":66,"mood":70,"sick":False},{"sp":"clown","name":"小藍","hunger":66,"mood":70,"sick":False},{"sp":"neon","name":"綠豆","hunger":66,"mood":70,"sick":False},{"sp":"neon","name":"薄荷","hunger":66,"mood":70,"sick":False},{"sp":"neon","name":"芽芽","hunger":66,"mood":70,"sick":False},{"sp":"puffer","name":"泡泡","hunger":66,"mood":70,"sick":False}]}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA, locale="zh-TW")
    # v1 save present before first load (migration)
    ctx.add_init_script("if(!localStorage.getItem('migrated_test')){localStorage.setItem('migrated_test','1');const s=%s;s.t=Date.now()-60e3;localStorage.setItem('fishtank.v1',JSON.stringify(s))}" % json.dumps(V1))
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: m.type == "error" and errs.append("console: " + m.text))
    pg.goto(url); pg.wait_for_timeout(1500)
    R["migrated"] = pg.evaluate("()=>{const s=JSON.parse(localStorage.getItem('fishtank.v1'));return {v:s.v,n:s.fish.length,hunger:s.fish.map(f=>Math.round(f.hunger)),growth:s.fish.map(f=>+f.growth.toFixed(2)),dirt:+s.dirt.toFixed(2),decor:s.decor&&s.decor.length}}")
    L = "()=>__tank.fish.map(f=>{const L=__tank.look(f);return [L.str,+L.scale.toFixed(2),L.color]})"
    R["look_before"] = pg.evaluate(L)
    # growth: simulate ~4 days of good care in hourly steps
    pg.evaluate("()=>{for(let h=0;h<110;h++){__tank.fish.forEach(f=>{f.hunger=100;f.mood=100;f.sick=false});__tank.S().dirt=0;__tank.care(3600)}__tank.fish.forEach(f=>{f.hunger=95});__tank.S().dirt=0.05}")
    pg.wait_for_timeout(400)
    R["toast_after_growth"] = pg.inner_text("#toast")
    R["look_after"] = pg.evaluate(L)
    R["growth_after"] = pg.evaluate("()=>__tank.fish.map(f=>+f.growth.toFixed(2))")
    pg.wait_for_timeout(3000)
    pg.tap("#bInfo"); pg.wait_for_timeout(200); R["panel"] = pg.inner_text("#panel").split("\n")[:3]; pg.screenshot(path=f"{out}/t9_panel_v2.png"); pg.tap("#panel")
    # partial growth via offline time: set one fish mid-way, check stage boundaries
    # ---- edit mode ----
    g = pg.evaluate("()=>__tank.geo()")
    n0 = pg.evaluate("()=>__tank.decor.length")
    cdp = ctx.new_cdp_session(pg)
    def touch(kind, x=None, y=None):
        cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [] if kind == "touchEnd" else [{"x": x, "y": y}]})
    def drag(x0, y0, x1, y1, steps=12):
        touch("touchStart", x0, y0); pg.wait_for_timeout(60)
        for i in range(1, steps + 1):
            touch("touchMove", x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); pg.wait_for_timeout(16)
        pg.wait_for_timeout(80); touch("touchEnd"); pg.wait_for_timeout(200)
    def ctap(x, y):
        touch("touchStart", x, y); pg.wait_for_timeout(50); touch("touchEnd"); pg.wait_for_timeout(50)
    pg.tap("#bDecor"); pg.wait_for_timeout(200)
    R["edit_on"] = pg.evaluate("()=>!!__tank.edit")
    fish_food0 = pg.evaluate("()=>__tank.food.length")
    def free_x():
        return pg.evaluate("""(y)=>{for(let x=30;x<360;x+=6){if(!__tank.decor.some(d=>{const b=__tank.rockBox(d);return x>=b.x0-10&&x<=b.x1+10&&y>=b.y0-10&&y<=b.y1+10}))return x}return 20}""", g["sandY"] - 10)
    pg.tap("#eRock")
    x1 = free_x(); ctap(x1, g["sandY"] - 10); pg.wait_for_timeout(250)
    x2 = free_x(); ctap(x2, g["sandY"] - 10); pg.wait_for_timeout(250)
    pg.tap("#eWeed")
    x3 = free_x(); ctap(x3, g["sandY"] - 10); pg.wait_for_timeout(500)
    R["placed"] = pg.evaluate("()=>__tank.decor.length") - n0
    R["food_while_edit"] = pg.evaluate("()=>__tank.food.length") - fish_food0
    R["types_last3"] = pg.evaluate("()=>__tank.decor.slice(-3).map(d=>d.type+(d.type==='rock'?d.v:''))")
    pg.screenshot(path=f"{out}/v2-edit.png")
    # move the first new rock
    rock = pg.evaluate("()=>{const d=__tank.decor[__tank.decor.length-3];return {x:d.x,type:d.type}}")
    target = 340 if rock["x"] < 200 else 40
    drag(rock["x"], g["sandY"] - 8, target, g["sandY"] - 60)
    R["moved_rock"] = pg.evaluate("()=>{const d=__tank.decor.filter(d=>d.type==='rock');return d.map(r=>Math.round(r.x))}"); R["moved_target"] = target
    # long-press removes the new weed
    wx = pg.evaluate("()=>__tank.decor[__tank.decor.length-1].x")
    n1 = pg.evaluate("()=>__tank.decor.length")
    touch("touchStart", wx, g["sandY"] - 20); pg.wait_for_timeout(750); touch("touchEnd"); pg.wait_for_timeout(200)
    R["longpress_removed"] = n1 - pg.evaluate("()=>__tank.decor.length")
    # drag the second rock to trash
    r2 = pg.evaluate("()=>{const d=__tank.decor.filter(d=>d.type==='rock');return d[d.length-1].x}")
    tb = pg.evaluate("()=>{const r=document.getElementById('eTrash').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}")
    n2 = pg.evaluate("()=>__tank.decor.length")
    drag(r2, g["sandY"] - 8, tb[0], tb[1], 20)
    R["trash_removed"] = n2 - pg.evaluate("()=>__tank.decor.length")
    # add a few more for the final layout
    pg.tap("#eRock")
    R["final_taps"]=[]
    for xx in range(3):
        ctap(free_x(), g["sandY"] - 15); pg.wait_for_timeout(150)
        R["final_taps"].append(pg.evaluate("()=>[__tank.decor.length, JSON.stringify(__tank.edit), document.getElementById('toast').textContent]"))
    pg.tap("#eDone"); pg.wait_for_timeout(200)
    R["edit_off"] = not pg.evaluate("()=>!!__tank.edit")
    layout = pg.evaluate("()=>__tank.decor.map(d=>[d.type,+d.fx.toFixed(2),d.v])")
    ctap(195, 400); pg.wait_for_timeout(100)
    R["knock_after_edit"] = pg.evaluate("()=>__tank.fish.some(f=>f.startle>0)")
    pg.reload(); pg.wait_for_timeout(1500)
    layout2 = pg.evaluate("()=>__tank.decor.map(d=>[d.type,+d.fx.toFixed(2),d.v])")
    R["layout_persisted"] = layout == layout2; R["L1"]=layout; R["L2"]=layout2; R["layout_n"] = len(layout2); R["rocks"] = sum(1 for d in layout2 if d[0] == "rock")
    R["growth_persisted"] = pg.evaluate("()=>__tank.fish.map(f=>+f.growth.toFixed(2))")
    pg.wait_for_timeout(4500)
    pg.screenshot(path=f"{out}/v2.png")
    pg.tap("#bStyle"); pg.wait_for_timeout(800); pg.screenshot(path=f"{out}/v2-pixel.png"); pg.tap("#bStyle")
    # baby look screenshot for comparison
    pg.evaluate("()=>__tank.fish.forEach((f,i)=>{f.growth=[0.05,0.5,0.05,0.5,0.9,0.05][i];f.lastStage=9})"); pg.wait_for_timeout(800); pg.screenshot(path=f"{out}/v2-stages.png")
    R["errors"] = errs
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
