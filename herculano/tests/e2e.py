"""End-to-end check of the core loop in the IWSDK emulator (managed dev session must be up).

Opens the scroll with one hand, sweeps the other over the target word, and
checks state and guide text at each step. Prints PASS/FAIL lines; exit code 1 on
any failure.
"""
import json, sys, time
from iw import Frame, cli, components, entity, logs, xr

SEAT = {"x": -1.53, "y": 1.2, "z": -0.45}    # seated at a table in the emulated living room
TABLE_Y = 0.78                             # that table's top
fails = 0

def scroll_state():
    return components(entity("Scroll"))["Scroll"]

def hint_text():
    res = cli("ui", "inspect", payload={"entityIndex": entity("ScreenSpace"), "selector": "#hint"})
    found = []
    def walk(o):
        if isinstance(o, dict):
            if isinstance(o.get("text"), str):
                found.append(o["text"])
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(res)
    return found[0] if found else json.dumps(res)[:200]

def check(name, ok, detail=""):
    global fails
    fails += 0 if ok else 1
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))

cli("browser", "reload")
cli("runtime", "wait")
time.sleep(3)
xr("enter")
xr("set-input-mode", mode="hand")
# Park both hands away from the table, then sit down facing it.
xr("set-transform", device="hand-left", position={"x": SEAT["x"] - 0.3, "y": 1.0, "z": SEAT["z"] + 0.2})
xr("set-transform", device="hand-right", position={"x": SEAT["x"] + 0.3, "y": 1.0, "z": SEAT["z"] + 0.2})
xr("set-transform", device="headset", position=SEAT)
xr("look-at", device="headset", target={"x": SEAT["x"], "y": TABLE_Y, "z": SEAT["z"] - 0.5})
time.sleep(2)

s = scroll_state()
check("starts rolled", s["unroll"] == 0 and s["revealed"] == 0 and not s["wordFound"], str(s))
sheet = Frame(components(entity("Scroll"))["Transform"])
check("the scroll lies on the real table", abs(sheet.pos[1] - TABLE_Y) < 0.01 and any("on a table" in m for m in logs(60, "[desk]")),
      f"y={sheet.pos[1]:.3f}")
park_r = {"x": SEAT["x"] + 0.3, "y": 1.0, "z": SEAT["z"] + 0.2}

# 1. Open: right hand pinches the roll and drags it 0.75 m to the right.
xr("set-transform", device="hand-right", position=sheet.world(0, 0.03, 0))
time.sleep(0.5)
xr("set-select-value", device="hand-right", value=1)
time.sleep(0.5)
xr("animate-to", device="hand-right", position=sheet.world(0.75, 0.04, 0), duration=1.5)
time.sleep(2)
s = scroll_state()          # still holding the roll
check("pulling opens 0.75 m", abs(s["unroll"] - 0.75) < 0.02, f"unroll={s['unroll']:.3f}")
check("the hand pulling the roll reveals nothing", s["revealed"] == 0, f"revealed={s['revealed']:.4f}")
xr("set-transform", device="hand-right", position=park_r)
xr("set-select-value", device="hand-right", value=0)
time.sleep(1)
s = scroll_state()
moved = Frame(components(entity("Scroll"))["Transform"])
check("the scroll stays put once touched", moved.pos == sheet.pos, f"{moved.pos} vs {sheet.pos}")

# 2. Sweep: left palm passes low over the target word.
check("target word lies on the opened part", 0 < s["targetS"] < s["unroll"], f"targetS={s['targetS']:.3f}")
# The emulated hand is placed by its wrist; the palm (grip space, which is what
# reveals ink) sits a few cm away. Measure that offset over a blank stretch of
# sheet, then aim the palm rather than the wrist. Offsets are in sheet axes.
CAL = (0.15, 0.0)
xr("set-transform", device="hand-left", position=sheet.world(CAL[0], 0.04, CAL[1]))
time.sleep(0.5)
c = scroll_state()
off_s, off_z = c["palmS"] - CAL[0], c["palmZ"] - CAL[1]
print(f"     palm is {off_s:+.3f} m along, {off_z:+.3f} m across from the wrist")
xr("set-transform", device="hand-left", position={"x": SEAT["x"] - 0.3, "y": 1.0, "z": SEAT["z"] + 0.2})
time.sleep(0.5)
ts, tz = s["targetS"] - off_s, s["targetZ"] - off_z
xr("set-transform", device="hand-left", position=sheet.world(ts - 0.12, 0.04, tz))
time.sleep(0.5)
xr("animate-to", device="hand-left", position=sheet.world(ts + 0.12, 0.04, tz), duration=1.2)
time.sleep(1.8)
s = scroll_state()
print(f"     palm last at s={s['palmS']:.3f} z={s['palmZ']:.3f}; target at s={s['targetS']:.3f} z={s['targetZ']:.3f}")
check("sweeping reveals ink", s["revealed"] > 0.005, f"revealed={s['revealed']:.4f}")
check("sweeping over the word finds it", s["wordFound"] is True)

# 3. Guide text reached the final step.
LATIN = ["HEDONON", "THANATOS", "ZEN", "APHTHARTON", "SARKI"]   # src/readings.ts order
try:
    t = hint_text()
    check("guide shows the found message", LATIN[s["reading"]] in t and "PORPHYRAS" in t and "of 5 read" in t, t[:120])
except Exception as e:
    check("guide shows the found message", False, str(e)[:200])

# 4. Another scroll: the old one rolls up and a different word is hidden.
before = s
cli("ecs", "set-component", payload={"entityIndex": entity("Scroll"), "componentId": "Scroll",
                                     "field": "reading", "value": (s["reading"] + 1) % len(LATIN)})
time.sleep(1.5)
s = scroll_state()
check("another scroll rolls up fresh", s["unroll"] == 0 and s["revealed"] == 0 and not s["wordFound"]
      and s["reading"] == (before["reading"] + 1) % len(LATIN), str({k: s[k] for k in ("reading", "unroll", "revealed")}))
check("its word is somewhere else", abs(s["targetS"] - before["targetS"]) > 0.01 or abs(s["targetZ"] - before["targetZ"]) > 0.01,
      f"targetS {before['targetS']:.3f} -> {s['targetS']:.3f}")
try:
    t = hint_text()
    check("guide starts over", "Pinch it" in t, t[:120])
except Exception as e:
    check("guide starts over", False, str(e)[:200])

sys.exit(1 if fails else 0)
