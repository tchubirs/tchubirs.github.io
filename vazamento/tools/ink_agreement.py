import numpy as np, tifffile, sys
from pathlib import Path
R=Path(sys.argv[4]) if len(sys.argv)>4 else Path('.')
def f(seg,suf):
    p=R/seg/f"{seg}{suf}.tif"
    return p if p.exists() else R/seg/f"{seg}{suf}.tiff"
def load(seg):
    x,y,z=[tifffile.imread(R/seg/f"{c}.tif") for c in "xyz"]
    ink=tifffile.imread(f(seg,"_inklabels")); sup=tifffile.imread(f(seg,"_supervision_mask"))
    H,W=x.shape; fy,fx=ink.shape[0]/H, ink.shape[1]/W
    # sample label at block centre of each grid cell
    yy=np.minimum((np.arange(H)*fy+fy/2).astype(int),ink.shape[0]-1)
    xx=np.minimum((np.arange(W)*fx+fx/2).astype(int),ink.shape[1]-1)
    inkg=ink[np.ix_(yy,xx)]>0; supg=sup[np.ix_(yy,xx)]>0
    keep=(x>0)&(y>0)&(z>0)&supg
    return np.stack([x[keep],y[keep],z[keep]],1), inkg[keep]
cell=float(sys.argv[3]) if len(sys.argv)>3 else 8.0
pa,ia=load(sys.argv[1]); pb,ib=load(sys.argv[2])
key=lambda q:(q[:,0]<<42)^(q[:,1]<<21)^q[:,2]
qb=np.floor(pb/cell).astype(np.int64); kb=key(qb)
order=np.argsort(kb); kbs=kb[order]
qa=np.floor(pa/cell).astype(np.int64); ka=key(qa)
pos=np.searchsorted(kbs,ka); pos=np.minimum(pos,len(kbs)-1)
hit=kbs[pos]==ka
la=ia[hit]; lb=ib[order[pos[hit]]]
n=hit.sum()
print(f"A={sys.argv[1]} B={sys.argv[2]} cell={cell}: {n} A-points share a cell with B")
if n:
    agree=(la==lb).mean()
    pa_ink=la.mean(); pb_ink=lb.mean()
    chance=pa_ink*pb_ink+(1-pa_ink)*(1-pb_ink)
    both=(la&lb).sum(); anyink=(la|lb).sum()
    print(f"  ink fraction A {pa_ink:.3f}  B {pb_ink:.3f}")
    print(f"  label agreement {agree:.3f}   expected by chance {chance:.3f}")
    print(f"  ink IoU on shared cells {both/max(anyink,1):.3f}  (ink in both {both}, ink in either {anyink})")
