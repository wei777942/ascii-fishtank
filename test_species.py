import sys
from playwright.sync_api import sync_playwright
from PIL import Image
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
SP = ['jelly', 'clown', 'neon', 'puffer', 'shrimp', 'crab', 'minnow', 'turtle', 'angel', 'betta']
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    ctx = b.new_context(viewport={"width": 390, "height": 1100}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=UA)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.goto(url); pg.wait_for_timeout(4000)
    pg.evaluate("""(SP)=>{
      const T=__tank, g=T.geo(); window.__freezeFish=true;
      const proto=T.fish[0];
      const list=[]; const top=g.surfaceY+70, step=(g.sandY-top-10)/SP.length;
      SP.forEach((sp,i)=>{[0.05,1].forEach((gr,j)=>{const f=Object.assign({},proto,{sp,name:sp,growth:gr,hunger:90,mood:90,sick:false,puff:0,x:j?285:140,y:top+i*step,vx:0,vy:0,face:1,flip:1,ang:0,mode:'walk',held:false,enter:false,startle:0});list.push(f)})});
      T.fish.length=0; list.forEach(f=>T.fish.push(f));
      T.bubbles.length=0;
      const lab=document.createElement('div'); lab.id='labs'; lab.style.cssText='position:fixed;inset:0;pointer-events:none;font:12px -apple-system,sans-serif;color:#9ffcff';
      lab.innerHTML=`<div style="position:absolute;left:118px;top:${g.surfaceY+22}px">幼魚</div><div style="position:absolute;left:265px;top:${g.surfaceY+22}px">成魚</div>`+
        SP.map((sp,i)=>`<div style="position:absolute;left:8px;top:${top+i*step-8}px">${({clown:'小丑魚',neon:'霓虹燈魚',puffer:'河豚',shrimp:'蝦子',crab:'螃蟹',minnow:'群魚',turtle:'烏龜',angel:'神仙魚',betta:'鬥魚'})[sp]}</div>`).join('');
      document.body.appendChild(lab); document.getElementById('bar').style.display='none'; document.getElementById('bTilt').style.display='none';
      T.decor.forEach(d=>{d.n=0;d.type='none'});
    }""", SP)
    pg.wait_for_timeout(600); pg.screenshot(path="/tmp/sp_ascii.png")
    pg.evaluate("()=>{__tank.S().style='pixel'}"); pg.wait_for_timeout(600); pg.screenshot(path="/tmp/sp_pixel.png")
    pg.evaluate("()=>{__tank.S().style='ascii'}")
    print("errors", errs)
    b.close()
a, c = Image.open("/tmp/sp_ascii.png"), Image.open("/tmp/sp_pixel.png")
out = Image.new("RGB", (a.width + c.width + 20, a.height), (0, 0, 0)); out.paste(a, (0, 0)); out.paste(c, (a.width + 20, 0))
out.save("/workspace/fishtank/shots/v5-species.png"); print(out.size)
