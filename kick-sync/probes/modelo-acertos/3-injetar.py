# Cria trechos de teste: 600 s de uma live de verdade (f32, 24 kHz, mono) com os clipes de acerto do jogo somados em lugares
# conhecidos (8 por modelo, 10,5 s uns dos outros), num volume relativo ao som em volta (RMS de 4 s), depois passados por AAC
# de 48 kbps, que e o que a live faz com tudo. Grava inj-<dB>.f32 e inj-pos.json ([[segundos, id], ...]) em POVIX_AUDIO.
# Uso: POVIX_AUDIO=<pasta> python -I 3-injetar.py <live.f32> <inicioS> [dB ...]   (padrao: -6 -12 -18 -24)
import av, numpy as np, os, sys, io, json
D = os.environ["POVIX_AUDIO"]; live = sys.argv[1]; ini = float(sys.argv[2]); dbs = [float(x) for x in sys.argv[3:]] or [-6, -12, -18, -24]
SR = 24000
MODELOS = {"classico-1": "hit-marker-001", "classico-2": "hit-marker-003", "moderno-1": "modern_hitmarker_1", "moderno-2": "modern_hitmarker_2",
           "moderno-3": "modern_hitmarker_3", "cabeca": "headshot-1", "morte": "modern_kill_notify"}
def a24(f):
    c = av.open(f); r = av.AudioResampler(format="flt", layout="mono", rate=SR)
    return np.concatenate([x.to_ndarray().reshape(-1) for fr in c.decode(audio=0) for x in r.resample(fr)])
def aac(x, kbps=48):
    buf = io.BytesIO(); oc = av.open(buf, "w", format="adts"); st = oc.add_stream("aac", rate=SR); st.bit_rate = kbps * 1000; st.layout = "mono"
    fr = av.AudioFrame.from_ndarray(x.reshape(1, -1).astype(np.float32), format="flt", layout="mono"); fr.sample_rate = SR
    for p in st.encode(fr): oc.mux(p)
    for p in st.encode(None): oc.mux(p)
    oc.close(); buf.seek(0)
    c = av.open(buf, format="adts"); r = av.AudioResampler(format="flt", layout="mono", rate=SR)
    y = np.concatenate([f.to_ndarray().reshape(-1) for fr in c.decode(audio=0) for f in r.resample(fr)])
    a, b = SR * 5, SR * 15
    cc = np.fft.irfft(np.fft.rfft(y[a:b], 1 << 19) * np.conj(np.fft.rfft(x[a:b], 1 << 19)))
    lag = int(np.argmax(cc[:4000])); y = y[lag:lag + len(x)]
    return np.pad(y, (0, len(x) - len(y))) if len(y) < len(x) else y
base = np.fromfile(live, dtype=np.float32, offset=4 * int(ini * SR), count=600 * SR)
T = {i: a24(os.path.join(D, "ui", f + ".wav")) for i, f in MODELOS.items()}
rng = np.random.default_rng(7)
ids = [i for i in MODELOS for _ in range(8)]; rng.shuffle(ids)
pos = [(6 + 10.5 * k, i) for k, i in enumerate(ids)]
json.dump(pos, open(os.path.join(D, "inj-pos.json"), "w"))
for db in dbs:
    y = base.copy()
    for t, i in pos:
        s = int(t * SR); loc = base[max(0, s - 2 * SR):s + 2 * SR]
        tpl = T[i][:int(0.4 * SR)]
        g = np.sqrt((loc ** 2).mean()) * 10 ** (db / 20) / (np.sqrt((tpl[:int(0.3 * SR)] ** 2).mean()) + 1e-9)
        y[s:s + len(tpl)] += g * tpl
    aac(y).astype(np.float32).tofile(os.path.join(D, f"inj{int(-db)}.f32"))
    print("gravado inj%d.f32" % -db)
