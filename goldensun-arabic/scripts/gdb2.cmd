set pagination off
set confirm off
set arm force-mode thumb
target remote localhost:2345
break *0x08018cac
commands
silent
printf "DT win=%08x ch=%04x x=%d y=%d flag=%d W=%d H=%d f16=%04x\n", $r0, $r1, $r2, $r3, *(int*)($sp), *(unsigned short*)($r0+8), *(unsigned short*)($r0+10), *(unsigned short*)($r0+0x16)
continue
end
continue
