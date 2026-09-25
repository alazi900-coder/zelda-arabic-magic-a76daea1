"""
Reads every prepared render and scores it, to find each picture's real width.

The pictures are already laid on black, turned dark-on-light and doubled by
sweep_ocr.py, so this is only the reading. One call per file with a short
deadline: tesseract handles a normal render in about a tenth of a second, but
a few of these -- large, textured, no text at all -- send it off for many
minutes, and one of those is enough to stall a whole batch. A file that runs
over is dropped as "no text", which for a picture with no text is the right
answer anyway.
"""
import json, os, re, subprocess
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

WORDS = set(w.strip().lower() for w in open("gamewords.txt"))
WORDS |= set("""ok lvl tp fp gk df mf fw exp hp pts vs kick body control guard speed stamina guts
experience inventory formation system save friends info swap commands finish prestige friendship
menu team level title next back yes no confirm cancel equip shop practice binder""".split())

names = sorted(os.listdir("prep"))
names = [n for n in names if n.endswith(".png")]
out, slow, done = {}, [], [0]


def job(n):
    try:
        r = subprocess.run(["tesseract", "prep/" + n, "-", "--psm", "11", "-l", "eng",
                            "-c", "tessedit_do_invert=0"],
                           capture_output=True, timeout=15)
        page = r.stdout.decode("utf8", "replace")
    except subprocess.TimeoutExpired:
        slow.append(n)
        page = ""
    except Exception:
        page = ""
    good = [t for t in re.findall(r"[A-Za-z]{3,}", page) if t.lower() in WORDS]
    out[n] = (len(good), sum(len(t) for t in good),
              " | ".join(l.strip() for l in page.splitlines() if l.strip()))
    done[0] += 1
    if done[0] % 400 == 0:
        print(done[0], "/", len(names), flush=True)


with ThreadPoolExecutor(max_workers=3) as ex:
    list(ex.map(job, names))
json.dump(out, open("sweep_ocr.json", "w"))
print("done", len(out), "timed out", len(slow), flush=True)
for n in slow[:20]:
    print("  slow:", n)
