"""Finds the lettering in a game picture and reads it."""
import subprocess, sys, tempfile, os
from collections import Counter, defaultdict
from PIL import Image

def components(mask, w, h):
    seen = [[False]*w for _ in range(h)]
    out = []
    for y in range(h):
        for x in range(w):
            if not mask[y][x] or seen[y][x]: continue
            stack=[(x,y)]; seen[y][x]=True; pts=[]
            while stack:
                cx,cy=stack.pop(); pts.append((cx,cy))
                for dx in(-1,0,1):
                    for dy in(-1,0,1):
                        nx,ny=cx+dx,cy+dy
                        if 0<=nx<w and 0<=ny<h and mask[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx]=True; stack.append((nx,ny))
            xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
            out.append((min(xs),min(ys),max(xs),max(ys),len(pts)))
    return out

def text_colours(im):
    w,h=im.size; px=im.load()
    cnt=Counter(px[x,y] for y in range(h) for x in range(w) if px[x,y][3])
    scored=[]
    for col,n in cnt.most_common(12):
        if n < 20 or n > w*h*0.4: continue
        mask=[[px[x,y]==col for x in range(w)] for y in range(h)]
        comps=[c for c in components(mask,w,h) if 2<=c[2]-c[0]+1<=18 and 4<=c[3]-c[1]+1<=16 and c[4]>=6]
        if len(comps)>=3: scored.append((len(comps),col,comps))
    scored.sort(reverse=True)
    # A label drawn as a coloured fill inside a pale outline offers both as
    # candidates. The fill is the one whose pixels are ringed by the other, and
    # the fill is the lettering -- picking the outline writes the Arabic in the
    # wrong colour.
    if len(scored) >= 2:
        (n0, c0, m0), (n1, c1, m1) = scored[0], scored[1]
        if abs(n0 - n1) <= max(2, n0 * 0.35):
            w, h = im.size; px = im.load()
            def ringed_by(a, b):
                touch = tot = 0
                for y in range(h):
                    for x in range(w):
                        if px[x, y] != a: continue
                        tot += 1
                        if any(0 <= x+dx < w and 0 <= y+dy < h and px[x+dx, y+dy] == b
                               for dx in (-1, 0, 1) for dy in (-1, 0, 1)): touch += 1
                return touch / tot if tot else 0
            if ringed_by(c1, c0) > ringed_by(c0, c1) + 0.15:
                scored[0], scored[1] = scored[1], scored[0]
    return scored

def lines_of(comps, gap=14):
    rows=defaultdict(list)
    for c in comps:
        key=None
        for k in rows:
            if abs(k-c[1])<=5: key=k; break
        rows[key if key is not None else c[1]].append(c)
    out=[]
    for k,cs in rows.items():
        cs.sort()
        groups=[[cs[0]]]
        for c in cs[1:]:
            if c[0]-groups[-1][-1][2] <= gap: groups[-1].append(c)
            else: groups.append([c])
        for g in groups:
            # a word gap is a few pixels; anything inside `gap` belongs to the
            # same phrase, and the phrase is what gets read and replaced
            out.append((min(c[0] for c in g), min(c[1] for c in g),
                        max(c[2] for c in g), max(c[3] for c in g)))
    return sorted(out, key=lambda b:(b[1],b[0]))

def ocr(im, box, col):
    x0,y0,x1,y1=box
    w,h=x1-x0+1, y1-y0+1
    if w<6 or h<5: return ""
    crop=im.crop((x0,y0,x1+1,y1+1)).convert("RGBA")
    px=crop.load()
    out=Image.new("L",(w,h),255)
    o=out.load()
    for y in range(h):
        for x in range(w):
            o[x,y]= 0 if px[x,y]==col else 255
    out=out.resize((w*6,h*6), Image.LANCZOS)
    pad=Image.new("L",(w*6+40,h*6+40),255); pad.paste(out,(20,20))
    with tempfile.NamedTemporaryFile(suffix=".png",delete=False) as f: p=f.name
    pad.save(p)
    try:
        r=subprocess.run(["tesseract",p,"stdout","--psm","7","-l","eng"],
                         capture_output=True,text=True,timeout=20)
        return r.stdout.strip()
    finally: os.unlink(p)

if __name__=="__main__":
    im=Image.open(sys.argv[1]).convert("RGBA")
    sc=text_colours(im)
    if not sc: print("no text colour found"); sys.exit()
    n,col,comps=sc[0]
    print(f"text colour {col}, {n} letter shapes")
    for b in lines_of(comps):
        print(f"  {b}  -> {ocr(im,b,col)!r}")
