import sys, json, math
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
out = "/workspace/fishtank/shots"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
R = {}
V2 = {"v": 2, "t": 0, "dirt": 0.1, "style": "ascii", "seen": 5, "motion": False,
      "fish": [{"sp": s, "name": n, "hunger": 70, "mood": 70, "sick": False, "growth": g} for s, n, g in
               [("clown", "阿青", 0.5), ("clown", "小藍", 0.4), ("neon", "綠豆", 0.3), ("neon", "薄荷", 0.3), ("neon", "芽芽", 0.3), ("puffer", "泡泡", 0.8)]],
      "decor": [{"type": "weed", "fx": 0.1, "n": 9, "v": 0, "back": False}, {"type": "rock", "fx": 0.5, "n": 0, "v": 1, "back": False},
                {"type": "weed", "fx": 0.75, "n": 6, "v": 0, "back": True}, {"type": "weed", "fx": 0.9, "n": 11, "v": 0, "back": False}]}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA, locale="zh-TW")
    ctx.add_init_script("if(!localStorage.getItem('mig3')){localStorage.setItem('mig3','1');const s=%s;s.t=Date.now()-30e3;localStorage.setItem('fishtank.v1',JSON.stringify(s))}" % json.dumps(V2))
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: m.type == "error" and errs.append("console: " + m.text))
    pg.goto(url); pg.wait_for_timeout(1200)
    R["migrated"] = pg.evaluate("()=>{const s=JSON.parse(localStorage.getItem('fishtank.v1'));return {v:s.v,n:s.fish.length,sp:[...new Set(s.fish.map(f=>f.sp))],oldKept:s.fish.slice(0,6).map(f=>f.name+':'+f.growth),decor:s.decor.map(d=>d.type+':'+d.s+':'+d.n)}}")
    pg.wait_for_timeout(8000)
    cdp = ctx.new_cdp_session(pg)
    def touch(kind, pts):
        cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]})
    def ctap(x, y, hold=50):
        touch("touchStart", [(x, y)]); pg.wait_for_timeout(hold); touch("touchEnd", []); pg.wait_for_timeout(60)
    def drag(x0, y0, x1, y1, steps=12):
        touch("touchStart", [(x0, y0)]); pg.wait_for_timeout(60)
        for i in range(1, steps + 1): touch("touchMove", [(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)]); pg.wait_for_timeout(16)
        pg.wait_for_timeout(60); touch("touchEnd", []); pg.wait_for_timeout(150)
    g = pg.evaluate("()=>__tank.geo()")
    # ---- each species renders & moves ----
    P = "()=>__tank.fish.map(f=>({sp:f.sp,x:f.x,y:f.y,mode:f.mode,face:f.face}))"
    a = pg.evaluate(P); pg.wait_for_timeout(2500); c = pg.evaluate(P)
    mv = {}
    for f0, f1 in zip(a, c): mv.setdefault(f0["sp"], []).append(round(math.hypot(f1["x"] - f0["x"], f1["y"] - f0["y"]), 1))
    R["moved_by_species"] = {k: max(v) for k, v in mv.items()}
    R["bottom_y"] = {f["sp"]: round(g["sandY"] - f["y"], 1) for f in c if f["sp"] in ("crab", "shrimp")}
    R["shrimp_mode"] = [f["mode"] for f in c if f["sp"] == "shrimp"]
    # shrimp flick backwards / crab scuttle on knock
    pg.evaluate("()=>{const s=__tank.fish.find(f=>f.sp==='shrimp');s.mode='walk';s.y=__tank.geo().sandY-8;s.x=200;s.face=1;s.flip=1;s.vx=0;s.vy=0;const c=__tank.fish.find(f=>f.sp==='crab');c.x=120;c.vx=0}")
    pg.wait_for_timeout(100)
    pre = pg.evaluate("()=>{const s=__tank.fish.find(f=>f.sp==='shrimp'),c=__tank.fish.find(f=>f.sp==='crab');return [s.x,s.face,c.x]}")
    ctap(240, g["sandY"] - 20)
    pg.wait_for_timeout(350)
    post = pg.evaluate("()=>{const s=__tank.fish.find(f=>f.sp==='shrimp'),c=__tank.fish.find(f=>f.sp==='crab');return [s.x,s.face,s.vy,c.x,c.startle]}")
    R["shrimp_flick"] = {"dx": round(post[0] - pre[0]), "face_kept": post[1] == pre[1], "vy": round(post[2])}
    R["crab_scuttle_dx"] = round(post[3] - pre[2])
    # feeding: bottom dwellers eat settled food
    pg.evaluate("()=>{__tank.fish.forEach(f=>{f.hunger=f.sp==='crab'||f.sp==='shrimp'?40:99});const c=__tank.fish.find(f=>f.sp==='crab');const g=__tank.geo();__tank.food.push({x:c.x+30,y:g.sandY-14,vy:0,ph:0,age:0,settled:true})}")
    R["crab_dbg0"] = pg.evaluate("()=>{const c=__tank.fish.find(f=>f.sp==='crab');return [c.x,c.y,c.startle,c.hunger,__tank.food.map(p=>[p.x,p.y])]}")
    pg.wait_for_timeout(5000)
    R["crab_dbg"] = pg.evaluate("()=>{const c=__tank.fish.find(f=>f.sp==='crab');return [c.x,c.y,c.startle,c.hunger,c.vx,__tank.food.map(p=>[p.x,p.y])]}")
    R["crab_ate"] = pg.evaluate("()=>{const c=__tank.fish.find(f=>f.sp==='crab');return Math.round(c.hunger)}") > 40
    # ---- decor size / length ----
    pg.tap("#bDecor"); pg.wait_for_timeout(200)
    w = pg.evaluate("()=>{const d=__tank.decor.find(d=>d.type==='weed'&&!d.back);return {x:d.x,n:d.n,s:d.s}}")
    # long press -> select, not delete
    n0 = pg.evaluate("()=>__tank.decor.length")
    ctap(w["x"], g["sandY"] - 15, hold=700)
    R["longpress_selects_not_deletes"] = pg.evaluate("()=>__tank.decor.length") == n0 and pg.evaluate("()=>!!__tank.edit.sel")
    R["sel_controls_visible"] = pg.is_visible("#eSel")
    pg.click("#eSel button[data-size='1.4']"); pg.wait_for_timeout(100)
    for _ in range(4): pg.click("#eSel button[data-len='1']"); pg.wait_for_timeout(50)
    R["weed_after_buttons"] = pg.evaluate("()=>{const d=__tank.edit.sel;return {s:d.s,n:d.n}}"); R["weed_before"] = w
    # rock: tap to select then pinch to enlarge
    r = pg.evaluate("()=>{const d=__tank.decor.find(d=>d.type==='rock');return {x:d.x,s:d.s}}")
    ctap(330, g["sandY"] - 200)  # empty water tap -> deselect
    R["deselected"] = pg.evaluate("()=>!__tank.edit.sel")
    R["pts_before_rock"] = pg.evaluate("(a)=>({pts:__tank.edit.pts.size, boxes:__tank.decor.map(d=>{const b=__tank.rockBox(d);return [d.type,Math.round(b.x0),Math.round(b.x1),Math.round(b.y0),Math.round(b.y1)]}), tap:a, sel:!!__tank.edit.sel, drag:!!__tank.edit.drag})", [r["x"], g["sandY"]-8])
    ctap(r["x"], g["sandY"] - 8)
    R["rock_selected"] = pg.evaluate("()=>__tank.edit.sel&&__tank.edit.sel.type")
    cx, cy = r["x"], g["sandY"] - 60
    touch("touchStart", [(cx - 20, cy), (cx + 20, cy)]); pg.wait_for_timeout(50)
    for i in range(1, 11): touch("touchMove", [(cx - 20 - 6 * i, cy), (cx + 20 + 6 * i, cy)]); pg.wait_for_timeout(16)
    touch("touchEnd", []); pg.wait_for_timeout(150)
    R["rock_after_pinch"] = pg.evaluate("()=>{const d=__tank.decor.find(d=>d.type==='rock');return +d.s.toFixed(2)}"); R["rock_before"] = r["s"]
    R["decor_count_unchanged"] = pg.evaluate("()=>__tank.decor.length") == n0
    # add a small rock too
    pg.tap("#eRock"); ctap(300, g["sandY"] - 200); fx_ = pg.evaluate("""(y)=>{for(let x=30;x<360;x+=6){if(!__tank.decor.some(d=>{const b=__tank.rockBox(d);return x>=b.x0-12&&x<=b.x1+12}))return x}return 20}""", g["sandY"]-10); ctap(fx_, g["sandY"] - 10)
    sel_new = pg.evaluate("()=>__tank.decor.length") - n0
    R["new_rock_added"] = sel_new
    # select the new rock -> 小
    nr = pg.evaluate("()=>__tank.decor[__tank.decor.length-1].x")
    ctap(nr, g["sandY"] - 8); pg.click("#eSel button[data-size='0.7']"); pg.wait_for_timeout(100)
    pg.screenshot(path=f"{out}/v3-edit-decor.png")
    # ---- creatures tab ----
    pg.tap("#eTabC"); pg.wait_for_timeout(150)
    c0 = pg.evaluate("()=>__tank.fish.length")
    pg.click("#ePalC button[data-sp='turtle']"); pg.wait_for_timeout(200)
    pg.click("#ePalC button[data-sp='minnow']"); pg.wait_for_timeout(200)
    c1 = pg.evaluate("()=>__tank.fish.length")
    R["added"] = c1 - c0
    R["poured_from_top"] = pg.evaluate("()=>__tank.fish.slice(-7).every(f=>f.y<__tank.geo().surfaceY+150)")
    for _ in range(4): pg.click("#ePalC button[data-sp='crab']"); pg.wait_for_timeout(80)
    R["cap_respected"] = pg.evaluate("()=>__tank.fish.length")
    pg.wait_for_timeout(1500)
    # select the betta by tapping it, remove
    bt = pg.evaluate("()=>{const f=__tank.fish.find(f=>f.sp==='betta');return [f.x,f.y]}")
    ctap(bt[0], bt[1])
    R["betta_selected"] = pg.evaluate("()=>__tank.edit.selF&&__tank.edit.selF.sp")
    pg.wait_for_timeout(300)
    pg.screenshot(path=f"{out}/v3-edit.png")
    if R["betta_selected"]:
        pg.click("#eSel button[data-rm]"); pg.wait_for_timeout(150)
    R["betta_removed"] = pg.evaluate("()=>!__tank.fish.some(f=>f.sp==='betta')")
    # remove one minnow school via select
    pg.evaluate("()=>{const f=__tank.fish.filter(f=>f.sp==='minnow').pop();__tank.selectFish(f)}")
    nm = pg.evaluate("()=>__tank.fish.filter(f=>f.sp==='minnow').length")
    pg.click("#eSel button[data-rm]"); pg.wait_for_timeout(150)
    R["school_removed"] = nm - pg.evaluate("()=>__tank.fish.filter(f=>f.sp==='minnow').length")
    # put betta back
    pg.click("#ePalC button[data-sp='betta']"); pg.wait_for_timeout(100)
    pg.tap("#eDone"); pg.wait_for_timeout(200)
    L = "()=>({decor:__tank.decor.map(d=>[d.type,+d.fx.toFixed(2),+(d.s||1).toFixed(2),d.n]),fish:__tank.fish.map(f=>f.sp+(f.grp?'#'+f.grp:''))})"
    before = pg.evaluate(L)
    pg.reload(); pg.wait_for_timeout(1500)
    after = pg.evaluate(L)
    R["persisted_decor"] = before["decor"] == after["decor"]; R["persisted_fish"] = sorted(before["fish"]) == sorted(after["fish"])
    R["final_counts"] = {"fish": len(after["fish"]), "decor": len(after["decor"])}
    # nice final shot: mixed growth stages
    pg.evaluate("()=>{const crabs=__tank.fish.filter(f=>f.sp==='crab');crabs.slice(2).forEach(c=>__tank.removeCreature(c));const r=__tank.decor.find(d=>d.type==='rock'&&d.s>2);if(r)__tank.setDecorSize(r,1.4);__tank.fish.forEach((f,i)=>{f.growth=[1,0.55,0.95,0.2,0.85][i%5];f.lastStage=9;f.hunger=90});__tank.S().dirt=0}")
    pg.wait_for_timeout(9000)
    pg.screenshot(path=f"{out}/v3.png")
    pg.tap("#bStyle"); pg.wait_for_timeout(900); pg.screenshot(path=f"{out}/v3-pixel.png"); pg.tap("#bStyle")
    pg.tap("#bInfo"); pg.wait_for_timeout(200); R["panel_has_school"] = "群魚 ×" in pg.inner_text("#panel"); pg.screenshot(path=f"{out}/v3-panel.png")
    R["errors"] = errs
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
