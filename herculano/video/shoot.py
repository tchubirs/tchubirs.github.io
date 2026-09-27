"""Seat the emulated reader at a table, then record one segment of the demo.

Usage: python3 video/shoot.py ar|vr   (managed dev session up with --allow-browser-automation)
"""
import json, os, subprocess, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tests"))
from iw import cli, entity, xr  # noqa: E402

SEAT = {"x": -1.53, "y": 1.2, "z": -0.45}   # at a table in the emulated living room
segment = sys.argv[1]
root = os.path.join(os.path.dirname(__file__), ".frames")
os.makedirs(root, exist_ok=True)
json.dump({"segment": segment, "seat": SEAT}, open(os.path.join(root, "plan.json"), "w"))

def run(script, timeout_ms):
    p = subprocess.run(["npx", "iwsdk", "browser", "run", script, "--timeout", str(timeout_ms)],
                       capture_output=True, text=True)
    d = json.loads(p.stdout or p.stderr)
    if not d.get("ok"):
        raise RuntimeError(d.get("error", {}).get("message", "")[:300])
    return d["data"].get("result")

run("video/goto.mjs", 60000)
cli("runtime", "wait")
time.sleep(3)
xr("enter")
xr("set-input-mode", mode="hand")
xr("set-transform", device="hand-left", position={"x": SEAT["x"] - 0.35, "y": 0.95, "z": SEAT["z"] + 0.25})
xr("set-transform", device="hand-right", position={"x": SEAT["x"] + 0.35, "y": 0.95, "z": SEAT["z"] + 0.25})
xr("set-transform", device="headset", position=SEAT)
xr("look-at", device="headset", target={"x": SEAT["x"], "y": 0.78, "z": SEAT["z"] - 0.5})
time.sleep(2.5)
# The demo reads the first scroll, HEDONON, whatever today's is.
cli("ecs", "set-component", payload={"entityIndex": entity("Scroll"), "componentId": "Scroll",
                                     "field": "reading", "value": 0})
time.sleep(1)
import shutil
shutil.rmtree(os.path.join(root, segment), ignore_errors=True)
while True:
    r = run("video/record.mjs", 110_000)
    print(json.dumps(r), flush=True)
    if r["next"] >= r["frames"]:
        break
