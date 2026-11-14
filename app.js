/* 電子魚缸 v1 — ASCII glow fish tank. Plain canvas + vanilla JS. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d');
const low = document.createElement('canvas'), lctx = low.getContext('2d');
const KEY = 'fishtank.v1';
const PX = 4;                       // CSS px per pixel in pixel-art mode
const INTRO = 2.8;                  // seconds of "pour fish in"
const HUNGER_PER_H = 12;            // full -> empty in ~8h
const DIRT_HOURS = 36;              // clean -> filthy in ~36h
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);
const MONO = 'ui-monospace, Menlo, "SF Mono", "DejaVu Sans Mono", monospace';

const SPECIES = {
  // strs/cols per growth stage: 幼魚 / 少年 / 成魚
  clown:  { label: '小丑魚',   strs: ['><(o>', '><((o>', '><(((o>'], cols: ['#a9cfd2', '#39f6ff', '#ff9a3c'], size: 1.0,  max: 70,  acc: 1.6, wf: 7 },
  neon:   { label: '霓虹燈魚', strs: ['><>', '><>', '>><>'],         cols: ['#a6d8bb', '#46ff8c', '#4fa8ff'], size: 0.85, max: 115, acc: 2.6, wf: 12 },
  puffer: { label: '河豚',     strs: ['><o>', '><(O)>', '><((O))>'], puffs: ['><@>', '><{@}>', '><{{@}}>'],
            cols: ['#d4ddb2', '#c8ff5a', '#ffd23f'], size: 1.05, max: 36, acc: 1.0, wf: 5 },
};
const STAGE_NAMES = ['幼魚', '少年', '成魚'];
const GROW_HOURS = 80;              // best care: baby -> adult in ~3.3 days; typical 4-7 days
const stageOf = g => g < 0.35 ? 0 : g < 0.75 ? 1 : 2;
function hex(c) { return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); }
function mix(a, b, k) { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * clamp(k, 0, 1)).toString(16).padStart(2, '0')).join(''); }
function stageColor(sp, g) {           // shifts toward the next stage's color just before each stage-up
  const c = SPECIES[sp].cols;
  return g < 0.35 ? mix(c[0], c[1], (g - 0.2) / 0.15) : mix(c[1], c[2], (g - 0.6) / 0.15);
}
function look(f) {
  const sp = SPECIES[f.sp], st = stageOf(f.growth || 0);
  const puffed = sp.puffs && f.puff > 0.35;
  return { st, str: puffed ? sp.puffs[st] : sp.strs[st], scale: sp.size * (0.72 + 0.5 * (f.growth || 0)) * (sp.puffs ? 1 + f.puff * 0.6 : 1),
    color: f.sick ? '#7fa58a' : stageColor(f.sp, f.growth || 0) };
}
const ROSTER = [['clown', '阿青'], ['clown', '小藍'], ['neon', '綠豆'], ['neon', '薄荷'], ['neon', '芽芽'], ['puffer', '泡泡']];
// pixel-art sprites (right-facing). a=body b=accent e=eye s=spike
const SPR = {   // [幼魚, 少年, 成魚]
  clown: [['..aaa..', 'a.aaaa.', 'aaabaea', 'a.aaaa.', '..aaa..'],
          ['...aaaa....', 'a.aaaaaaa..', 'aaaabaaaaea', 'aaaabaaaaaa', 'a.aaaaaaa..', '...aaaa....'],
          ['....aaaaa....', 'a..aaaaaaaa..', 'aa.abaabaaaa.', 'aaaabaabaaaea', 'aa.abaabaaaa.', 'a..aaaaaaaa..', '....aaaaa....']],
  neon: [['a.aa.', 'abbae'], ['a.aaa..', 'aabbbae', 'a.aaa..'], ['a..aaa...', 'aa.aaaaa.', 'aabbbbbae', 'aa.aaaaa.', 'a..aaa...']],
  puffer: [['.aaa..', 'aaaaea', 'aaaaaa', '.aaa..'],
           ['...aaaa..', '..aaaaaa.', 'aaaaaaaea', 'aaaaaaaaa', '..aaaaaa.', '...aaaa..'],
           ['....aaaa...', '..aaaaaaaa.', '.aaaaaaaaa.', 'aaaaaaaaaea', 'aaaaaaaaaaa', '.aaaaaaaaa.', '..aaaaaaaa.', '....aaaa...']],
  pufferBig: ['...s.s.s...', '..aaaaaaa..', '.saaaaaaas.', 'aaaaaaaaaea', 'aaaaaaaaaaa', '.saaaaaaas.', '..aaaaaaa..', '...s.s.s...'],
};

const ROCKS = [          // ASCII rocks, bottom-aligned on the sand
  [' ^ ', '(_)'],
  ['  /\\  ', ' /  \\_', '(_____)'],
  ['  ()  ', ' (  )_', '(_)(__)'],
];
const ROCKPX = [['.a.', 'aaa'], ['..a...', '.aab..', 'aaaaa.', 'aaaaaa'], ['.aa....', 'aabaa..', 'aaaaaaa']];

// ---------- state ----------
let S = load();
let W = 0, H = 0, DPR = 1, dprCap = 3, fs = 18, charW = 10, safe = { t: 0, r: 0, b: 0, l: 0 };
let surfaceY = 0, sandY = 0, bounds = { l: 0, r: 0, t: 0, b: 0 };
let decor = null, edit = null;
let fish = [], food = [], bubbles = [], ripples = [], crumbs = [], specks = [], weeds = [], sandRows = [];
let t = 0, intro = 0, shake = 0, lastWall = Date.now(), lastSave = 0;
let tilt = { raw: 0, x: 0 }, slosh = { s: 0, v: 0 }, waterDip = 0, changing = null, motionOn = false;
let groupT = { x: 0, y: 0, wt: 0 };
let frameAvg = 16, slowFor = 0;

function freshState() {
  return { v: 2, decor: null, t: Date.now(), dirt: 0.05, style: 'ascii', seen: 0, motion: false,
    fish: ROSTER.map(([sp, name], i) => ({ sp, name, hunger: 80, mood: 75, sick: false, growth: 0.06 + (i % 3) * 0.05 })) };
}
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!s || !(s.v === 1 || s.v === 2) || !Array.isArray(s.fish)) s = freshState();
  // v1 -> v2 migration: keep fish/hunger/mood/dirt; fish start as babies; decor filled in at boot from screen width
  s.fish.forEach((f, i) => { if (typeof f.growth !== 'number') f.growth = 0.06 + (i % 3) * 0.05; });
  if (!Array.isArray(s.decor)) s.decor = null;
  s.v = 2;
  return s;
}
function save() {
  S.t = Date.now();
  S.fish = fish.map(f => ({ sp: f.sp, name: f.name, hunger: f.hunger, mood: f.mood, sick: f.sick, growth: f.growth }));
  if (decor) S.decor = decor.map(d => ({ type: d.type, fx: +d.fx.toFixed(4), n: d.n, v: d.v, back: !!d.back }));
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
}

// ---------- care simulation (also used for offline time) ----------
function care(sec, list) {
  let left = sec;
  while (left > 0) {
    const step = Math.min(left, 600); left -= step;
    const h = step / 3600;
    S.dirt = clamp(S.dirt + h / DIRT_HOURS, 0, 1);
    for (const f of list) {
      f.hunger = clamp(f.hunger - HUNGER_PER_H * h, 0, 100);
      const target = clamp(f.hunger * 0.55 + (1 - S.dirt) * 45 - (f.sick ? 20 : 0), 0, 100);
      const rate = 25 * h;
      f.mood += clamp(target - f.mood, -rate, rate);
      if (f.hunger <= 5 || (S.dirt > 0.9 && f.mood < 20)) f.sick = true;
      if (f.sick && f.hunger >= 35 && S.dirt < 0.85) f.sick = false;
      // growth: only while fed (>=30) and healthy; faster when full and happy
      if (!f.sick && f.hunger >= 30) f.growth = clamp((f.growth || 0) + h / GROW_HOURS * (0.4 + 0.6 * f.mood / 100) * (0.5 + 0.5 * f.hunger / 100), 0, 1);
    }
  }
}

// ---------- layout ----------
function readSafe() {
  const s = getComputedStyle($('safe'));
  safe = { t: parseFloat(s.paddingTop) || 0, r: parseFloat(s.paddingRight) || 0, b: parseFloat(s.paddingBottom) || 0, l: parseFloat(s.paddingLeft) || 0 };
}
function resize() {
  readSafe();
  W = window.innerWidth; H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, dprCap);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  fs = clamp(W / 21, 14, 24);
  ctx.font = `${fs}px ${MONO}`; charW = ctx.measureText('M').width;
  surfaceY = safe.t + Math.max(44, H * 0.075);
  sandY = H - safe.b - 66;
  bounds = { l: fs * 2.2, r: W - fs * 2.2, t: surfaceY + fs * 1.3, b: sandY - fs * 1.0 };
  low.width = Math.ceil(W / PX); low.height = Math.ceil(H / PX);
  buildScenery();
  for (const f of fish) { f.x = clamp(f.x, -80, W + 80); f.y = clamp(f.y, bounds.t, bounds.b); }
}
function buildScenery() {
  const chars = '._.,-\'`. _ ,.';
  sandRows = [];
  const n = Math.ceil(W / (charW * 0.9)) + 2;
  for (let r = 0; r < 5; r++) { let s = ''; for (let i = 0; i < n; i++) s += chars[(Math.random() * chars.length) | 0]; sandRows.push(s); }
  if (!decor) {
    if (!S.decor) {           // default layout = the v1 seaweed row
      S.decor = [];
      const count = Math.max(5, Math.round(W / 48));
      for (let i = 0; i < count; i++) {
        const back = i % 3 === 1;
        S.decor.push({ type: 'weed', fx: clamp(((i + 0.5) / count * W + rnd(-12, 12)) / W, 0.02, 0.98), n: back ? (5 + Math.random() * 5) | 0 : (7 + Math.random() * 7) | 0, back });
      }
    }
    decor = S.decor.map(d => ({ ...d, ph: rnd(0, 6.28), sp: rnd(0.7, 1.2), lift: 0 }));
  }
  syncDecor();
  specks = [];
  for (let i = 0; i < 160; i++) specks.push({ x: rnd(0, W), y: rnd(surfaceY, sandY), vx: rnd(-4, 4), vy: rnd(-2, 3), c: '.,`\''[i % 4] });
}

function syncDecor() {
  for (const d of decor) d.x = d.fx * W;
  weeds = decor.filter(d => d.type === 'weed');
}
function rockBox(d) {        // css-px bounding box of a decor item
  if (d.type === 'weed') return { x0: d.x - charW * 1.2, x1: d.x + charW * 1.2, y0: sandY - d.n * fs * 0.78 - fs * 0.4 - d.lift, y1: sandY + fs * 0.5 - d.lift };
  const r = ROCKS[d.v], w = r[0].length * charW * 0.5 + charW * 0.6;
  return { x0: d.x - w, x1: d.x + w, y0: sandY - r.length * fs * 0.82 - d.lift, y1: sandY + fs * 0.5 - d.lift };
}

// ---------- fish ----------
function makeFish(p, i) {
  const fromLeft = i % 2 === 0, fromTop = i === 4;
  const f = { sp: p.sp, name: p.name, hunger: p.hunger, mood: p.mood, sick: p.sick, growth: p.growth || 0, lastStage: stageOf(p.growth || 0),
    x: fromTop ? rnd(W * 0.3, W * 0.7) : fromLeft ? -60 - i * 30 : W + 60 + i * 30,
    y: fromTop ? surfaceY - 30 : rnd(H * 0.2, H * 0.6),
    vx: 0, vy: 0, face: fromLeft ? 1 : -1, flip: fromLeft ? 1 : -1, ang: 0, ph: rnd(0, 6), startle: 0, fx: 0, fy: 0,
    puff: 0, wt: 0, tx: 0, ty: 0, pause: 0, bubT: rnd(1, 4), enter: true };
  f.tx = rnd(W * 0.2, W * 0.8); f.ty = rnd(bounds.t + 20, bounds.b - 20);
  if (f.sp === 'puffer') f.ty = rnd((bounds.t + bounds.b) / 2, bounds.b - 10);
  f.vx = f.face * SPECIES[f.sp].max * 1.2;
  return f;
}
const halfLen = f => { const L = look(f); return L.str.length * charW * L.scale / 2; };
const mouthX = f => f.x + Math.sign(f.flip || 1) * halfLen(f) * 0.9;
function nearestFood(f) {
  let best = null, bd = 1e9;
  for (const p of food) { const d = Math.hypot(p.x - f.x, p.y - f.y); if (d < bd) { bd = d; best = p; } }
  return best;
}
function pickWander(f) {
  const b = bounds;
  if (f.sp === 'puffer') { f.tx = rnd(b.l, b.r); f.ty = rnd(b.t + (b.b - b.t) * 0.45, b.b); f.pause = Math.random() < 0.5 ? rnd(1, 3) : 0; }
  else { f.tx = rnd(b.l, b.r); f.ty = rnd(b.t + 10, b.b - (b.b - b.t) * 0.15); }
  f.wt = rnd(3, 8);
}
function updateFish(f, dt, neonC) {
  const sp = SPECIES[f.sp];
  const hf = f.sick ? 0.35 : f.hunger < 30 ? 0.45 + 0.55 * f.hunger / 30 : 1;
  const mf = 0.75 + 0.25 * f.mood / 100;
  const maxS = sp.max * hf * mf;
  let dx, dy, want, arrive = false;
  if (f.enter) {
    dx = f.tx - f.x; dy = f.ty - f.y; want = sp.max * 1.3; arrive = true;
    if (Math.hypot(dx, dy) < 30 || intro > INTRO + 1.5) { f.enter = false; pickWander(f); }
  } else if (f.startle > 0) {
    f.startle -= dt;
    if ((f.x < bounds.l && f.fx < 0) || (f.x > bounds.r && f.fx > 0)) f.fx = -f.fx;
    if ((f.y < bounds.t && f.fy < 0) || (f.y > bounds.b && f.fy > 0)) f.fy = -f.fy;
    dx = f.fx; dy = f.fy; want = sp.max * 2.4 * Math.max(0.55, hf);
  } else {
    const fd = f.hunger < 96 ? nearestFood(f) : null;
    if (fd) { dx = fd.x - mouthX(f); dy = fd.y - f.y; want = maxS * 1.15; }
    else if (f.sp === 'neon' && neonC) {
      dx = (groupT.x - f.x) * 0.6 + (neonC.x - f.x) * 0.9 + neonC.vx * 0.4;
      dy = (groupT.y - f.y) * 0.6 + (neonC.y - f.y) * 0.9 + neonC.vy * 0.4;
      for (const o of fish) if (o !== f && o.sp === 'neon') {
        const ox = f.x - o.x, oy = f.y - o.y, d = Math.hypot(ox, oy);
        if (d < fs * 2.2 && d > 0.1) { dx += ox / d * 160; dy += oy / d * 160; }
      }
      want = maxS * 0.7;
    } else {
      f.wt -= dt;
      if (f.pause > 0) { f.pause -= dt; dx = f.tx - f.x; dy = f.ty - f.y; want = 4; }
      else {
        dx = f.tx - f.x; dy = f.ty - f.y; want = maxS * (f.sp === 'puffer' ? 0.6 : 0.55); arrive = true;
        if (f.wt <= 0 || Math.hypot(dx, dy) < 25) pickWander(f);
      }
    }
  }
  const d = Math.hypot(dx, dy) || 1;
  if (arrive) want *= clamp(d / 80, 0.25, 1);
  const k = Math.min(1, sp.acc * dt * (f.startle > 0 ? 3 : 1));
  f.vx += (dx / d * want - f.vx) * k;
  f.vy += (dy / d * want - f.vy) * k * 0.85;
  // tilt: water sloshes "downhill"
  f.vx += tilt.x * 40 * dt;
  // soft walls
  if (!f.enter) {
    if (f.x < bounds.l) f.vx += (bounds.l - f.x) * 4 * dt;
    if (f.x > bounds.r) f.vx -= (f.x - bounds.r) * 4 * dt;
    if (f.y < bounds.t) f.vy += (bounds.t - f.y) * 4 * dt;
    if (f.y > bounds.b) f.vy -= (f.y - bounds.b) * 4 * dt;
  }
  const sp2 = Math.hypot(f.vx, f.vy), lim = f.startle > 0 ? sp.max * 3 : sp.max * 1.5;
  if (sp2 > lim) { f.vx *= lim / sp2; f.vy *= lim / sp2; }
  f.x += f.vx * dt; f.y += f.vy * dt;
  if (!f.enter) { f.x = clamp(f.x, 6, W - 6); f.y = clamp(f.y, surfaceY + fs * 0.6, sandY - fs * 0.4); }
  // facing with hysteresis, smooth flip through 0
  if (f.vx > 6) f.face = 1; else if (f.vx < -6) f.face = -1;
  f.flip += (f.face - f.flip) * Math.min(1, dt * 5);
  const targAng = clamp(Math.atan2(f.vy, Math.abs(f.vx) + 15), -0.45, 0.45);
  f.ang += (targAng - f.ang) * Math.min(1, dt * 4);
  f.ph += dt * sp.wf * (0.4 + Math.min(1.5, Math.hypot(f.vx, f.vy) / sp.max));
  f.puff = Math.max(0, f.puff - dt / 4);
  // eat
  for (let i = food.length - 1; i >= 0; i--) {
    const p = food[i];
    if (f.hunger < 99 && Math.hypot(p.x - mouthX(f), p.y - f.y) < fs * 0.7) {
      food.splice(i, 1); f.hunger = clamp(f.hunger + 14, 0, 100); f.mood = clamp(f.mood + 4, 0, 100);
      if (f.sick && f.hunger >= 35 && S.dirt < 0.85) f.sick = false;
      crumbs.push({ x: p.x, y: p.y, t: 0, ch: Math.random() < 0.5 ? '*' : '+' });
      break;
    }
  }
  // breathe bubbles
  f.bubT -= dt;
  if (f.bubT <= 0) { f.bubT = rnd(2, 6) / (f.startle > 0 ? 3 : 1); if (bubbles.length < 60) bubbles.push(newBubble(mouthX(f), f.y - fs * 0.2, false)); }
}
function newBubble(x, y, big, vy) { return { x, y, vy: vy || rnd(22, 38), ph: rnd(0, 6), age: 0, big, grow: Math.random() < 0.5 ? rnd(1.5, 3.5) : 1e9 }; }
const isBig = b => b.big || b.age > b.grow;

// ---------- interactions ----------
function knock(x, y) {
  ripples.push({ x, y, t: 0 }); shake = 1;
  slosh.v += (x < W / 2 ? 1 : -1) * 0.04;
  const R = Math.max(W, H) * 0.75;
  for (const f of fish) {
    let ox = f.x - x, oy = f.y - y; const d = Math.hypot(ox, oy) || 1;
    if (d > R) continue;
    const s = 1 - d / R;
    ox /= d; oy /= d;
    f.fx = ox; f.fy = oy * 0.8; f.startle = 0.7 + 1.1 * s; f.enter = false;
    const imp = SPECIES[f.sp].max * (1.5 + 2.5 * s);
    f.vx += ox * imp; f.vy += oy * imp * 0.8;
    f.mood = clamp(f.mood - 1.5 * s, 0, 100);
    if (f.sp === 'puffer' && s > 0.3) f.puff = 1;
  }
  if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
}
function dropFood(x, n) {
  for (let i = 0; i < n && food.length < 40; i++) {
    food.push({ x: clamp(x + rnd(-14, 14), 10, W - 10), y: surfaceY + rnd(-6, 4), vy: rnd(16, 26), ph: rnd(0, 6), age: 0, settled: false });
  }
}
function feedButton() { for (let i = 0; i < 5; i++) dropFood(rnd(W * 0.15, W * 0.85), 1); toast('撒了一把飼料'); }
function changeWater() {
  if (changing) return;
  changing = { t: 0, from: S.dirt };
  for (let i = 0; i < 28; i++) bubbles.push(newBubble(rnd(0, W), sandY - rnd(0, 60), Math.random() < 0.5, rnd(90, 160)));
}

// ---------- motion ----------
function onOrient(e) { if (e.gamma != null) { tilt.raw = clamp(e.gamma / 40, -1, 1); motionOn = true; } }
function onMotion(e) {
  const a = e.acceleration;
  if (a && a.x != null) { const m = Math.hypot(a.x, a.y || 0); if (m > 7) { slosh.v += clamp(a.x, -15, 15) * 0.004; } }
  if (!motionOn && e.accelerationIncludingGravity && e.accelerationIncludingGravity.x != null) {
    let gx = e.accelerationIncludingGravity.x / 9.8; if (!/iP(hone|ad|od)/.test(navigator.userAgent)) gx = -gx;
    tilt.raw = clamp(-gx * 1.3, -1, 1);
  }
}
function listenMotion() {
  window.addEventListener('deviceorientation', onOrient);
  window.addEventListener('devicemotion', onMotion);
}
const needsPerm = typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';
let permAsked = false;
function askMotion() {
  if (!needsPerm || permAsked) return; permAsked = true;
  DeviceMotionEvent.requestPermission().then(r => {
    if (r === 'granted') {
      S.motion = true; $('bTilt').style.display = 'none'; listenMotion();
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => {});
      toast('傾斜手機，水會晃喔');
    } else { toast('沒有開啟傾斜（可在設定重開）'); permAsked = false; }
  }).catch(() => { permAsked = false; });
}

// ---------- input ----------
let press = null;
cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (edit) { editDown(e); return; }
  if (needsPerm && S.motion && !permAsked) askMotion();   // re-grant silently on first touch
  if (press) clearTimeout(press.timer);
  const p = { x: e.clientX, y: e.clientY, done: false, moved: false };
  p.timer = setTimeout(() => { if (!p.done && !p.moved) { p.done = true; dropFood(p.x, 3); } }, 450);
  press = p;
});
cv.addEventListener('pointermove', e => {
  if (edit) { editMove(e); return; }
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 14) { press.moved = true; clearTimeout(press.timer); }
});
cv.addEventListener('pointerup', e => {
  if (edit) { editUp(e); return; }
  if (!press) return; clearTimeout(press.timer);
  if (!press.done && !press.moved) knock(press.x, press.y);
  press = null;
});
cv.addEventListener('pointercancel', () => {
  if (edit && edit.drag) { clearTimeout(edit.drag.timer); edit.drag.d.lift = 0; edit.drag = null; } if (press) clearTimeout(press.timer); press = null; });
['gesturestart', 'gesturechange', 'dblclick'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
const btn = (id, fn) => $(id).addEventListener('click', e => { e.stopPropagation(); fn(); });
btn('bFeed', feedButton);
btn('bWater', () => { changeWater(); });
btn('bInfo', () => { const p = $('panel'); p.style.display = p.style.display === 'block' ? 'none' : 'block'; renderPanel(); });
$('panel').addEventListener('click', () => { $('panel').style.display = 'none'; });
btn('bStyle', () => { S.style = S.style === 'ascii' ? 'pixel' : 'ascii'; styleLabel(); save(); });
btn('bTilt', askMotion);
function styleLabel() { $('bStyle').textContent = S.style === 'ascii' ? '▦ 像素' : 'Aa 字元'; }

// ---------- decor edit mode ----------
const MAX_DECOR = 40;
const placeTop = () => surfaceY + (sandY - surfaceY) * 0.5;
function hitDecor(x, y) {
  for (let i = decor.length - 1; i >= 0; i--) { const b = rockBox(decor[i]); if (x >= b.x0 - 6 && x <= b.x1 + 6 && y >= b.y0 - 6 && y <= b.y1 + 6) return decor[i]; }
  return null;
}
function overTrash(x, y) { const r = $('eTrash').getBoundingClientRect(); return x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12; }
function removeDecor(d) {
  const i = decor.indexOf(d); if (i < 0) return;
  decor.splice(i, 1); syncDecor(); save();
  for (let k = 0; k < 8; k++) bubbles.push(newBubble(d.x + rnd(-14, 14), sandY - rnd(0, 40), Math.random() < 0.4, rnd(50, 90)));
  toast(d.type === 'weed' ? '移除了水草' : '移除了石頭', 1.4);
}
function addDecor(x) {
  if (decor.length >= MAX_DECOR) { toast('放太多了，先刪掉一些吧'); return; }
  const d = edit.type === 'weed'
    ? { type: 'weed', fx: 0, n: (7 + Math.random() * 7) | 0, v: 0, back: false }
    : { type: 'rock', fx: 0, n: 0, v: edit.rv = (edit.rv + 1) % ROCKS.length, back: false };
  d.fx = clamp(x, 10, W - 10) / W; d.ph = rnd(0, 6.28); d.sp = rnd(0.7, 1.2); d.lift = 30;
  decor.push(d); syncDecor(); save();
}
function editDown(e) {
  const x = e.clientX, y = e.clientY, d = hitDecor(x, y);
  try { cv.setPointerCapture(e.pointerId); } catch (er) {}
  if (d) {
    const drag = { d, sx: x, sy: y, ox: d.x, moved: false };
    drag.timer = setTimeout(() => { if (!drag.moved && edit && edit.drag === drag) { edit.drag = null; removeDecor(d); } }, 550);
    edit.drag = drag;
  } else edit.tap = { x, y };
}
function editMove(e) {
  const x = e.clientX, y = e.clientY, g = edit.drag;
  if (edit.tap && Math.hypot(x - edit.tap.x, y - edit.tap.y) > 14) edit.tap = null;
  if (!g) return;
  if (!g.moved && Math.hypot(x - g.sx, y - g.sy) > 10) { g.moved = true; clearTimeout(g.timer); }
  if (!g.moved) return;
  g.d.x = clamp(g.ox + x - g.sx, 8, W - 8); g.d.fx = g.d.x / W;
  g.d.lift = Math.max(0, g.sy - y);
  edit.hot = overTrash(x, y); $('eTrash').classList.toggle('hot', edit.hot);
}
function editUp(e) {
  const x = e.clientX, y = e.clientY, g = edit.drag;
  if (g) {
    clearTimeout(g.timer); edit.drag = null; edit.hot = false; $('eTrash').classList.remove('hot');
    if (g.moved && overTrash(x, y)) removeDecor(g.d); else { syncDecor(); save(); }
  } else if (edit.tap) {
    if (y >= placeTop() - 10) addDecor(x); else toast('點缸底（下半部）放置', 1.4);
  }
  edit.tap = null;
}
function setEditType(tp) { edit.type = tp; $('eWeed').classList.toggle('sel', tp === 'weed'); $('eRock').classList.toggle('sel', tp === 'rock'); }
function enterEdit() {
  edit = { type: 'weed', rv: -1, drag: null, tap: null, hot: false };
  setEditType('weed'); $('panel').style.display = 'none';
  $('bar').style.display = 'none'; $('ebar').style.display = 'flex';
}
function exitEdit() { edit = null; save(); $('ebar').style.display = 'none'; $('bar').style.display = 'flex'; toast('佈置好了', 1.4); }
btn('bDecor', enterEdit);
btn('eWeed', () => setEditType('weed'));
btn('eRock', () => setEditType('rock'));
btn('eTrash', () => toast('把水草或石頭拖到這裡刪除', 1.6));
btn('eDone', exitEdit);

let toastT = 0;
function toast(msg, sec = 2.4) { const el = $('toast'); el.textContent = msg; el.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => el.style.opacity = 0, sec * 1000); }
const bar = v => { const n = Math.round(clamp(v, 0, 100) / 10); return '█'.repeat(n) + '░'.repeat(10 - n); };
function moodWord(f) {
  if (f.sick) return '生病了（餵牠就會好）';
  if (f.hunger < 30) return '餓了，游不動';
  if (f.mood > 70) return '開心';
  if (f.mood > 40) return '還好';
  return '悶悶的';
}
function renderPanel() {
  if ($('panel').style.display !== 'block') return;
  const lines = fish.map(f => `<b>${f.name}</b> <span class="dim">${SPECIES[f.sp].label}</span>\n 飽足 ${bar(f.hunger)}  心情 ${bar(f.mood)}\n 成長 ${bar((f.growth || 0) * 100)}  ${STAGE_NAMES[stageOf(f.growth || 0)]}　狀態 ${moodWord(f)}`);
  $('panel').innerHTML = lines.join('\n') + `\n\n<b>水質</b> ${bar((1 - S.dirt) * 100)} ${Math.round((1 - S.dirt) * 100)}%` +
    `\n<span class="dim">點玻璃：魚會嚇跑　長按：餵食　點此關閉</span>`;
}

// ---------- geometry ----------
function surf(x) {
  return surfaceY + waterDip + Math.sin(x * 0.035 + t * 1.6) * 2.5 + Math.sin(x * 0.013 - t * 0.9) * 2 + slosh.s * (x - W / 2);
}
function weedPos(w, j) {
  const sc = fs / 18;
  const x = w.x + Math.sin(t * 0.9 * w.sp + w.ph + j * 0.45) * j * 0.9 * sc - slosh.s * 2.2 * j * j * sc;
  return [x, sandY - j * fs * 0.78 - (w.lift || 0)];
}

// ---------- update ----------
function update(dt) {
  t += dt; intro += dt;
  tilt.x += (tilt.raw - tilt.x) * Math.min(1, dt * 4);
  // water surface spring follows tilt
  const target = -tilt.x * 0.22;
  slosh.v += ((target - slosh.s) * 28 - slosh.v * 3.2) * dt;
  slosh.s += slosh.v * dt;
  shake = Math.max(0, shake - dt * 4);
  if (changing) {
    changing.t += dt; const p = Math.min(1, changing.t / 2.4);
    waterDip = Math.sin(Math.PI * p) * (sandY - surfaceY) * 0.18;
    if (p > 0.45) S.dirt = changing.from * (1 - (p - 0.45) / 0.55);
    if (p >= 1) { S.dirt = 0; waterDip = 0; changing = null; for (const f of fish) f.mood = clamp(f.mood + 12, 0, 100); toast('換好水了，清澈！'); save(); }
  }
  // neon school
  let nc = null, nn = 0;
  for (const f of fish) if (f.sp === 'neon') { if (!nc) nc = { x: 0, y: 0, vx: 0, vy: 0 }; nc.x += f.x; nc.y += f.y; nc.vx += f.vx; nc.vy += f.vy; nn++; }
  if (nc) { nc.x /= nn; nc.y /= nn; nc.vx /= nn; nc.vy /= nn; }
  groupT.wt -= dt;
  if (groupT.wt <= 0 || (nc && Math.hypot(groupT.x - nc.x, groupT.y - nc.y) < 40)) {
    groupT = { x: rnd(bounds.l, bounds.r), y: rnd(bounds.t, bounds.b - 40), wt: rnd(2.5, 6) };
  }
  for (const f of fish) {
    updateFish(f, dt, nc);
    const st = stageOf(f.growth || 0);
    if (st > f.lastStage) { toast(`${f.name}長成${STAGE_NAMES[st]}了！`, 3); for (let k = 0; k < 6; k++) crumbs.push({ x: f.x + rnd(-20, 20), y: f.y + rnd(-12, 12), t: 0, ch: '*' }); }
    f.lastStage = st;
  }
  for (const d of decor) if (!(edit && edit.drag && edit.drag.d === d)) d.lift = Math.max(0, d.lift - dt * 500);
  // food
  for (let i = food.length - 1; i >= 0; i--) {
    const p = food[i]; p.age += dt; p.ph += dt * 2;
    if (!p.settled) {
      p.y += p.vy * dt; p.x += (Math.sin(p.ph) * 8 + tilt.x * 14) * dt;
      if (p.y >= sandY - fs * 0.35) { p.y = sandY - fs * 0.35; p.settled = true; }
    }
    if (p.age > 75) { food.splice(i, 1); S.dirt = clamp(S.dirt + 0.01, 0, 1); }
  }
  // bubbles
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]; b.age += dt; b.ph += dt * 3;
    b.y -= b.vy * dt * (isBig(b) ? 1.25 : 1); b.x += (Math.sin(b.ph) * 10 - slosh.s * 120) * dt;
    if (b.y < surf(b.x) + 3) bubbles.splice(i, 1);
  }
  // aerator
  if (Math.random() < dt * 1.6 && bubbles.length < 70) bubbles.push(newBubble(W * 0.86 + rnd(-3, 3), sandY - 4, false));
  // intro splash
  if (intro < 1.4 && Math.random() < dt * 25) bubbles.push(newBubble(rnd(W * 0.1, W * 0.9), rnd(surfaceY + 10, surfaceY + 120), Math.random() < 0.4, rnd(40, 80)));
  for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > 0.9) ripples.splice(i, 1); }
  for (let i = crumbs.length - 1; i >= 0; i--) { crumbs[i].t += dt; crumbs[i].y -= dt * 12; if (crumbs[i].t > 0.7) crumbs.splice(i, 1); }
  for (const s of specks) {
    s.x += (s.vx + tilt.x * 6) * dt; s.y += s.vy * dt;
    if (s.x < 0) s.x += W; if (s.x > W) s.x -= W;
    if (s.y < surfaceY + 8) s.vy = Math.abs(s.vy); if (s.y > sandY) s.vy = -Math.abs(s.vy);
  }
  // buttons hint
  $('bFeed').classList.toggle('need', fish.some(f => f.hunger < 30 || f.sick));
  $('bWater').classList.toggle('need', S.dirt > 0.55);
}

// ---------- render: ASCII ----------
function glow(color, blur) { ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = blur * DPR * (1 - S.dirt * 0.6); }
function drawBackground() {
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  // water body
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, surf(x));
  ctx.lineTo(W, H); ctx.closePath();
  const g = ctx.createLinearGradient(0, surfaceY, 0, H);
  const d = S.dirt;
  g.addColorStop(0, `rgba(${(4 + d * 30) | 0},${(28 + d * 10) | 0},${(34 - d * 22) | 0},0.55)`);
  g.addColorStop(1, `rgba(${(2 + d * 22) | 0},${(10 + d * 12) | 0},${(14 - d * 10) | 0},0.6)`);
  ctx.fillStyle = g; ctx.fill();
}
function drawDirt() {
  const d = S.dirt; if (d < 0.02) return;
  ctx.save(); ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, surf(x));
  ctx.lineTo(W, H); ctx.closePath();
  ctx.fillStyle = `rgba(28,30,4,${d * 0.5})`; ctx.fill();
  const n = Math.floor(d * specks.length);
  ctx.font = `${fs * 0.8}px ${MONO}`; ctx.fillStyle = `rgba(150,140,80,${0.25 + d * 0.4})`;
  for (let i = 0; i < n; i++) { const s = specks[i]; if (s.y > surf(s.x) + 4) ctx.fillText(s.c, s.x, s.y); }
  ctx.restore();
}
function drawWeeds(back) {
  ctx.font = `${fs}px ${MONO}`;
  for (const w of weeds) {
    if (w.back !== back) continue;
    glow(back ? '#1f8f52' : '#46ff8c', back ? 4 : 9);
    if (back) ctx.globalAlpha = 0.6;
    for (let j = 0; j < w.n; j++) { const [x, y] = weedPos(w, j); ctx.fillText(j % 2 ? '{' : '}', x, y); }
    ctx.globalAlpha = 1;
  }
}
function drawRocks() {
  ctx.font = `${fs}px ${MONO}`;
  for (const d of decor) if (d.type === 'rock') {
    const r = ROCKS[d.v] || ROCKS[0];
    glow('#6fb5ad', 4); ctx.globalAlpha = 0.8;
    for (let k = 0; k < r.length; k++) ctx.fillText(r[k], d.x, sandY + fs * 0.15 - (r.length - 1 - k) * fs * 0.82 - d.lift);
  }
  ctx.globalAlpha = 1;
}
function drawEditOverlay() {
  if (!edit) return;
  ctx.save(); ctx.shadowBlur = 0; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
  const zy = placeTop();
  ctx.strokeStyle = 'rgba(70,255,140,0.35)'; ctx.fillStyle = 'rgba(70,255,140,0.05)';
  ctx.fillRect(6, zy, W - 12, sandY + fs * 0.6 - zy); ctx.strokeRect(6, zy, W - 12, sandY + fs * 0.6 - zy);
  for (const d of decor) {
    const b = rockBox(d), on = edit.drag && edit.drag.d === d;
    ctx.strokeStyle = on ? (edit.hot ? 'rgba(255,90,90,0.95)' : 'rgba(159,252,255,0.95)') : 'rgba(159,252,255,0.35)';
    ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  }
  ctx.setLineDash([]); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#bfffd0'; ctx.shadowColor = '#46ff8c'; ctx.shadowBlur = 6 * DPR;
  ctx.font = `${Math.max(12, fs * 0.72)}px -apple-system, "PingFang TC", sans-serif`;
  ctx.fillText('佈置中：點缸底放' + (edit.type === 'weed' ? '水草' : '石頭') + '・拖曳移動', W / 2, surfaceY + fs * 1.4);
  ctx.fillText('拖到 🗑 或長按刪除', W / 2, surfaceY + fs * 2.5);
  ctx.restore();
}
function drawSand() {
  ctx.font = `${fs * 0.9}px ${MONO}`; ctx.shadowBlur = 0;
  for (let r = 0; r < sandRows.length; r++) {
    ctx.fillStyle = `rgba(70,190,140,${0.5 - r * 0.08})`;
    ctx.fillText(sandRows[r], -charW * 0.5 + (r % 2) * charW * 0.4, sandY + fs * 0.55 + r * fs * 0.75);
  }
}
function drawFishA(f) {
  const sp = SPECIES[f.sp], L = look(f);
  const str = L.str, s = L.scale, col = L.color;
  const thin = f.sick ? 0.6 : f.hunger < 30 ? 0.62 + 0.38 * f.hunger / 30 : 1;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.ang * Math.sign(f.flip || 1));
  ctx.scale(f.flip * s, thin * s);
  glow(col, f.sick ? 4 : 7 + 5 * (f.growth || 0));
  if (L.st === 0 && !f.sick) ctx.globalAlpha = 0.85;
  if (f.hunger < 30 && !f.sick) ctx.globalAlpha = 0.75;
  const n = str.length, w = n * charW;
  const amp = fs * 0.11 * (0.35 + Math.min(1.2, Math.hypot(f.vx, f.vy) / sp.max));
  for (let i = 0; i < n; i++) {
    const tail = Math.pow(1 - i / n, 1.4);
    ctx.fillText(str[i], -w / 2 + (i + 0.5) * charW, Math.sin(f.ph - i * 0.8) * amp * tail);
  }
  ctx.restore();
  if (f.sick && Math.sin(t * 2 + f.ph * 0.1) > 0.7) { ctx.save(); glow('#7fa58a', 3); ctx.font = `${fs * 0.7}px ${MONO}`; ctx.fillText('?', f.x, f.y - fs * 1.1); ctx.restore(); }
}
function renderAscii() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  drawBackground();
  drawWeeds(true);
  drawSand();
  drawRocks();
  // food
  ctx.font = `${fs * 0.9}px ${MONO}`; glow('#ffe066', 8);
  for (const p of food) ctx.fillText(p.settled ? '.' : '∘', p.x, p.y);
  for (const f of fish) drawFishA(f);
  // bubbles
  glow('#9ffcff', 6);
  for (const b of bubbles) {
    const big = isBig(b);
    ctx.font = `${fs * (big ? 0.85 : 0.6)}px ${MONO}`;
    ctx.fillText(big ? 'O' : 'o', b.x, b.y);
  }
  ctx.font = `${fs * 0.8}px ${MONO}`; glow('#ffffff', 6);
  for (const c of crumbs) { ctx.globalAlpha = 1 - c.t / 0.7; ctx.fillText(c.ch, c.x, c.y); }
  ctx.globalAlpha = 1;
  drawWeeds(false);
  drawDirt();
  drawEditOverlay();
  // surface
  ctx.font = `${fs}px ${MONO}`; glow('#39f6ff', 10);
  const step = charW * 0.95;
  for (let x = step / 2; x < W + step; x += step) ctx.fillText('~', x, surf(x));
  drawRipples();
}
function drawRipples() {
  for (const r of ripples) {
    const a = 1 - r.t / 0.9;
    ctx.save(); ctx.globalAlpha = a;
    ctx.strokeStyle = '#9ffcff'; ctx.shadowColor = '#39f6ff'; ctx.shadowBlur = 10 * DPR; ctx.lineWidth = 1.5;
    for (let k = 0; k < 2; k++) { const rad = (r.t - k * 0.15) * 260; if (rad > 0) { ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, 6.283); ctx.stroke(); } }
    ctx.fillStyle = '#e8ffff'; ctx.font = `600 ${fs * 1.2}px -apple-system, "PingFang TC", sans-serif`;
    ctx.fillText('叩', r.x, r.y - r.t * 30);
    ctx.restore();
  }
}

// ---------- render: pixel art ----------
const PCOL = { clown: { a: '#39f6ff', b: '#e8ffff' }, neon: { a: '#46ff8c', b: '#39f6ff' }, puffer: { a: '#c8ff5a', s: '#46ff8c' } };
function sprite(rows, cx, cy, mirror, cols, thin) {
  const h = rows.length, w = rows[0].length;
  const ox = Math.round(cx - w / 2), oy = Math.round(cy - h / 2);
  for (let r = 0; r < h; r++) {
    if (thin && (r === 0 || r === h - 1) && h > 3) continue;
    const row = rows[r];
    for (let c = 0; c < w; c++) {
      const ch = row[mirror ? w - 1 - c : c]; if (ch === '.') continue;
      lctx.fillStyle = ch === 'e' ? '#000' : (cols[ch] || cols.a);
      lctx.fillRect(ox + c, oy + r, 1, 1);
    }
  }
}
function renderPixel() {
  const lw = low.width, lh = low.height;
  lctx.clearRect(0, 0, lw, lh);
  // weeds
  for (const w of weeds) {
    lctx.fillStyle = w.back ? '#1f8f52' : '#46ff8c';
    for (let j = 0; j < w.n * 2; j++) {
      const [x, y] = weedPos(w, j / 2);
      lctx.fillRect(Math.round(x / PX), Math.round(y / PX), 1, 1);
      if (j % 3 === 0) lctx.fillRect(Math.round(x / PX) + (j % 2 ? 1 : -1), Math.round(y / PX), 1, 1);
    }
  }
  // sand
  for (let y = Math.round(sandY / PX); y < lh; y++) for (let x = 0; x < lw; x++) {
    const v = ((x * 73 + y * 151) ^ (x * y)) % 11;
    if (v < 2) { lctx.fillStyle = v ? '#2e8a64' : '#1c5a40'; lctx.fillRect(x, y, 1, 1); }
  }
  for (const d of decor) if (d.type === 'rock') {
    const r = ROCKPX[d.v] || ROCKPX[0];
    sprite(r, d.x / PX, (sandY - d.lift) / PX - r.length / 2 + 1, false, { a: '#4f8f88', b: '#8fd0c8' }, false);
  }
  lctx.fillStyle = '#ffe066';
  for (const p of food) lctx.fillRect(Math.round(p.x / PX), Math.round(p.y / PX), 1, 1);
  for (const f of fish) {
    const L = look(f);
    const cols = f.sick ? { a: '#6f8f7a', b: '#9fb8a8', s: '#6f8f7a' } : { ...PCOL[f.sp], a: L.color };
    const rows = f.sp === 'puffer' && f.puff > 0.35 ? SPR.pufferBig : SPR[f.sp][L.st];
    const tiltOff = Math.round(f.ang * 2);
    sprite(rows, f.x / PX, f.y / PX + tiltOff * 0, f.flip < 0, cols, f.sick || f.hunger < 30);
  }
  lctx.fillStyle = '#9ffcff';
  for (const b of bubbles) {
    const x = Math.round(b.x / PX), y = Math.round(b.y / PX);
    if (isBig(b)) { lctx.fillRect(x - 1, y, 1, 1); lctx.fillRect(x + 1, y, 1, 1); lctx.fillRect(x, y - 1, 1, 1); lctx.fillRect(x, y + 1, 1, 1); }
    else lctx.fillRect(x, y, 1, 1);
  }
  lctx.fillStyle = '#39f6ff';
  for (let x = 0; x < lw; x++) lctx.fillRect(x, Math.round(surf(x * PX + PX / 2) / PX), 1, 1);
  if (S.dirt > 0.02) {
    lctx.fillStyle = 'rgba(150,140,80,0.7)';
    const n = Math.floor(S.dirt * specks.length);
    for (let i = 0; i < n; i++) lctx.fillRect(Math.round(specks[i].x / PX), Math.round(specks[i].y / PX), 1, 1);
  }
  drawBackground();
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.shadowColor = '#39f6ff'; ctx.shadowBlur = 8 * DPR * (1 - S.dirt * 0.6);
  ctx.drawImage(low, 0, 0, lw * PX, lh * PX);
  ctx.restore();
  if (S.dirt > 0.02) {
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, surf(x));
    ctx.lineTo(W, H); ctx.closePath(); ctx.shadowBlur = 0; ctx.fillStyle = `rgba(28,30,4,${S.dirt * 0.5})`; ctx.fill();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  drawRipples();
  drawEditOverlay();
}

function drawIntroText() {
  const a = intro < 0.4 ? intro / 0.4 : intro < INTRO ? 1 : Math.max(0, 1 - (intro - INTRO) / 0.8);
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  glow('#9ffcff', 14);
  ctx.font = `600 ${fs * 1.7}px -apple-system, "PingFang TC", sans-serif`;
  ctx.fillText('電子魚缸', W / 2, H * 0.42);
  glow('#46ff8c', 6);
  ctx.font = `${fs * 0.75}px -apple-system, "PingFang TC", sans-serif`;
  ctx.fillText(S.seen ? '點一下敲玻璃・長按餵食' : '倒魚入缸… 點一下敲玻璃・長按餵食', W / 2, H * 0.42 + fs * 1.8);
  ctx.restore();
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (shake > 0) ctx.translate(Math.sin(t * 90) * shake * 4, Math.cos(t * 70) * shake * 2);
  if (S.style === 'pixel') renderPixel(); else renderAscii();
  drawIntroText();
}

// ---------- loop ----------
let lastFrame = performance.now();
function frame(now) {
  const rawDt = (now - lastFrame) / 1000; lastFrame = now;
  const dt = Math.min(0.05, Math.max(0, rawDt));
  // wall-clock care (handles background/suspend too)
  const wall = Date.now(), gap = (wall - lastWall) / 1000; lastWall = wall;
  if (gap > 0) care(Math.min(gap, 86400 * 30), fish);
  if (gap > 3600) offlineToast(gap);
  update(dt);
  render();
  // adaptive resolution if the phone struggles
  frameAvg = frameAvg * 0.95 + rawDt * 1000 * 0.05;
  if (frameAvg > 30 && DPR > 2) { slowFor += rawDt; if (slowFor > 2) { dprCap = 2; slowFor = 0; resize(); } } else slowFor = 0;
  if (wall - lastSave > 5000) { lastSave = wall; save(); renderPanel(); }
  requestAnimationFrame(frame);
}
function offlineToast(sec) {
  const h = sec / 3600;
  const hungry = fish.some(f => f.hunger < 30 || f.sick);
  toast(`離開了 ${h < 24 ? Math.round(h) + ' 小時' : Math.round(h / 24) + ' 天'}${hungry ? '，魚餓了，快餵牠們' : S.dirt > 0.5 ? '，水有點髒了' : ''}`, 4);
}

// ---------- boot ----------
function boot() {
  resize();
  const away = (Date.now() - (S.t || Date.now())) / 1000;
  const list = S.fish.map(p => ({ ...p }));
  if (away > 0) care(Math.min(away, 86400 * 30), list);
  fish = list.map(makeFish);
  styleLabel();
  if (needsPerm && !S.motion) $('bTilt').style.display = 'block';
  if (!needsPerm && typeof DeviceMotionEvent !== 'undefined') listenMotion();
  lastWall = Date.now();
  if (away > 3600) setTimeout(() => offlineToast(away), 3200);
  S.seen = (S.seen || 0) + 1;
  save();
  requestAnimationFrame(t0 => { lastFrame = t0; requestAnimationFrame(frame); });
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else lastWall = Math.min(lastWall, Date.now()); });
window.addEventListener('pagehide', save);
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

// test / debug hook
window.__tank = { geo: () => ({ W, H, sandY, surfaceY }), look, rockBox, get decor() { return decor; }, get edit() { return edit; }, care: sec => care(sec, fish), get fish() { return fish; }, get food() { return food; }, get bubbles() { return bubbles; }, S: () => S, knock, dropFood, changeWater };
boot();
})();
