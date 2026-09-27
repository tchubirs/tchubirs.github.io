"""Assemble the demo: title card, recorded segments with captions, end card, and
a soundtrack synthesised from the recorded scroll state (same sounds as
src/audio.ts). Needs PIL, numpy, scipy and imageio-ffmpeg.

Usage: python3 video/make_video.py [out.mp4]
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy.signal import butter, lfilter, lfilter_zi
import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
FRAMES = os.path.join(HERE, ".frames")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "herculano-demo.mp4")
W, H, FPS, SR = 1280, 800, 30, 48000

SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
SERIF_B = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
BG = (18, 13, 9)
GOLD = (232, 194, 122)
CREAM = (239, 230, 214)
DIM = (170, 156, 136)

def font(path, size):
    return ImageFont.truetype(path, size)

def card(lines, vignette=True):
    """A full-frame text card: [(text, font, colour, gap_after)]."""
    img = Image.new("RGB", (W, H), BG)
    if vignette:
        glow = Image.new("L", (W, H), 0)
        ImageDraw.Draw(glow).ellipse((W * 0.15, H * 0.1, W * 0.85, H * 0.9), fill=38)
        glow = glow.filter(ImageFilter.GaussianBlur(120))
        img = Image.composite(Image.new("RGB", (W, H), (60, 42, 26)), img, glow)
    d = ImageDraw.Draw(img)
    heights = []
    for text, f, _, gap in lines:
        box = d.multiline_textbbox((0, 0), text, font=f, spacing=10, align="center")
        heights.append(box[3] - box[1] + gap)
    y = (H - sum(heights)) / 2
    for (text, f, colour, gap), h in zip(lines, heights):
        box = d.multiline_textbbox((0, 0), text, font=f, spacing=10, align="center")
        d.multiline_text(((W - (box[2] - box[0])) / 2, y), text, font=f, fill=colour, spacing=10, align="center")
        y += h
    return img

def caption(img, text):
    """Lower-third caption on a soft dark band."""
    img = img.convert("RGB")
    f = font(SERIF, 30)
    d = ImageDraw.Draw(img, "RGBA")
    box = d.textbbox((0, 0), text, font=f)
    tw, th = box[2] - box[0], box[3] - box[1]
    x, y = (W - tw) / 2, H - 92
    d.rounded_rectangle((x - 26, y - 16, x + tw + 26, y + th + 22), radius=18, fill=(12, 8, 5, 178))
    d.text((x, y - box[1] + 2), text, font=f, fill=CREAM)
    return img

def fade(img, k):
    return Image.blend(Image.new("RGB", (W, H), BG), img, max(0.0, min(1.0, k)))

# ---------------------------------------------------------------- pictures

TITLE = card([
    ("HERCULANEUM", font(SERIF_B, 92), GOLD, 26),
    ("Read a scroll burnt by Vesuvius, with your bare hands.", font(SERIF, 36), CREAM, 34),
    ("Mixed reality  ·  hands only  ·  seated  ·  WebXR", font(SERIF, 24), DIM, 0),
])
END = card([
    ("In 2023, the first word ever read inside a still-rolled", font(SERIF, 34), CREAM, 6),
    ("Herculaneum scroll was", font(SERIF, 34), CREAM, 14),
    ("ΠΟΡΦΥΡΑΣ", font(SERIF_B, 84), GOLD, 10),
    ("“purple”, found with machine learning on X-ray scans.", font(SERIF, 34), CREAM, 44),
    ("This is the version you can hold.", font(SERIF, 30), DIM, 44),
    ("The scrolls here are simulated; the text is Epicurus, Principal Doctrines I–V.\n"
     "Recorded in the IWSDK emulator (Meta Quest 3 profile).", font(SERIF, 20), DIM, 0),
])

def load(segment):
    d = os.path.join(FRAMES, segment)
    if not os.path.exists(os.path.join(d, "log.json")):
        return None
    log = json.load(open(os.path.join(d, "log.json")))
    files = sorted(f for f in os.listdir(d) if f.endswith(".jpg"))
    return d, files, log

def captions_for(segment, log):
    found = next((e["t"] for e in log["log"] if e["found"]), None)
    if segment == "vr":
        return [(0, 99, "No passthrough? The scroll brings its own desk.")]
    cues = [
        (0.0, 4.0, "The scroll finds your real table."),
        (4.0, 8.6, "Pinch the charred roll and pull it open."),
        (8.6, (found or 21) - 0.2, "The ink is invisible. Sweep your palm just above the papyrus."),
    ]
    if found is not None:
        cues.append((found, 26.3, "Find the word on the card: ἡδονῶν, “of pleasures”."))
    cues.append((26.5, 99, "Every day, a new scroll hides a new word."))
    return cues

timeline = []   # (kind, payload) per output frame
sound = []      # per output frame: dict(unroll_speed, scan, revealing, chime)

def hold(img, seconds, fade_in=0.6, fade_out=0.6):
    n = int(seconds * FPS)
    for i in range(n):
        t = i / FPS
        k = min(1.0, t / fade_in if fade_in else 1.0, (seconds - t) / fade_out if fade_out else 1.0)
        timeline.append(("img", (img, k)))
        sound.append(None)

hold(TITLE, 4.0)
for seg in ("ar", "vr"):
    rec = load(seg)
    if rec is None:
        continue
    d, files, log = rec
    cues = captions_for(seg, log)
    prev = None
    n = min(len(files), len(log["log"]))
    for i in range(n):
        e = log["log"][i]
        text = next((c for a, b, c in cues if a <= e["t"] < b), None)
        k = min(1.0, (i + 1) / 12, (n - i) / 12)  # short fades between shots
        timeline.append(("file", (os.path.join(d, files[i]), text, k)))
        speed = 0.0 if prev is None else max(0.0, (e["unroll"] - prev["unroll"]) * FPS)
        sound.append({
            "speed": speed,
            "scan": e["scan"],
            "revealing": prev is not None and e["revealed"] > prev["revealed"],
            "chime": prev is not None and e["found"] and not prev["found"],
        })
        prev = e
hold(END, 7.5, fade_out=1.2)

# ---------------------------------------------------------------- sound

N = len(timeline)
spf = SR // FPS
out = np.zeros(N * spf)
t = np.arange(N * spf) / SR
rng = np.random.default_rng(79)

# A low, dusty bed so the room is never dead silent.
bed = rng.standard_normal(N * spf)
b, a = butter(2, 180 / (SR / 2))
out += lfilter(b, a, bed) * 0.05 + np.sin(2 * np.pi * 55 * t) * 0.012

# Papyrus rustle while the roll is pulled; scanner hum while a palm is over the sheet.
crackle = rng.standard_normal(N * spf) * np.where(rng.random(N * spf) < 0.015, 1.0, 0.2)
b_band, a_band = butter(2, [1800 / (SR / 2), 3600 / (SR / 2)], btype="band")
rustle = lfilter(b_band, a_band, crackle)
saw = sum(2 * ((t * f) % 1.0) - 1 for f in (110, 110.6, 220.9))
hum = np.zeros_like(saw)
zi = None
level = cutoff = 0.0
gain_r = np.zeros(N * spf)
gain_h = np.zeros(N * spf)
for i, s in enumerate(sound):
    seg = slice(i * spf, (i + 1) * spf)
    target_r = 0.0 if s is None else min(1.0, s["speed"] * 3) * 0.6
    target_l = 0.0 if s is None else float(s["scan"])
    level += (target_l - level) * 0.35
    want = 1500.0 if (s and s["revealing"]) else 380.0 + 250.0 * level
    cutoff += (want - cutoff) * 0.3 if cutoff else want
    b_l, a_l = butter(2, cutoff / (SR / 2))
    if zi is None:
        zi = lfilter_zi(b_l, a_l) * 0
    hum[seg], zi = lfilter(b_l, a_l, saw[seg], zi=zi)
    gain_r[seg] = target_r
    gain_h[seg] = level * 0.1
smooth = np.ones(400) / 400
out += rustle * np.convolve(gain_r, smooth, "same") * 0.9
out += hum * np.convolve(gain_h, smooth, "same")

# The chord when the word is found.
for i, s in enumerate(sound):
    if s and s["chime"]:
        for j, f in enumerate((440, 554.37, 659.25, 880)):
            start = i * spf + int(j * 0.11 * SR)
            n = int(2.4 * SR)
            tt = np.arange(n) / SR
            tri = 2 * np.abs(2 * ((tt * f) % 1.0) - 1) - 1
            env = np.minimum(1, tt / 0.02) * np.exp(-tt * 2.9)
            end = min(len(out), start + n)
            out[start:end] += (tri * env * 0.16)[: end - start]

out *= 0.9 / max(1e-6, np.max(np.abs(out)))
audio_path = os.path.join(FRAMES, "sound.wav")
import wave
with wave.open(audio_path, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out * 32767).astype("<i2").tobytes())

# ---------------------------------------------------------------- encode

ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
enc = subprocess.Popen(
    [ffmpeg, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
     "-i", "-", "-i", audio_path, "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p",
     "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", OUT],
    stdin=subprocess.PIPE,
)
for kind, p in timeline:
    if kind == "img":
        img, k = p
        frame = fade(img, k)
    else:
        path, text, k = p
        frame = Image.open(path).convert("RGB").resize((W, H))
        if text:
            frame = caption(frame, text)
        frame = fade(frame, k)
    enc.stdin.write(frame.tobytes())
enc.stdin.close()
enc.wait()
print(OUT, f"{N / FPS:.1f} s")
