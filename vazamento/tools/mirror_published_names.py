"""Mirror the published ink/ tree with the exact file names and tiny blank contents."""
import sys, json, re, html, urllib.request
from pathlib import Path
import numpy as np, tifffile, zarr
def listing(path):
    s = urllib.request.urlopen(f"https://huggingface.co/buckets/scrollprize/datasets/tree/{path}", timeout=60).read().decode()
    out=set()
    for m in re.findall(r'data-props="([^"]+)"', s):
        try: d=json.loads(html.unescape(m))
        except Exception: continue
        def walk(o):
            if isinstance(o,dict):
                if "path" in o and "type" in o: out.add((o["type"], o["path"].split("/")[-1]))
                for v in o.values(): walk(v)
            elif isinstance(o,list):
                for v in o: walk(v)
        walk(d)
    return out
root=Path(sys.argv[1]); blank=np.zeros((16,16),np.uint8)
for scroll in sys.argv[2:]:
    for t,seg in sorted(listing(f"ink/{scroll}")):
        if t!="directory": continue
        d=root/scroll/seg; d.mkdir(parents=True, exist_ok=True)
        for t2,n in listing(f"ink/{scroll}/{seg}"):
            if t2=="file" and n.lower().endswith((".tif",".tiff")) and ("_inklabels" in n or "_mask" in n):
                tifffile.imwrite(d/n, blank)
        g=zarr.open_group(d/f"{seg}.zarr", mode="w", zarr_format=2); g.create_array("0", data=np.zeros((1,16,16),np.uint8), chunks=(1,16,16))
print("mirrored")
