# frame cost with 17 vs 100 creatures, iPhone viewport, CPU throttled 4x to approximate a phone
import sys, json
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
FPS = """(sec)=>new Promise(r=>{const ts=[];const t0=performance.now();(function k(t){ts.push(t);if(t-t0<sec*1000)requestAnimationFrame(k);else{const d=ts.slice(1).map((v,i)=>v-ts[i]).sort((a,b)=>a-b);r({fps:+(d.length/((ts[ts.length-1]-ts[0])/1000)).toFixed(1),p95_ms:+d[Math.floor(d.length*.95)].toFixed(1)})}})(t0)})"""
R = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for n in (17, 100):
        for style in ("ascii", "pixel"):
            ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
            pg = ctx.new_page(); pg.goto(url); pg.wait_for_timeout(4000)
            pg.evaluate("(n)=>{const ks=['clown','neon','puffer','shrimp','crab','turtle','angel','betta','jelly'];let i=0;while(__tank.fish.length<n){if(!__tank.addCreature(ks[i++%ks.length]))break}}", n)
            if style == "pixel": pg.evaluate("()=>{__tank.setMenu(true)}"); pg.tap("#bStyle"); pg.evaluate("()=>__tank.setMenu(false)")
            pg.wait_for_timeout(5000)
            cdp = ctx.new_cdp_session(pg); cdp.send("Performance.enable"); cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
            pg.wait_for_timeout(1500)
            m0 = {x["name"]: x["value"] for x in cdp.send("Performance.getMetrics")["metrics"]}
            f = pg.evaluate(FPS, 5)
            m1 = {x["name"]: x["value"] for x in cdp.send("Performance.getMetrics")["metrics"]}
            frames = f["fps"] * 5
            R[f"{n}_{style}"] = {"count": pg.evaluate("()=>__tank.fish.length"), **f,
                                  "main_thread_ms_per_frame": round((m1["TaskDuration"] - m0["TaskDuration"]) * 1000 / frames, 2)}
            ctx.close()
    b.close()
print(json.dumps(R, indent=1))
