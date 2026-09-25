import { processArabicText } from "@/lib/arabic-processing";
const editor = "سمعت شائعات أن النادي\nسيحل على أي حال. لا\nفائدة من الحماس الآن...";
const rom = editor.replace(/\n/g, "\\n");                  // what the build does first (toRomText)
const show = (s: string) => JSON.stringify(s.replace(/[^\x00-\x7f]/g, "·"));
console.log("build order (toRomText, then shape):", show(processArabicText(rom)));
console.log("shape per real line, then toRomText :", show(processArabicText(editor).replace(/\n/g, "\\n")));
