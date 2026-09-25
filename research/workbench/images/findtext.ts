import { readFileSync } from "node:fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
const rows = readInazumaText(new Uint8Array(readFileSync(process.argv[2])));
const want = ["Speed", "Kick", "Body", "Control", "Guard", "Stamina", "Guts", "Experience",
  "Friends", "Inventory", "Formation", "Info", "System", "Save",
  "Team level", "Title", "Scattered Eleven", "Swap", "Commands", "Finish",
  "Please enter your name.", "New Game", "Continue", "Connect"];
for (const w of want) {
  const hits = rows.filter((r) => r.text.trim() === w);
  const loose = hits.length ? [] : rows.filter((r) => r.text.includes(w));
  console.log(`${w.padEnd(24)} exact:${String(hits.length).padStart(3)}  contains:${String(loose.length).padStart(4)}  ${hits[0] ? `[${hits[0].source}]` : loose[0] ? `[${loose[0].source}] ${JSON.stringify(loose[0].text.slice(0,40))}` : "— غير موجود كنصّ"}`);
}
