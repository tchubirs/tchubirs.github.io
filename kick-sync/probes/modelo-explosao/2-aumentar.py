# Aumenta os sons do jogo para parecerem som de live: tom, passa-baixas (distancia), reverb, fundo de VOD, AAC. Precisa de numpy e av.
# Uso: POVIX_AUDIO=<pasta> python -I 2-aumentar.py explosao|tiro SEMENTE N_POR_SOM. Espera <pasta>/deteccoes_vod.json (3-detectar-fundos.mjs) e <pasta>/vod/*.f32.
"""Gera clipes de 14 s a 24 kHz: som do jogo (explosao/tiro) com cara de live (distancia, reverb, fundo da VOD, AAC)."""
import sys, os, csv, json, wave, io, numpy as np, av
D = os.environ.get("POVIX_AUDIO") or os.path.dirname(os.path.abspath(__file__))
R = 24000; L = 14 * R
rng = np.random.default_rng(int(sys.argv[2]) if len(sys.argv) > 2 else 1)
cls = sys.argv[1]  # explosao | tiro
N_AUG = int(sys.argv[3]) if len(sys.argv) > 3 else 10
det = json.load(open(os.path.join(D, "deteccoes_vod.json")))
canais = [k for k in det if not k.startswith("_")]
vod = {c: np.fromfile(os.path.join(D, "vod", c + ".f32"), dtype=np.float32) for c in canais}
chao = {c: det["_chao_" + c] for c in canais}

def ler(fn):
    w = wave.open(fn); n = w.getnframes(); ch = w.getnchannels(); sw = w.getsampwidth(); sr = w.getframerate()
    raw = w.readframes(n)
    x = np.frombuffer(raw, dtype={2: np.int16, 4: np.int32}[sw]).astype(np.float32) / (32768 if sw == 2 else 2**31)
    return x.reshape(-1, ch).mean(1), sr

def reamostrar(x, sr_de, sr_para):
    if sr_de == sr_para: return x
    n = int(round(len(x) * sr_para / sr_de)); X = np.fft.rfft(x); m = n // 2 + 1
    Y = np.zeros(m, dtype=complex); k = min(m, len(X)); Y[:k] = X[:k]
    return np.fft.irfft(Y, n) * (n / len(x))

def passabaixas(x, fc, ordem=2):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / R)
    return np.fft.irfft(X / np.sqrt(1 + (f / fc) ** (2 * ordem)), len(x))

def reverb(x, rt, molhado):
    n = int(rt * R); t = np.arange(n) / R
    ir = rng.standard_normal(n) * np.exp(-t * 6.9 / rt)
    ir = passabaixas(ir, rng.uniform(1500, 6000), 1)
    ir /= np.sqrt((ir ** 2).sum()) + 1e-9
    nn = len(x) + n; y = np.fft.irfft(np.fft.rfft(x, nn) * np.fft.rfft(ir, nn), nn)[:len(x) + n]
    y *= np.sqrt((x ** 2).sum() / ((y ** 2).sum() + 1e-12))
    out = np.zeros(len(y)); out[:len(x)] += x * np.sqrt(1 - molhado); out += y * np.sqrt(molhado)
    return out

def forca(x):  # RMS de blocos de 10 ms, como medirGraves
    b = R // 100; n = len(x) // b
    return np.sqrt((x[:n * b].reshape(n, b) ** 2).mean(1))

def aac(x, kbps):
    buf = io.BytesIO(); oc = av.open(buf, "w", format="adts"); st = oc.add_stream("aac", rate=R); st.bit_rate = kbps * 1000; st.layout = "mono"
    fr = av.AudioFrame.from_ndarray(np.clip(x, -1, 1).astype(np.float32).reshape(1, -1), format="flt", layout="mono"); fr.sample_rate = R
    for p in st.encode(fr): oc.mux(p)
    for p in st.encode(None): oc.mux(p)
    oc.close(); buf.seek(0)
    ic = av.open(buf, format="adts"); rs = av.AudioResampler(format="flt", layout="mono", rate=R)
    y = np.concatenate([f.to_ndarray().reshape(-1) for fr in ic.decode(audio=0) for f in rs.resample(fr)])
    return y[:len(x)] if len(y) >= len(x) else np.pad(y, (0, len(x) - len(y)))

def fundo():
    for _ in range(200):
        c = canais[rng.integers(len(canais))]; v = vod[c]; o = int(rng.integers(0, len(v) - L))
        t0, t1 = o / R, (o + L) / R
        if any(a < t1 + 2 and b > t0 - 2 for a, b in det[c]): continue
        return c, o
    raise SystemExit("sem fundo")

arqs = [r for r in csv.DictReader(open(os.path.join(D, "rust-sons", "_categorias.csv"))) if r["categoria"].startswith(cls)]
if cls == "tiro": arqs = [arqs[i] for i in rng.permutation(len(arqs))[:len(arqs) // 2]]
saida = open(os.path.join(D, f"aug-{cls}.f32"), "wb"); man = []
for r in arqs:
    x0, sr = ler(os.path.join(D, "rust-sons", r["arquivo"]))
    x0 = reamostrar(x0, sr, R)[: 8 * R]
    for k in range(N_AUG):
        x = x0.copy()
        x = reamostrar(x, R, int(R * rng.uniform(0.92, 1.08)))  # muda tom e duracao; relido a 24k abaixo
        x = np.interp(np.arange(int(len(x) * 1.0)), np.arange(len(x)), x)
        fc = float(np.exp(rng.uniform(np.log(600), np.log(10500))))
        x = passabaixas(x, fc, int(rng.integers(1, 4)))
        if rng.random() < 0.75: x = reverb(x, rng.uniform(0.25, 2.5), rng.uniform(0.1, 0.75))
        c, o = fundo(); bg = vod[c][o:o + L].astype(np.float64)
        razao = float(np.exp(rng.uniform(np.log(8), np.log(45))))
        pico = forca(x).max() + 1e-12
        x = x * (razao * chao[c] / pico)
        ini = int(rng.uniform(4, 6) * R); mix = bg.copy(); n = min(len(x), L - ini); mix[ini:ini + n] += x[:n]
        kb = int(rng.choice([32, 48, 64, 96])); mix = aac(mix, kb)
        mix.astype(np.float32).tofile(saida)
        man.append(dict(arq=r["arquivo"], clip=r["clip"], cat=r["categoria"], fundo=c, fc=round(fc), razao=round(razao, 1), kbps=kb, chao=chao[c], ini=ini / R, i=len(man)))
json.dump(man, open(os.path.join(D, f"aug-{cls}.json"), "w")); print(cls, len(man), "clipes")
