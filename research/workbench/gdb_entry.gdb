set architecture arm
set pagination off
target remote :2345
break *0x02000800
continue
