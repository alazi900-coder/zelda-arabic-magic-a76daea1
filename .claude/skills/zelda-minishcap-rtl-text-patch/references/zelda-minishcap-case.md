# Case notes: Zelda Minish Cap USA dialogue RTL

This note describes the Zelda-specific RTL flow approach. It intentionally
excludes Fire Emblem and Mother 3.

## Goal

Make dialogue text in The Legend of Zelda: The Minish Cap write from right to
left during the typewriter animation, without reversing the raw script strings.

## Target

```text
The Legend of Zelda: The Minish Cap (USA)
Clean SHA1: b4bd50e4131b027c334547b4524e2dbbd4227130
```

## Hook summary

```text
ROM offset: 0x0569BA
Runtime:    0x080569BA
Original:   BL 0x0805F7DC
Replacement branch target: 0x0810D514
```

The branch goes to a THUMB cave placed in expanded/unused ROM space. The cave
performs the RTL X calculation, calls the original draw routine, and returns
back to the original text command flow.

## Conceptual algorithm

```c
// Conceptual only; actual patch is THUMB assembly.
glyph_width = get_current_glyph_width(text_state);
progress    = text_state->x - line_start_x;
rtl_x       = right_anchor - progress - glyph_width;

old_x = text_state->x;
text_state->x = rtl_x;
call_original_draw_glyph_0805F7DC(text_state);
text_state->x = update_for_next_logical_glyph(old_x, glyph_width);
```

## Why not reverse the script text?

Reversing script bytes creates several problems:

- Control codes and waits can move to the wrong side of words.
- Line breaks and text windows become harder to preserve.
- Re-extraction and translation memory become confusing.
- The visual typewriter effect may still animate from the wrong side.

The renderer-patch method preserves logical strings and changes only where the
engine places each glyph during drawing.

## Difference from Mother 3

Mother 3's method is a tilemap post-pass:

```text
draw row normally -> rewrite row reversed -> set hardware H-flip bit
```

Zelda Minish Cap's method is a glyph-position hook:

```text
intercept draw call -> compute mirrored X -> call original glyph draw
```

Therefore Zelda does not need glyph pre-flipping for this patch.
