/* 電子魚缸 v1 — ASCII glow fish tank. Plain canvas + vanilla JS. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d');
const low = document.createElement('canvas'), lctx = low.getContext('2d');
const KEY = 'fishtank.v1';
const PX = 4;                       // CSS px per pixel in pixel-art mode
const INTRO = 2.8;                  // seconds of "pour fish in"
const AUTO_AT = 45, AUTO_COOLDOWN = 20 * 60 * 1000;   // v6 auto-feed: fire when avg 飽足 < 45, at most every 20 min
let autoFeeds = 0, autoChk = 0;
// v9 breeding: healthy adult pairs of the same species occasionally have 1–3 babies
const BREED_GAP_H = [3, 6], BREED_COOL_H = 12, OFFLINE_BABY_CAP = 3;
let hearts = [], offlineBabies = 0;
const canBreed = (f, now) => stageOf(f.growth || 0) === 2 && !f.sick && f.hunger >= 50 && f.mood >= 50 && (f.bt || 0) <= now;                                         // offline auto-feeds counted for the welcome-back toast
const HUNGER_PER_H = 12;            // full -> empty in ~8h
const DIRT_HOURS = 36;              // clean -> filthy in ~36h
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);
const MONO = 'ui-monospace, Menlo, "SF Mono", "DejaVu Sans Mono", monospace';

const SPECIES = {
  // strs/cols per growth stage: 幼魚 / 少年 / 成魚. A stage may be an array of lines (columns line up).
  // ac = per-character accent colours (stripes, spots, shell, fins). sy = body height. bob = vertical hover.
  clown:  { label: '小丑魚', strs: ['>|o>', '><|(|°>', '><|((|(|°>'], cols: ['#ffc49a', '#ff9a3c', '#ff7417'],
            ac: { '|': '#ffffff' }, size: 1.0, max: 70, acc: 1.6, wf: 7 },
  neon:   { label: '霓虹燈魚', kind: 'school', strs: ['-=°', '>-==°', '>--===°'], cols: ['#a8ecff', '#4ee6ff', '#1fc8ff'],
            ac: { '=': '#ff3d6e' }, sy: 0.8, size: 0.85, max: 115, acc: 2.6, wf: 12, burst: true },
  puffer: { label: '河豚', strs: ['<(°)', ['  .-.', '<(: °)', "  '-'"], ['  .--.', '<( :: °)', "  '--'"]],
            puffs: ['<{°}', ['  \\|/', '<{: °}', '  /|\\'], ['  \\||/', '<{ :: °}', '  /||\\']],
            cols: ['#fff0a8', '#ffe04a', '#ffc81a'], ac: { ':': '#d08a10', '*': '#ff9a3c' }, sy: 1.1, size: 1.05, max: 36, acc: 1.0, wf: 5, bob: 1.6, maxAng: 0.2 },
  shrimp: { label: '蝦子', kind: 'shrimp', strs: [['}~°', " '"], ['}~~~°=', " '''"], ['}~~~~°==', "  ''''"]], cols: ['#ffc8d2', '#ff8fa8', '#ff4d6a'],
            ac: { "'": '#ffd6de', '=': '#ffd6de' }, size: 0.85, max: 28, acc: 2.5, wf: 9 },
  crab:   { label: '螃蟹', kind: 'crab', strs: ['v(;;)v', '(\\/)(;;)(\\/)', '(\\/)(;,,;)(\\/)'], cols: ['#ffb592', '#ff7a4a', '#ff3b2f'],
            ac: { '\\': '#ffd0a0', '/': '#ffd0a0', 'v': '#ffd0a0' }, size: 0.8, max: 34, acc: 3, wf: 6 },
  minnow: { label: '群魚', kind: 'school', strs: ['<>', '>°>', '>-°>'], cols: ['#dfe9f0', '#eef7ff', '#ffffff'],
            ac: { '-': '#7fd0ff' }, sy: 0.85, size: 0.7, max: 120, acc: 2.8, wf: 13 },
  turtle: { label: '烏龜', kind: 'turtle', strs: [['  _', '-(@)o'], ['  __', '-(@@@)o', "  ' '"], ['  ____', '~{@@@@}O', "  '  '"]], cols: ['#a8f0b8', '#5fe08a', '#28c070'],
            ac: { '@': '#d8b060', '_': '#d8b060' }, size: 1.05, max: 24, acc: 0.8, wf: 3, bob: 0.7, maxAng: 0.3 },
  angel:  { label: '神仙魚', strs: [[' /', '>|°>', ' \\'], ['   /', '><(|°>', '   \\'], ['    /', '   /|', '><(| °>', '   \\|', '    \\']], cols: ['#e2d4ff', '#c0a0ff', '#9a66ff'],
            ac: { '|': '#ffe066' }, size: 1.0, max: 42, acc: 0.9, wf: 4, maxAng: 0.18 },
  betta:  { label: '鬥魚', strs: [['~', '~{°>', '~'], ['~~', '~~{((°>', '~~'], ['~~~.', '~~~{(((°>', "~~~'"]], cols: ['#ffb3e2', '#ff5ad0', '#ff1f8f'],
            ac: { '~': '#a070ff', '.': '#a070ff', "'": '#a070ff' }, size: 1.0, max: 48, acc: 1.4, wf: 6, fin: 2.4 },
};
SPECIES.jelly = { label: '水母', kind: 'jelly', strs: [[' _ ', '(_)', ' ) '], [' .-. ', '(   )', " '~' ", ' ) ( ', ' ( ) '],
    ['  .--.  ', ' (    ) ', '  \\~~/  ', '  )|(|  ', '  (|)|  ', '  )|(   ']], cols: ['#f3e2f2', '#ffc6ea', '#ff9fd8'],
  ac: { '|': '#bfe8ff', '~': '#fff0fa', '(': '#e8c8ff', ')': '#e8c8ff' }, alpha: 0.7, size: 1.0, max: 30, acc: 1, wf: 2 };
const kindOf = sp => SPECIES[sp].kind || 'swim';
const isBottom = f => { const k = kindOf(f.sp); return k === 'crab' || k === 'shrimp'; };
const strLen = str => Array.isArray(str) ? Math.max(...str.map(l => l.length)) : str.length;
const MAX_CREATURES = 100, SCHOOL_SIZE = 6;   // v9: cap raised 25 -> 100
const DEFAULT_NAME = { jelly: '水水', clown: '小丑', neon: '霓虹', puffer: '河豚', shrimp: '小蝦', crab: '阿蟹', minnow: '群魚', turtle: '龜龜', angel: '小仙', betta: '阿鬥' };
const STARTERS = [['shrimp', '小蝦'], ['crab', '阿蟹'], ['turtle', '龜龜'], ['angel', '小仙'], ['betta', '阿鬥']];
function starterList() {
  const out = STARTERS.map(([sp, name]) => ({ sp, name, hunger: 80, mood: 75, sick: false, growth: 0.08 }));
  for (let i = 0; i < SCHOOL_SIZE; i++) out.push({ sp: 'minnow', name: '群魚', grp: 1, hunger: 80, mood: 75, sick: false, growth: 0.08 });
  return out;
}
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
const ROCKS = [          // ASCII rocks, bottom-aligned on the sand
  [' ^ ', '(_)'],
  ['  /\\  ', ' /  \\_', '(_____)'],
  ['  ()  ', ' (  )_', '(_)(__)'],
];
const ROCKPX = [['.a.', 'aaa'], ['..a...', '.aab..', 'aaaaa.', 'aaaaaa'], ['.aa....', 'aabaa..', 'aaaaaaa']];

// pixel-art sprites (right-facing). a=body (stage colour) b=accent e=eye s=spike/legs
const BABY_PX = {
  clown: ['.aaa..', 'abaaa.', 'abaaea', '.aaa..'],
  neon: ['aaaae', '.bbb.'],
  puffer: ['.aaa.', 'aaaea', 'aabaa', '.aaa.'],
  shrimp: ['....b.', 'aaaaea', '.s.s..'],
  crab: ['b.e.e.b', 'baaaaab', '.a.a.a.'],
  minnow: ['.ae', 'aa.'],
  turtle: ['..bbb..', '.bbbbaa', 'abbbbae', '.a...a.'],
  angel: ['.a..', '.ba.', 'aabe', '.ba.', '.a..'],
  betta: ['bb.aa..', 'bbbaaae', 'bbbaaa.', 'bb.....'],
};
const ADULT_PX = {
  clown: ['....aaaaa....', 'a..aabaabaa..', 'aa.aabaabaaa.', 'aaaaabaabaaea', 'aa.aabaabaaa.', 'a..aabaabaa..', '....aaaaa....'],
  neon: ['a.aaaaaa..', 'aaaaaaaaae', 'a.bbbbbb..'],
  puffer: ['...aaaa...', '.aaaaaaaa.', 'aaabaabaea', 'aaaaaaaaaa', 'aabaabaaaa', '.aaaaaaaa.', '...aaaa...'],
  shrimp: ['.........bb.', '.aaaaaaa...b', 'aaaaaaaaaea.', 'a.aaaaaaa...', '...s.s.s.s..'],
  crab: ['b.b.e.e.b.b', 'bb.aaaaa.bb', '.aaaaaaaaa.', '..a.a.a.a..'],
  minnow: ['a.aaa.', 'aaaabe', 'a.aaa.'],
  turtle: ['....bbbb....', '..bbbbbbbb..', '.bbbbbbbbbaa', 'a.bbbbbbbbae', '.a.a....a.a.'],
  angel: ['....a....', '...aa....', '..aba....', '.aabaa...', 'aaabaaae.', 'aaabaaaaa', '.aabaa...', '..aba....', '...aa....', '....a....'],
  betta: ['bbb...........', 'bbbb..aaaa....', 'bbbbbaaaaaaa..', 'bbbbbbaaaaaaea', 'bbbbbaaaaaaaa.', 'bbbb..aaaa....', 'bbb...........'],
};
function shrink(rows, k) {
  const h = rows.length, w = rows[0].length, H2 = Math.max(2, Math.round(h * k)), W2 = Math.max(2, Math.round(w * k)), out = [];
  for (let r = 0; r < H2; r++) { let line = ''; for (let c = 0; c < W2; c++) line += rows[Math.min(h - 1, Math.floor(r / k))][Math.min(w - 1, Math.floor(c / k))]; out.push(line); }
  return out;
}
const SPR = { pufferBig: ['...s.s.s...', '..aaaaaaa..', '.saaaaaaas.', 'aaaaaaaaaea', 'aaaaaaaaaaa', '.saaaaaaas.', '..aaaaaaa..', '...s.s.s...'] };
BABY_PX.jelly = ['.aa.', 'abba', 's.s.', '.s.s'];
ADULT_PX.jelly = ['..aaaa..', '.aaaaaa.', 'aabaabaa', 'aaaaaaaa', '.s.s.s.s', 's.s.s.s.', '.s.s.s..', 's...s...'];
for (const k in ADULT_PX) SPR[k] = [BABY_PX[k], shrink(ADULT_PX[k], 0.75), ADULT_PX[k]];   // [幼魚, 少年, 成魚]

// ---------- state ----------
let S = load();
let W = 0, H = 0, DPR = 1, dprCap = 3, fs = 18, charW = 10, safe = { t: 0, r: 0, b: 0, l: 0 };
let surfaceY = 0, sandY = 0, bounds = { l: 0, r: 0, t: 0, b: 0 };
let decor = null, edit = null;
let fish = [], food = [], bubbles = [], ripples = [], crumbs = [], specks = [], weeds = [], sandRows = [];
let t = 0, intro = 0, shake = 0, lastWall = Date.now(), lastSave = 0;
let tilt = { raw: 0, x: 0 }, slosh = { s: 0, v: 0 }, waterDip = 0, changing = null, motionOn = false;
const groupTs = {};
let frameAvg = 16, slowFor = 0;

function freshState() {
  return { v: 3, decor: null, t: Date.now(), dirt: 0.05, style: 'ascii', seen: 0, motion: false, starter3: true,
    fish: ROSTER.map(([sp, name], i) => ({ sp, name, hunger: 80, mood: 75, sick: false, growth: 0.06 + (i % 3) * 0.05 })).concat(starterList()) };
}
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!s || !(s.v === 1 || s.v === 2 || s.v === 3) || !Array.isArray(s.fish)) s = freshState();
  // v1 -> v2 migration: keep fish/hunger/mood/dirt; fish start as babies; decor filled in at boot from screen width
  s.fish.forEach((f, i) => { if (typeof f.growth !== 'number') f.growth = 0.06 + (i % 3) * 0.05; });
  if (!Array.isArray(s.decor)) s.decor = null;
  else s.decor.forEach(d => { if (typeof d.s !== 'number') d.s = 1; });       // v2 -> v3: decor size
  s.fish = s.fish.filter(f => SPECIES[f.sp]);
  if (!s.starter3) {                                                           // v2 -> v3: new friends join once
    s.starter3 = true; const add = starterList();
    if (s.fish.length + add.length <= MAX_CREATURES) { s.fish = s.fish.concat(add); s.newFriends = true; }
  }
  if (typeof s.autoFeed !== 'boolean') s.autoFeed = false;
  if (typeof s.sound !== 'boolean') s.sound = true;
  s.fish.forEach(f => { if (f.sp === 'minnow') f.grp = 1; });
  if (typeof s.breed !== 'boolean') s.breed = true;                            // v9: breeding toggle, default on
  if (typeof s.breedT !== 'number') s.breedT = Date.now() + 3600e3;             // first litter no sooner than 1 h after update                 // v9: merge separate 群魚 groups into one school                            // v7: ambient sound, default on                   // v6: auto-feed setting, default off
  s.v = 3;
  return s;
}
function save() {
  S.t = Date.now();
  S.fish = fish.map(f => { const o = { sp: f.sp, name: f.name, hunger: f.hunger, mood: f.mood, sick: f.sick, growth: f.growth }; if (f.grp) o.grp = f.grp; if (f.bt) o.bt = f.bt; return o; });
  if (decor) S.decor = decor.map(d => ({ type: d.type, fx: +d.fx.toFixed(4), n: d.n, v: d.v, back: !!d.back, s: +(d.s || 1).toFixed(3) }));
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
}

// ---------- care simulation (also used for offline time) ----------
function care(sec, list, away) {
  let left = sec, born = [];
  const t0 = Date.now() - sec * 1000;
  while (left > 0) {
    const step = Math.min(left, 600); left -= step;
    const tnow = t0 + (sec - left) * 1000;
    if (away && S.breed && offlineBabies < OFFLINE_BABY_CAP && list.length + born.length < MAX_CREATURES && tnow >= (S.breedT || 0)) {
      const pair = findPair(list, tnow);
      if (pair) { const kids = litter(pair[0], pair[1], list.concat(born), tnow).slice(0, OFFLINE_BABY_CAP - offlineBabies); offlineBabies += kids.length; born = born.concat(kids); }
    }
    const h = step / 3600;
    S.dirt = clamp(S.dirt + h / DIRT_HOURS, 0, 1);
    if (away && S.autoFeed && list.length && list.reduce((a, f) => a + f.hunger, 0) / list.length < AUTO_AT) {
      for (const f of list) { f.hunger = clamp(f.hunger + 42, 0, 100); f.mood = clamp(f.mood + 4, 0, 100); }   // fed while away
      autoFeeds++;
    }
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
    for (const b of born) b.hunger = clamp(b.hunger - HUNGER_PER_H * h * 0.5, 40, 100);   // newborns stay fed enough while away
  }
  return born;
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
        S.decor.push({ type: 'weed', fx: clamp(((i + 0.5) / count * W + rnd(-12, 12)) / W, 0.02, 0.98), n: back ? (5 + Math.random() * 5) | 0 : (7 + Math.random() * 7) | 0, back, s: 1 });
      }
    }
    decor = S.decor.map(d => ({ ...d, s: d.s || 1, ph: rnd(0, 6.28), sp: rnd(0.7, 1.2), lift: 0 }));
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
  const k = d.s || 1;
  if (PLANTS[d.type]) return plantBox(d);
  if (d.type === 'weed') return { x0: d.x - charW * 1.2 * Math.max(1, k), x1: d.x + charW * 1.2 * Math.max(1, k), y0: sandY - d.n * fs * 0.78 * k - fs * 0.4 - d.lift, y1: sandY + fs * 0.5 - d.lift };
  const r = ROCKS[d.v] || ROCKS[0], w = (r[0].length * charW * 0.5 + charW * 0.3) * k + charW * 0.3;
  return { x0: d.x - w, x1: d.x + w, y0: sandY - r.length * fs * 0.82 * k - d.lift, y1: sandY + fs * 0.5 - d.lift };
}

// ---------- plant types (v5) ----------
// each returns glyphs [x, y, ch, colour] in css px for the current frame; used by ASCII and pixel renderers
const PLANTS = {
  kelp:    { label: '海帶', icon: '≀', n: 16, min: 4, max: 30, rowH: 0.8 },
  coral:   { label: '珊瑚', icon: 'Ψ', n: 6, min: 3, max: 10, rowH: 0.85 },
  grass:   { label: '草叢', icon: '"', n: 3, min: 1, max: 6, rowH: 0.6 },
  anemone: { label: '海葵', icon: '*', n: 4, min: 2, max: 8, rowH: 0.7 },
};
const TYPE_LABEL = { weed: '水草', rock: '石頭', kelp: '海帶', coral: '珊瑚', grass: '草叢', anemone: '海葵' };
const LEN_RANGE = { weed: [3, 22], kelp: [4, 30], coral: [3, 10], grass: [1, 6], anemone: [2, 8] };
function plantGlyphs(d) {
  const k = d.s || 1, sc = fs / 18 * k, out = [], base = sandY - (d.lift || 0), P = PLANTS[d.type], rh = fs * P.rowH * k;
  const sway = (j, sp, amp) => Math.sin(t * sp * d.sp + d.ph + j * 0.4) * j * amp * sc - slosh.s * 1.6 * j * j * sc;
  if (d.type === 'kelp') {          // tall golden-brown ribbon, slow wide wave, leaf blades
    for (let j = 0; j < d.n; j++) {
      const x = d.x + sway(j, 0.55, 1.3) + Math.sin(t * 1.1 + j * 0.7 + d.ph) * 2 * sc, y = base - j * rh;
      out.push([x, y, j % 2 ? '(' : ')', j > d.n - 3 ? '#e8d070' : '#c9a63a']);
      if (j % 4 === 2) out.push([x + charW * 0.7 * k * (j % 8 === 2 ? 1 : -1), y - rh * 0.3, '~', '#a8c040']);
    }
  } else if (d.type === 'coral') {  // branching coral: trunk | then Y branches, Ψ tips
    for (let j = 0; j < d.n; j++) {
      const cnt = j === 0 ? 1 : Math.min(1 + Math.floor(j / 2), 4), y = base - j * rh, top = j === d.n - 1;
      for (let i = 0; i < cnt; i++) {
        const x = d.x + (i - (cnt - 1) / 2) * charW * 0.95 * k + sway(j, 0.5, 0.25);
        out.push([x, y, j === 0 ? '|' : top ? 'Ψ' : (i + j) % 3 === 0 ? 'y' : 'Y', top ? '#ffc0a8' : '#ff7f6a']);
      }
    }
  } else if (d.type === 'grass') {  // short tuft of blades
    const blades = 5;
    for (let b = 0; b < blades; b++) {
      const bx = d.x + (b - 2) * charW * 0.55 * k, hgt = Math.max(1, d.n - (b === 0 || b === 4 ? 1 : 0));
      for (let j = 0; j < hgt; j++) {
        const x = bx + Math.sin(t * 2.2 * d.sp + d.ph + b * 1.3) * j * 1.6 * sc - slosh.s * 3 * j * sc;
        out.push([x, base - j * rh, j === hgt - 1 ? (b % 2 ? '"' : "'") : j === 0 ? ',' : '|', j === hgt - 1 ? '#c8ff7a' : '#8fe05a']);
      }
    }
  } else if (d.type === 'anemone') { // round base with waving tentacles and glowing-free yellow tips
    out.push([d.x, base, '(___)', '#ff9a5a']);
    for (let i = 0; i < 5; i++) {
      const tx = d.x + (i - 2) * charW * 0.7 * k;
      for (let j = 1; j <= d.n; j++) {
        const x = tx + Math.sin(t * 1.6 * d.sp + d.ph + i * 1.1 + j * 0.8) * j * 1.5 * sc + (i - 2) * j * 0.8 * sc - slosh.s * 2 * j * j * sc;
        out.push([x, base - j * rh, j === d.n ? 'o' : (i + j) % 2 ? '(' : ')', j === d.n ? '#ffe066' : '#d77bff']);
      }
    }
  }
  return out;
}
function plantBox(d) {
  const k = d.s || 1, P = PLANTS[d.type], hw = { kelp: 1.6, coral: 2.3, grass: 1.8, anemone: 2.4 }[d.type] * charW * k;
  const rows = d.type === 'anemone' ? d.n + 1 : d.n;
  return { x0: d.x - hw, x1: d.x + hw, y0: sandY - rows * fs * P.rowH * k - fs * 0.4 - d.lift, y1: sandY + fs * 0.5 - d.lift };
}
function drawPlants() {
  for (const d of decor) if (PLANTS[d.type]) {
    ctx.font = `${fs * (d.s || 1)}px ${MONO}`;
    for (const [x, y, ch, c] of plantGlyphs(d)) { ctx.fillStyle = c; ctx.fillText(ch, x, y); }
  }
}
function drawPlantsPx() {
  for (const d of decor) if (PLANTS[d.type]) for (const [x, y, ch, c] of plantGlyphs(d)) {
    lctx.fillStyle = c;
    const px = Math.round(x / PX), py = Math.round(y / PX);
    if (ch.length > 1) lctx.fillRect(px - 2, py, 5, 1);          // anemone base
    else { lctx.fillRect(px, py, 1, 1); if (ch === 'Ψ' || ch === 'Y' || ch === '~') { lctx.fillRect(px - 1, py - 1, 1, 1); lctx.fillRect(px + 1, py - 1, 1, 1); } }
  }
}

// ---------- fish ----------
function makeFish(p, i, pour) {
  const fromLeft = i % 2 === 0, fromTop = pour || i === 4 || isBottom(p);
  const f = { sp: p.sp, name: p.name, hunger: p.hunger, mood: p.mood, sick: p.sick, growth: p.growth || 0, lastStage: stageOf(p.growth || 0), bt: p.bt || 0,
    x: fromTop ? rnd(W * 0.3, W * 0.7) : fromLeft ? -60 - i * 30 : W + 60 + i * 30,
    y: fromTop ? surfaceY - 30 - (pour ? rnd(0, 40) : rnd(0, 20)) : rnd(H * 0.2, H * 0.6), grp: p.grp || 0, mode: 'walk', surfT: rnd(20, 60), surfacing: 0,
    vx: 0, vy: 0, face: fromLeft ? 1 : -1, flip: fromLeft ? 1 : -1, ang: 0, ph: rnd(0, 6), startle: 0, fx: 0, fy: 0,
    puff: 0, wt: 0, tx: 0, ty: 0, pause: 0, bubT: rnd(1, 4), enter: true, seed: rnd(0, 6.28) };
  f.tx = rnd(W * 0.2, W * 0.8); f.ty = rnd(bounds.t + 20, bounds.b - 20);
  if (f.sp === 'puffer') f.ty = rnd((bounds.t + bounds.b) / 2, bounds.b - 10);
  f.vx = f.face * SPECIES[f.sp].max * 1.2;
  if (isBottom(f)) { f.vx = rnd(-20, 20); f.vy = 20; f.tx = rnd(W * 0.1, W * 0.9); }
  if (fromTop && !isBottom(f)) { f.vx = rnd(-30, 30); f.vy = 60; }
  return f;
}
const halfLen = f => { const L = look(f); return strLen(L.str) * charW * L.scale / 2; };
const mouthX = f => f.sp === 'crab' || f.sp === 'jelly' ? f.x : f.x + Math.sign(f.flip || 1) * halfLen(f) * 0.9;
const schoolKey = f => kindOf(f.sp) === 'school' ? f.sp + ':' + (f.grp || 0) : null;
const floorY = f => sandY - fs * 0.34 * look(f).scale;
function bottomFood(f) {
  let best = null, bd = 1e9;
  for (const p of food) if (p.settled || p.y > floorY(f) - fs * 1.5) { const d = Math.abs(p.x - f.x); if (d < bd) { bd = d; best = p; } }
  return best;
}
function nearestFood(f) {
  let best = null, bd = 1e9;
  for (const p of food) { const d = Math.hypot(p.x - f.x, p.y - f.y); if (d < bd) { bd = d; best = p; } }
  return best;
}
function pickWander(f) {
  const b = bounds;
  if (f.sp === 'puffer') { f.tx = rnd(b.l, b.r); f.ty = rnd(b.t + (b.b - b.t) * 0.45, b.b); f.pause = Math.random() < 0.5 ? rnd(1, 3) : 0; }
  else if (f.sp === 'betta') { f.tx = rnd(b.l, b.r); f.ty = rnd(b.t, b.t + (b.b - b.t) * 0.55); f.pause = Math.random() < 0.3 ? rnd(1, 2.5) : 0; }
  else if (f.sp === 'angel') { f.tx = clamp(f.x + rnd(-120, 120), b.l, b.r); f.ty = rnd(b.t + 20, b.b - 20); }
  else if (f.sp === 'turtle') { f.tx = rnd(b.l, b.r); f.ty = rnd(b.t + (b.b - b.t) * 0.3, b.b); f.pause = Math.random() < 0.4 ? rnd(2, 5) : 0; }
  else { f.tx = rnd(b.l, b.r); f.ty = rnd(b.t + 10, b.b - (b.b - b.t) * 0.15); }
  f.wt = rnd(3, 8);
}
function updateBottom(f, dt) {
  const sp = SPECIES[f.sp];
  const hf = f.sick ? 0.35 : f.hunger < 30 ? 0.45 + 0.55 * f.hunger / 30 : 1;
  const maxS = sp.max * hf * (0.75 + 0.25 * f.mood / 100);
  const fy = floorY(f), air = f.mode !== 'glass' && f.y < fy - 1;
  const toGlass = side => { f.mode = 'glass'; f.wallSide = side; f.gt = rnd(4, 10); f.ty = rnd(bounds.t + 30, fy - 20); };
  if (f.enter) {
    f.vy = Math.min(f.vy + 120 * dt, 110); f.vx *= 1 - dt * 0.5;
    if (!air) { f.enter = false; f.wt = 0; }
  } else if (f.mode === 'glass') {          // shrimp crawling on the side glass
    f.gt -= dt;
    const wx = f.wallSide < 0 ? fs * 0.7 : W - fs * 0.7;
    f.x += (wx - f.x) * Math.min(1, dt * 6);
    if (Math.abs(f.ty - f.y) < 6) f.ty = rnd(bounds.t + 30, fy - 20);
    f.vy = f.held ? 0 : Math.sign(f.ty - f.y) * maxS * 0.5; f.vx = 0;
    if (f.gt <= 0 || bottomFood(f)) { f.mode = 'walk'; f.vy = 0; f.vx = -f.wallSide * 30; }
  } else if (f.startle > 0) {
    f.startle -= dt;
    if (!air) f.vx *= 1 - Math.min(1, dt * 1.2);
  } else {
    let dir = 0, want = 0;
    const fd = f.hunger < 96 ? bottomFood(f) : null;
    if (fd) { dir = Math.sign(fd.x - f.x); want = Math.abs(fd.x - f.x) < 3 ? 0 : maxS * 1.1; }
    else {
      f.wt -= dt;
      if (f.pause > 0) f.pause -= dt;
      else {
        dir = Math.sign(f.tx - f.x); want = maxS * 0.6;
        if (Math.abs(f.tx - f.x) < 8 || f.wt <= 0) {
          f.tx = rnd(fs, W - fs); f.wt = rnd(4, 9); f.pause = Math.random() < 0.6 ? rnd(1, 4) : 0;
          if (f.sp === 'shrimp' && Math.random() < 0.3) toGlass(f.x < W / 2 ? -1 : 1);
        }
      }
      if (f.sp === 'shrimp' && !air && f.mode === 'walk' && Math.random() < dt * 0.25) { f.vy = -rnd(55, 100); f.vx += f.face * 30; }   // hop
    }
    if (f.held) want = 0;
    if (!air && f.mode === 'walk') f.vx += (dir * want - f.vx) * Math.min(1, sp.acc * dt);
  }
  if (f.mode !== 'glass') {
    if (f.y < fy - 1 && !f.enter) { f.vy = Math.min(f.vy + 150 * dt, 80); f.vx *= 1 - dt * 0.8; }
    f.vx += tilt.x * 60 * dt;
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.y >= fy) { f.y = fy; if (f.vy > 0) f.vy = 0; }
    const m = fs * 0.7;
    if (f.x < m) { f.x = m; f.vx = Math.abs(f.vx) * 0.3; if (f.sp === 'shrimp' && !f.enter && f.startle <= 0 && Math.random() < 0.5) toGlass(-1); }
    if (f.x > W - m) { f.x = W - m; f.vx = -Math.abs(f.vx) * 0.3; if (f.sp === 'shrimp' && !f.enter && f.startle <= 0 && Math.random() < 0.5) toGlass(1); }
  } else f.y = clamp(f.y + f.vy * dt, bounds.t, fy);
  if (f.mode !== 'glass') for (const o of fish) if (o !== f && isBottom(o) && o.mode !== 'glass') {   // don't pile up
    const dx = f.x - o.x, gap = (halfLen(f) + halfLen(o)) * 0.85;
    if (Math.abs(dx) < gap && Math.abs(f.y - o.y) < fs) f.x = clamp(f.x + Math.sign(dx || f.ph - o.ph) * Math.min(45 * dt, gap - Math.abs(dx)), fs * 0.7, W - fs * 0.7);
  }
  let targAng = 0;
  if (f.sp === 'crab') { f.face = 1; f.flip = 1; }
  else {
    if (f.mode === 'glass') { f.face = f.wallSide; targAng = -Math.PI / 2; }
    else if (f.startle <= 0) { if (f.vx > 5) f.face = 1; else if (f.vx < -5) f.face = -1; }
    if (f.mode !== 'glass' && f.y < fy - 2) targAng = clamp(Math.atan2(f.vy, Math.abs(f.vx) + 20) * 0.5, -0.4, 0.4);
    f.flip += (f.face - f.flip) * Math.min(1, dt * 5);
  }
  f.ang += (targAng - f.ang) * Math.min(1, dt * 5);
  f.ph += dt * sp.wf * (0.3 + Math.min(1.5, Math.abs(f.vx) / sp.max));
}
function updateJelly(f, dt) {   // pulse up, drift slowly down, steer weakly toward food
  const sp = SPECIES[f.sp], hf = f.sick ? 0.4 : f.hunger < 30 ? 0.5 + 0.5 * f.hunger / 30 : 1;
  f.pulseT = (f.pulseT == null ? rnd(0, 2) : f.pulseT) - dt;
  const low = bounds.b - fs * 2, high = surfaceY + fs * 1.6;
  if (f.enter) { if (f.y > surfaceY + fs * 3) f.enter = false; f.vy = Math.max(f.vy, 30); }
  else if (((f.pulseT <= 0 && (f.y > (f.jy || (f.jy = rnd(surfaceY + 90, low))) || Math.random() < 0.004)) || f.y > low) && !f.held) {
    if (Math.random() < 0.35) f.jy = rnd(surfaceY + 90, low);
    f.pulseT = rnd(1.8, 3.2) / hf; f.pulse = 1;
    f.vy = -rnd(40, 65) * hf * (f.y < high + 40 ? 0.3 : 1);
  }
  f.pulse = Math.max(0, (f.pulse || 0) - dt * 2.2);
  f.vy = Math.min(f.vy + 26 * dt, 18);             // water drag + slow sink
  if (f.y < high) f.vy = Math.max(f.vy, 5);
  const fd = f.hunger < 96 ? nearestFood(f) : null;
  if (f.startle > 0) f.startle -= dt;
  else {
    let tx = fd ? fd.x : f.tx; if (!fd && (Math.abs(f.tx - f.x) < 10 || Math.random() < dt * 0.1)) f.tx = rnd(bounds.l, bounds.r);
    f.vx += (clamp((tx - f.x) * 0.3, -sp.max * 0.5, sp.max * 0.5) - f.vx) * Math.min(1, dt * 0.8);
  }
  if (f.held) { f.vx *= 0.9; f.vy *= 0.9; }
  f.vx += tilt.x * 30 * dt;
  f.vx *= 1 - dt * 0.3;
  f.x = clamp(f.x + f.vx * dt, fs, W - fs); f.y = clamp(f.y + f.vy * dt, surfaceY - 40, sandY - fs * 1.5);
  f.face = 1; f.flip = 1; f.ang += (clamp(f.vx / 120, -0.25, 0.25) - f.ang) * Math.min(1, dt * 2);
  f.ph += dt * sp.wf;
}
function updateFish(f, dt, schools) {
  const sp = SPECIES[f.sp];
  if (isBottom(f)) { updateBottom(f, dt); afterMove(f, dt); return; }
  if (sp.kind === 'jelly') { updateJelly(f, dt); afterMove(f, dt); return; }
  const key = schoolKey(f), neonC = key && schools[key], gT = key && groupTs[key];
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
    else if (neonC && gT) {
      dx = (gT.x - f.x) * 0.6 + (neonC.x - f.x) * 0.9 + neonC.vx * 0.4;
      dy = (gT.y - f.y) * 0.6 + (neonC.y - f.y) * 0.9 + neonC.vy * 0.4;
      const sepR = fs * (f.sp === 'minnow' ? 1.5 : 2.2);
      for (const o of fish) if (o !== f && schoolKey(o) === key) {
        const ox = f.x - o.x, oy = f.y - o.y, d = Math.hypot(ox, oy);
        if (d < sepR && d > 0.1) { dx += ox / d * 160; dy += oy / d * 160; }
      }
      want = maxS * 0.7;
    } else if (f.surfacing > 0) {        // turtle comes up for air
      dx = f.tx - f.x; dy = f.ty - f.y; want = maxS * 0.8; arrive = true;
      if (Math.abs(dy) < 12) {
        f.surfacing -= dt;
        if (f.surfacing <= 0) { f.surfT = rnd(30, 80); pickWander(f); for (let k = 0; k < 4; k++) bubbles.push(newBubble(f.x + rnd(-8, 8), f.y + 6, k % 2 === 0, rnd(30, 50))); }
      }
    } else {
      if (sp.kind === 'turtle') { f.surfT -= dt; if (f.surfT <= 0) { f.surfacing = rnd(3, 5); f.tx = f.x; f.ty = surfaceY + fs * 0.75; } }
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
  if (sp.burst && f.startle <= 0 && !f.enter) want *= 0.5 + 1.0 * Math.max(0, Math.sin(t * 2.4 + f.seed));   // neon: dart, coast, dart
  if (f.held) want = 0;
  const k = Math.min(1, sp.acc * dt * (f.startle > 0 ? 3 : 1));
  f.vx += (dx / d * want - f.vx) * k;
  f.vy += (dy / d * want - f.vy) * k * 0.85;
  // tilt: water sloshes "downhill"
  f.vx += tilt.x * 40 * dt;
  // soft walls
  if (!f.enter) {
    if (f.x < bounds.l) f.vx += (bounds.l - f.x) * 4 * dt;
    if (f.x > bounds.r) f.vx -= (f.x - bounds.r) * 4 * dt;
    if (f.y < bounds.t && !(f.surfacing > 0)) f.vy += (bounds.t - f.y) * 4 * dt;
    if (f.y > bounds.b) f.vy -= (f.y - bounds.b) * 4 * dt;
  }
  const sp2 = Math.hypot(f.vx, f.vy), lim = f.startle > 0 ? sp.max * 3 : sp.max * 1.5;
  if (sp2 > lim) { f.vx *= lim / sp2; f.vy *= lim / sp2; }
  f.x += f.vx * dt; f.y += f.vy * dt;
  if (!f.enter) { f.x = clamp(f.x, 6, W - 6); f.y = clamp(f.y, surfaceY + fs * 0.6, sandY - fs * 0.4); }
  // facing with hysteresis, smooth flip through 0
  if (f.vx > 6) f.face = 1; else if (f.vx < -6) f.face = -1;
  f.flip += (f.face - f.flip) * Math.min(1, dt * 5);
  const mA = sp.maxAng || 0.45, targAng = clamp(Math.atan2(f.vy, Math.abs(f.vx) + 15), -mA, mA);
  f.ang += (targAng - f.ang) * Math.min(1, dt * 4);
  f.ph += dt * sp.wf * (0.4 + Math.min(1.5, Math.hypot(f.vx, f.vy) / sp.max));
  f.puff = Math.max(0, f.puff - dt / 4);
  afterMove(f, dt);
}
function afterMove(f, dt) {
  const L = look(f), reach = fs * 0.7 * Math.max(1, L.scale);
  // eat
  for (let i = food.length - 1; i >= 0; i--) {
    const p = food[i];
    if (f.hunger < 99 && Math.hypot(p.x - mouthX(f), p.y - f.y) < reach) {
      food.splice(i, 1); f.hunger = clamp(f.hunger + 14, 0, 100); f.mood = clamp(f.mood + 4, 0, 100);
      if (f.sick && f.hunger >= 35 && S.dirt < 0.85) f.sick = false;
      crumbs.push({ x: p.x, y: p.y, t: 0, ch: Math.random() < 0.5 ? '*' : '+' });
      break;
    }
  }
  // breathe bubbles
  f.bubT -= dt;
  if (f.bubT <= 0) { f.bubT = rnd(2, 6) * (isBottom(f) ? 3 : 1) * (f.sp === 'minnow' ? 2.5 : 1) * Math.max(1, fish.length / 25) / (f.startle > 0 ? 3 : 1); if (bubbles.length < 60) bubbles.push(newBubble(mouthX(f), f.y - fs * 0.2, false)); }
}
function newBubble(x, y, big, vy) { return { x, y, vy: vy || rnd(22, 38), ph: rnd(0, 6), age: 0, big, grow: Math.random() < 0.5 ? rnd(1.5, 3.5) : 1e9 }; }
const isBig = b => b.big || b.age > b.grow;

// ---------- interactions ----------
function knock(x, y) {
  ripples.push({ x, y, t: 0 }); shake = 1; sfx(knockSound); bloop(0.4);
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
    const sp = SPECIES[f.sp];
    if (f.sp === 'crab') { f.vy = 0; f.vx = Math.sign(f.x - x || 1) * sp.max * (3 + 3 * s); f.startle = 1 + s; }
    else if (f.sp === 'shrimp') {          // tail flick: shoots backwards without turning
      f.mode = 'walk'; f.vx = -f.face * sp.max * (4 + 4 * s); f.vy = -rnd(70, 130) * (0.5 + s); f.startle = 0.9;
    } else if (f.sp === 'turtle') { f.surfacing = 0; f.vx *= 0.6; f.vy *= 0.6; }
    else if (f.sp === 'jelly') { f.vx = ox * 50 * (0.4 + s); f.vy = oy * 35 * (0.4 + s); f.startle = 1.2; }
  }
  if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
}
function dropFood(x, n) {
  if (performance.now() - snd.lastBloop > 300) { sfx(sprinkleSound); bloop(0.5); }
  for (let i = 0; i < n && food.length < 40; i++) {
    food.push({ x: clamp(x + rnd(-14, 14), 10, W - 10), y: surfaceY + rnd(-6, 4), vy: rnd(16, 26), ph: rnd(0, 6), age: 0, settled: false });
  }
}
function autoFeedTick() {
  if (!S.autoFeed || edit || !fish.length || intro < 3) return;
  const avg = fish.reduce((a, f) => a + f.hunger, 0) / fish.length;
  if (avg >= AUTO_AT || Date.now() - (S.autoT || 0) < AUTO_COOLDOWN || food.length > 4) return;
  S.autoT = Date.now();
  const n = clamp(Math.ceil(fish.length * 0.7), 4, 12);
  for (let i = 0; i < n; i++) dropFood(rnd(W * 0.12, W * 0.88), 1);
  toast('自動餵食', 1.6); save();
}
function setAutoFeed(on) { S.autoFeed = on; if (on) S.autoT = 0; save(); renderPanel(); toast(on ? '自動餵食：開（魚餓了會自己撒飼料）' : '自動餵食：關', 1.8); }
function feedButton() { for (let i = 0; i < 5; i++) dropFood(rnd(W * 0.15, W * 0.85), 1); toast('撒了一把飼料'); }
function changeWater() {
  if (changing) return;
  changing = { t: 0, from: S.dirt };
  for (let i = 0; i < 28; i++) bubbles.push(newBubble(rnd(0, W), sandY - rnd(0, 60), Math.random() < 0.5, rnd(90, 160)));
}

// ---------- motion ----------
// tilt toggle: S.tiltOn = user preference (persisted); motionReady = sensor permission granted this session
const tiltAvailable = typeof DeviceMotionEvent !== 'undefined' || typeof DeviceOrientationEvent !== 'undefined';
let motionReady = false, listening = false;
function sensorLive() { if (!motionReady) { motionReady = true; tiltLabel(); } }   // events arriving = permission is active
function onOrient(e) { if (!S.tiltOn) return; if (e.gamma != null) { tilt.raw = clamp(e.gamma / 40, -1, 1); motionOn = true; sensorLive(); } }
function onMotion(e) {
  if (!S.tiltOn) return;
  const gr = e.accelerationIncludingGravity;
  if (gr && gr.x != null) sensorLive();      // ignore empty events some browsers send without sensors
  const a = e.acceleration;
  if (a && a.x != null) { const m = Math.hypot(a.x, a.y || 0); if (m > 7) { slosh.v += clamp(a.x, -15, 15) * 0.004; } }
  if (!motionOn && e.accelerationIncludingGravity && e.accelerationIncludingGravity.x != null) {
    let gx = e.accelerationIncludingGravity.x / 9.8; if (!/iP(hone|ad|od)/.test(navigator.userAgent)) gx = -gx;
    tilt.raw = clamp(-gx * 1.3, -1, 1);
  }
}
function listenMotion() {
  if (listening) return; listening = true;
  window.addEventListener('deviceorientation', onOrient);
  window.addEventListener('devicemotion', onMotion);
}
function tiltLabel() {
  const b = $('bTilt'); if (!b) return;
  const pending = S.tiltOn && needsPerm && !motionReady;
  b.textContent = pending ? '📱 傾斜：點此啟用' : S.tiltOn ? '📱 傾斜：開' : '📱 傾斜：關';
  b.classList.toggle('on', S.tiltOn && !pending);
}
function setTilt(on) {
  S.tiltOn = on;
  if (!on) { tilt.raw = 0; motionOn = false; }       // water and fish ease back to level via the existing smoothing
  save(); tiltLabel();
}
function tiltButton() {
  if (S.tiltOn && (motionReady || !needsPerm)) { setTilt(false); toast('傾斜已關閉，水面會慢慢回平', 1.8); return; }
  if (needsPerm && !motionReady) { askMotion(true); return; }
  listenMotion(); setTilt(true); toast('傾斜已開啟', 1.4);
}
const needsPerm = typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';
let permAsked = false;
function askMotion(fromButton) {
  if (!needsPerm || permAsked) return; permAsked = true;
  DeviceMotionEvent.requestPermission().then(r => {
    permAsked = false;
    if (r === 'granted') {
      S.motion = true; motionReady = true; listenMotion();
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => {});
      setTilt(true);
      if (fromButton) toast('傾斜已開啟，傾斜手機水會晃喔');
    } else { if (fromButton) toast('沒有取得傾斜權限（可在 Safari 設定重開）'); tiltLabel(); }
  }).catch(() => { permAsked = false; tiltLabel(); });
}

// ---------- sound (v7): Web Audio only, no files ----------
const snd = { ctx: null, master: null, water: null, trickle: null, dropT: 0, nextBloop: null, lastBloop: 0 };
const SND_VOL = 0.55;
// v9 water: no noise bed at all — only sparse, quiet droplets every 150–500 ms
function droplet(ac, dest, t0, rand = Math.random) {
  const r = (a, b) => a + rand() * (b - a);
  const f0 = 800 * Math.pow(3000 / 800, rand() * rand() * 0.6 + rand() * 0.4), dur = r(0.012, 0.045);
  const amp = 0.008 + Math.pow(rand(), 2.4) * 0.05;               // mostly tiny, a few brighter ones
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f0 * r(1.25, 1.9), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(amp, t0 + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.01);
}
function nextDropGap(rand = Math.random) { return 0.15 + Math.pow(rand(), 1.3) * 0.35; }   // irregular, sparse
function trickleTick() {
  const ac = snd.ctx; if (!ac || ac.state !== 'running' || !S.sound || document.hidden) return;
  if (snd.dropT < ac.currentTime + 0.01) snd.dropT = ac.currentTime + 0.02;
  while (snd.dropT < ac.currentTime + 0.25) { droplet(ac, snd.water, snd.dropT); snd.dropT += nextDropGap(); }
}
function initAudio() {
  if (snd.ctx) return snd.ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  const ac = new AC(); snd.ctx = ac;
  snd.master = ac.createGain(); snd.master.gain.value = 0; snd.master.connect(ac.destination);
  snd.water = ac.createGain(); snd.water.gain.value = 1; snd.water.connect(snd.master);
  snd.dropT = 0;
  snd.trickle = setInterval(trickleTick, 70);
  scheduleBloop();
  return ac;
}
// v8: knuckle-on-glass knock — bandpassed noise click + quickly decaying ring of a few partials (< 150 ms)
function knockSound(ac, dest, t0, rand = Math.random) {
  const v = 0.75 + rand() * 0.4, p = 0.92 + rand() * 0.16;
  const n = Math.floor(ac.sampleRate * 0.03), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (rand() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.004));
  const src = ac.createBufferSource(); src.buffer = buf;
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000 * p; bp.Q.value = 1.2;
  const cg = ac.createGain(); cg.gain.value = 0.32 * v;
  src.connect(bp); bp.connect(cg); cg.connect(dest); src.start(t0);
  [[1550, 0.07, 0.09], [2330, 0.045, 0.06], [2980, 0.03, 0.04]].forEach(([f, a, dec]) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = f * p;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(a * v, t0 + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dec);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dec + 0.01);
  });
}
// v8: flakes shaken from a tube — many tiny highpassed noise grains (3–8 kHz) over ~0.6 s with a gentle fade
function sprinkleSound(ac, dest, t0, rand = Math.random) {
  const len = 0.45 + rand() * 0.3, sr = ac.sampleRate, n = Math.floor(sr * (len + 0.05));
  const buf = ac.createBuffer(1, n, sr), d = buf.getChannelData(0);
  for (let t = 0; t < len; t += 0.004 + rand() * 0.012) {               // random grain timing
    const env = Math.min(1, t / 0.06) * Math.pow(1 - t / len, 1.5), a = env * (0.3 + rand() * 0.7);
    const i0 = Math.floor(t * sr), gl = Math.floor(sr * (0.002 + rand() * 0.004));
    for (let i = 0; i < gl && i0 + i < n; i++) d[i0 + i] += (rand() * 2 - 1) * a * Math.sin(Math.PI * i / gl);
  }
  const src = ac.createBufferSource(); src.buffer = buf;
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 8000;
  const g = ac.createGain(); g.gain.value = 0.16;
  src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(dest); src.start(t0);
}
function sfx(fn) { const ac = snd.ctx; if (!ac || !S.sound || ac.state !== 'running') return; fn(ac, snd.master, ac.currentTime + 0.005); }
function renderSfxSample(kind, sec = 2.5) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, ac = new OAC(1, Math.floor(44100 * sec), 44100);
  const m = ac.createGain(); m.gain.value = SND_VOL; m.connect(ac.destination);
  if (kind === 'knock') [0.1, 0.8, 1.5].forEach(t => knockSound(ac, m, t)); else [0.1, 1.3].forEach(t => sprinkleSound(ac, m, t));
  return ac.startRendering().then(b => Array.from(b.getChannelData(0)));
}
// offline render of the water layer (bubbles excluded) for previews/tests
function renderWaterSample(sec = 10) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, ac = new OAC(1, Math.floor(44100 * sec), 44100);
  const m = ac.createGain(); m.gain.value = SND_VOL; m.connect(ac.destination);
  for (let t = 0.02; t < sec; t += nextDropGap()) droplet(ac, m, t);
  return ac.startRendering().then(b => Array.from(b.getChannelData(0)));
}
function bloop(vol = 1) {                 // a soft bubble: sine with a quick upward pitch sweep
  const ac = snd.ctx; if (!ac || !S.sound || ac.state !== 'running') return;
  const t0 = ac.currentTime + 0.01, f0 = rnd(260, 520), dur = rnd(0.07, 0.13);
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f0 * rnd(2.2, 3.2), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.09 * vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.05);
  o.connect(g); g.connect(snd.master); o.start(t0); o.stop(t0 + dur + 0.08);
  snd.lastBloop = performance.now();
}
function scheduleBloop() {
  clearTimeout(snd.nextBloop);
  snd.nextBloop = setTimeout(() => {
    if (!document.hidden) { bloop(rnd(0.35, 0.8)); if (Math.random() < 0.35) setTimeout(() => bloop(rnd(0.25, 0.5)), rnd(90, 220)); }
    scheduleBloop();
  }, rnd(2500, 8000));
}
function soundApply() {                   // fade master to on/off; suspend when off or hidden
  const ac = snd.ctx; if (!ac) return;
  const on = S.sound && !document.hidden, now = ac.currentTime;
  snd.master.gain.cancelScheduledValues(now); snd.master.gain.setValueAtTime(snd.master.gain.value, now);
  if (on) { if (ac.state !== 'running') ac.resume().catch(() => {}); snd.master.gain.linearRampToValueAtTime(SND_VOL, now + 1.2); }
  else { snd.master.gain.linearRampToValueAtTime(0, now + 0.15); setTimeout(() => { if (!(S.sound && !document.hidden) && ac.state === 'running') ac.suspend().catch(() => {}); }, 200); }
}
function soundGesture() {                 // iOS: audio can only start inside a user gesture
  if (!S.sound) return;
  const ac = initAudio(); if (!ac) return;
  if (ac.state !== 'running') ac.resume().then(soundApply).catch(() => {});
  else if (snd.master.gain.value < SND_VOL * 0.9) soundApply();
}
['pointerdown', 'touchend', 'click'].forEach(ev => document.addEventListener(ev, soundGesture, { capture: true, passive: true }));
function setSound(on) {
  S.sound = on; save();
  if (on) { initAudio(); soundApply(); } else soundApply();
  renderPanel(); toast(on ? '聲音：開' : '聲音：關', 1.4);
}

// ---------- input ----------
let press = null;
cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (edit) { editDown(e); return; }
  if (needsPerm && S.tiltOn && !motionReady && !permAsked) askMotion(false);   // re-grant on first touch if it was on
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
cv.addEventListener('pointercancel', e => {
  if (edit) { editCancel(e); return; } if (press) clearTimeout(press.timer); press = null; });
['gesturestart', 'gesturechange', 'dblclick'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (!(e.target.closest && e.target.closest('#panel'))) e.preventDefault(); }, { passive: false });
const btn = (id, fn) => $(id).addEventListener('click', e => { e.stopPropagation(); fn(); });
btn('bFeed', feedButton);
btn('bWater', () => { changeWater(); });
// v9: tapping 狀態 again closes it (menu stays open); the panel sits below the dropdown so 狀態 and ≡ stay tappable
function placePanel() {
  const p = $('panel'), bar = $('bar');
  const r = document.body.classList.contains('menu') && bar.getBoundingClientRect();
  p.style.top = r && r.height ? Math.round(r.bottom + 8) + 'px' : '';
  p.style.maxHeight = r && r.height ? Math.max(160, innerHeight - r.bottom - 24) + 'px' : '';
}
btn('bInfo', () => { const p = $('panel'); p.style.display = p.style.display === 'block' ? 'none' : 'block'; placePanel(); renderPanel(); });
$('panel').addEventListener('click', e => {
  if (e.target.closest && e.target.closest('#pBreed')) { e.stopPropagation(); S.breed = !S.breed; save(); renderPanel(); toast(S.breed ? '繁殖：開（健康的成魚偶爾會生小寶寶）' : '繁殖：關', 1.8); return; }
  if (e.target.closest && e.target.closest('#pSound')) { e.stopPropagation(); setSound(!S.sound); return; }
  if (e.target.closest && e.target.closest('#pAuto')) { e.stopPropagation(); setAutoFeed(!S.autoFeed); return; }
  $('panel').style.display = 'none';
});
btn('bStyle', () => { S.style = S.style === 'ascii' ? 'pixel' : 'ascii'; styleLabel(); save(); });
btn('bTilt', tiltButton);
// v8: buttons hidden by default; ≡ shows/hides the bottom bar + tilt toggle; auto-collapse after 8 s idle
let menuT = 0;
function setMenu(open) { document.body.classList.toggle('menu', open); menuT = Date.now(); if (typeof placePanel === 'function') placePanel(); }
function menuIdleCheck() {
  if (window.__menuPin || !document.body.classList.contains('menu') || edit || $('panel').style.display === 'block') { menuT = Date.now(); return; }
  if (Date.now() - menuT > 8000) setMenu(false);
}
document.addEventListener('pointerdown', () => { menuT = Date.now(); }, { capture: true, passive: true });
btn('bMenu', () => {                       // ≡ closes the dropdown and the 狀態 panel together
  const open = document.body.classList.contains('menu');
  if (open) $('panel').style.display = 'none';
  setMenu(!open);
});
function styleLabel() { $('bStyle').textContent = S.style === 'ascii' ? '▦ 像素' : 'Aa 字元'; }

// ---------- edit mode: 裝飾 (decor) + 生物 (creatures) ----------
const MAX_DECOR = 40;
const SIZES = [['小', 0.7], ['中', 1], ['大', 1.4]];
const placeTop = () => surfaceY + (sandY - surfaceY) * 0.5;
function hitDecor(x, y) {
  for (let i = decor.length - 1; i >= 0; i--) { const b = rockBox(decor[i]); if (x >= b.x0 - 6 && x <= b.x1 + 6 && y >= b.y0 - 6 && y <= b.y1 + 6) return decor[i]; }
  return null;
}
function hitFish(x, y) {
  let best = null, bd = 1e9;
  for (const f of fish) { const d = Math.hypot(f.x - x, f.y - y), r = Math.max(halfLen(f), fs * 0.8) + 12; if (d < r && d < bd) { bd = d; best = f; } }
  return best;
}
function overTrash(x, y) { const r = $('eTrash').getBoundingClientRect(); return r.width > 0 && x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12; }
function removeDecor(d) {
  const i = decor.indexOf(d); if (i < 0) return;
  decor.splice(i, 1); syncDecor(); save();
  if (edit && edit.sel === d) selectDecor(null);
  for (let k = 0; k < 8; k++) bubbles.push(newBubble(d.x + rnd(-14, 14), sandY - rnd(0, 40), Math.random() < 0.4, rnd(50, 90)));
  toast('移除了' + (TYPE_LABEL[d.type] || ''), 1.4);
}
function addDecor(x) {
  if (decor.length >= MAX_DECOR) { toast('放太多了，先刪掉一些吧'); return; }
  const d = edit.type === 'weed'
    ? { type: 'weed', fx: 0, n: (7 + Math.random() * 7) | 0, v: 0, back: false, s: 1 }
    : PLANTS[edit.type] ? { type: edit.type, fx: 0, n: PLANTS[edit.type].n, v: 0, back: false, s: 1 }
    : { type: 'rock', fx: 0, n: 0, v: edit.rv = (edit.rv + 1) % ROCKS.length, back: false, s: 1 };
  d.fx = clamp(x, 10, W - 10) / W; d.ph = rnd(0, 6.28); d.sp = rnd(0.7, 1.2); d.lift = 30;
  decor.push(d); syncDecor(); save();
}
function creatureCount() { return fish.length; }
function uniqueName(sp, list = fish) {
  const base = DEFAULT_NAME[sp] || SPECIES[sp].label;
  if (sp === 'minnow') return base;
  if (!list.some(f => f.name === base)) return base;
  for (let i = 2; ; i++) if (!list.some(f => f.name === base + i)) return base + i;
}
// find the closest eligible same-species pair
function findPair(list, now) {
  let best = null, bd = Infinity;
  const ok = list.filter(f => canBreed(f, now));
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
    const a = ok[i], b = ok[j]; if (a.sp !== b.sp) continue;
    const d = a.x != null ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    if (d < bd) { bd = d; best = [a, b]; }
  }
  return best;
}
function litter(a, b, list, now) {           // returns plain baby records; marks parents' cooldown
  const n = Math.min(1 + Math.floor(Math.random() * 3), MAX_CREATURES - list.length), out = [];
  for (let i = 0; i < n; i++) out.push({ sp: a.sp, name: uniqueName(a.sp, list.concat(out)), hunger: 85, mood: 80, sick: false, growth: 0.04, grp: a.sp === 'minnow' ? 1 : 0, bt: now + BREED_COOL_H * 3600e3 });
  a.bt = b.bt = now + BREED_COOL_H * 3600e3;
  S.breedT = now + rnd(BREED_GAP_H[0], BREED_GAP_H[1]) * 3600e3;
  return out;
}
// live: steer the pair together, then hearts + babies when they meet
function breedTick() {
  if (!S.breed || edit || fish.length >= MAX_CREATURES) { for (const f of fish) f.mate = null; return; }
  const now = Date.now();
  if (now < S.breedT) return;
  let pair = fish.find(f => f.mate && fish.includes(f.mate) && canBreed(f, now) && canBreed(f.mate, now));
  pair = pair ? [pair, pair.mate] : findPair(fish, now);
  if (!pair) return;
  const [a, b] = pair; a.mate = b; b.mate = a;
  a.mateT = a.mateT || now;
  if (now - a.mateT > 90e3) { a.mate = b.mate = null; a.mateT = 0; a.bt = b.bt = now + 3600e3; return; }   // never met: try later
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  for (const f of pair) { f.tx = mx; f.ty = isBottom(f) ? f.ty : my; f.pause = 0; f.wt = 3; }
  if (Math.hypot(a.x - b.x, a.y - b.y) < fs * 3.5) {
    a.mate = b.mate = null; a.mateT = 0;
    const kids = litter(a, b, fish, now);
    kids.forEach((k, i) => { const f = makeFish(k, fish.length, false); f.enter = false; f.x = mx + rnd(-20, 20); f.y = clamp(my + rnd(-12, 12), surfaceY + 20, sandY - 10); f.vx = rnd(-20, 20); f.vy = rnd(-10, 10); fish.push(f); });
    for (let k = 0; k < 6; k++) hearts.push({ x: mx + rnd(-14, 14), y: my - rnd(0, 10), t: -k * 0.12 });
    save(); toast(`♥ ${a.name} 和 ${b.name} 生了 ${kids.length} 隻小寶寶`, 2.6);
  }
}
function drawHearts() {
  if (!hearts.length) return;
  ctx.save(); ctx.shadowBlur = 0; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${fs * 0.9}px ${MONO}`; ctx.fillStyle = '#ff7fb0';
  for (const h of hearts) if (h.t > 0) { ctx.globalAlpha = Math.max(0, 1 - h.t / 1.8); ctx.fillText('♥', h.x + Math.sin(h.t * 4 + h.x) * 4, h.y - h.t * 22); }
  ctx.restore();
}
function addCreature(sp) {
  const need = sp === 'minnow' ? SCHOOL_SIZE : 1, room = MAX_CREATURES - creatureCount();
  if (room <= 0 || (sp === 'minnow' && room < 3)) { toast(`魚缸滿了（最多 ${MAX_CREATURES} 隻），先移除一些吧`); return null; }
  const n = Math.min(need, room), grp = sp === 'minnow' ? 1 : 0;   // v9: every 群魚 joins the one shared school
  const x0 = rnd(W * 0.2, W * 0.8), added = [];
  for (let i = 0; i < n; i++) {
    const f = makeFish({ sp, name: uniqueName(sp), hunger: 85, mood: 75, sick: false, growth: 0.05, grp }, fish.length, true);
    f.x = x0 + rnd(-30, 30); f.y = surfaceY - 20 - i * 6; f.tx = clamp(x0 + rnd(-60, 60), bounds.l, bounds.r); f.ty = rnd(bounds.t + 40, bounds.b - 40);
    if (isBottom(f)) f.tx = clamp(x0 + rnd(-60, 60), fs, W - fs);
    fish.push(f); added.push(f);
  }
  for (let k = 0; k < 14; k++) bubbles.push(newBubble(x0 + rnd(-40, 40), surfaceY + rnd(5, 60), Math.random() < 0.5, rnd(40, 90)));   // pour-in splash
  ripples.push({ x: x0, y: surfaceY + 4, t: 0.3, quiet: true });
  save(); toast(`倒入了${added[0].name}${n > 1 ? ' ×' + n : ''}`, 1.6); renderSel();
  return added;
}
function removeCreature(f) {
  const gone = f.sp === 'minnow' ? fish.filter(o => o.sp === 'minnow' && o.grp === f.grp) : [f];
  fish = fish.filter(o => !gone.includes(o));
  for (const o of gone) for (let k = 0; k < 3; k++) bubbles.push(newBubble(o.x + rnd(-10, 10), o.y, Math.random() < 0.5, rnd(50, 90)));
  if (edit) edit.selF = null;
  save(); toast(`${gone.length > 1 ? '群魚 ×' + gone.length : f.name}回到大海了`, 1.6); renderSel();
}
function setDecorSize(d, v) { d.s = clamp(v, 0.5, 2.2); save(); renderSel(); }
// v9: mouse/trackpad resize — wheel over the canvas scales the selected item; a corner handle can be dragged
const HANDLE = 14;
function handlePos(d) { const b = rockBox(d); return { x: b.x1, y: b.y0 }; }
function overHandle(d, x, y) { const h = handlePos(d); return Math.abs(x - h.x) < HANDLE * 1.4 && Math.abs(y - h.y) < HANDLE * 1.4; }
let wheelSave = 0;
cv.addEventListener('wheel', e => {
  if (!edit || edit.tab !== 'decor' || !edit.sel) return;
  e.preventDefault();
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  edit.sel.s = clamp((edit.sel.s || 1) * Math.exp(-clamp(dy, -120, 120) * 0.0012), 0.5, 2.2);
  const now = performance.now(); if (!edit.lastSelR || now - edit.lastSelR > 120) { edit.lastSelR = now; renderSel(); }
  clearTimeout(wheelSave); wheelSave = setTimeout(() => { save(); renderSel(); }, 250);
}, { passive: false });
function setWeedLen(d, dn) { const r = LEN_RANGE[d.type] || [3, 22]; d.n = clamp(d.n + dn, r[0], r[1]); save(); renderSel(); }
function selectDecor(d) { if (!edit) return; edit.sel = d; edit.selF = null; for (const f of fish) f.held = false; renderSel(); }
function selectFish(f) { if (!edit) return; for (const o of fish) o.held = false; edit.selF = f; edit.sel = null; if (f) f.held = true; renderSel(); }
function renderSel() {
  const el = $('eSel'); if (!edit) { el.style.display = 'none'; return; }
  const d = edit.tab === 'decor' ? edit.sel : null, f = edit.tab === 'life' ? edit.selF : null;
  if (d) {
    const z = d.s || 1;
    let h = `<span class="lbl">${TYPE_LABEL[d.type] || ''}</span>` +
      SIZES.map(([lb, v]) => `<button data-size="${v}" class="${Math.abs(z - v) < 0.15 ? 'sel' : ''}">${lb}</button>`).join('');
    if (d.type !== 'rock') h += `<span class="sep"></span><button data-len="-1">短</button><span class="num" id="eLen">${d.n}</span><button data-len="1">長</button>`;
    h += `<span class="sep"></span><button data-step="-0.15" aria-label="縮小">−</button><button data-step="0.15" aria-label="放大">＋</button>`;
    h += `<button data-del="1" class="del">🗑 刪除</button>`;
    el.innerHTML = h; el.style.display = 'flex';
  } else if (f) {
    const grp = f.sp === 'minnow' ? fish.filter(o => o.sp === 'minnow' && o.grp === f.grp).length : 0;
    el.innerHTML = `<span class="lbl">${grp ? f.name + ' ×' + grp : f.name}・${STAGE_NAMES[stageOf(f.growth || 0)]}</span><button data-rm="1" class="del">🗑 ${grp ? '移除整群' : '移除'}</button>`;
    el.style.display = 'flex';
  } else el.style.display = 'none';
  $('eCount').textContent = `${creatureCount()}/${MAX_CREATURES}`;
}
$('eSel').addEventListener('click', e => {
  e.stopPropagation();
  const b = e.target.closest('button'); if (!b || !edit) return;
  if (b.dataset.size && edit.sel) setDecorSize(edit.sel, +b.dataset.size);
  else if (b.dataset.step && edit.sel) setDecorSize(edit.sel, (edit.sel.s || 1) + +b.dataset.step);
  else if (b.dataset.len && edit.sel) setWeedLen(edit.sel, +b.dataset.len);
  else if (b.dataset.del && edit.sel) removeDecor(edit.sel);
  else if (b.dataset.rm && edit.selF) removeCreature(edit.selF);
});
$('ePalC').addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('button[data-sp]'); if (b && edit) addCreature(b.dataset.sp); });
function editDown(e) {
  const x = e.clientX, y = e.clientY;
  try { cv.setPointerCapture(e.pointerId); } catch (er) {}
  edit.pts.set(e.pointerId, { x, y });
  if (edit.pts.size === 2) {                    // pinch to resize the selected / grabbed item
    const target = (edit.drag && edit.drag.d) || edit.sel;
    if (edit.tab === 'decor' && target) {
      if (edit.drag) { clearTimeout(edit.drag.timer); target.x = edit.drag.ox; target.fx = target.x / W; target.lift = 0; edit.drag = null; }
      const [a, b] = [...edit.pts.values()];
      edit.pinch = { d: target, d0: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), s0: target.s || 1 };
      if (edit.sel !== target) selectDecor(target);
    }
    edit.tap = null; return;
  }
  if (edit.pts.size > 2 || edit.pinch) return;
  if (edit.tab === 'decor' && edit.sel && overHandle(edit.sel, x, y)) {          // drag the corner handle to resize
    const d = edit.sel, b = rockBox(d), ax = d.x, ay = b.y1;
    edit.resize = { d, ax, ay, r0: Math.max(16, Math.hypot(x - ax, y - ay)), s0: d.s || 1 }; return;
  }
  if (edit.tab === 'decor') {
    const d = hitDecor(x, y);
    if (d) {
      const drag = { d, sx: x, sy: y, ox: d.x, moved: false };
      drag.timer = setTimeout(() => { if (!drag.moved && edit && edit.drag === drag) { selectDecor(d); if (navigator.vibrate) try { navigator.vibrate(8); } catch (er) {} } }, 450);  // long-press = select (never delete)
      edit.drag = drag; return;
    }
  } else {
    const f = hitFish(x, y);
    if (f) { edit.tapF = { f, x, y }; return; }
  }
  edit.tap = { x, y };
}
function editMove(e) {
  const x = e.clientX, y = e.clientY;
  if (edit.pts.has(e.pointerId)) edit.pts.set(e.pointerId, { x, y });
  if (edit.resize) {
    const r = edit.resize; r.d.s = clamp(r.s0 * Math.hypot(x - r.ax, y - r.ay) / r.r0, 0.5, 2.2);
    const now = performance.now(); if (!edit.lastSelR || now - edit.lastSelR > 120) { edit.lastSelR = now; renderSel(); }
    return;
  }
  if (edit.pinch) {
    if (edit.pts.size >= 2) {
      const [a, b] = [...edit.pts.values()];
      edit.pinch.d.s = clamp(edit.pinch.s0 * Math.hypot(a.x - b.x, a.y - b.y) / edit.pinch.d0, 0.5, 2.2);
      const now = performance.now(); if (!edit.lastSelR || now - edit.lastSelR > 120) { edit.lastSelR = now; renderSel(); }
    }
    return;
  }
  if (edit.tap && Math.hypot(x - edit.tap.x, y - edit.tap.y) > 14) edit.tap = null;
  if (edit.tapF && Math.hypot(x - edit.tapF.x, y - edit.tapF.y) > 18) edit.tapF = null;
  const g = edit.drag; if (!g) return;
  if (!g.moved && Math.hypot(x - g.sx, y - g.sy) > 10) { g.moved = true; clearTimeout(g.timer); }
  if (!g.moved) return;
  g.d.x = clamp(g.ox + x - g.sx, 8, W - 8); g.d.fx = g.d.x / W;
  g.d.lift = Math.max(0, g.sy - y);
  edit.hot = overTrash(x, y); $('eTrash').classList.toggle('hot', edit.hot);
}
function editUp(e) {
  const x = e.clientX, y = e.clientY;
  edit.pts.delete(e.pointerId);
  if (edit.resize) { edit.resize = null; save(); renderSel(); edit.tap = null; return; }
  if (edit.pinch) { if (edit.pts.size < 2) { edit.pinch = null; save(); renderSel(); } edit.tap = null; edit.drag = null; edit.tapF = null; return; }
  const g = edit.drag;
  if (g) {
    clearTimeout(g.timer); edit.drag = null; edit.hot = false; $('eTrash').classList.remove('hot');
    if (g.moved && overTrash(x, y)) removeDecor(g.d);
    else { if (!g.moved) selectDecor(g.d); syncDecor(); save(); }
  } else if (edit.tapF) {
    selectFish(edit.tapF.f);
  } else if (edit.tap) {
    if (edit.tab === 'decor') {
      if (edit.sel) selectDecor(null);                       // first tap on empty water just deselects
      else if (y >= placeTop() - 10) addDecor(x); else toast('點缸底（下半部）放置', 1.4);
    } else if (edit.selF) selectFish(null);
  }
  edit.tap = null; edit.tapF = null;
}
function editCancel(e) {
  if (!edit) return;
  edit.pts.delete(e.pointerId);
  if (edit.drag) { clearTimeout(edit.drag.timer); edit.drag.d.lift = 0; edit.drag = null; }
  if (edit.pts.size < 2) edit.pinch = null;
  if (edit.resize) { edit.resize = null; save(); renderSel(); }
}
function setEditType(tp) { edit.type = tp; for (const b of document.querySelectorAll('#ePalD button[data-type]')) b.classList.toggle('sel', b.dataset.type === tp); }
function setTab(tab) {
  edit.tab = tab; selectDecor(null); selectFish(null);
  $('ePalD').style.display = tab === 'decor' ? 'flex' : 'none';
  $('ePalC').style.display = tab === 'life' ? 'flex' : 'none';
  $('eTabD').classList.toggle('sel', tab === 'decor'); $('eTabC').classList.toggle('sel', tab === 'life');
  renderSel();
}
function enterEdit() {
  edit = { hintY: () => Math.max($('ebar').getBoundingClientRect().bottom + fs * 1.1, placeTop() - fs * 2.6), tab: 'decor', type: 'weed', rv: -1, drag: null, tap: null, tapF: null, hot: false, sel: null, selF: null, pts: new Map(), pinch: null };
  setEditType('weed'); setTab('decor'); $('panel').style.display = 'none';
  document.body.classList.add('editing'); $('bar').style.display = 'none'; $('ebar').style.display = 'flex'; $('bTilt').style.display = 'none';
}
function exitEdit() { for (const f of fish) f.held = false; edit = null; save(); document.body.classList.remove('editing'); $('eSel').style.display = 'none'; $('ebar').style.display = 'none'; $('bar').style.display = 'flex'; $('bTilt').style.display = tiltAvailable ? 'block' : 'none'; toast('佈置好了', 1.4); }
// v9: picker shows only each creature's picture (its ASCII art in its own colours), no species names
const escH = c => c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c;
function speciesArt(k) {
  const sp = SPECIES[k];
  let st = [2, 1, 0].find(i => { const v = sp.strs[i]; return (Array.isArray(v) ? v.length : 1) <= 3; }); if (st == null) st = 0;
  const raw = sp.strs[st], lines = Array.isArray(raw) ? raw : [raw], col = sp.cols[st] || sp.cols[0];
  return lines.map(l => [...l].map(c => c === ' ' ? ' ' : `<span style="color:${(sp.ac && sp.ac[c]) || col}">${escH(c)}</span>`).join('')).join('\n');
}
$('ePalC').innerHTML = Object.keys(SPECIES).map(k => `<button data-sp="${k}" class="art" aria-label="add"><pre>${speciesArt(k)}</pre></button>`).join('');
btn('bDecor', enterEdit);
$('ePalD').insertAdjacentHTML('afterbegin', '<button id="eWeed" data-type="weed">} 水草</button><button id="eRock" data-type="rock">(_) 石頭</button>' +
  Object.keys(PLANTS).map(k => `<button data-type="${k}">${PLANTS[k].icon} ${PLANTS[k].label}</button>`).join(''));
$('ePalD').addEventListener('click', e => { const b = e.target.closest('button[data-type]'); if (b && edit) { e.stopPropagation(); setEditType(b.dataset.type); } });
btn('eTrash', () => toast('把水草或石頭拖到這裡刪除', 1.6));
btn('eTabD', () => setTab('decor'));
btn('eTabC', () => setTab('life'));
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
  const seen = new Set(), rows = [];
  for (const f of fish) {
    if (f.sp !== 'minnow') { rows.push(f); continue; }
    const k = 'm' + f.grp; if (seen.has(k)) continue; seen.add(k);
    const g = fish.filter(o => o.sp === 'minnow' && o.grp === f.grp), avg = key => g.reduce((a, o) => a + (o[key] || 0), 0) / g.length;
    rows.push({ sp: 'minnow', name: '群魚 ×' + g.length, hunger: avg('hunger'), mood: avg('mood'), growth: avg('growth'), sick: g.some(o => o.sick) });
  }
  const lines = rows.map(f => `<b>${f.name}</b>\n 飽足 ${bar(f.hunger)}  心情 ${bar(f.mood)}\n 成長 ${bar((f.growth || 0) * 100)}  ${STAGE_NAMES[stageOf(f.growth || 0)]}　狀態 ${moodWord(f)}`);
  $('panel').innerHTML = `<div class="ptog"><button id="pAuto" class="${S.autoFeed ? 'on' : ''}">∴ 自動餵食：${S.autoFeed ? '開' : '關'}</button> <button id="pSound" class="${S.sound ? 'on' : ''}">♪ 聲音：${S.sound ? '開' : '關'}</button> <button id="pBreed" class="${S.breed ? 'on' : ''}">♥ 繁殖：${S.breed ? '開' : '關'}</button></div>` + lines.join('\n') + `\n\n<b>水質</b> ${bar((1 - S.dirt) * 100)} ${Math.round((1 - S.dirt) * 100)}%` +
    `\n<span class="dim">點玻璃：魚會嚇跑　長按：餵食　點此關閉</span>`;
}

// ---------- geometry ----------
function surf(x) {
  return surfaceY + waterDip + Math.sin(x * 0.035 + t * 1.6) * 2.5 + Math.sin(x * 0.013 - t * 0.9) * 2 + slosh.s * (x - W / 2);
}
function weedPos(w, j) {
  const k = w.s || 1, sc = fs / 18 * k;
  const x = w.x + Math.sin(t * 0.9 * w.sp + w.ph + j * 0.45) * j * 0.9 * sc - slosh.s * 2.2 * j * j * sc;
  return [x, sandY - j * fs * 0.78 * k - (w.lift || 0)];
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
  // schools (neon, each 群魚 group): centre + shared wander target
  const schools = {};
  for (const f of fish) { const k = schoolKey(f); if (!k) continue; const c = schools[k] || (schools[k] = { x: 0, y: 0, vx: 0, vy: 0, n: 0 }); c.x += f.x; c.y += f.y; c.vx += f.vx; c.vy += f.vy; c.n++; }
  for (const k in schools) {
    const c = schools[k]; c.x /= c.n; c.y /= c.n; c.vx /= c.n; c.vy /= c.n;
    let g = groupTs[k];
    if (!g) g = groupTs[k] = { x: 0, y: 0, wt: 0 };
    g.wt -= dt;
    if (g.wt <= 0 || Math.hypot(g.x - c.x, g.y - c.y) < 40) { g.x = rnd(bounds.l, bounds.r); g.y = rnd(bounds.t, bounds.b - 40); g.wt = rnd(2.5, 6); }
  }
  if (!window.__freezeFish) for (const f of fish) {
    updateFish(f, dt, schools);
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
  for (let i = hearts.length - 1; i >= 0; i--) { hearts[i].t += dt; if (hearts[i].t > 1.8) hearts.splice(i, 1); }
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
function glow(color) { ctx.fillStyle = color; ctx.shadowBlur = 0; }   // v5: flat colours, no glow
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
  for (const w of weeds) {
    if (w.back !== back) continue;
    ctx.font = `${fs * (w.s || 1)}px ${MONO}`;
    glow(back ? '#1f8f52' : '#46ff8c', back ? 4 : 9);
    if (back) ctx.globalAlpha = 0.6;
    for (let j = 0; j < w.n; j++) { const [x, y] = weedPos(w, j); ctx.fillText(j % 2 ? '{' : '}', x, y); }
    ctx.globalAlpha = 1;
  }
}
function drawRocks() {
  ctx.font = `${fs}px ${MONO}`;
  for (const d of decor) if (d.type === 'rock') {
    const r = ROCKS[d.v] || ROCKS[0], z = d.s || 1;
    ctx.font = `${fs * z}px ${MONO}`;
    glow('#6fb5ad', 4); ctx.globalAlpha = 0.8;
    for (let k = 0; k < r.length; k++) ctx.fillText(r[k], d.x, sandY + fs * 0.15 * z - (r.length - 1 - k) * fs * 0.82 * z - d.lift);
  }
  ctx.globalAlpha = 1;
}
function drawEditOverlay() {
  if (!edit) return;
  ctx.save(); ctx.shadowBlur = 0; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
  const zy = placeTop();
  if (edit.tab !== 'life') {
  ctx.strokeStyle = 'rgba(70,255,140,0.35)'; ctx.fillStyle = 'rgba(70,255,140,0.05)';
  ctx.fillRect(6, zy, W - 12, sandY + fs * 0.6 - zy); ctx.strokeRect(6, zy, W - 12, sandY + fs * 0.6 - zy); }
  const life = edit.tab === 'life';
  if (!life) for (const d of decor) {
    const b = rockBox(d), on = edit.drag && edit.drag.d === d, sel = edit.sel === d;
    ctx.strokeStyle = on ? (edit.hot ? 'rgba(255,90,90,0.95)' : 'rgba(159,252,255,0.95)') : sel ? 'rgba(255,224,102,0.95)' : 'rgba(159,252,255,0.35)';
    ctx.lineWidth = sel ? 2 : 1; if (sel) ctx.setLineDash([]); else ctx.setLineDash([5, 5]);
    ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    if (sel) {                                       // corner resize handle (flat)
      ctx.fillStyle = edit.resize ? '#fff3b0' : '#ffe066'; ctx.fillRect(b.x1 - HANDLE / 2, b.y0 - HANDLE / 2, HANDLE, HANDLE);
      ctx.strokeStyle = '#001012'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(b.x1 - 4, b.y0 + 3); ctx.lineTo(b.x1 + 3, b.y0 - 4); ctx.moveTo(b.x1 - 3, b.y0 - 4); ctx.lineTo(b.x1 + 3, b.y0 - 4); ctx.lineTo(b.x1 + 3, b.y0 + 2); ctx.stroke();
    }
  }
  ctx.setLineDash([]); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (life && edit.selF && fish.includes(edit.selF)) {
    const f = edit.selF, r = Math.max(halfLen(f), fs * 0.8) + 10;
    const group = f.sp === 'minnow' ? fish.filter(o => o.sp === 'minnow' && o.grp === f.grp) : [f];
    ctx.strokeStyle = 'rgba(255,224,102,0.95)'; ctx.lineWidth = 2;
    for (const o of group) { ctx.beginPath(); ctx.arc(o.x, o.y, o === f ? r : r * 0.8, 0, 6.283); ctx.stroke(); }
  }
  ctx.fillStyle = '#bfffd0'; ctx.shadowBlur = 0;
  ctx.font = `${Math.max(12, fs * 0.72)}px -apple-system, "PingFang TC", sans-serif`;
  if (life) {
    const hy = edit.hintY();
    ctx.fillText('生物：點上方按鈕倒入新朋友', W / 2, hy);
    ctx.fillText(`點缸裡的生物可選取／移除（${fish.length}/${MAX_CREATURES}）`, W / 2, hy + fs * 1.1);
  } else {
    const hy = edit.hintY();
    ctx.fillText('佈置中：點缸底放' + (TYPE_LABEL[edit.type] || '') + '・拖曳移動', W / 2, hy);
    ctx.fillText('點物件可調大小／長度（雙指・滾輪・拖角落）・拖到 🗑 刪除', W / 2, hy + fs * 1.1);
  }
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
  ctx.translate(f.x, f.y + (sp.bob ? Math.sin(t * sp.bob + f.seed) * fs * 0.12 : 0));
  ctx.rotate(f.ang * Math.sign(f.flip || 1));
  ctx.scale(f.flip * s, thin * s * (sp.sy || 1));
  glow(col, f.sick ? 4 : 7 + 5 * (f.growth || 0));
  if (L.st === 0 && !f.sick) ctx.globalAlpha = 0.85;
  if (f.hunger < 30 && !f.sick) ctx.globalAlpha = 0.75;
  if (sp.alpha) ctx.globalAlpha *= sp.alpha;
  const lines = Array.isArray(str) ? str : [str], mid = (lines.length - 1) / 2;
  const n = strLen(str), w = n * charW, crab = f.sp === 'crab';
  const amp = fs * 0.11 * (sp.fin || 1) * (0.35 + Math.min(1.2, Math.hypot(f.vx, f.vy) / sp.max));
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li], ly = (li - mid) * fs * 0.78;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === ' ') continue;
      const tail = Math.pow(1 - i / n, 1.4);
      const jelly = sp.kind === 'jelly', jx = jelly && li >= 2 ? Math.sin(t * 2.2 + f.seed + li * 0.9) * fs * 0.1 * li : 0;
      const wy = jelly ? (li < 2 ? -(f.pulse || 0) * fs * 0.15 : (f.pulse || 0) * fs * 0.1 * li)
        : crab ? Math.sin(f.ph * 2 + i * Math.PI) * fs * 0.05 * Math.min(1, Math.abs(f.vx) / 8 + 0.2) : Math.sin(f.ph - i * 0.8) * amp * tail;
      const ac = sp.ac && !f.sick && sp.ac[line[i]];
      if (ac) ctx.fillStyle = ac;
      ctx.fillText(line[i], -w / 2 + (i + 0.5) * charW + (jelly ? jx * (li < 2 ? 0 : 1) - (li < 2 ? (i - n / 2) * (f.pulse || 0) * charW * -0.08 : 0) : 0), ly + wy);
      if (ac) ctx.fillStyle = col;
    }
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
  drawPlants();
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
  drawHearts();
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
    ctx.strokeStyle = '#9ffcff'; ctx.shadowBlur = 0; ctx.lineWidth = 1.5;
    for (let k = 0; k < 2; k++) { const rad = (r.t - k * 0.15) * 260; if (rad > 0) { ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, 6.283); ctx.stroke(); } }
    ctx.fillStyle = '#e8ffff'; ctx.font = `600 ${fs * 1.2}px -apple-system, "PingFang TC", sans-serif`;
    if (!r.quiet) ctx.fillText('叩', r.x, r.y - r.t * 30);
    ctx.restore();
  }
}

// ---------- render: pixel art ----------
const PCOL = { jelly: { b: '#ffffff', s: '#bfe8ff' }, clown: { b: '#ffffff' }, neon: { b: '#ff3d6e' }, puffer: { b: '#c07a10', s: '#ff9a3c' }, shrimp: { b: '#ffd6de', s: '#ff8fa8' }, crab: { b: '#ffd0a0' },
  minnow: { b: '#7fd0ff' }, turtle: { b: '#d8b060' }, angel: { b: '#ffe066' }, betta: { b: '#a070ff' } };
function sprite(rows, cx, cy, mirror, cols, thin, k = 1) {
  const h = rows.length, w = rows[0].length;
  const ox = Math.round(cx - w * k / 2), oy = Math.round(cy - h * k / 2);
  for (let r = 0; r < h; r++) {
    if (thin && (r === 0 || r === h - 1) && h > 3) continue;
    const row = rows[r];
    for (let c = 0; c < w; c++) {
      const ch = row[mirror ? w - 1 - c : c]; if (ch === '.') continue;
      lctx.fillStyle = ch === 'e' ? '#000' : (cols[ch] || cols.a);
      lctx.fillRect(ox + c * k, oy + r * k, k, k);
    }
  }
}
function renderPixel() {
  const lw = low.width, lh = low.height;
  lctx.clearRect(0, 0, lw, lh);
  // weeds
  for (const w of weeds) {
    lctx.fillStyle = w.back ? '#1f8f52' : '#46ff8c';
    if ((w.s || 1) >= 1.25) lctx.globalAlpha = 1;
    for (let j = 0; j < w.n * 2; j++) {
      const [x, y] = weedPos(w, j / 2);
      lctx.fillRect(Math.round(x / PX), Math.round(y / PX), 1, 1);
      if (j % 3 === 0 || (w.s || 1) >= 1.25) lctx.fillRect(Math.round(x / PX) + (j % 2 ? 1 : -1), Math.round(y / PX), 1, 1);
    }
  }
  // sand
  for (let y = Math.round(sandY / PX); y < lh; y++) for (let x = 0; x < lw; x++) {
    const v = ((x * 73 + y * 151) ^ (x * y)) % 11;
    if (v < 2) { lctx.fillStyle = v ? '#2e8a64' : '#1c5a40'; lctx.fillRect(x, y, 1, 1); }
  }
  drawPlantsPx();
  for (const d of decor) if (d.type === 'rock') {
    const z = d.s || 1, k = z >= 1.25 ? 2 : 1, r = z < 0.85 ? shrink(ROCKPX[d.v] || ROCKPX[0], 0.7) : (ROCKPX[d.v] || ROCKPX[0]);
    sprite(r, d.x / PX, (sandY - d.lift) / PX - r.length * k / 2 + 1, false, { a: '#4f8f88', b: '#8fd0c8' }, false, k);
  }
  lctx.fillStyle = '#ffe066';
  for (const p of food) lctx.fillRect(Math.round(p.x / PX), Math.round(p.y / PX), 1, 1);
  for (const f of fish) {
    const L = look(f);
    const cols = f.sick ? { a: '#6f8f7a', b: '#9fb8a8', s: '#6f8f7a' } : { ...PCOL[f.sp], a: L.color };
    const rows = f.sp === 'puffer' && f.puff > 0.35 ? SPR.pufferBig : SPR[f.sp][L.st];
    const tiltOff = Math.round(f.ang * 2);
    lctx.globalAlpha = SPECIES[f.sp].alpha || 1;
    sprite(rows, f.x / PX, f.y / PX + tiltOff * 0, f.flip < 0, cols, f.sick || f.hunger < 30);
    lctx.globalAlpha = 1;
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
  ctx.shadowBlur = 0;
  ctx.drawImage(low, 0, 0, lw * PX, lh * PX);
  ctx.restore();
  if (S.dirt > 0.02) {
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, surf(x));
    ctx.lineTo(W, H); ctx.closePath(); ctx.shadowBlur = 0; ctx.fillStyle = `rgba(28,30,4,${S.dirt * 0.5})`; ctx.fill();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  drawRipples();
  drawHearts();
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
  if (gap > 0) {
    if (gap > 60) offlineBabies = 0;
    const born = care(Math.min(gap, 86400 * 30), fish, gap > 60);
    born.forEach(k => { const f = makeFish(k, fish.length, false); f.enter = false; f.x = rnd(W * 0.2, W * 0.8); f.y = rnd(surfaceY + 60, sandY - 60); fish.push(f); });
    if (born.length) save();
  }
  if (wall - autoChk > 1500) { autoChk = wall; autoFeedTick(); menuIdleCheck(); breedTick(); }
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
  toast(`離開了 ${h < 24 ? Math.round(h) + ' 小時' : Math.round(h / 24) + ' 天'}${autoFeeds ? `，自動餵食了 ${autoFeeds} 次` : ''}${S.bornAway ? `，♥ 多了 ${S.bornAway} 隻小寶寶` : ''}${hungry ? '，魚餓了，快餵牠們' : S.dirt > 0.5 ? '，水有點髒了' : ''}`, 4); autoFeeds = 0; S.bornAway = 0;
}

// ---------- boot ----------
function boot() {
  resize();
  const away = (Date.now() - (S.t || Date.now())) / 1000;
  const list = S.fish.map(p => ({ ...p }));
  offlineBabies = 0;
  if (away > 0) list.push(...care(Math.min(away, 86400 * 30), list, true));
  S.bornAway = offlineBabies;
  fish = list.map(makeFish);
  styleLabel();
  if (typeof S.tiltOn !== 'boolean') S.tiltOn = needsPerm ? !!S.motion : true;   // migrate: v1-v3 had no off switch
  if (tiltAvailable) $('bTilt').style.display = 'block';
  if (!needsPerm && tiltAvailable) { listenMotion(); motionReady = true; }
  else if (needsPerm && S.tiltOn) {           // iOS: works without a tap only if permission is still granted
    listenMotion();
    try { DeviceMotionEvent.requestPermission().then(r => { if (r === 'granted') { motionReady = true; tiltLabel(); } }).catch(() => {}); } catch (e) {}
  }
  tiltLabel();
  lastWall = Date.now();
  if (away > 3600) setTimeout(() => offlineToast(away), 3200);
  else if (S.newFriends) setTimeout(() => toast('新朋友來了：蝦子、螃蟹、群魚、烏龜、神仙魚、鬥魚（佈置 → 生物 可增減）', 5), 3000);
  delete S.newFriends;
  S.seen = (S.seen || 0) + 1;
  save();
  requestAnimationFrame(t0 => { lastFrame = t0; requestAnimationFrame(frame); });
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else lastWall = Math.min(lastWall, Date.now()); soundApply(); });
window.addEventListener('pagehide', save);
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

// test / debug hook
window.__tank = { setMenu, breedTick, findPair, get hearts() { return hearts; }, MAX_CREATURES, handlePos, get ripples() { return ripples; }, get snd() { return snd; }, setSound, bloop, renderWaterSample, renderSfxSample, setAutoFeed, autoFeedTick, get autoFeeds() { return autoFeeds; }, get tilt() { return { raw: tilt.raw, x: tilt.x, slosh: slosh.s, on: S.tiltOn, ready: motionReady }; }, tiltButton, addCreature, removeCreature, enterEdit, exitEdit, setTab, selectDecor, selectFish, setDecorSize, setWeedLen, get schools() { return groupTs; }, geo: () => ({ W, H, sandY, surfaceY }), look, rockBox, get decor() { return decor; }, get edit() { return edit; }, care: sec => care(sec, fish), get fish() { return fish; }, get food() { return food; }, get bubbles() { return bubbles; }, S: () => S, knock, dropFood, changeWater };
boot();
})();
