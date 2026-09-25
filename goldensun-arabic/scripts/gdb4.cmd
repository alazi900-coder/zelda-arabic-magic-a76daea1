set pagination off
set confirm off
set arm force-mode thumb
target remote localhost:2345
break *0x0801a05c
commands
silent
printf "DT win=%08x ch=%04x x=%d y=%d W=%d f16=%04x lr=%08x\n", $r0, $r1, $r2, $r3, *(unsigned short*)($r0+8), *(unsigned short*)($r0+0x16), $lr
continue
end
break *0x08019f40
commands
silent
printf "BS id=%x flag=%d lr=%08x idx=%d\n", $r0, $r1, $lr, *(unsigned short*)(*(unsigned int*)0x03001e8c + 0x12b2)
continue
end
continue
