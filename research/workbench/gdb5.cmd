set pagination off
set confirm off
set remotetimeout 300
set architecture armv5te
target remote 127.0.0.1:3333
break *0x0203ec08
break *0x02033fc8
info breakpoints
continue
echo \n=== توقّف ===\n
info registers pc lr
detach
quit
