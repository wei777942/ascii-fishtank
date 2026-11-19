# 電子魚缸 — 部署說明

- **固定網址（iPhone 用 Safari 開，分享 → 加入主畫面）**: https://wei777942.github.io/ascii-fishtank/
- 託管：GitHub Pages（repo `wei777942/ascii-fishtank`，branch `main`，路徑 `/`）。網址永遠不變，更新只要推新 commit。
- 本機專案：`/workspace/fishtank`（git）。

## 重新部署
```bash
cd /workspace/fishtank
# 改完檔案後：把 sw.js 裡的 V='fishtank-vN' 與 index.html / sw.js 的 app.js?v=N 一起 +1（強制手機拿新版）
git add -A && git commit -m "update" && git push
# 約 1 分鐘後生效；查狀態：
gh api repos/wei777942/ascii-fishtank/pages/builds/latest --jq .status
```
- Service worker 是 network-first：有網路就拿最新版，離線用快取。GitHub Pages 本身有約 10 分鐘 CDN 快取。
- 存檔在瀏覽器 localStorage（key `fishtank.v1`），更新程式不會清掉魚。注意：Safari 分頁與「加入主畫面」的 App 是兩份獨立存檔。

## 驗證
```bash
python3 test_ios.py https://wei777942.github.io/ascii-fishtank/   # iPhone 390x844 DPR3 headless 測試，截圖到 shots/
python3 test_v3.py https://wei777942.github.io/ascii-fishtank/    # v3：新魚種、生物增減、裝飾大小／長度／雙指縮放、v2 存檔遷移
python3 test_tilt.py https://wei777942.github.io/ascii-fishtank/    # v4：傾斜開關（模擬 iOS 權限＋devicemotion）
python3 test_species.py https://wei777942.github.io/ascii-fishtank/ # v4：全魚種幼魚／成魚對照圖 → shots/v4-species.png
# （test_v2.py 是 v2 的舊版測試：v3 起長按改為「選取」、佈置工具列移到上方，部分項目已不適用）
```

## v5 (2026-11-14)
- Removed all glow (canvas shadowBlur, CSS text/box-shadow, icon blur) — flat crisp colours.
- New creature 水母 (jelly): pulse-up / drift-down, translucent, 3 stages, pixel sprite.
- New plants in 裝飾: 海帶 / 珊瑚 / 草叢 / 海葵 (select, resize, length, delete, persist, pixel mode).
- Tests: `python3 test_v5.py [url]` (no-glow + jelly + plants), plus test_v3 / test_tilt / test_ios / test_species (→ shots/v5-species.png).

## v6 (2026-11-14)
- 自動餵食 toggle at the top of the 狀態 panel (`S.autoFeed`, default off, persisted).
- Live: when average 飽足 < 45, drops pellets (≈0.7 × creature count, 4–12), 20-min cooldown, toast 「自動餵食」.
- Offline / background catch-up: with auto-feed on, each 10-min care step tops fish up (+42) when average 飽足 < 45; dirt unchanged.
- Test: `python3 test_v6.py [url]`.

## v7 (2026-11-14)
- Ambient sound via Web Audio (no files): looping brown noise → highpass 70 Hz → lowpass ~420 Hz (slow LFO) for water flow, plus random soft sine "bloop" bubbles every 2.5–8 s; master gain 0.55 (measured rms ≈ 0.026).
- Starts on the first tap/touch (iOS gesture rule); suspends when hidden, resumes on return. Subtle bloop on glass tap and feeding.
- 「♪ 聲音：開／關」 toggle next to 自動餵食 in the 狀態 panel (`S.sound`, default on, persisted).
- Test: `python3 test_v7.py [url]`.

