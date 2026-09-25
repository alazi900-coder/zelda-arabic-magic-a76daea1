#!/bin/sh
# od.sh ram lo hi  -> ARM disassembly of [lo,hi)
lo=$((0x$2)); hi=$((0x$3))
dd if=$1 of=/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/rtl/_chunk.bin bs=1 skip=$((lo-0x02000000)) count=$((hi-lo)) 2>/dev/null
arm-none-eabi-objdump -b binary -marm -D --adjust-vma=$lo /tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/rtl/_chunk.bin | tail -n +8
