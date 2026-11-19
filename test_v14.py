# v14: ≡ → 重新開缸 with two in-app confirmations (runs with seed_classic so the tank starts with 17 creatures)
import sys, json, time
import seed_classic  # noqa: F401  (classic save seeded only when none exists; MOCK=1 keeps ntfy off the box allowance)
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
SH = "/workspace/fishtank/shots"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
R = {}; errs = []
ST = "()=>({fish:__tank.fish.length,saved:JSON.parse(localStorage.getItem('fishtank.v1')||'{\"fish\":[]}').fish.length,dlg:document.getElementById('dlg').classList.contains('on'),msg:document.getElementById('dlgMsg').innerText,yes:document.getElementById('dlgYes').innerText})"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for tag, (w, h, phone) in {"phone": (390, 844, True), "desktop": (1280, 800, False)}.items():
        kw = dict(viewport={"width": w, "height": h})
        if phone: kw.update(device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
        c = b.new_context(**kw); pg = c.new_page()
        pg.on("pageerror", lambda e: errs.append(f"{tag}: {e}")); pg.on("console", lambda m: m.type == "error" and errs.append(f"{tag}: {m.text}"))
        toasts = []; pg.expose_function("__toastSpy", lambda s: toasts.append(s))
        pg.add_init_script("new MutationObserver(()=>{const t=document.getElementById('toast');if(t&&t.textContent)window.__toastSpy(t.textContent)}).observe(document,{subtree:true,childList:true,characterData:true})")
        tap = pg.tap if phone else pg.click
        pg.goto(url); pg.wait_for_timeout(3800)
        r = {"start": pg.evaluate(ST)}
        tap("#bMenu"); pg.wait_for_timeout(200)
        r["last_menu_item"] = pg.evaluate("()=>[...document.querySelectorAll('#bar button')].filter(b=>b.offsetParent).pop().innerText")
        tap("#bReset"); pg.wait_for_timeout(250); r["step1"] = pg.evaluate(ST)
        r["dialog_glow"] = pg.evaluate("()=>{const s=getComputedStyle(document.querySelector('#dlg .box'));return s.boxShadow+'|'+s.textShadow}")
        if phone: pg.screenshot(path=f"{SH}/v14-confirm1.png")
        tap("#dlgNo"); pg.wait_for_timeout(250); r["cancel1"] = pg.evaluate(ST)
        tap("#bMenu"); pg.wait_for_timeout(200); tap("#bReset"); pg.wait_for_timeout(200); tap("#dlgYes"); pg.wait_for_timeout(250)
        r["step2"] = pg.evaluate(ST); r["step2_danger"] = pg.evaluate("()=>document.getElementById('dlgYes').classList.contains('danger')")
        if phone: pg.screenshot(path=f"{SH}/v14-confirm2.png")
        tap("#dlgNo"); pg.wait_for_timeout(250); r["cancel2"] = pg.evaluate(ST)
        pg.reload(); pg.wait_for_timeout(3000); r["after_cancels_reload"] = pg.evaluate(ST)
        tap("#bMenu"); pg.wait_for_timeout(200); tap("#bReset"); pg.wait_for_timeout(200); tap("#dlgYes"); pg.wait_for_timeout(250)
        toasts.clear()
        with pg.expect_navigation(): tap("#dlgYes")
        pg.wait_for_timeout(5200)
        r["after_reset"] = pg.evaluate("()=>{const s=JSON.parse(localStorage.getItem('fishtank.v1'));return {fish:__tank.fish.length,saved:s.fish.length,decor:__tank.decor.length,dirt:s.dirt}}")
        r["hint"] = sorted(set(toasts))
        if phone: pg.screenshot(path=f"{SH}/v14-after.png")
        pg.reload(); pg.wait_for_timeout(2500); r["still_empty_after_reload"] = pg.evaluate("()=>__tank.fish.length") == 0
        R[tag] = r; c.close()

    # ---------- pebbles + log ----------
    FPS = """(sec)=>new Promise(r=>{const ts=[];const t0=performance.now();(function k(t){ts.push(t);if(t-t0<sec*1000)requestAnimationFrame(k);else{const d=ts.slice(1).map((v,i)=>v-ts[i]).sort((a,b)=>a-b);r({fps:+(d.length/((ts[ts.length-1]-ts[0])/1000)).toFixed(1),p95_ms:+d[Math.floor(d.length*.95)].toFixed(1)})}})(t0)})"""
    for tag, (w, h, phone) in {"phone": (390, 844, True), "desktop": (1280, 800, False)}.items():
        kw = dict(viewport={"width": w, "height": h})
        if phone: kw.update(device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
        c = b.new_context(**kw); pg = c.new_page()
        pg.on("pageerror", lambda e: errs.append(f"peb-{tag}: {e}")); pg.on("console", lambda m: m.type == "error" and errs.append(f"peb-{tag}: {m.text}"))
        pg.goto(url); pg.wait_for_timeout(3500)
        pg.evaluate("()=>{['crab','starfish','snail','shrimp'].forEach(k=>__tank.addCreature(k))}"); pg.wait_for_timeout(6000)
        r = {"bottom_creatures": pg.evaluate("()=>__tank.fish.filter(f=>['crab','starfish','snail','shrimp'].includes(f.sp)).map(f=>({sp:f.sp,y_above_sand:Math.round(__tank.geo().sandY-f.y)}))")}
        r["pebble_px"] = pg.evaluate("()=>{const c=document.getElementById('c'),g=c.getContext('2d'),y=Math.round((__tank.geo().sandY+20)*devicePixelRatio);const d=g.getImageData(0,y,c.width,1).data;let w=0,n=0;for(let i=0;i<d.length;i+=4){n++;if(d[i]>120&&d[i+1]>120&&d[i+2]>120&&Math.abs(d[i]-d[i+2])<40)w++}return {whiteish_frac:+(w/n).toFixed(3)}}")
        pg.screenshot(path=f"{SH}/v14-pebbles{'' if phone else '-desktop'}.png")
        pg.evaluate("()=>__tank.setMenu(true)"); (pg.tap if phone else pg.click)("#bStyle"); pg.evaluate("()=>__tank.setMenu(false)"); pg.wait_for_timeout(1200)
        pg.screenshot(path=f"/tmp/v14-pebbles-pixel-{tag}.png")
        pg.evaluate("()=>__tank.setMenu(true)"); (pg.tap if phone else pg.click)("#bStyle"); pg.evaluate("()=>__tank.setMenu(false)"); pg.wait_for_timeout(500)
        if not phone:
            # log: pick from 佈置, place, wheel + handle resize, drag, save/reload
            pg.click("#bMenu"); pg.wait_for_timeout(150); pg.click("#bDecor"); pg.wait_for_timeout(300)
            r["log_button"] = pg.evaluate("()=>{const b=document.querySelector('#ePalD button[data-type=log]');return b&&b.innerText}")
            pg.click("#ePalD button[data-type=log]"); pg.wait_for_timeout(100)
            n0 = pg.evaluate("()=>__tank.decor.length")
            gy = pg.evaluate("()=>__tank.geo().sandY-6")
            gx = pg.evaluate("(y)=>{let best=640,bd=-1;for(let x=120;x<innerWidth-120;x+=10){let m=1e9;for(const d of __tank.decor){const b=__tank.rockBox(d);m=Math.min(m,Math.abs(x-(b.x0+b.x1)/2)-(b.x1-b.x0)/2)}if(m>bd){bd=m;best=x}}return best}", gy)   # emptiest spot
            pg.mouse.click(gx, gy); pg.wait_for_timeout(600)
            r["log_added"] = pg.evaluate("()=>__tank.decor.length") - n0
            pg.evaluate("()=>{const d=__tank.decor.filter(d=>d.type==='log').pop();__tank.selectDecor(d)}"); pg.wait_for_timeout(150)
            S = "()=>+(__tank.edit.sel.s||1).toFixed(3)"
            bx = pg.evaluate("()=>{const b=__tank.rockBox(__tank.edit.sel);return {x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2}}")
            s0 = pg.evaluate(S); pg.mouse.move(bx["x"], bx["y"])
            for _ in range(4): pg.mouse.wheel(0, -100); pg.wait_for_timeout(60)
            s1 = pg.evaluate(S)
            hp = pg.evaluate("()=>__tank.handlePos(__tank.edit.sel)"); pg.mouse.move(hp["x"], hp["y"]); pg.mouse.down(); pg.mouse.move(hp["x"] + 40, hp["y"] - 50, steps=8); pg.mouse.up(); pg.wait_for_timeout(150)
            s2 = pg.evaluate(S)
            pg.locator("#eSel button", has_text="−").first.click(); pg.wait_for_timeout(120); s3 = pg.evaluate(S)
            r["log_resize"] = {"start": s0, "wheel_up": s1, "handle_drag": s2, "minus": s3, "len_buttons": pg.evaluate("()=>!!document.querySelector('#eSel button[data-len]')")}
            bx = pg.evaluate("()=>{const b=__tank.rockBox(__tank.edit.sel);return {x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2}}")
            x_before = pg.evaluate("()=>Math.round(__tank.edit.sel.x)")
            pg.mouse.move(bx["x"], bx["y"]); pg.mouse.down(); pg.mouse.move(bx["x"] - 200, bx["y"], steps=12); pg.mouse.up(); pg.wait_for_timeout(500)
            r["log_dragged_px"] = pg.evaluate("()=>Math.round(__tank.decor.filter(d=>d.type==='log').pop().x)") - x_before
            pg.screenshot(path=f"{SH}/v14-log.png")
            pg.click("#bMenu"); pg.wait_for_timeout(300)
            saved = pg.evaluate("()=>JSON.parse(localStorage.getItem('fishtank.v1')).decor.filter(d=>d.type==='log')")
            pg.reload(); pg.wait_for_timeout(3000)
            r["log_saved"] = saved; r["log_after_reload"] = pg.evaluate("()=>__tank.decor.filter(d=>d.type==='log').map(d=>({s:d.s,x:Math.round(d.x)}))")
            pg.evaluate("()=>__tank.setMenu(true)"); pg.click("#bStyle"); pg.evaluate("()=>__tank.setMenu(false)"); pg.wait_for_timeout(1200)
            pg.screenshot(path="/tmp/v14-log-pixel.png"); pg.evaluate("()=>__tank.setMenu(true)"); pg.click("#bStyle"); pg.evaluate("()=>__tank.setMenu(false)")
        R["pebbles_" + tag] = r; c.close()
    for style in ("ascii", "pixel"):
        c = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA); pg = c.new_page()
        pg.on("pageerror", lambda e: errs.append(f"fps: {e}"))
        pg.goto(url); pg.wait_for_timeout(3500)
        pg.evaluate("()=>{const ks=[...document.querySelectorAll('#ePalC button[data-sp]')].map(b=>b.dataset.sp);let i=0,g=0;while(__tank.fish.length<100&&g++<400)__tank.addCreature(ks[i++%ks.length]);}")
        if style == "pixel": pg.evaluate("()=>__tank.setMenu(true)"); pg.tap("#bStyle"); pg.evaluate("()=>__tank.setMenu(false)")
        pg.wait_for_timeout(4000)
        R["fps_100_" + style] = {"count": pg.evaluate("()=>__tank.fish.length"), **pg.evaluate(FPS, 5)}
        c.close()
    R["errors"] = errs; b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
