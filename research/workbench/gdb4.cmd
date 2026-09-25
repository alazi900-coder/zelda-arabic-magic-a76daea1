set pagination off
set confirm off
set remotetimeout 300
set architecture armv5te
target remote 127.0.0.1:3333
echo \n=== نقطة مراقبة قراءة على جدول العروض ===\n
rwatch *(int*)0x023DE54C
continue
echo \n=== أُصيبت النقطة ===\n
info registers pc lr r0 r1 r2 r3 r4 r5
echo \n--- التعليمات حول PC ---\n
x/10i $pc-24
echo \n--- المكدّس ---\n
x/12wx $sp
detach
quit
