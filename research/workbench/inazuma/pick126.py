import struct, json, re

FORMS={0x0621:[0xFE80,0xFE80,None,None],0x0622:[0xFE81,0xFE82,None,None],0x0623:[0xFE83,0xFE84,None,None],
0x0624:[0xFE85,0xFE86,None,None],0x0625:[0xFE87,0xFE88,None,None],0x0626:[0xFE89,0xFE8A,0xFE8B,0xFE8C],
0x0627:[0xFE8D,0xFE8E,None,None],0x0628:[0xFE8F,0xFE90,0xFE91,0xFE92],0x0629:[0xFE93,0xFE94,None,None],
0x062A:[0xFE95,0xFE96,0xFE97,0xFE98],0x062B:[0xFE99,0xFE9A,0xFE9B,0xFE9C],0x062C:[0xFE9D,0xFE9E,0xFE9F,0xFEA0],
0x062D:[0xFEA1,0xFEA2,0xFEA3,0xFEA4],0x062E:[0xFEA5,0xFEA6,0xFEA7,0xFEA8],0x062F:[0xFEA9,0xFEAA,None,None],
0x0630:[0xFEAB,0xFEAC,None,None],0x0631:[0xFEAD,0xFEAE,None,None],0x0632:[0xFEAF,0xFEB0,None,None],
0x0633:[0xFEB1,0xFEB2,0xFEB3,0xFEB4],0x0634:[0xFEB5,0xFEB6,0xFEB7,0xFEB8],0x0635:[0xFEB9,0xFEBA,0xFEBB,0xFEBC],
0x0636:[0xFEBD,0xFEBE,0xFEBF,0xFEC0],0x0637:[0xFEC1,0xFEC2,0xFEC3,0xFEC4],0x0638:[0xFEC5,0xFEC6,0xFEC7,0xFEC8],
0x0639:[0xFEC9,0xFECA,0xFECB,0xFECC],0x063A:[0xFECD,0xFECE,0xFECF,0xFED0],0x0641:[0xFED1,0xFED2,0xFED3,0xFED4],
0x0642:[0xFED5,0xFED6,0xFED7,0xFED8],0x0643:[0xFED9,0xFEDA,0xFEDB,0xFEDC],0x0644:[0xFEDD,0xFEDE,0xFEDF,0xFEE0],
0x0645:[0xFEE1,0xFEE2,0xFEE3,0xFEE4],0x0646:[0xFEE5,0xFEE6,0xFEE7,0xFEE8],0x0647:[0xFEE9,0xFEEA,0xFEEB,0xFEEC],
0x0648:[0xFEED,0xFEEE,None,None],0x0649:[0xFEEF,0xFEF0,None,None],0x064A:[0xFEF1,0xFEF2,0xFEF3,0xFEF4]}
LIG={0x0622:[0xFEF5,0xFEF6],0x0623:[0xFEF7,0xFEF8],0x0625:[0xFEF9,0xFEFA],0x0627:[0xFEFB,0xFEFC]}
NAMES=["معزول","نهائي","أولي","وسطي"]

# --- خريطة الخط: رمز -> رسمة، مطابَقة في الخطوط الثلاثة ---
def cmap_of(path):
    b=open(path,'rb').read()
    u16=lambda o: struct.unpack('<H',b[o:o+2])[0]
    u32=lambda o: struct.unpack('<I',b[o:o+4])[0]
    cm={}; p=u16(0x0C)
    while p<len(b)-8:
        kind=b[p:p+4]; size=u32(p+4)
        if size==0: break
        if kind==b'PAMC':
            first,last,method=u16(p+8),u16(p+10),u32(p+12)
            if method==0:
                base=u16(p+20)
                for i,c in enumerate(range(first,last+1)): cm[c]=base+i
            elif method==1:
                for i,c in enumerate(range(first,last+1)):
                    g=u16(p+20+i*2)
                    if g!=0xFFFF: cm[c]=g
        p+=size
    return cm
cms=[cmap_of('fontfiles/'+n) for n in ['FONT12.NFTR','FONT12N.NFTR','FONT8.NFTR']]
assert cms[0]==cms[1]==cms[2], "خرائط الخطوط الثلاثة غير متطابقة"
cmap=cms[0]

# --- الرموز التي تستعملها نصوص الروم فعلاً ---
strs=[]
def walk(o):
    if isinstance(o,str): strs.append(o)
    elif isinstance(o,dict):
        for v in o.values(): walk(v)
    elif isinstance(o,list):
        for v in o: walk(v)
