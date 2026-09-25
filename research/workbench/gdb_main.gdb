set architecture arm
set pagination off
set remotetimeout 30
target remote :2345
break *0x020297e4
continue
info registers r0 r1 r2 r3 r4 r5 r6 r7 r8
x/4wx $r8
x/1i $pc
