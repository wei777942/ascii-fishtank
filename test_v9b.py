# v9: single school, breeding, 100 cap + FPS, desktop resize (mouse), creature picker pictures
import sys, json, time
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
R = {}; errs = []
def hook(pg):
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
def iphone(b, init=None):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
    if init: ctx.add_init_script(init)
    pg = ctx.new_page(); hook(pg); return ctx, pg
def saved(fish, **kw):
    st = {"v": 3, "decor": None, "t": int(time.time()*1000), "dirt": 0.05, "style": "ascii", "seen": 1, "motion": False, "starter3": True, "fish": fish}
    st.update(kw); return "if(!sessionStorage.__seeded){sessionStorage.__seeded=1;localStorage.setItem('fishtank.v1',%s)}" % json.dumps(json.dumps(st))
FPS = """(sec)=>new Promise(r=>{const ts=[];const t0=performance.now();(function k(t){ts.push(t);if(t-t0<sec*1000)requestAnimationFrame(k);else{const d=ts.slice(1).map((v,i)=>v-ts[i]).sort((a,b)=>a-b);r({fps:+(d.length/((ts[ts.length-1]-ts[0])/1000)).toFixed(1),p50_ms:+d[Math.floor(d.length*.5)].toFixed(1),p95_ms:+d[Math.floor(d.length*.95)].toFixed(1)})}})(t0)})"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    # ---- 1. single school: migration merges groups; adding twice joins the same flock ----
    mins = [{"sp": "minnow", "name": "群魚", "grp": g, "hunger": 80, "mood": 75, "sick": False, "growth": 0.3} for g in (1, 2) for _ in range(6)]
    ctx, pg = iphone(b, saved(mins + [{"sp": "clown", "name": "阿青", "hunger": 80, "mood": 75, "sick": False, "growth": 0.3}]))
    pg.goto(url); pg.wait_for_timeout(1500)
    R["migrated_groups"] = pg.evaluate("()=>[...new Set(__tank.fish.filter(f=>f.sp==='minnow').map(f=>f.grp))]")
    pg.evaluate("()=>{__tank.addCreature('minnow');}"); pg.wait_for_timeout(1500); pg.evaluate("()=>{__tank.addCreature('minnow');}")
    R["school_groups_after_add"] = pg.evaluate("()=>[...new Set(__tank.fish.filter(f=>f.sp==='minnow').map(f=>f.grp))]")
    R["school_size"] = pg.evaluate("()=>__tank.fish.filter(f=>f.sp==='minnow').length")
    R["school_keys"] = pg.evaluate("()=>Object.keys(__tank.schools).filter(k=>k.startsWith('minnow'))")
    spread = "()=>{const m=__tank.fish.filter(f=>f.sp==='minnow'),cx=m.reduce((a,f)=>a+f.x,0)/m.length,cy=m.reduce((a,f)=>a+f.y,0)/m.length;const d=m.map(f=>Math.hypot(f.x-cx,f.y-cy)).sort((a,b)=>a-b);return {median:Math.round(d[Math.floor(d.length/2)]),max:Math.round(d[d.length-1])}}"
    R["school_spread_t2s"] = pg.evaluate(spread); pg.wait_for_timeout(15000); R["school_spread_t17s"] = pg.evaluate(spread)
    ctx.close()
    # ---- 2. breeding ----
    adults = [{"sp": "clown", "name": n, "hunger": 90, "mood": 90, "sick": False, "growth": 1} for n in ("阿青", "小藍")] + [{"sp": "betta", "name": "阿鬥", "hunger": 90, "mood": 90, "sick": False, "growth": 1}]
    ctx, pg = iphone(b, saved(adults, breedT=int(time.time()*1000)+3600e3, breed=True))
    pg.goto(url); pg.wait_for_timeout(3500)
    R["breed_default_on"] = pg.evaluate("()=>__tank.S().breed")
    pg.evaluate("()=>{const c=__tank.fish.filter(f=>f.sp==='clown');c[0].x=60;c[0].y=250;c[1].x=330;c[1].y=600;__tank.S().breedT=0}")
    n0 = pg.evaluate("()=>__tank.fish.length"); t0 = time.time(); met = None
    while time.time() - t0 < 45:
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>__tank.fish.length") > n0: met = round(time.time() - t0, 1); break
    R["pair_met_and_bred_after_s"] = met
    R["hearts_shown"] = pg.evaluate("()=>__tank.hearts.length") > 0
    pg.wait_for_timeout(300); pg.screenshot(path="/workspace/fishtank/shots/v9-breed.png")
    kids = pg.evaluate("()=>__tank.fish.slice(3).map(f=>({sp:f.sp,growth:+f.growth.toFixed(2),stage:f.growth<0.35?'幼魚':'?'}))")
    R["babies"] = kids; R["babies_1_to_3"] = 1 <= len(kids) <= 3
    R["toast"] = pg.inner_text("#toast")
    R["parent_cooldown_h"] = pg.evaluate("()=>__tank.fish.filter(f=>f.sp==='clown'&&f.growth===1).map(f=>Math.round((f.bt-Date.now())/3600e3))")
    R["next_pair_gap_h"] = pg.evaluate("()=>+((__tank.S().breedT-Date.now())/3600e3).toFixed(1)")
    # no repeat right away (global + per-creature cooldown)
    pg.evaluate("()=>{__tank.fish.forEach(f=>{f.hunger=90;f.mood=90})}"); n1 = pg.evaluate("()=>__tank.fish.length"); pg.wait_for_timeout(4000)
    R["no_rebreed_during_cooldown"] = pg.evaluate("()=>__tank.fish.length") == n1
    # toggle off in 狀態
    pg.evaluate("()=>__tank.setMenu(true)"); pg.wait_for_timeout(150); pg.tap("#bInfo"); pg.wait_for_timeout(200)
    R["breed_label"] = pg.inner_text("#pBreed"); pg.tap("#pBreed"); pg.wait_for_timeout(200); R["breed_label_off"] = pg.inner_text("#pBreed")
    pg.screenshot(path="/workspace/fishtank/shots/v9-status-breed.png")
    pg.reload(); pg.wait_for_timeout(1200); R["breed_off_persisted"] = pg.evaluate("()=>__tank.S().breed") is False
    ctx.close()
    # ---- 3. no babies at the cap (100) + FPS with 100 creatures ----
    ctx, pg = iphone(b, saved(adults, breedT=0, breed=True))
    pg.goto(url); pg.wait_for_timeout(3000)
    pg.evaluate("""()=>{const sp=Object.keys(__tank.S().fish.reduce((a,f)=>a,{}));const ks=['clown','neon','puffer','shrimp','crab','turtle','angel','betta','jelly'];let i=0;
      while(__tank.fish.length<100){const k=ks[i++%ks.length];if(!__tank.addCreature(k))break}}""")
    pg.wait_for_timeout(500)
    R["count_at_cap"] = pg.evaluate("()=>__tank.fish.length")
    R["add_refused_at_cap"] = pg.evaluate("()=>__tank.addCreature('clown')") is None
    pg.evaluate("()=>{__tank.fish.forEach(f=>{f.growth=1;f.hunger=95;f.mood=95;f.bt=0;f.sick=false});__tank.S().breedT=0;const c=__tank.fish.filter(f=>f.sp==='clown');c[1].x=c[0].x+5;c[1].y=c[0].y}")
    pg.wait_for_timeout(4000)
    R["no_babies_at_cap"] = pg.evaluate("()=>__tank.fish.length") == 100
    pg.wait_for_timeout(6000)
    R["fps_100_ascii"] = pg.evaluate(FPS, 6)
    pg.screenshot(path="/workspace/fishtank/shots/v9-100.png")
    pg.evaluate("()=>__tank.setMenu(true)"); pg.tap("#bStyle"); pg.wait_for_timeout(1500)
    R["fps_100_pixel"] = pg.evaluate(FPS, 6)
    pg.tap("#bStyle"); pg.wait_for_timeout(300)
    R["bubbles_at_100"] = pg.evaluate("()=>__tank.bubbles.length")
    ctx.close()
    # baseline fps with ~17
    ctx, pg = iphone(b); pg.goto(url); pg.wait_for_timeout(6000); R["fps_default_tank"] = pg.evaluate(FPS, 5); R["default_count"] = pg.evaluate("()=>__tank.fish.length"); ctx.close()
    # ---- 4. offline breeding is capped ----
    many = [{"sp": sp, "name": sp + str(i), "hunger": 95, "mood": 95, "sick": False, "growth": 1} for sp in ("clown", "angel", "betta", "turtle", "puffer") for i in range(2)]
    ctx, pg = iphone(b, saved(many, breedT=0, breed=True, autoFeed=True, t=int(time.time()*1000) - 96 * 3600e3))
    pg.goto(url); pg.wait_for_timeout(1500)
    R["offline_96h_babies"] = pg.evaluate("()=>__tank.fish.length") - len(many)
    pg.wait_for_timeout(3000); R["offline_toast"] = pg.inner_text("#toast")
    ctx.close()
    ctx, pg = iphone(b, saved(many, breedT=0, breed=False, autoFeed=True, t=int(time.time()*1000) - 96 * 3600e3))
    pg.goto(url); pg.wait_for_timeout(1200); R["offline_babies_when_off"] = pg.evaluate("()=>__tank.fish.length") - len(many); ctx.close()
    # ---- 5. creature picker: pictures only ----
    ctx, pg = iphone(b); pg.goto(url); pg.wait_for_timeout(4000)
    pg.evaluate("()=>{__tank.setMenu(true);__tank.enterEdit();__tank.setTab('life')}"); pg.wait_for_timeout(400)
    R["picker"] = pg.evaluate("""()=>{const labels=['水母','小丑魚','霓虹燈魚','河豚','蝦子','螃蟹','群魚','烏龜','神仙魚','鬥魚'];const bs=[...document.querySelectorAll('#ePalC button')];
      return {n:bs.length,has_names:bs.some(b=>labels.some(l=>b.innerText.includes(l))),min_w:Math.min(...bs.map(b=>b.getBoundingClientRect().width)),min_h:Math.min(...bs.map(b=>b.getBoundingClientRect().height)),coloured:bs.every(b=>b.querySelector('span[style*=color]'))}}""")
    pg.screenshot(path="/workspace/fishtank/shots/v9-creatures.png")
    pg.click("#ePalC button[data-sp='clown']"); pg.wait_for_timeout(200); R["add_toast"] = pg.inner_text("#toast")
    f = pg.evaluate("()=>{const f=__tank.fish[__tank.fish.length-1];return [f.x,f.y]}")
    pg.evaluate("()=>__tank.selectFish(__tank.fish[__tank.fish.length-1])"); pg.wait_for_timeout(150); R["sel_label"] = pg.inner_text("#eSel")
    ctx.close()
    # ---- 6. desktop: mouse wheel / corner handle / buttons / mouse drag ----
    ctx = b.new_context(viewport={"width": 1280, "height": 800}); pg = ctx.new_page(); hook(pg)
    pg.goto(url); pg.wait_for_timeout(4000)
    pg.click("#bMenu"); pg.wait_for_timeout(150); pg.click("#bDecor"); pg.wait_for_timeout(300)
    # pick a plant in the middle of the tank (desktop tanks are already full of 水草)
    IDX = pg.evaluate("()=>{let bi=0,bd=1e9;__tank.decor.forEach((d,i)=>{const v=Math.abs(d.x-innerWidth/2);if(d.type!=='rock'&&v<bd){bd=v;bi=i}});return bi}")
    d = pg.evaluate("(i)=>{const d=__tank.decor[i];const b=__tank.rockBox(d);return {x:d.x,cy:(b.y0+b.y1)/2,s:d.s}}", IDX)
    pg.mouse.click(d["x"], d["cy"]); pg.wait_for_timeout(200)
    R["desk_selected"] = pg.evaluate("()=>__tank.edit.sel&&__tank.edit.sel.type")
    S = "()=>+(__tank.edit.sel.s||1).toFixed(3)"
    s0 = pg.evaluate(S); pg.mouse.move(d["x"], d["cy"]); 
    for _ in range(5): pg.mouse.wheel(0, -100); pg.wait_for_timeout(60)
    s1 = pg.evaluate(S)
    for _ in range(4): pg.mouse.wheel(0, 100); pg.wait_for_timeout(60)
    s2 = pg.evaluate(S)
    for _ in range(40): pg.mouse.wheel(0, -200)
    pg.wait_for_timeout(100); smax = pg.evaluate(S)
    for _ in range(60): pg.mouse.wheel(0, 200)
    pg.wait_for_timeout(100); smin = pg.evaluate(S)
    R["wheel"] = {"start": s0, "up": s1, "down": s2, "max_clamp": smax, "min_clamp": smin}
    pg.evaluate("()=>__tank.setDecorSize(__tank.edit.sel,1)"); pg.wait_for_timeout(100)
    h = pg.evaluate("()=>__tank.handlePos(__tank.edit.sel)")
    pg.mouse.move(h["x"], h["y"]); pg.mouse.down(); pg.mouse.move(h["x"] + 40, h["y"] - 60, steps=8); pg.mouse.up(); pg.wait_for_timeout(150)
    s_big = pg.evaluate(S)
    h = pg.evaluate("()=>__tank.handlePos(__tank.edit.sel)")
    pg.mouse.move(h["x"], h["y"]); pg.mouse.down(); pg.mouse.move(h["x"] - 25, h["y"] + 70, steps=8); pg.mouse.up(); pg.wait_for_timeout(150)
    R["handle_drag"] = {"after_drag_out": s_big, "after_drag_in": pg.evaluate(S), "still_selected": pg.evaluate("()=>!!__tank.edit.sel")}
    pg.click("#eSel button[data-size]:last-of-type") if False else None
    sizes = pg.evaluate("()=>[...document.querySelectorAll('#eSel button[data-size]')].map(b=>[b.innerText,b.dataset.size])")
    out = {}
    for lb, v in sizes:
        pg.click(f"#eSel button[data-size='{v}']"); pg.wait_for_timeout(80); out[lb] = pg.evaluate(S)
    pg.click("#eSel button[data-step='0.15']"); pg.wait_for_timeout(80); out["＋"] = pg.evaluate(S)
    pg.click("#eSel button[data-step='-0.15']"); pg.click("#eSel button[data-step='-0.15']"); pg.wait_for_timeout(80); out["−−"] = pg.evaluate(S)
    n0 = pg.evaluate("()=>__tank.edit.sel.n"); pg.click("#eSel button[data-len='1']"); pg.click("#eSel button[data-len='1']"); out["長x2"] = [n0, pg.evaluate("()=>__tank.edit.sel.n")]
    pg.click("#eSel button[data-len='-1']"); out["短"] = pg.evaluate("()=>__tank.edit.sel.n")
    R["buttons"] = out
    R["buttons_visible"] = pg.evaluate("()=>[...document.querySelectorAll('#eSel button')].every(b=>{const r=b.getBoundingClientRect();return r.width>=24&&r.height>=24&&getComputedStyle(b).visibility!=='hidden'})")
    # mouse drag to move
    pg.evaluate("()=>__tank.setDecorSize(__tank.edit.sel,1.3)")
    d = pg.evaluate("()=>{const d=__tank.edit.sel;const b=__tank.rockBox(d);return {x:d.x,cy:(b.y0+b.y1)/2+10}}")
    pg.mouse.move(d["x"], d["cy"]); pg.mouse.down(); pg.mouse.move(d["x"] - 150, d["cy"], steps=10); pg.mouse.up(); pg.wait_for_timeout(200)
    R["mouse_drag_moved_px"] = round(d["x"] - pg.evaluate("(i)=>__tank.decor[i].x", IDX))
    d = pg.evaluate("(i)=>{const d=__tank.decor[i];const b=__tank.rockBox(d);return {x:d.x,cy:(b.y0+b.y1)/2}}", IDX)
    pg.mouse.click(d["x"], d["cy"]); pg.wait_for_timeout(300)
    pg.screenshot(path="/workspace/fishtank/shots/v9-desktop-resize.png")
    pg.click("#eDone"); pg.wait_for_timeout(200)
    pg.reload(); pg.wait_for_timeout(1200)
    R["desk_size_persisted"] = pg.evaluate("(i)=>+(__tank.decor[i].s).toFixed(2)", IDX)
    ctx.close()
    R["errors"] = errs
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
