"""
Finds each picture's real width by reading it.

The seam-continuity guess was wrong often enough to lose whole menus, and a
wrong width is obvious to a reader: the letters only line up at one of them.
So every candidate width is run through OCR and the one whose output holds the
most real English words wins.

Speed comes from how tesseract is called, not from doing less work: started
once per picture it spends about four seconds loading its model and a moment
reading, even on a 64x32 button. Given a list of files it loads the model once
and separates the pages with a form feed, which is the whole sweep in minutes
rather than an hour. So the pictures are prepared first -- laid on black,
turned so the text is dark on light, doubled in size -- and then handed over in
chunks, four chunks at a time for the machine's four cores.
"""
import io, json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

WORDS = set(w.strip().lower() for w in open("gamewords.txt"))
WORDS |= set("""ok lvl tp fp gk df mf fw exp hp pts vs kick body control guard speed stamina guts
experience inventory formation system save friends info swap commands finish prestige friendship
menu team level title next back yes no confirm cancel equip shop practice binder""".split())


def score(text):
    good = [t for t in re.findall(r"[A-Za-z]{3,}", text) if t.lower() in WORDS]
    return (len(good), sum(len(t) for t in good))


def prepare(name):
    im = Image.open("sweep/" + name).convert("RGBA")
    bg = Image.new("RGBA", im.size, (0, 0, 0, 255))
    bg.alpha_composite(im)
    g = bg.convert("L")
    if sum(g.getdata()) / (g.width * g.height) < 128:
        g = ImageOps.invert(g)          # tesseract wants dark text on light
    g.resize((g.width * 2, g.height * 2), Image.LANCZOS).save("prep/" + name)


names = [n for n in json.load(open("sweep_index.json"))
         if (lambda m: int(m.group(1)) >= 32 and int(m.group(2)) >= 16)(re.search(r"~(\d+)x(\d+)\.png$", n))]

os.makedirs("prep", exist_ok=True)
with ThreadPoolExecutor(max_workers=4) as ex:
    list(ex.map(prepare, names))
print("prepared", len(names), flush=True)

CHUNK = 200
chunks = [names[i:i + CHUNK] for i in range(0, len(names), CHUNK)]
out = {}


def run(k):
    listing = f"prep/_list{k}.txt"
    with open(listing, "w") as fh:
        fh.write("\n".join("prep/" + n for n in chunks[k]))
    subprocess.run(["tesseract", listing, f"prep/_out{k}", "--psm", "11", "-l", "eng",
                    "-c", "tessedit_do_invert=0"], capture_output=True, timeout=1800)
    pages = open(f"prep/_out{k}.txt", encoding="utf8", errors="replace").read().split("\f")
    for n, page in zip(chunks[k], pages):
        a, b = score(page)
        out[n] = (a, b, " | ".join(l.strip() for l in page.splitlines() if l.strip()))
    print("chunk", k + 1, "/", len(chunks), flush=True)


with ThreadPoolExecutor(max_workers=4) as ex:
    list(ex.map(run, range(len(chunks))))
json.dump(out, open("sweep_ocr.json", "w"))
print("done", len(out), flush=True)
