"""Thin wrapper over the IWSDK CLI for scripted emulator checks."""
import json, math, subprocess

def cli(*args, payload=None):
    cmd = ["npx", "iwsdk", *args] + (["--input-json", json.dumps(payload)] if payload is not None else [])
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    d = json.loads(out)
    if not d.get("ok"):
        raise RuntimeError(f"{' '.join(args)}: {d.get('error', {}).get('message', '')[:200]}")
    return d["data"].get("result")

def xr(action, **payload):
    return cli("xr", action, payload=payload)

def entity(component):
    return cli("ecs", "find", payload={"withComponents": [component]})["entities"][0]["entityIndex"]

def components(index):
    return {c["componentId"]: c.get("values") for c in cli("ecs", "query", payload={"entityIndex": index})["components"]}

def logs(count=40, contains=""):
    r = cli("browser", "logs", payload={"count": count})
    items = r.get("logs", r) if isinstance(r, dict) else r
    return [l.get("message", l.get("text", "")) for l in items if contains in l.get("message", l.get("text", ""))]

class Frame:
    """World pose of an entity with a yaw-only rotation (the scroll lies flat)."""
    def __init__(self, transform):
        self.pos = transform["position"]
        x, y, z, w = transform["orientation"]
        self.yaw = math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + x * x))

    def world(self, lx, ly, lz):
        c, s = math.cos(self.yaw), math.sin(self.yaw)
        return {"x": self.pos[0] + c * lx + s * lz, "y": self.pos[1] + ly, "z": self.pos[2] - s * lx + c * lz}
