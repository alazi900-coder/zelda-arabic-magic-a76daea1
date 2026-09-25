# 7x8 Arabic forms for Inazuma's FONT8. Row 5 is the joining line; rows 6-7 hold
# descenders and dots below; rows 0-2 hold ascender tops and dots above.
def G(*rows):
    rows = list(rows)
    w = max(len(r) for r in rows)
    return [r.ljust(w, '.') for r in rows]

def at(rows_by_index, w):
    out = ['.' * w for _ in range(8)]
    for y, r in rows_by_index.items():
        out[y] = r.ljust(w, '.')
    return out

def add(base, extra):
    out = [list(r) for r in base]
    for y, r in extra.items():
        for x, c in enumerate(r):
            if c == '#': out[y][x] = '#'
    return [''.join(r) for r in out]

# skeletons ---------------------------------------------------------------
TOOTH_INIT = at({3: '..#', 4: '..#', 5: '###'}, 3)
TOOTH_MED = at({3: '.#.', 4: '.#.', 5: '###'}, 3)
BOAT_ISO = at({4: '#....#', 5: '######'}, 6)
BOAT_FIN = at({4: '#.....', 5: '######'}, 6)
NOON_ISO = at({4: '#...#', 5: '#...#', 6: '.###.'}, 5)
HAH_INIT = at({3: '.####', 4: '..#..', 5: '###..'}, 5)
HAH_MED = at({3: '.####', 4: '..#..', 5: '#####'}, 5)
HAH_ISO = at({3: '.####', 4: '#....', 5: '#....', 6: '#....', 7: '.####'}, 5)
HAH_FIN = at({5: '.####', 6: '#....', 7: '.####'}, 5)
DAL_ISO = at({3: '.#.', 4: '..#', 5: '###'}, 3)
DAL_FIN = at({3: '.#..', 4: '..#.', 5: '####'}, 4)
REH_ISO = at({4: '..#', 5: '..#', 6: '.#.', 7: '#..'}, 3)
REH_FIN = at({5: '..##', 6: '.#..', 7: '#...'}, 4)
SEEN_INIT = at({4: '.#.#.#', 5: '######'}, 6)
SEEN_ISO = at({4: '#.#.#.#', 5: '#.#####', 6: '.##....'}, 7)
SAD_INIT = at({3: '..###.', 4: '#.#..#', 5: '######'}, 6)
SAD_ISO = at({3: '...###.', 4: '#.#...#', 5: '#.#####', 6: '.##....'}, 7)
TAH_JOIN = at({1: '.#...', 2: '.#...', 3: '.###.', 4: '.#..#', 5: '#####'}, 5)
TAH_END = at({1: '.#...', 2: '.#...', 3: '.###.', 4: '.#..#', 5: '.####'}, 5)
AIN_INIT = at({3: '..##', 4: '.#..', 5: '####'}, 4)
AIN_MED = at({3: '.##.', 4: '.##.', 5: '####'}, 4)
AIN_ISO = at({3: '..##', 4: '.#..', 5: '.###', 6: '#...', 7: '.###'}, 4)
AIN_FIN = at({4: '.##.', 5: '.###', 6: '#...', 7: '.###'}, 4)
FEH_JOIN = at({3: '.##', 4: '.##', 5: '###'}, 3)
FEH_ISO = at({3: '....##', 4: '#...##', 5: '######'}, 6)
QAF_ISO = at({3: '...##', 4: '#..##', 5: '#...#', 6: '.###.'}, 5)
KAF_JOIN = at({1: '..##', 2: '.#..', 3: '..#.', 4: '...#', 5: '####'}, 4)
KAF_ISO = at({1: '.....#', 2: '.....#', 3: '..#..#', 4: '#....#', 5: '######'}, 6)
LAM_JOIN = at({1: '.#', 2: '.#', 3: '.#', 4: '.#', 5: '##'}, 2)
LAM_ISO = at({1: '....#', 2: '....#', 3: '....#', 4: '#...#', 5: '#...#', 6: '.###.'}, 5)
MEEM_INIT = at({3: '.#.', 4: '#.#', 5: '###'}, 3)
MEEM_MED = at({3: '.#..', 4: '#.#.', 5: '####'}, 4)
MEEM_ISO = at({3: '.#.', 4: '#.#', 5: '.#.', 6: '.#.', 7: '.#.'}, 3)
MEEM_FIN = at({4: '.##.', 5: '####', 6: '#...', 7: '#...'}, 4)
HEH_INIT = at({2: '.#.', 3: '#.#', 4: '#.#', 5: '###'}, 3)
HEH_MED = at({4: '.##.', 5: '####', 6: '.##.'}, 4)
HEH_ISO = at({3: '.##.', 4: '#..#', 5: '.##.'}, 4)
HEH_FIN = at({3: '.##..', 4: '#..#.', 5: '.####'}, 5)
WAW_ISO = at({3: '..##', 4: '..##', 5: '...#', 6: '..#.', 7: '##..'}, 4)
WAW_FIN = at({3: '..##.', 4: '..##.', 5: '...##', 6: '..#..', 7: '##...'}, 5)
YEH_ISO = at({3: '...##', 4: '..#..', 5: '#..##', 6: '.###.'}, 5)
YEH_FIN = at({4: '..#..', 5: '#..##', 6: '.###.'}, 5)
ALEF_ISO = at({1: '#', 2: '#', 3: '#', 4: '#', 5: '#'}, 1)
ALEF_FIN = at({1: '#.', 2: '#.', 3: '#.', 4: '#.', 5: '##'}, 2)
ALEF_ISO_LOW = at({2: '#.', 3: '#.', 4: '#.', 5: '#.'}, 2)
ALEF_FIN_LOW = at({2: '#.', 3: '#.', 4: '#.', 5: '##'}, 2)
HAMZA = at({2: '.##', 3: '#..', 4: '.##', 5: '##.'}, 3)
LA = at({1: '#...#', 2: '#...#', 3: '.#..#', 4: '..#.#', 5: '...##'}, 5)
LA_LOW = at({2: '#...#', 3: '.#..#', 4: '..#.#', 5: '...##'}, 5)

