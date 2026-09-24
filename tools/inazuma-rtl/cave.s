@ Inazuma Eleven (Europe) right-to-left text, placed in ITCM at 0x01FFF420
@ (the end of the ITCM autoload block, which the SDK otherwise hands to the
@ ITCM arena -- the arena start literal at 0x0200712C is moved past this).
    .arm
    .syntax unified
    .section .text
    .global _start
_start:

@ ---- AlignX (0x02034100) entry hook -------------------------------------
@ r0 obj, r1 x0, r2 width, r3 line pointer, [sp] mode (0 left, 1 centre,
@ 2 right). A line that starts with the RTL marker 0x82 0x95 and asked for
@ left alignment is aligned right instead, against at most 232 pixels: the
@ dialogue draws into a 256-wide buffer (that width is also the buffer's
@ pitch, so it cannot change) of which the box shows 12..242. The widest
@ English line is 228, so 232 puts a right-aligned line's end as far from
@ the right border as a left-aligned line's start is from the left one.
cave_align:
    ldrb    ip, [r3]
    cmp     ip, #0x82
    ldrbeq  ip, [r3, #1]
    cmpeq   ip, #0x95
    bne     1f
    ldr     ip, [sp]
    cmp     ip, #0
    bne     1f
    mov     ip, #2
    str     ip, [sp]
    cmp     r2, #232
    movgt   r2, #232
1:  push    {r3, r4, r5, lr}            @ the instruction the hook replaced
    ldr     pc, =0x02034104

@ ---- letter spacing for the current character ---------------------------
@ in: ip = character code. out: r0 = spacing (obj+0x14), or 0 for the
@ Arabic slots 0x8140-0x829A and the space, so Arabic letters join and a
@ word gap is the space glyph alone.
spacing_of:
    cmp     ip, #0x20
    beq     2f
    sub     ip, ip, #0x8100
    subs    ip, ip, #0x40
    bmi     3f
    cmp     ip, #0x15C                  @ 0x829A - 0x8140 + 1
    blo     2f
3:  bx      lr                           @ r0 already holds obj+0x14
2:  mov     r0, #0
    bx      lr

@ ---- draw loops' advance: ldr r1,[sl,#20] at 0x02033EFC (code at [sp+0x20])
@ and at 0x020346E8 / 0x02034968 (code at [sp+0x18]); called with bl.
cave_draw_sp_20:
    ldr     ip, [sp, #0x20]
    b       draw_sp
cave_draw_sp_18:
    ldr     ip, [sp, #0x18]
draw_sp:
    push    {r0, lr}
    ldr     r0, [sl, #20]
    bl      spacing_of
    mov     r1, r0
    pop     {r0, lr}
    bx      lr

@ ---- measure loops ---------------------------------------------------------
@ replaces  cmp r1,#0 / cmpne acc,#0 / ldrne r0,[obj,#20] / addne acc,acc,r0
@ with: if the width is not 0, acc += the current character's own spacing
@ (the draw loops now add each character's spacing after it, so a line
@ measures what it draws, give or take the last character's).
@   0x020340B8: r1 width, r6 char pointer, r7 obj, r4 acc
@   0x02033FD8: r1 width, r7 char pointer, r8 obj, r5 acc
cave_measure_a:
    push    {r2, r3, lr}
    mov     r2, r6
    mov     r3, r7
    bl      measure_sp
    add     r4, r4, r0
    pop     {r2, r3, lr}
    bx      lr
cave_measure_b:
    push    {r2, r3, lr}
    mov     r2, r7
    mov     r3, r8
    bl      measure_sp
    add     r5, r5, r0
    pop     {r2, r3, lr}
    bx      lr
@ in: r1 width, r2 char pointer, r3 obj. out: r0 spacing to add.
measure_sp:
    mov     r0, #0
    cmp     r1, #0
    bxeq    lr
    push    {lr}
    ldrb    ip, [r2]
    cmp     ip, #0x81
    cmpne   ip, #0x82
    ldrbeq  r0, [r2, #1]
    orreq   ip, r0, ip, lsl #8
    ldr     r0, [r3, #20]
    bl      spacing_of
    pop     {lr}
    bx      lr

@ ---- after the dialogue's DrawString (0x020580C8: ldr r1,[sp,#0x2c]) -----
@ r4 = dialogue object; its per-character rectangles {x,y,w,h} (s16 each)
@ are at r4+0x2E0 and their count is the byte at r4+0x1C68. Each line that
@ starts with the zero-width marker gets its rectangles reversed, so the
@ typewriter reveals it from the right.
cave_reverse:
    push    {r4-r9}
    add     r5, r4, #0x2E0              @ rect array
    add     r0, r4, #0x1000
    ldrb    r6, [r0, #0xC68]            @ count
    mov     r7, #0                      @ i
5:  cmp     r7, r6
    bge     9f
    add     r0, r5, r7, lsl #3
    ldrsh   r1, [r0, #2]                @ y of this line
    ldrsh   r9, [r0, #4]                @ w of its first rect
    add     r8, r7, #1                  @ j
6:  cmp     r8, r6
    bge     7f
    add     r0, r5, r8, lsl #3
    ldrsh   r2, [r0, #2]
    cmp     r2, r1
    addeq   r8, r8, #1
    beq     6b
7:  cmp     r9, #0
    bne     8f
    @ reverse rects [r7, r8)
    add     r0, r5, r7, lsl #3          @ lo
    add     r1, r5, r8, lsl #3
    sub     r1, r1, #8                  @ hi
10: cmp     r0, r1
    bge     8f
    ldr     r2, [r0]
    ldr     r3, [r1]
    str     r3, [r0]
    str     r2, [r1]
    ldr     r2, [r0, #4]
    ldr     r3, [r1, #4]
    str     r3, [r0, #4]
    str     r2, [r1, #4]
    add     r0, r0, #8
    sub     r1, r1, #8
    b       10b
8:  mov     r7, r8
    b       5b
9:  pop     {r4-r9}
    ldr     r1, [sp, #0x2C]             @ the instruction the hook replaced
    bx      lr

    .ltorg
