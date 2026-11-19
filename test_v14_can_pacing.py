# v14: can pacing — shake every 0.7 s before and after button taps; count relay posts per shake (mock ntfy)
import json, time, sys
sys.path.insert(0, '/workspace/fishtank')
import mock_ntfy
from playwright.sync_api import sync_playwright
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
SHAKE = "()=>window.dispatchEvent(new DeviceMotionEvent('devicemotion',{acceleration:{x:22,y:9,z:6},accelerationIncludingGravity:{x:22,y:18,z:6},interval:16}))"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    tc = b.new_context(viewport={"width": 1280, "height": 800}); mock_ntfy.install(tc); tank = tc.new_page(); tank.goto(url); tank.wait_for_timeout(3000)
    tank.evaluate("()=>{__tank.setMenu(true);__tank.openCanPanel()}"); tank.wait_for_timeout(500); link = tank.evaluate("()=>__tank.canLink()")
    tank.evaluate("()=>{window.__got=[];const o=__tank.dropFood;}")
    cc = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA); mock_ntfy.install(cc)
    can = cc.new_page(); can.goto(link); can.wait_for_timeout(1500); can.tap("#start"); can.wait_for_timeout(300)
    def phase(tag, n=24, every=700):
        out = []
        for i in range(n):
            f0 = len([1 for t, m in mock_ntfy.LOG if '"feed"' in m])
            can.evaluate(SHAKE); t0 = time.time(); can.wait_for_timeout(every)
            out.append(len([1 for t, m in mock_ntfy.LOG if '"feed"' in m]) - f0)
        return {"posts_per_shake": out, "queued": can.evaluate("()=>__can.relay.queued"), "tokens": can.evaluate("()=>__can.relay._tokens()")}
    print("before", phase("before"))
    for _ in range(3): can.tap("#bFeed"); can.wait_for_timeout(500)
    can.tap("#bKnock"); can.wait_for_timeout(500)
    print("after buttons", phase("after"))
    print("after more", phase("after2")); print("after more2", phase("after3"))
    b.close()
