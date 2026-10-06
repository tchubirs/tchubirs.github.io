"""O som de um canal entre dois instantes, no relógio absoluto, mono a 8 kHz, em float32 cru.
Uso: python3 pcm-8khz.py canal INICIO_ISO MINUTOS saida.f32"""
import sys, io, os, datetime as dt, numpy as np, av, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
_spec = importlib.util.spec_from_file_location("lab", os.path.join(os.path.dirname(os.path.abspath(__file__)), "mesma-cena.py"))
lab = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lab)
chan, t0 = sys.argv[1], dt.datetime.fromisoformat(sys.argv[2].replace("Z", "+00:00"))
t1 = t0 + dt.timedelta(minutes=float(sys.argv[3]))
RATE = 8000
out = np.zeros(int((t1 - t0).total_seconds() * RATE), dtype=np.float32)
segs = lab.segments(chan, t0, t1)
def one(s):
    c = av.open(io.BytesIO(lab.get(s[2], binary=True)), format="mpegts")
    res = av.AudioResampler(format="flt", layout="mono", rate=RATE)
    pcm = [f.to_ndarray().reshape(-1) for fr in c.decode(audio=0) for f in res.resample(fr)]
    return s, np.concatenate(pcm) if pcm else np.zeros(1, dtype=np.float32)
with cf.ThreadPoolExecutor(8) as ex:
    for (pdt, dur, url), x in ex.map(one, segs):
        i0 = int((pdt - t0).total_seconds() * RATE)
        a, b = max(i0, 0), min(i0 + len(x), len(out))
        if b > a:
            out[a:b] = x[a - i0:b - i0]
out.tofile(sys.argv[4])
print(chan, len(segs), "segments", len(out) / RATE, "s")