def w(g): return len(g[0])

GLYPHS = [
    HAMZA,                                                    # FE80 ء
    add(at({2: '.#.', 3: '.#.', 4: '.#.', 5: '.#.'}, 3), {0: '###'}),   # FE81 آ
    add(at({2: '.#.', 3: '.#.', 4: '.#.', 5: '.##'}, 3), {0: '###'}),   # FE82 ـآ
    add(ALEF_ISO_LOW, {0: '##'}),                            # FE83 أ
    add(ALEF_FIN_LOW, {0: '##'}),                            # FE84 ـأ
    add(WAW_ISO, {1: '..##'}),                               # FE85 ؤ
    add(WAW_FIN, {1: '..##'}),                               # FE86 ـؤ
    add(ALEF_ISO_LOW, {7: '##'}),                            # FE87 إ
    add(ALEF_FIN_LOW, {7: '##'}),                            # FE88 ـإ
    add(YEH_ISO, {1: '..##'}),                               # FE89 ئ
    add(YEH_FIN, {2: '..##'}),                               # FE8A ـئ
    add(TOOTH_INIT, {1: '.##'}),                             # FE8B ئـ
    add(TOOTH_MED, {1: '##.'}),                              # FE8C ـئـ
    ALEF_ISO,                                                # FE8D ا
    ALEF_FIN,                                                # FE8E ـا
    add(BOAT_ISO, {7: '..#...'}),                            # FE8F ب
    add(BOAT_FIN, {7: '..#...'}),                            # FE90 ـب
    add(TOOTH_INIT, {7: '..#'}),                             # FE91 بـ
    add(TOOTH_MED, {7: '.#.'}),                              # FE92 ـبـ
    add(HEH_ISO, {1: '#.#.'}),                               # FE93 ة
    add(HEH_FIN, {1: '#.#..'}),                              # FE94 ـة
    add(BOAT_ISO, {2: '.#.#..'}),                            # FE95 ت
    add(BOAT_FIN, {2: '.#.#..'}),                            # FE96 ـت
    add(TOOTH_INIT, {1: '#.#'}),                             # FE97 تـ
    add(TOOTH_MED, {1: '#.#'}),                              # FE98 ـتـ
    add(BOAT_ISO, {1: '..#...', 2: '.#.#..'}),               # FE99 ث
    add(BOAT_FIN, {1: '..#...', 2: '.#.#..'}),               # FE9A ـث
    add(TOOTH_INIT, {0: '.#.', 1: '#.#'}),                   # FE9B ثـ
    add(TOOTH_MED, {0: '.#.', 1: '#.#'}),                    # FE9C ـثـ
    add(HAH_ISO, {5: '..#..'}),                              # FE9D ج
    add(HAH_FIN, {6: '..#..'}),                              # FE9E ـج
    add(HAH_INIT, {7: '..#..'}),                             # FE9F جـ
    add(HAH_MED, {7: '..#..'}),                              # FEA0 ـجـ
    HAH_ISO,                                                 # FEA1 ح
    HAH_FIN,                                                 # FEA2 ـح
    HAH_INIT,                                                # FEA3 حـ
    HAH_MED,                                                 # FEA4 ـحـ
    add(HAH_ISO, {1: '...#.'}),                              # FEA5 خ
    add(HAH_FIN, {3: '..#..'}),                              # FEA6 ـخ
    add(HAH_INIT, {1: '...#.'}),                             # FEA7 خـ
    add(HAH_MED, {1: '...#.'}),                              # FEA8 ـخـ
    DAL_ISO,                                                 # FEA9 د
    DAL_FIN,                                                 # FEAA ـد
    add(DAL_ISO, {1: '.#.'}),                                # FEAB ذ
    add(DAL_FIN, {1: '.#..'}),                               # FEAC ـذ
    REH_ISO,                                                 # FEAD ر
    REH_FIN,                                                 # FEAE ـر
    add(REH_ISO, {2: '..#'}),                                # FEAF ز
    add(REH_FIN, {3: '..#.'}),                               # FEB0 ـز
    SEEN_ISO,                                                # FEB1 س
    SEEN_ISO,                                                # FEB2 ـس
    SEEN_INIT,                                               # FEB3 سـ
    SEEN_INIT,                                               # FEB4 ـسـ
    add(SEEN_ISO, {1: '....#..', 2: '...#.#.'}),             # FEB5 ش
    add(SEEN_ISO, {1: '....#..', 2: '...#.#.'}),             # FEB6 ـش
    add(SEEN_INIT, {1: '...#..', 2: '..#.#.'}),              # FEB7 شـ
    add(SEEN_INIT, {1: '...#..', 2: '..#.#.'}),              # FEB8 ـشـ
    SAD_ISO,                                                 # FEB9 ص
    SAD_ISO,                                                 # FEBA ـص
    SAD_INIT,                                                # FEBB صـ
    SAD_INIT,                                                # FEBC ـصـ
    add(SAD_ISO, {1: '....#..'}),                            # FEBD ض
    add(SAD_ISO, {1: '....#..'}),                            # FEBE ـض
    add(SAD_INIT, {1: '...#..'}),                            # FEBF ضـ
    add(SAD_INIT, {1: '...#..'}),                            # FEC0 ـضـ
    TAH_END,                                                 # FEC1 ط
    TAH_END,                                                 # FEC2 ـط
    TAH_JOIN,                                                # FEC3 طـ
    TAH_JOIN,                                                # FEC4 ـطـ
    add(TAH_END, {1: '...#.'}),                              # FEC5 ظ
    add(TAH_END, {1: '...#.'}),                              # FEC6 ـظ
    add(TAH_JOIN, {1: '...#.'}),                             # FEC7 ظـ
    add(TAH_JOIN, {1: '...#.'}),                             # FEC8 ـظـ
    AIN_ISO,                                                 # FEC9 ع
    AIN_FIN,                                                 # FECA ـع
    AIN_INIT,                                                # FECB عـ
    AIN_MED,                                                 # FECC ـعـ
    add(AIN_ISO, {1: '..#.'}),                               # FECD غ
    add(AIN_FIN, {2: '.#..'}),                               # FECE ـغ
    add(AIN_INIT, {1: '..#.'}),                              # FECF غـ
    add(AIN_MED, {1: '.#..'}),                               # FED0 ـغـ
    add(FEH_ISO, {1: '....#.'}),                             # FED1 ف
    add(FEH_ISO, {1: '....#.'}),                             # FED2 ـف
    add(FEH_JOIN, {1: '.#.'}),                               # FED3 فـ
    add(FEH_JOIN, {1: '.#.'}),                               # FED4 ـفـ
    add(QAF_ISO, {1: '..#.#'}),                              # FED5 ق
    add(QAF_ISO, {1: '..#.#'}),                              # FED6 ـق
    add(FEH_JOIN, {1: '#.#'}),                               # FED7 قـ
    add(FEH_JOIN, {1: '#.#'}),                               # FED8 ـقـ
    KAF_ISO,                                                 # FED9 ك
    KAF_ISO,                                                 # FEDA ـك
    KAF_JOIN,                                                # FEDB كـ
    KAF_JOIN,                                                # FEDC ـكـ
    LAM_ISO,                                                 # FEDD ل
    LAM_ISO,                                                 # FEDE ـل
    LAM_JOIN,                                                # FEDF لـ
    LAM_JOIN,                                                # FEE0 ـلـ
    MEEM_ISO,                                                # FEE1 م
    MEEM_FIN,                                                # FEE2 ـم
    MEEM_INIT,                                               # FEE3 مـ
    MEEM_MED,                                                # FEE4 ـمـ
    add(NOON_ISO, {2: '..#..'}),                             # FEE5 ن
    add(NOON_ISO, {2: '..#..'}),                             # FEE6 ـن
    add(TOOTH_INIT, {1: '..#'}),                             # FEE7 نـ
    add(TOOTH_MED, {1: '.#.'}),                              # FEE8 ـنـ
    HEH_ISO,                                                 # FEE9 ه
    HEH_FIN,                                                 # FEEA ـه
    HEH_INIT,                                                # FEEB هـ
    HEH_MED,                                                 # FEEC ـهـ
    WAW_ISO,                                                 # FEED و
    WAW_FIN,                                                 # FEEE ـو
    YEH_ISO,                                                 # FEEF ى
    YEH_FIN,                                                 # FEF0 ـى
    add(YEH_ISO, {7: '.#.#.'}),                              # FEF1 ي
    add(YEH_FIN, {7: '.#.#.'}),                              # FEF2 ـي
    add(TOOTH_INIT, {7: '#.#'}),                             # FEF3 يـ
    add(TOOTH_MED, {7: '#.#'}),                              # FEF4 ـيـ
    add(LA_LOW, {0: '###'}),                                 # FEF5 لآ
    add(LA_LOW, {0: '###'}),                                 # FEF6 ـلآ
    add(LA_LOW, {0: '##'}),                                  # FEF7 لأ
    add(LA_LOW, {0: '##'}),                                  # FEF8 ـلأ
    add(LA, {7: '##'}),                                      # FEF9 لإ
    add(LA, {7: '##'}),                                      # FEFA ـلإ
    LA,                                                      # FEFB لا
    LA,                                                      # FEFC ـلا
]
assert len(GLYPHS) == 125, len(GLYPHS)
for i, g in enumerate(GLYPHS):
    assert len(g) == 8 and all(len(r) == len(g[0]) <= 7 for r in g), (hex(0xFE80 + i), g)
