const { analyzeGtaIvUnsupportedCharacters } = await import("/home/user/zelda-arabic-magic-a76daea1/src/lib/gtaiv/gxt-format.ts");

const translation = "اصطحب ديميتري إلى ~y~متجر الجنس~s~ في شارع~n~ديلاوير";
const { processedText, unsupported } = analyzeGtaIvUnsupportedCharacters(translation, "");
console.log("input: ", JSON.stringify(translation));
console.log("output:", JSON.stringify(processedText));
console.log("unsupported:", unsupported);

// print each char with its codepoint to see exact visual order
for (const ch of processedText) {
  process.stdout.write(`[${ch}=U+${ch.codePointAt(0).toString(16)}]`);
}
console.log();
