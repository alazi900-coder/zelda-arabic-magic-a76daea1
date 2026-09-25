import { reshapeArabic, reverseBidi } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/arabic-processing";
const text = process.argv.slice(2).join(" ");
process.stdout.write(JSON.stringify([...reverseBidi(reshapeArabic(text))].map((c) => c.codePointAt(0)!)));
