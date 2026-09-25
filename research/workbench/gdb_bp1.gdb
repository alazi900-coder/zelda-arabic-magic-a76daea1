set architecture arm
set pagination off
target remote :2345
break *0x020297e4
continue
