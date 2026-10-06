"""Dois canais da Kick ouvem o mesmo som no mesmo instante? Envolvente de ataques no relógio absoluto
(PROGRAM-DATE-TIME), depois correlação normalizada em janelas de 20 s. Uso: python3 mesma-cena.py INICIO_ISO MINUTOS canal1 canal2"""
import io, json, sys, re, datetime as dt, urllib.request, concurrent.futures as cf
import numpy as np, av

UA = {"User-Agent": "Mozilla/5.0"}
RATE = 100          # envelope frames per second


def get(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    return data if binary else data.decode()


def segments(chan, t0, t1):
    vods = json.loads(get(f"https://kick.com/api/v2/channels/{chan}/videos"))
    for v in vods:
        s = dt.datetime.fromisoformat(v["start_time"]).replace(tzinfo=dt.timezone.utc)
        e = s + dt.timedelta(milliseconds=v["duration"] or 10**10)
        if s <= t1 and e >= t0 and v.get("source"):
            base = v["source"].rsplit("/", 1)[0]
            pl = get(f"{base}/160p30/playlist.m3u8")
            out, pdt = [], None
            lines = pl.splitlines()
            for i, line in enumerate(lines):
                if line.startswith("#EXT-X-PROGRAM-DATE-TIME:"):
                    pdt = dt.datetime.fromisoformat(line.split(":", 1)[1].replace("Z", "+00:00"))
                elif line.startswith("#EXTINF:"):
                    dur = float(line[8:].split(",")[0])
                    name = lines[i + 1]
                    if pdt and pdt <= t1 and pdt + dt.timedelta(seconds=dur) >= t0:
                        out.append((pdt, dur, f"{base}/160p30/{name}"))
                    pdt = pdt + dt.timedelta(seconds=dur) if pdt else None
            return out
    return []


def envelope(ts_bytes):
    """Mono 16 kHz samples of one segment, and the spectral-flux onset envelope at RATE Hz."""
    c = av.open(io.BytesIO(ts_bytes), format="mpegts")
    res = av.AudioResampler(format="flt", layout="mono", rate=16000)
    pcm = []
    for frame in c.decode(audio=0):
        for f in res.resample(frame):
            pcm.append(f.to_ndarray().reshape(-1))
    x = np.concatenate(pcm) if pcm else np.zeros(1)
    hop, win = 16000 // RATE, 512
    n = max(0, (len(x) - win) // hop)
    frames = np.lib.stride_tricks.sliding_window_view(x, win)[::hop][:n] * np.hanning(win)
    mag = np.log1p(10 * np.abs(np.fft.rfft(frames, axis=1)))
    flux = np.maximum(mag[1:] - mag[:-1], 0).sum(axis=1)
    loud = np.sqrt((frames ** 2).mean(axis=1))[1:]
    return np.concatenate([[0], flux]), np.concatenate([[0], loud])


def track(chan, t0, t1):
    import os
    key = f"cache_{chan}_{t0:%Y%m%dT%H%M%S}_{int((t1 - t0).total_seconds())}.npz"
    if os.path.exists(key):
        z = np.load(key)
        env, loud, n = z["env"], z["loud"], int(z["n"])
    else:
        env, loud, n = _track(chan, t0, t1)
        np.savez(key, env=env, loud=loud, n=n)
    return fill(env), fill(loud), n


def fill(x, short=100):
    """The few frames lost at each segment boundary as zeros; a real gap (no segment) stays NaN."""
    x = x.copy()
    nan = np.isnan(x)
    i = 0
    while i < len(x):
        if nan[i]:
            j = i
            while j < len(x) and nan[j]:
                j += 1
            if j - i < short:
                x[i:j] = 0
            i = j
        else:
            i += 1
    return x


def _track(chan, t0, t1):
    segs = segments(chan, t0, t1)
    total = int((t1 - t0).total_seconds() * RATE)
    env, loud = np.full(total, np.nan), np.full(total, np.nan)
    def one(s):
        return s, envelope(get(s[2], binary=True))
    with cf.ThreadPoolExecutor(8) as ex:
        for (pdt, dur, url), (f, l) in ex.map(one, segs):
            i0 = int((pdt - t0).total_seconds() * RATE)
            for arr, src in ((env, f), (loud, l)):
                a, b = max(i0, 0), min(i0 + len(src), total)
                if b > a:
                    arr[a:b] = src[a - i0:b - i0]
    return env, loud, len(segs)


def ncc(a, b, max_lag):
    """Normalised cross-correlation of b against a for lags -max_lag..max_lag frames; peak, lag, peak/second."""
    a = (a - a.mean()) / (a.std() + 1e-9)
    b = (b - b.mean()) / (b.std() + 1e-9)
    full = np.correlate(b, a, mode="valid") / len(a)
    lag = int(np.argmax(full)) - max_lag
    peak = full.max()
    rest = np.delete(full, range(max(0, lag + max_lag - 20), min(len(full), lag + max_lag + 21)))
    second = rest.max() if len(rest) else 0
    return float(peak), lag / RATE, float(peak / (abs(second) + 1e-9))


if __name__ == "__main__":
    t0 = dt.datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00"))
    t1 = t0 + dt.timedelta(minutes=float(sys.argv[2]))
    chans = sys.argv[3:]
    data = {}
    for c in chans:
        env, loud, n = track(c, t0, t1)
        data[c] = (env, loud)
        print(f"{c}: {n} segments, {np.isfinite(env).mean():.0%} covered", flush=True)
    WIN, STEP, LAG = 20 * RATE, 10 * RATE, 8 * RATE
    ref = chans[0]
    for other in chans[1:]:
        print(f"\n{ref} vs {other}: window start, peak ncc, lag s, peak/second")
        rows = []
        for i in range(LAG, len(data[ref][0]) - WIN - LAG, STEP):
            a = data[ref][0][i:i + WIN]
            b = data[other][0][i - LAG:i + WIN + LAG]
            if np.isnan(a).any() or np.isnan(b).any():
                continue
            # the reference window is normalised inside ncc; b is normalised over its own span
            peak, lag, ratio = ncc(a, b, LAG)
            rows.append((i / RATE, peak, lag, ratio))
        rows = np.array(rows)
        if not len(rows):
            print("  no overlap"); continue
        strong = rows[(rows[:, 1] > 0.3) & (rows[:, 3] > 1.5)]
        print(f"  windows {len(rows)}, strong {len(strong)}, median peak {np.median(rows[:,1]):.3f}")
        if len(strong):
            lags = strong[:, 2]
            print(f"  strong lags: median {np.median(lags):+.2f} s, spread {np.percentile(lags,90)-np.percentile(lags,10):.2f} s")
            for r in strong[:12]:
                print(f"  {(t0 + dt.timedelta(seconds=r[0])).strftime('%H:%M:%S')}  peak {r[1]:.2f}  lag {r[2]:+.2f}  ratio {r[3]:.1f}")
