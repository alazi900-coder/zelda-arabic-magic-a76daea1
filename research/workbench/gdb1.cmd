set pagination off
set confirm off
set architecture armv5te
target remote 127.0.0.1:3333
echo \n=== متصل ===\n
info registers pc cpsr
dump binary memory /tmp/mainram.bin 0x02000000 0x02400000
echo \n=== تفريغ الذاكرة تمّ ===\n
detach
quit
