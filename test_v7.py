import sys, json, time
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
R = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=user-gesture-required"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.goto(url); pg.wait_for_timeout(4000)
    R["version"] = pg.evaluate("()=>[...document.scripts].map(s=>s.src).find(s=>s.includes('app.js'))")
    R["default_sound"] = pg.evaluate("()=>__tank.S().sound")
    R["before_tap_ctx"] = pg.evaluate("()=>__tank.snd.ctx ? __tank.snd.ctx.state : null")
    cdp = ctx.new_cdp_session(pg)
    def ctap(x, y):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]}); pg.wait_for_timeout(50)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); pg.wait_for_timeout(80)
    ctap(200, 420); pg.wait_for_timeout(1800)
    meter = """()=>new Promise(r=>{const s=__tank.snd,ac=s.ctx,a=ac.createAnalyser();a.fftSize=2048;s.master.connect(a);
      const buf=new Float32Array(a.fftSize);let peak=0,sum=0,n=0;const t0=performance.now();
      (function k(){a.getFloatTimeDomainData(buf);for(const v of buf){peak=Math.max(peak,Math.abs(v));sum+=v*v;n++}
        if(performance.now()-t0<2500)setTimeout(k,40);else{s.master.disconnect(a);r({rms:+Math.sqrt(sum/n).toFixed(4),peak:+peak.toFixed(3)})}})()})"""
    R["after_tap"] = pg.evaluate("()=>{const s=__tank.snd;return {state:s.ctx.state,master:+s.master.gain.value.toFixed(2),flowNodes:!!(s.flow&&s.flow.src&&s.flow.lp&&s.flow.g),lfo:!!s.lfo,bloopTimer:!!s.nextBloop}}")
    R["level_on"] = pg.evaluate(meter)
    # bloop on knock / feed
    pg.evaluate("()=>{__tank.snd.lastBloop=0}"); ctap(120, 500); pg.wait_for_timeout(100)
    R["bloop_on_tap"] = pg.evaluate("()=>performance.now()-__tank.snd.lastBloop<600")
    pg.evaluate("()=>{__tank.snd.lastBloop=0}"); pg.tap("#bFeed"); pg.wait_for_timeout(100)
    R["bloop_on_feed"] = pg.evaluate("()=>performance.now()-__tank.snd.lastBloop<600")
    R["feed_pellets"] = pg.evaluate("()=>__tank.food.length")
    # --- panel toggles ---
    pg.tap("#bInfo"); pg.wait_for_timeout(250)
    R["labels"] = [pg.inner_text("#pAuto"), pg.inner_text("#pSound")]
    R["same_row"] = pg.evaluate("()=>Math.abs(document.getElementById('pAuto').getBoundingClientRect().top-document.getElementById('pSound').getBoundingClientRect().top)<2")
    R["btn_glow"] = pg.evaluate("()=>{const s=getComputedStyle(document.getElementById('pSound'));return s.boxShadow+'|'+s.textShadow}")
    pg.screenshot(path="/workspace/fishtank/shots/v7-status.png")
    pg.tap("#pSound"); pg.wait_for_timeout(600)
    R["off"] = pg.evaluate("()=>({label:document.getElementById('pSound').innerText,state:__tank.snd.ctx.state,gain:+__tank.snd.master.gain.value.toFixed(3),panelOpen:getComputedStyle(document.getElementById('panel')).display})")
    pg.reload(); pg.wait_for_timeout(1500); ctap(200, 420); pg.wait_for_timeout(500)
    R["off_after_reload"] = pg.evaluate("()=>({saved:__tank.S().sound,ctx:__tank.snd.ctx?__tank.snd.ctx.state:null})")
    pg.tap("#bInfo"); pg.wait_for_timeout(200); R["label_after_reload"] = pg.inner_text("#pSound")
    pg.tap("#pSound"); pg.wait_for_timeout(1600)
    R["on_again"] = pg.evaluate("()=>({label:document.getElementById('pSound').innerText,state:__tank.snd.ctx.state,gain:+__tank.snd.master.gain.value.toFixed(2)})")
    pg.tap("#panel"); pg.wait_for_timeout(200)
    # visibility: hidden -> suspended, visible -> running
    pg.evaluate("()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))}"); pg.wait_for_timeout(500)
    R["hidden_state"] = pg.evaluate("()=>__tank.snd.ctx.state")
    pg.evaluate("()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))}"); pg.wait_for_timeout(800)
    R["visible_state"] = pg.evaluate("()=>__tank.snd.ctx.state")
    # animation + auto-feed still work
    pos0 = pg.evaluate("()=>__tank.fish.map(f=>[f.x,f.y])"); pg.wait_for_timeout(3000); pos1 = pg.evaluate("()=>__tank.fish.map(f=>[f.x,f.y])")
    R["animation_moving"] = sum(abs(a[0]-c[0])+abs(a[1]-c[1]) > 2 for a, c in zip(pos0, pos1))
    pg.evaluate("()=>{__tank.setAutoFeed(true);__tank.food.length=0;__tank.S().autoT=0;__tank.fish.forEach(f=>f.hunger=25)}"); pg.wait_for_timeout(3000)
    R["autofeed_pellets"] = pg.evaluate("()=>__tank.food.length")
    pg.evaluate("()=>__tank.setAutoFeed(false)")
    R["errors"] = errs
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
