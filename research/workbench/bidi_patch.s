@ Bidi patch for PH's per-character RTL draw loop (func_02033484).
@ Buffers contiguous runs of ASCII Latin/digit characters instead of drawing
@ them immediately, then flushes the run left-to-right once it ends, so an
@ embedded name or number reads correctly inside an RTL Arabic line while the
@ block as a whole still sits in the right place (the per-character pen
@ subtract already reserves the correct span; only the draw order changes).
@
@ Registers r4-r11 are proven (from the original code's own usage of r5,r6,r7,
@ r8,r9 immediately before and after these exact same calls) to be callee-
@ saved across 0x2023ea4/0x2023eec/0x020296e0, so r7 (line ptr) and r9 (ctx
@ ptr) don't need to be manually saved/restored around them here.
@
@ Split across the ROM's two free-space gaps found in arm9.bin (nothing big
@ enough for the whole patch exists in one place): CharHook + the first part
@ of DoFlush live in the 212-byte zero-filled gap at 0x020574C0; DoFlush's
@ loop body continues in the 151-byte 0xFF-filled gap at 0x02055D81, right
@ after this patch's own run-buffer data. A single `b` bridges the two.

    .arm
    .syntax unified

    .equ RUN_COUNT, 0x02055D84
    .equ RUN_BUF,   0x02055D88
    .equ RUN_MAX,   8     @ generous for a name or number; a longer run just
                            @ draws the overflow character normally instead
                            @ of buffering it

    .equ FN_LOOKUP_GLYPH,  0x02023ea4
    .equ FN_GLYPH_METRICS, 0x02023eec
    .equ FN_DRAW_GLYPH,    0x020296e0
    .equ ORIG_RESUME,      0x02033544   @ instruction right after the one we overwrote
    .equ ORIG_TAIL,        0x020335cc   @ shared "add sp,#8; pop{...}; " tail
    .equ DOFLUSH_PART2,    0x02055DA8   @ right after this file's RUN_BUF data

    .section .hook, "ax"

CharHook:                           @ 0x020574C0 -- replaces ldrsh r1,[r7,#14] at 0x02033540
    sub     r1, r8, #0x30            @ digit? (r8-'0' < 10)
    cmp     r1, #10
    blo     IsLatin
    orr     r1, r8, #0x20             @ fold case, then letter? ((r8|0x20)-'a' < 26)
    sub     r1, r1, #0x61
    cmp     r1, #26
    bhs     NotLatin

IsLatin:
    ldr     r6, [r9, #0x2C]          @ fontPtr
    mov     r0, r6
    mov     r1, r8
    bl      FN_LOOKUP_GLYPH
    ldr     r2, =0xFFFF
    mov     r1, r0
    cmp     r1, r2
    ldreq   r0, [r6]
    ldrheq  r1, [r0, #2]
    mov     r0, r6
    bl      FN_GLYPH_METRICS
    ldrsb   r0, [r0, #2]
    ldr     r2, [r9, #0x30]
    add     r0, r0, r2               @ r0 = advance

    ldr     r2, =RUN_COUNT
    ldr     r3, [r2]
    cmp     r3, #RUN_MAX
    bge     SkipBuffer                @ run buffer full: draw this one normally instead

    ldr     r1, =RUN_BUF
    add     r1, r1, r3, lsl #2
    strh    r8, [r1]
    strh    r0, [r1, #2]
    add     r3, r3, #1
    str     r3, [r2]

    ldrsh   r1, [r7, #8]
    sub     r1, r1, r0
    strh    r1, [r7, #8]

    b       ORIG_TAIL

SkipBuffer:
    ldrsh   r1, [r7, #14]
    b       ORIG_RESUME

NotLatin:
    bl      DoFlush
    ldrsh   r1, [r7, #14]
    b       ORIG_RESUME

DoFlush:
    push    {r4, r5, r6, r7, r8, r9, r10, r11, lr}
    ldr     r0, =RUN_COUNT
    ldr     r1, [r0]
    cmp     r1, #0
    beq     DoFlushDone

    ldrsh   r4, [r7, #8]              @ runningX = current pen (== reserved left edge)
    ldrsh   r5, [r7, #0xA]             @ drawY (the stack-passed Y bias is measured 0 in
                                         @ every real dialogue draw, so it's skipped here)
    ldrsh   r10, [r7, #0xE]            @ lineParam (const)
    ldr     r8, =RUN_BUF

    b       DOFLUSH_PART2

    .ltorg

    .section .flush2, "ax"

    add     r6, r8, r1, lsl #2          @ endPtr (const) -- r1(count) still holds
                                          @ what DoFlush's first block loaded
FlushLoop:
    cmp     r8, r6
    bge     FlushLoopEnd
    ldrh    r0, [r8]                    @ codepoint
    ldrsh   r11, [r8, #2]                 @ width -- r4-r11 all survive FN_DRAW_GLYPH
                                             @ (same convention already relied on above)
    sub     sp, sp, #8
    str     r10, [sp]
    str     r0, [sp, #4]

    add     r0, r9, #16
    ldr     r1, [r9, #0x2C]                  @ fontPtr
    mov     r2, r4                            @ this glyph's draw X (before advancing)
    mov     r3, r5
    bl      FN_DRAW_GLYPH

    add     sp, sp, #8
    add     r4, r4, r11
    add     r8, r8, #4
    b       FlushLoop

FlushLoopEnd:
    mov     r0, #0
    ldr     r1, =RUN_COUNT
    str     r0, [r1]

DoFlushDone:
    pop     {r4, r5, r6, r7, r8, r9, r10, r11, lr}
    bx      lr

    .ltorg
