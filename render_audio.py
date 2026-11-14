# Render v8 sound samples via OfflineAudioContext in the real app code, save wavs + print spectrum/envelope stats.
import sys, json, wave, numpy as np
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
def save(name, data):
    a = np.clip(np.array(data, dtype=np.float32), -1, 1)
    with wave.open(f"/workspace/fishtank/shots/{name}.wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(44100); w.writeframes((a * 32767).astype(np.int16).tobytes())
    return a
def stats(a, sr=44100):
    spec = np.abs(np.fft.rfft(a)) ** 2; fr = np.fft.rfftfreq(len(a), 1 / sr); tot = spec.sum()
    band = lambda lo, hi: round(float(spec[(fr >= lo) & (fr < hi)].sum() / tot), 3)
    win = int(sr * 0.05); env = np.sqrt(np.convolve(a ** 2, np.ones(win) / win, "valid"))[::win // 2]   # 50 ms RMS envelope
    e = env[int(len(env) * 0.05):] - env[int(len(env) * 0.05):].mean()
    es = np.abs(np.fft.rfft(e)); ef = np.fft.rfftfreq(len(e), (win // 2) / sr)
    slow = es[(ef > 0.03) & (ef < 1.0)]; fast = es[(ef >= 1.0)]
    return {"rms": round(float(np.sqrt((a ** 2).mean())), 4), "peak": round(float(np.abs(a).max()), 3),
            "energy_<500Hz": band(0, 500), "500-1k": band(500, 1000), "1k-3k": band(1000, 3000), "3k-8k": band(3000, 8000), ">8k": band(8000, 22050),
            "centroid_Hz": int((spec * fr).sum() / tot),
            "env_cv": round(float(env.std() / env.mean()), 3),
            "slow_swell_ratio(0.03-1Hz vs >1Hz mean)": round(float(slow.mean() / fast.mean()), 2) if len(slow) else None}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome"); pg = b.new_page()
    pg.goto(url); pg.wait_for_timeout(1500)
    out = {}
    for name, js in [("v8-water", "()=>__tank.renderWaterSample(10)"), ("v8-knock", "()=>__tank.renderSfxSample('knock')"), ("v8-feed", "()=>__tank.renderSfxSample('feed')")]:
        a = save(name, pg.evaluate(js)); out[name] = stats(a)
        if name == "v8-knock":   # length of one knock above -40 dB of its peak
            seg = np.abs(a[int(0.1*44100):int(0.7*44100)]); thr = seg.max() * 0.01; idx = np.where(seg > thr)[0]
            out[name]["one_knock_ms"] = int((idx[-1] - idx[0]) / 44.1)
        if name == "v8-feed":
            seg = np.abs(a[int(0.1*44100):int(1.25*44100)]); thr = seg.max() * 0.03; idx = np.where(seg > thr)[0]
            out[name]["one_sprinkle_ms"] = int((idx[-1] - idx[0]) / 44.1)
    b.close()
print(json.dumps(out, indent=1))
