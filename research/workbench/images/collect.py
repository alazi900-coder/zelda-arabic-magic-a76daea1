import glob, json, os, sys
from PIL import Image
sys.path.insert(0, ".")
from ocr_probe import text_colours, lines_of, ocr

out = {}
files = sorted(f for f in glob.glob("all_png/*/*.png") if "_معاينة" not in f)
for i, f in enumerate(files):
    try:
        im = Image.open(f).convert("RGBA")
        if im.width * im.height > 300000:   # backgrounds: nothing to read
            continue
        sc = text_colours(im)
        if not sc: continue
        n, col, comps = sc[0]
        rows = []
        for b in lines_of(comps):
            t = ocr(im, b, col)
            if t: rows.append({"box": list(b), "text": t})
        if rows:
            out[os.path.relpath(f, "all_png")] = {"colour": list(col), "lines": rows}
    except Exception as e:
        print("ERR", f, e, file=sys.stderr)
    if i % 50 == 0: print(f"{i}/{len(files)}", flush=True)
json.dump(out, open("ocr.json", "w"), ensure_ascii=False, indent=1)
print("images with text:", len(out))
