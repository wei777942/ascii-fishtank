# v13: a brand-new tank starts empty. The older suites were written for the classic 17-creature starter tank,
# so they run with this seed (only when the page has no save yet — explicit saves in a test still win).
import json
from playwright.sync_api import Browser
ROSTER = [('clown', '阿青'), ('clown', '小藍'), ('neon', '綠豆'), ('neon', '薄荷'), ('neon', '芽芽'), ('puffer', '泡泡')]
FISH = [dict(sp=sp, name=n, hunger=80, mood=75, sick=False, growth=0.06 + (i % 3) * 0.05) for i, (sp, n) in enumerate(ROSTER)]
FISH += [dict(sp=sp, name=n, hunger=80, mood=75, sick=False, growth=0.08) for sp, n in [('shrimp', '小蝦'), ('crab', '阿蟹'), ('turtle', '龜龜'), ('angel', '小仙'), ('betta', '阿鬥')]]
FISH += [dict(sp='minnow', name='群魚', grp=1, hunger=80, mood=75, sick=False, growth=0.08) for _ in range(6)]
SEED = "(()=>{try{if(location.pathname.endsWith('can.html'))return;if(!localStorage.getItem('fishtank.v1'))localStorage.setItem('fishtank.v1',JSON.stringify(Object.assign(%s,{t:Date.now()})))}catch(e){}})()" % json.dumps(
    dict(v=3, decor=None, dirt=0.05, style='ascii', seen=0, motion=False, starter3=True, fish=FISH), ensure_ascii=False)
_orig = Browser.new_context
def _nc(self, *a, **k):
    c = _orig(self, *a, **k); c.add_init_script(SEED); return c
Browser.new_context = _nc
_orig_np = Browser.new_page
def _np(self, *a, **k):
    c = self.new_context(*a, **k); p = c.new_page(); return p
Browser.new_page = _np
