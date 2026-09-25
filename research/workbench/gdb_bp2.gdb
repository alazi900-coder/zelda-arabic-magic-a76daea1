set architecture arm
set pagination off
set remotetimeout 60
target remote :2345
break *0x020297e4
continue
