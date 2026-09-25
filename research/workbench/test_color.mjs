const { encodeGtaIvArabicText } = await import("/home/user/zelda-arabic-magic-a76daea1/src/lib/gtaiv/gxt-format.ts");
const encoded = encodeGtaIvArabicText("~r~ Hello ~s~ world", "~r~ مرحبا ~s~ بالعالم");
console.log(JSON.stringify(encoded.processedText));
