import sys, json, math
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
R = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
    ctx.add_init_script("document.addEventListener('DOMContentLoaded',()=>{document.body.classList.add('menu');window.__menuPin=1})")  # v8: buttons live behind ≡; pin the menu open for older tests
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    # count non-zero shadowBlur / glow-like CSS
    pg.add_init_script("""(()=>{window.__blur=0;const d=Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype,'shadowBlur');
      Object.defineProperty(CanvasRenderingContext2D.prototype,'shadowBlur',{set(v){if(v>0)window.__blur++;d.set.call(this,v)},get(){return d.get.call(this)}});})()""")
    pg.goto(url); pg.wait_for_timeout(5000)
    cdp = ctx.new_cdp_session(pg)
    def ctap(x, y, hold=50):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]}); pg.wait_for_timeout(hold)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); pg.wait_for_timeout(80)
    R["css_glow"] = pg.evaluate("()=>[...document.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e);return (s.textShadow&&s.textShadow!=='none')||(s.boxShadow&&s.boxShadow!=='none')}).map(e=>e.id||e.tagName)")
    g = pg.evaluate("()=>__tank.geo()")
    # ---- add jellyfish via 生物 tab ----
    pg.evaluate("()=>{const T=__tank;while(T.fish.length>14)T.removeCreature(T.fish[T.fish.length-1])}")
    pg.tap("#bDecor"); pg.wait_for_timeout(150); pg.tap("#eTabC"); pg.wait_for_timeout(150)
    n0 = pg.evaluate("()=>__tank.fish.length")
    pg.click("#ePalC button[data-sp='jelly']"); pg.wait_for_timeout(100); pg.click("#ePalC button[data-sp='jelly']")
    R["jelly_added"] = pg.evaluate("()=>__tank.fish.length") - n0
    # ---- add each new plant type ----
    pg.tap("#eTabD"); pg.wait_for_timeout(150)
    pg.evaluate("()=>{__tank.decor.filter(d=>d.type==='weed').slice(3).forEach(d=>d.fx=-1)}")  # keep layout manageable
    placed = {}
    xs = {"kelp": 70, "coral": 150, "grass": 225, "anemone": 305}
    for tp, x in xs.items():
        pg.click(f"#ePalD button[data-type='{tp}']"); pg.wait_for_timeout(60)
        before = pg.evaluate("()=>__tank.decor.length")
        # avoid tapping an existing item
        fx = pg.evaluate("""([x,y])=>{for(let d=0;d<200;d+=8)for(const s of [1,-1]){const xx=x+s*d;if(xx<15||xx>375)continue;if(!__tank.decor.some(o=>{const b=__tank.rockBox(o);return xx>=b.x0-8&&xx<=b.x1+8&&y>=b.y0-8&&y<=b.y1+8}))return xx}return x}""", [x, g["sandY"] - 10])
        ctap(fx, g["sandY"] - 10)
        placed[tp] = pg.evaluate("()=>__tank.decor.length") - before
    R["plants_placed"] = placed
    # select the kelp: resize + length
    k = pg.evaluate("()=>{const d=__tank.decor.find(d=>d.type==='kelp');return [d.x,d.n,d.s]}")
    ctap(k[0], g["sandY"] - 30)
    R["kelp_selected"] = pg.evaluate("()=>__tank.edit.sel&&__tank.edit.sel.type")
    R["sel_label"] = pg.inner_text("#eSel") if pg.is_visible("#eSel") else ""
    if R["kelp_selected"] == "kelp":
        pg.click("#eSel button[data-size='1.4']"); [pg.click("#eSel button[data-len='1']") for _ in range(3)]
    R["kelp_after"] = pg.evaluate("()=>{const d=__tank.decor.find(d=>d.type==='kelp');return [d.n,d.s]}"); R["kelp_before"] = k
    # anemone length down
    a = pg.evaluate("()=>__tank.decor.find(d=>d.type==='anemone').x")
    ctap(330, g["sandY"] - 300); ctap(a, g["sandY"] - 12)
    if pg.evaluate("()=>__tank.edit.sel&&__tank.edit.sel.type") == "anemone": pg.click("#eSel button[data-len='-1']")
    R["anemone_n"] = pg.evaluate("()=>__tank.decor.find(d=>d.type==='anemone').n")
    # delete the grass via 刪除
    gx = pg.evaluate("()=>__tank.decor.find(d=>d.type==='grass').x")
    ctap(330, g["sandY"] - 300); ctap(gx, g["sandY"] - 6)
    R["grass_sel"] = pg.evaluate("()=>__tank.edit.sel&&__tank.edit.sel.type")
    if R["grass_sel"] == "grass": pg.click("#eSel button[data-del]")
    R["grass_deleted"] = not pg.evaluate("()=>__tank.decor.some(d=>d.type==='grass')")
    pg.click("#ePalD button[data-type='grass']"); ctap(330, g["sandY"] - 300)
    ctap(pg.evaluate("""(y)=>{for(let x=20;x<370;x+=6){if(!__tank.decor.some(o=>{const b=__tank.rockBox(o);return x>=b.x0-8&&x<=b.x1+8}))return x}return 200}""", g["sandY"]), g["sandY"] - 8)
    pg.wait_for_timeout(300)
    pg.screenshot(path="/workspace/fishtank/shots/v5-edit.png")
    pg.tap("#eDone"); pg.wait_for_timeout(200)
    # glyph check: each plant produces glyphs and they move (sway)
    gl = "()=>__tank.decor.filter(d=>['kelp','coral','grass','anemone'].includes(d.type)).map(d=>d.type)"
    R["plant_types_now"] = pg.evaluate(gl)
    L = "()=>({d:__tank.decor.map(d=>[d.type,+d.fx.toFixed(2),+(d.s||1).toFixed(2),d.n]),f:__tank.fish.map(f=>f.sp)})"
    before = pg.evaluate(L); pg.reload(); pg.wait_for_timeout(1500); after = pg.evaluate(L)
    R["persisted"] = before == after
    # jellyfish motion: pulses up then sinks
    pg.wait_for_timeout(4000); ys = []
    for _ in range(70):
        ys.append(pg.evaluate("()=>__tank.fish.filter(f=>f.sp==='jelly').map(f=>Math.round(f.y))")); pg.wait_for_timeout(150)
    j0 = [y[0] for y in ys]
    R["jelly_y_range"] = [min(j0), max(j0)]; R["jy"] = j0
    R["jelly_went_up_and_down"] = any(j0[i+1] < j0[i] - 1 for i in range(len(j0)-1)) and any(j0[i+1] > j0[i] for i in range(len(j0)-1))
    # tap pushes jelly gently
    jx, jy = pg.evaluate("()=>{const f=__tank.fish.find(f=>f.sp==='jelly');return [f.x,f.y]}")
    ctap(jx - 25 if jx > 60 else jx + 25, jy); pg.wait_for_timeout(500)
    jx2 = pg.evaluate("()=>__tank.fish.find(f=>f.sp==='jelly').x")
    R["jelly_pushed_dx"] = round(jx2 - jx, 1)
    # jelly eats food it touches
    pg.evaluate("()=>{const f=__tank.fish.find(f=>f.sp==='jelly');f.hunger=40;__tank.fish.forEach(o=>{if(o!==f)o.hunger=100});__tank.food.push({x:f.x,y:f.y,vy:0,ph:0,age:0,settled:false})}")
    pg.wait_for_timeout(600)
    R["jelly_ate"] = pg.evaluate("()=>Math.round(__tank.fish.find(f=>f.sp==='jelly').hunger)") > 40
    # grown jellyfish + new plants screenshot
    pg.evaluate("()=>{__tank.fish.forEach((f,i)=>{f.growth=f.sp==='jelly'?(i%2?1:0.5):[1,0.55,0.95,0.2][i%4];f.lastStage=9});__tank.S().dirt=0}")
    pg.wait_for_timeout(5000)
    pg.screenshot(path="/workspace/fishtank/shots/v5-new.png")
    pg.screenshot(path="/workspace/fishtank/shots/v5.png")
    pg.tap("#bStyle"); pg.wait_for_timeout(800); pg.screenshot(path="/workspace/fishtank/shots/v5-pixel.png"); pg.tap("#bStyle")
    R["shadowBlur_nonzero_sets"] = pg.evaluate("()=>window.__blur")
    R["errors"] = errs
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
