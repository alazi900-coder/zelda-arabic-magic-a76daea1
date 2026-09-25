set pagination off
set confirm off
set remotetimeout 60
set architecture armv5te
target remote 127.0.0.1:3333
printf "PC عند الاتصال = %#x\n", $pc
break *$pc
continue
printf "\n=== نقطة التوقّف عملت: PC = %#x ===\n", $pc
detach
quit