## v8 (2026-11-14)
- Water layer replaced: steady white-noise bed → bandpass 1.9 kHz / highpass 600 Hz (no LFO, no swell) + a babble of tiny sine droplets (800–3000 Hz, upward sweep, 12–45 ms) every 20–120 ms, scheduled 250 ms ahead. Bubble bloops unchanged.
- Glass tap: knuckle knock (bandpassed noise click ~3 kHz + 1.55/2.33/2.98 kHz decaying partials, ~60 ms). Feeding: sprinkle (highpassed 3–8 kHz noise grains, ~0.45–0.75 s fade).
- Samples: `python3 render_audio.py [url]` → shots/v8-water|knock|feed.wav (+ .m4a via ffmpeg) with spectrum/envelope stats.
- UI: only a small 「≡」 button top-right; it shows/hides the bottom bar + tilt toggle (body.menu). Auto-collapse after 8 s idle unless 狀態 panel or 佈置 is open. Older tests pin the menu open via an init script (`window.__menuPin`).
- Test: `python3 test_v8.py [url]`.

## v9 (2026-11-14)
- Water: no noise bed at all; only sparse quiet droplets every 150–500 ms (preview shots/v9-water.m4a).
- UI: everything (餵食 換水 狀態 像素 佈置 傾斜) lives in a top-right dropdown under ≡; 狀態 sits below the dropdown; closes by tapping 狀態 again or ≡ (closes both).
- Desktop resize in 佈置: mouse wheel over the canvas, corner handle drag, −/＋ buttons (plus 小/中/大, 短/長, pinch).
- 生物 picker shows only each creature's coloured ASCII picture; species names removed from toasts/selection/狀態.
- One shared 群魚 school (saves migrated: all minnows grp 1).
- Cap 25 → 100. Breeding (♥ 繁殖 toggle in 狀態, default on): healthy adult same-species pairs, 1–3 babies, 12 h per-creature cooldown, 3–6 h between litters, offline max 3 babies per absence.
- Tests: test_v9.py (menu/panel), test_v9b.py (school, breeding, cap, desktop resize, picker), perf_v9.py (frame cost 17 vs 100, CPU ×4), render_audio.py.