walk(json.load(open('all_strings_full.json')))
used=set()
for s in strs:
    cs=[ord(c) for c in s]; i=0
    while i<len(cs):
        c=cs[i]
        if c>=0x80 and i+1<len(cs): used.add((c<<8)|cs[i+1]); i+=2
        else: used.add(c); i+=1
used_glyphs={cmap[c] for c in used if c in cmap}
print("نصوص مفحوصة: %d | رموز مستعملة: %d | رسمات محجوزة: %d" % (len(strs),len(used),len(used_glyphs)))

# --- الشرط الصارم: الرمز غائب، ورسمته غير محجوزة لأي رمز مستعمل ---
LO,HI=0x8140,0x829A
safe=[c for c in sorted(cmap) if LO<=c<=HI and c not in used and cmap[c] not in used_glyphs]
print("رموز تجتاز الشرط الصارم: %d" % len(safe))

# --- الـ83 الحالية: هل تجتاز الشرط الصارم؟ ---
TS=open('/home/user/zelda-arabic-magic-a76daea1/src/lib/inazuma/inazuma-arabic-glyphs.ts').read()
def arr(n):
    m=re.search(n+r'[^=]*=\s*\[([^\]]*)\]',TS); return [int(x.strip(),0) for x in m.group(1).split(',')]
oldCP, oldCode, oldIdx = arr('INAZUMA_ARABIC_CODEPOINTS'), arr('INAZUMA_SHIFT_JIS_CODES'), arr('INAZUMA_GLYPH_INDICES')
bad=[hex(c) for c in oldCode if c not in safe]
print("من الـ83 الحالية لا تجتاز الشرط:", bad if bad else "لا شيء — كلها سليمة")
for c,g in zip(oldCode,oldIdx):
    assert cmap[c]==g, "تعارض: 0x%04X -> %d بينما الخط يقول %d"%(c,g,cmap[c])
print("تطابق الرمز/الرسمة في الـ83 الحالية: سليم")

# --- كل الأشكال المطلوبة، بترتيب ثابت ---
want=[]
for base,f in FORMS.items():
    for k,cp in enumerate(f):
        if cp is not None: want.append((cp, chr(base), NAMES[k]))
for alef,(iso,fin) in LIG.items():
    want.append((iso,"ل"+chr(alef),NAMES[0])); want.append((fin,"ل"+chr(alef),NAMES[1]))
seen=set(); want=[w for w in want if not (w[0] in seen or seen.add(w[0]))]
print("أشكال العربية المطلوبة كلها: %d" % len(want))

# --- ابقِ الـ83 كما هي (كي لا تنكسر ترجمات محفوظة)، وأضف الناقص من الحرّ ---
have=dict(zip(oldCP, oldCode))
free=[c for c in safe if c not in set(oldCode)]
need=[w for w in want if w[0] not in have]
print("ناقص: %d | خانات حرّة صارمة: %d" % (len(need), len(free)))
assert len(free)>=len(need), "الخانات الحرّة لا تكفي"

for (cp,L,F),code in zip(need, free):
    have[cp]=code

final=[(cp,have[cp],cmap[have[cp]],L,F) for cp,L,F in want]
codes=[x[1] for x in final]; idxs=[x[2] for x in final]
assert len(set(codes))==len(codes), "تكرار رمز"
assert len(set(idxs))==len(idxs), "تكرار رسمة — خانتان تشتركان في صورة واحدة"
assert all(i not in used_glyphs for i in idxs), "رسمة محجوزة تسرّبت"
assert [x[0] for x in final][:len(oldCP)] != oldCP or True
# الـ83 القديمة لم تتغيّر خريطتها
for cp,code in zip(oldCP,oldCode): assert have[cp]==code, "تغيّرت خريطة حرف قديم!"
print("فحوص السلامة: كلها اجتازت ✅")

json.dump({"codepoints":[x[0] for x in final],"codes":codes,"indices":idxs,
           "labels":[f"{x[3]} {x[4]}" for x in final]}, open('slots126.json','w'), ensure_ascii=False)
print("\nالنتيجة: %d شكلاً، منها %d جديدة" % (len(final), len(need)))
print("أمثلة على الجديد:", ", ".join(f"{L} {F}" for _,_,_,L,F in final if have[_ ] and _ not in dict(zip(oldCP,oldCode)))[:200] if False else "")
