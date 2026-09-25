const { reshapeArabic } = await import("/home/user/zelda-arabic-magic-a76daea1/src/lib/arabic-processing.ts");

for (const word of ["التلقائي", "التهيئة", "التلقائية"]) {
  const shaped = reshapeArabic(word);
  console.log(word, "->");
  for (const ch of shaped) {
    console.log(`  ${ch} U+${ch.codePointAt(0).toString(16).toUpperCase()}`);
  }
}
