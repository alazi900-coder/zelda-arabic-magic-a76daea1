set pagination off
set confirm off
set architecture armv5te
target remote 127.0.0.1:3333
echo \n=== نقطة مراقبة على جدول العروض ===\n
rwatch *(int*)0x023DE54C
info watchpoints
continue
echo \n=== أُصيبت! ===\n
info registers pc lr r0 r1 r2 r3
x/12i $pc-32
detach
quit
