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
