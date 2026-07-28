---
name: zelda-minishcap-rtl-text-patch
description: Patch The Legend of Zelda: The Minish Cap USA dialogue renderer so dialogue text flows right-to-left by changing glyph draw X coordinates at runtime, not by reversing script text. Use this only for Zelda: The Minish Cap GBA dialogue RTL work, especially Arabic/Hebrew/Farsi/Urdu translation projects that need the typewriter animation to begin from the right side of the dialogue box. Do not use for Fire Emblem or Mother 3; those use different engines and different RTL strategies.
---

# Zelda Minish Cap dialogue RTL engine patch

This skill is for **The Legend of Zelda: The Minish Cap (USA) on GBA** only.
It documents the dialogue-flow patch used to make the typewriter effect write
from **right to left** while keeping the stored script text in normal logical
order.

## Target ROM

Use this exact clean USA ROM as the base:

```text
Game:  The Legend of Zelda: The Minish Cap (USA)
SHA1:  b4bd50e4131b027c334547b4524e2dbbd4227130
```

If the SHA1 differs, stop and verify the build before patching. Do not assume
Japanese, European, Rev, or already-expanded ROMs share the same hook address.

## What this patch changes

The patch changes the **dialogue renderer's X placement**, not the text bytes.

Do **not** do this:

```text
stored text:  مرحبا  ->  ابحرم
```

Instead, leave the text in logical order and modify the renderer so each next
glyph is placed from the right anchor toward the left.

Original conceptual placement:

```text
x = line_start_x + progress
```

RTL placement:

```text
rtl_x = right_anchor - progress - glyph_width
```

Where:

- `right_anchor` is the safe right edge of the dialogue line.
- `progress` is how far the original engine has advanced through the line.
- `glyph_width` is the width of the current glyph, so the glyph's right edge
  lands on the intended RTL position instead of overshooting the box.

## Hook point

The patch replaces the original dialogue draw call with a branch to a small
THUMB code cave.

```text
ROM offset: 0x0569BA
Runtime:    0x080569BA
Original:   BL 0x0805F7DC
Patched:    BL 0x0810D514
```

The cave then calls the original draw function after temporarily adjusting the
text state's X coordinate.

High-level flow:

```text
1. The game reads the next dialogue character normally.
2. The hook receives the text/draw state.
3. The cave reads the current logical X/progress.
4. It estimates/reads the current glyph width.
5. It computes rtl_x = right_anchor - progress - glyph_width.
6. It temporarily writes rtl_x into the text state.
7. It calls the original draw routine at 0x0805F7DC.
8. It restores/updates the internal X so the next glyph continues RTL.
```

This keeps control codes, line breaks, speaker logic, and script extraction
simple because the stored strings remain untouched.

## Files in this skill

```text
patches/TMC_USA_dialogue_RTL_v1.ips
scripts/apply_tmc_dialogue_rtl.py
scripts/verify_tmc_rtl_patch.py
scripts/make_ips.py
references/zelda-minishcap-case.md
```

## Applying the patch

From this skill folder:

```bash
python scripts/apply_tmc_dialogue_rtl.py "The Legend of Zelda - The Minish Cap (USA).gba" "TMC_USA_Dialogue_RTL.gba" --ips patches/TMC_USA_dialogue_RTL_v1.ips
```

The patcher checks the expected SHA1 by default. Use `--force` only when you
have independently confirmed that the ROM is the same compatible USA build.

## Verifying a patched ROM

```bash
python scripts/verify_tmc_rtl_patch.py "TMC_USA_Dialogue_RTL.gba"
```

The verifier checks:

- ROM size is large enough to contain the code cave.
- The hook bytes at `0x0569BA` are no longer the original call.
- The code cave at `0x10D514` is present.
- The original clean SHA1 is not accidentally being inspected as the patched
  file.

## Important distinction from Mother 3

Mother 3's documented skill mirrors finished tilemap rows and uses the GBA
hardware horizontal-flip bit. That approach requires pre-flipping glyph tiles.

This Zelda Minish Cap skill is different:

- It patches the **glyph placement step** inside the dialogue draw path.
- It does **not** mirror the entire tilemap row after drawing.
- It does **not** require hardware H-flip or pre-flipped font glyphs.
- It is meant for dialogue text flow only, not all menus.

## When to use this skill

Use it when the user says things like:

- "اعكس سريان محادثات زيلدا مينيش كاب"
- "أبغى أنميشن الكلام يبدأ من اليمين"
- "لا تعكس النصوص، اعكس السريان نفسه"
- "Minish Cap dialogue RTL"
- "Zelda Minish Cap Arabic dialogue typewriter RTL"

Do not use this skill for Fire Emblem, Mother 3, NDS NFTR work, PS2 scripts,
or generic Arabic reshaping. Those need separate engine analysis.

## Troubleshooting

### Text appears on the right but is shifted too far

Adjust only the `right_anchor`/margin in the code cave, not the script text.
A small left margin is safer than writing near the far-right tile boundary.

### Text order is still wrong

Check whether the text pipeline is also reversing strings. For this engine
patch, dialogue strings should generally stay logical. If a separate build
step reverses them, the result can look double-reversed.

### Menus did not change

Expected. This skill targets dialogue flow. Menus can be handled separately by
reshaping/reversing text or by finding their own renderer.

### Crash after patching

First check SHA1. If the ROM is not the exact USA target or is already patched
in the same region, the hook may land in the wrong code. Restore a clean USA
ROM and reapply the IPS.
