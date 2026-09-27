"""End-to-end check of the core loop in the IWSDK emulator (managed dev session must be up).

Opens the scroll with one hand, sweeps the other over the target word, and
checks state and guide text at each step. Prints PASS/FAIL lines; exit code 1 on
any failure.
"""
import json, subprocess, sys, time

ORIGIN = (-0.35, 0.74, -0.5)          # SHEET_ORIGIN in src/scroll-system.ts
fails = 0

def cli(*args, payload=None):
    cmd = ["npx", "iwsdk", *args] + (["--input-json", json.dumps(payload)] if payload is not None else [])
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    d = json.loads(out)
    if not d.get("ok"):
        raise RuntimeError(f"{' '.join(args)}: {json.dumps(d.get('error'))[:300]}")
    return d["data"].get("result")

def xr(action, **payload):
    return cli("xr", action, payload=payload)

def scroll_state():
    ents = cli("ecs", "find", payload={"withComponents": ["Scroll"]})["entities"]
    comps = cli("ecs", "query", payload={"entityIndex": ents[0]["entityIndex"]})["components"]
    return next(c["values"] for c in comps if c["componentId"] == "Scroll")

def hint_text():
    panel = cli("ecs", "find", payload={"withComponents": ["ScreenSpace"]})["entities"][0]
    res = cli("ui", "inspect", payload={"entityIndex": panel["entityIndex"], "selector": "#hint"})
    return json.dumps(res, ensure_ascii=False)

def check(name, ok, detail=""):
    global fails
    fails += 0 if ok else 1
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))

cli("browser", "reload")
cli("runtime", "wait")
time.sleep(3)
xr("enter")
xr("set-input-mode", mode="hand")
xr("set-transform", device="headset", position={"x": 0.2, "y": 1.15, "z": 0.1})
xr("look-at", device="headset", target={"x": 0.15, "y": 0.74, "z": -0.5})
# Park both hands away from the sheet.
xr("set-transform", device="hand-left", position={"x": -0.3, "y": 1.1, "z": -0.1})
xr("set-transform", device="hand-right", position={"x": 0.3, "y": 1.1, "z": -0.1})
time.sleep(1)

s = scroll_state()
check("starts rolled", s["unroll"] == 0 and s["revealed"] == 0 and not s["wordFound"], str(s))

# 1. Open: right hand pinches the roll and drags it 0.75 m to the right.
xr("set-transform", device="hand-right", position={"x": ORIGIN[0], "y": 0.77, "z": ORIGIN[2]})
time.sleep(0.5)
xr("set-select-value", device="hand-right", value=1)
time.sleep(0.5)
xr("animate-to", device="hand-right", position={"x": ORIGIN[0] + 0.75, "y": 0.78, "z": ORIGIN[2]}, duration=1.5)
time.sleep(2)
s = scroll_state()          # still holding the roll
check("pulling opens 0.75 m", abs(s["unroll"] - 0.75) < 0.02, f"unroll={s['unroll']:.3f}")
check("the hand pulling the roll reveals nothing", s["revealed"] == 0, f"revealed={s['revealed']:.4f}")
xr("set-transform", device="hand-right", position={"x": 0.3, "y": 1.1, "z": -0.1})
xr("set-select-value", device="hand-right", value=0)
time.sleep(1)
s = scroll_state()

# 2. Sweep: left palm passes low over the target word.
check("target word lies on the opened part", 0 < s["targetS"] < s["unroll"], f"targetS={s['targetS']:.3f}")
# The emulated hand is placed by its wrist; the palm (grip space, which is what
# reveals ink) sits a few cm away. Measure that offset over a blank stretch of
# sheet, then aim the palm rather than the wrist.
CAL = (0.15, 0.0)
xr("set-transform", device="hand-left", position={"x": ORIGIN[0] + CAL[0], "y": ORIGIN[1] + 0.04, "z": ORIGIN[2] + CAL[1]})
time.sleep(0.5)
c = scroll_state()
off_s, off_z = c["palmS"] - CAL[0], c["palmZ"] - CAL[1]
print(f"     palm is {off_s:+.3f} m along, {off_z:+.3f} m across from the wrist")
xr("set-transform", device="hand-left", position={"x": -0.3, "y": 1.1, "z": -0.1})
time.sleep(0.5)
tx, tz = ORIGIN[0] + s["targetS"] - off_s, ORIGIN[2] + s["targetZ"] - off_z
xr("set-transform", device="hand-left", position={"x": tx - 0.12, "y": ORIGIN[1] + 0.04, "z": tz})
time.sleep(0.5)
xr("animate-to", device="hand-left", position={"x": tx + 0.12, "y": ORIGIN[1] + 0.04, "z": tz}, duration=1.2)
time.sleep(1.8)
s = scroll_state()
print(f"     palm last at s={s['palmS']:.3f} z={s['palmZ']:.3f}; target at s={s['targetS']:.3f} z={s['targetZ']:.3f}")
check("sweeping reveals ink", s["revealed"] > 0.005, f"revealed={s['revealed']:.4f}")
check("sweeping over the word finds it", s["wordFound"] is True)

# 3. Guide text reached the final step.
try:
    t = hint_text()
    check("guide shows the found message", "HEDONON" in t and "PORPHYRAS" in t, t[:160])
except Exception as e:
    check("guide shows the found message", False, str(e)[:200])

sys.exit(1 if fails else 0)
