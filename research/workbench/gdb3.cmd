set pagination off
set confirm off
set remotetimeout 120
set architecture armv5te
target remote 127.0.0.1:3333
echo \n=== 1. البحث عن الخط في الذاكرة الحيّة ===\n
find /b 0x023D0000, 0x02400000, 0x52, 0x54, 0x46, 0x4E
