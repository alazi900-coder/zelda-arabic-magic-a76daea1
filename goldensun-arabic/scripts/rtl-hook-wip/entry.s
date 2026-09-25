.syntax unified
.thumb

.section .text.entry, "ax", %progbits

@ ---------------------------------------------------------------------------
@ BufferString hook. The real entry (0x08018038) is overwritten with an
@ 8-byte long jump here. This shim first substitutes the return address so
@ the ORIGINAL, untouched function body (resumed at entry+8) returns into
@ GsBufferStringRet instead of the true caller, then replicates the two
@ instructions that got overwritten (position-independent: register pushes
@ and high-register copies only, no PC-relative content).
@ ---------------------------------------------------------------------------
.thumb_func
.global GsBufferStringHook
GsBufferStringHook:
    push {lr}                  @ frame A: the true caller's return address
    ldr  r3, .Lpost_addr
    mov  lr, r3                @ substitute: original's own epilogue will `bx lr` here
    push {r5, r6, r7, lr}      @ replicate BufferString's overwritten 1st instr
    mov  r7, fp                @ replicate 2nd
    mov  r6, sl                @ replicate 3rd
    mov  r5, r9                @ replicate 4th
    ldr  r3, .Lbs_resume
    bx   r3                    @ resume the untouched original body at entry+8
    .align 2
.Lpost_addr: .word GsBufferStringRet + 1
.Lbs_resume: .word 0x08018041

.thumb_func
GsBufferStringRet:
    ldr  r1, .Lrtlbase
    ldr  r1, [r1]
    ldr  r2, .Lrtloff
    adds r1, r1, r2            @ r1 = the text buffer BufferString just filled
    bl   GsBufferStringPost    @ r0 = original's own return value ("start")
    pop  {r1}                  @ frame A: true caller's return address
    bx   r1
    .align 2
.Lrtlbase: .word 0x03001e8c
.Lrtloff:  .word 0xeb0

@ ---------------------------------------------------------------------------
@ DrawText hook. The real entry (0x08018cac) is overwritten with an 8-byte
@ long jump here. Adjusts x, then tail-continues into the untouched original
@ body (entry+8) with the TRUE caller's LR intact -- no post-processing
@ needed, so no substitution.
@ ---------------------------------------------------------------------------
.thumb_func
.global GsDrawTextHook
GsDrawTextHook:
    push {r0, r1, r3, lr}      @ win, ch, y, and the true caller's return address
    bl   GsDrawTextPreX        @ r0=win r1=ch r2=x already in place; returns mirrored x
    movs r2, r0
    pop  {r0, r1, r3}
    pop  {r3}                  @ retrieve the true caller's return address
    mov  lr, r3
    push {r5, r6, r7, lr}      @ replicate DrawText's overwritten 1st instr
    mov  r7, fp                @ replicate 2nd
    mov  r6, sl                @ replicate 3rd
    mov  r5, r9                @ replicate 4th
    ldr  r3, .Ldt_resume
    bx   r3                    @ resume the untouched original body at entry+8
    .align 2
.Ldt_resume: .word 0x08018cb5
