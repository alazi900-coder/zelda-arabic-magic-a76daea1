set architecture arm
target remote :2345
set pagination off
break *0x020297e4
continue
