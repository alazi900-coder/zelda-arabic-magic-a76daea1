set pagination off
set confirm off
set arm force-mode thumb
target remote localhost:2345
break *0x08019f40
commands
silent
printf "WRAP id=%x flag=%d lr=%08x\n", $r0, $r1, $lr
continue
end
break *0x08018038
commands
silent
printf "ORIG id=%x flag=%d lr=%08x\n", $r0, $r1, $lr
continue
end
continue