## v10 (2026-11-19) — phone food can
- ≡ → 「⇄ 手機飼料罐」 (only there; never on load) opens a QR + 6-char room code + link (`?can=ROOM`). Tap the item again or ≡ to close; auto-closes once a phone connects. Tiny green ● on the menu item while connected.
- Transport: PeerJS 1.5.5 bundled at lib/peerjs.min.js (free public broker 0.peerjs.com + PeerJS STUN/TURN, plus TURN over TCP). QR: qrcode-generator 2.0.4 bundled at lib/qrcode.js. Both lazy-loaded only when the item is opened.
- Room id kept in sessionStorage (`fishtank.room`); peer id = `asciifishtank-ROOM`. Tank tab reload keeps the room; phones redial automatically.
- `?can=` on index.html redirects to can.html before app.js loads, so the can never reads/writes the tank save. can.js: shake (devicemotion spike) / tip forward (beta < -12°) / 撒飼料 → feed n=1–5 (rate-limited 450 ms); left/right tilt maps pellet x; 敲玻璃; 換水.
- sw.js caches can.html, can.js and lib/*; cross-origin (broker, WebRTC) is never intercepted.
- Test: `python3 test_v10.py [url]` — real broker signaling; the data channel is bridged by the test because this box's Chrome policy forbids non-proxied UDP WebRTC (BRIDGE=0 to try a real channel).

## v11 (2026-11-19) — faster phone connection
- Tank registers its room on the PeerJS broker in the background ~1–3 s after load (idle callback); QR still only from ≡ → 手機飼料罐. Network errors back off 1.5 s → 48 s.
- ICE trimmed to 1 STUN (Google) + 1 TURN (us-0 UDP+TCP), iceCandidatePoolSize 2.
- Can: connects on load (before 「點一下開始」), shows progress (1/3, 2/3) with elapsed seconds and the final connect time; faster retries (peer-unavailable 1.2 s, stuck ICE redial after 7 s).
- Timing: `python3 timing_can.py [url] [runs]`.

## v12 (2026-11-19) — phone can over the ntfy.sh relay (WebRTC removed)
- Real phones stayed at (2/3) forever: WebRTC (PeerJS) never opened. Now both pages talk through **ntfy.sh** (free, no account):
  publish = `POST https://ntfy.sh/fishtank-<room>?cache=no&firebase=no`, subscribe = `wss://ntfy.sh/fishtank-<room>/ws` (SSE fallback).
- Room = 20 random chars (crypto, ~99 bits) → topic is unguessable; still in sessionStorage per tab, QR only from ≡ → 手機飼料罐.
- Shared code: `lib/relay.js` (paced queue ≥0.9 s, token bucket burst 24 / +1 per 10 s per device, feeds merge up to 6, newest state only).
- Protocol (JSON, field `f` = sender): can → hello / feed{n,x} / knock / water / ping (4 min) / bye; tank → state{to,n,hunger,clean} (on hello, after actions ≤1 per 12 s, 2.5 s after water) / here (tab reloaded) / bye.
- ntfy.sh anonymous limits are per IP: 60 requests burst (+1 per 5 s) and 250 messages/day. On 429 the pages show 「今天的免費傳送次數用完了」.
- sw.js `fishtank-v12`; ntfy.sh never intercepted. PeerJS removed (lib/peerjs.min.js deleted).
- Test: `python3 test_v12.py <url> 3` (two real browser contexts through the real relay; no bridge).

## v13 (2026-11-19)
- Phone feeds spread over the whole surface: no steering → one pellet per equal slice of 8–92 % of the tank width.
  Root cause of "always far left": the can sent raw `gamma/40` as x whenever any orientation event had fired; a phone held
  sideways reports gamma ≈ ±80–90° → x = −1 → far left. Now tilt is computed relative to the screen (gravity vector + screen.orientation.angle),
  with a ~12° dead zone, and only a deliberate sideways *pour* steers; 撒飼料 button and shake always spread.
- ≡ menu: separate 「∽ 生物」 (picture-only creature picker) and 「⌂ 佈置」 (decor only). ≡ (now visible while editing) or 完成 closes.
- A brand-new tank (no save) starts with zero creatures; one quiet toast 『點 ≡ →「生物」加魚』. Existing saves untouched.
- Ten new creatures: 金魚 goldfish, 海馬 seahorse, 鰻魚 eel, 章魚 octopus, 烏賊 squid, 魟魚 ray, 鯊魚 shark, 獅子魚 lionfish, 海星 starfish, 螺 snail
  (ASCII + pixel sprites, own depth bands / rests / crawling / glass climbing; generic hunger, breeding, save, 100 cap).
- sw.js `fishtank-v13`, `app.js?v=13`, `can.js?v=13`, `lib/relay.js?v=13`.
- Tests: `test_v13.py` (uses `mock_ntfy.py` automatically when the box's ntfy.sh allowance is used up); older suites run with `seed_classic.py`
  (classic 17-creature start) via /tmp/runall.sh.

## v14 (2026-11-20)
- ≡ → 「↺ 重新開缸」 (last item): two in-app dialogs (確定 → danger 「清掉重來」), 取消 or tapping outside changes nothing.
  Final confirm removes only `localStorage['fishtank.v1']` (save() is blocked during the reset so pagehide can't write it back) and reloads → v13 empty tank.
- Tank floor: white pebble bed (. o ° ∘ ·, white/light grey, flat), pre-rendered once per resize into offscreen canvases (ASCII + pixel).
- 佈置: new horizontal driftwood log (picture-only button `=o=~(@)`, ASCII + pixel sprites, drag / wheel / corner handle / −＋, saved).
- Phone can "goes dead after buttons": root cause was the relay's token bucket (burst 24, +1 per 10 s) shared by shakes, pours and
  buttons — after ~20 s of use only one post per 10 s got through. Now posts inside a 1.2 s window merge (feeds add up to 8, one knock),
  bucket burst 30 / +1 per 5 s, and the merge window widens smoothly (1.2 → 5 s) as tokens run low instead of stalling.
  Tank status after actions ≤ 1 per 20 s.
- sw.js `fishtank-v14`, `?v=14` everywhere. Test: `MOCK=1 python3 test_v14.py <url>`.
