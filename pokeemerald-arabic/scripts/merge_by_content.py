"""Carry the Arabic into another tree by what each line says, not by line number.

A patch is a set of line numbers, and the multiplatform fork moved lines --
comments rewritten from `@ Unused` to `/* Unused */`, a `waitstate` added --
so a hundred-and-sixty-line hunk was thrown out whole for the sake of one line
of drift. Forty files stayed English that way.

None of that matters to a translation. A message is the same message wherever
it sits, so the Arabic is matched to the English it replaced -- read from our
own two trees, position for position, which is exact -- and written into
whatever file holds that English now.
"""
import glob, os, re, sys

LIT = r'"((?:[^"\\]|\\.)*)"'
KEEP = re.compile(r"[^0-9A-Za-zÀ-ÿ]")


def key(text):
    """A message stripped to its letters -- what layout cannot change."""
    text = re.sub(r"\{[^}]*\}", "", text)
    for esc in ("\\n", "\\l", "\\p", "$"):
        text = text.replace(esc, "")
    return KEEP.sub("", text).upper()


def inc_units(lines):
    """-> [(first_line, last_line, [literals])] for every `$`-terminated run."""
    out, cur, start = [], [], None
    for i, line in enumerate(lines):
        m = re.match(r'^[ \t]*\.string[ \t]+' + LIT + r'[ \t]*$', line)
        if not m:
            if cur:
                out.append((start, i - 1, cur)); cur, start = [], None
            continue
        if start is None:
            start = i
        cur.append(m.group(1))
        if "$" in m.group(1):
            out.append((start, i, cur)); cur, start = [], None
    if cur:
        out.append((start, len(lines) - 1, cur))
    return out


def c_units(text):
    """-> [(span_start, span_end, literal)] for every `_("...")`."""
    return [(m.start(1), m.end(1), m.group(1))
            for m in re.finditer(r'(?<![A-Za-z0-9_])_\(\s*' + LIT + r'\s*\)', text)]


def build_map(ar_root, en_root, files):
    """{key of English -> what the Arabic tree writes in its place}."""
    inc_map, c_map, skipped = {}, {}, 0
    for rel in files:
        a, e = ar_root + rel, en_root + rel
        if not (os.path.exists(a) and os.path.exists(e)):
            continue
        if not rel.endswith((".inc", ".s", ".c", ".h")):
            continue    # the font sheets and title art are images
        if rel.endswith((".inc", ".s")):
            al, el = open(a, encoding="utf-8").read().split("\n"), \
                     open(e, encoding="utf-8").read().split("\n")
            au, eu = inc_units(al), inc_units(el)
            if len(au) != len(eu):
                skipped += 1
                continue
            for (s1, e1, alits), (_, _, elits) in zip(au, eu):
                k = key("".join(elits))
                if k:
                    inc_map.setdefault(k, al[s1:e1 + 1])
        else:
            at, et = open(a, encoding="utf-8").read(), open(e, encoding="utf-8").read()
            au, eu = c_units(at), c_units(et)
            if len(au) != len(eu):
                skipped += 1
                continue
            for (_, _, alit), (_, _, elit) in zip(au, eu):
                k = key(elit)
                if k:
                    c_map.setdefault(k, alit)
    return inc_map, c_map, skipped


def apply_to(root, inc_map, c_map):
    changed = files = 0
    for pat in ("data/**/*.inc", "data/**/*.s", "src/**/*.c", "src/**/*.h"):
        for path in glob.glob(root + pat, recursive=True):
            if path.endswith((".inc", ".s")):
                lines = open(path, encoding="utf-8").read().split("\n")
                units = inc_units(lines)
                n = 0
                for s, e, lits in reversed(units):        # back to front: spans hold
                    repl = inc_map.get(key("".join(lits)))
                    if repl and repl != lines[s:e + 1]:
                        lines[s:e + 1] = repl
                        n += 1
                if n:
                    open(path, "w", encoding="utf-8").write("\n".join(lines))
            else:
                text = open(path, encoding="utf-8").read()
                n = 0
                for s, e, lit in reversed(c_units(text)):
                    repl = c_map.get(key(lit))
                    if repl and repl != lit:
                        text = text[:s] + repl + text[e:]
                        n += 1
                if n:
                    open(path, "w", encoding="utf-8").write(text)
            if n:
                files += 1
                changed += n
    return files, changed


def main(ar_root, en_root, target, list_file):
    ar_root = ar_root.rstrip("/") + "/"
    en_root = en_root.rstrip("/") + "/"
    target = target.rstrip("/") + "/"
    files = [l.strip() for l in open(list_file, encoding="utf-8") if l.strip()]
    inc_map, c_map, skipped = build_map(ar_root, en_root, files)
    print(f"قاموس: {len(inc_map)} رسالة مجمَّعة + {len(c_map)} نصّ C   (تُخطّي {skipped} ملفاً)")
    f, n = apply_to(target, inc_map, c_map)
    print(f"كُتبت {n} ترجمة في {f} ملفاً")


if __name__ == "__main__":
    main(*sys.argv[1:5])
