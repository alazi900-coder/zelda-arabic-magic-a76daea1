import { prepareInazumaLine } from "@/lib/inazuma/inazuma-editor-bridge";
// box1 = "AAAA", box2 = "BBBB" -- distinct enough to tell apart after encoding
const t = "بوصف اول جزء هنا\\fثم جزء ثاني منفصل";
const whole = prepareInazumaLine("a\\fb", t, undefined).encoded!;
const box1Alone = prepareInazumaLine("x", "بوصف اول جزء هنا", undefined).encoded!;
const box2Alone = prepareInazumaLine("x", "ثم جزء ثاني منفصل", undefined).encoded!;
const [g1, g2] = whole.split("\\f");
console.log("box1 matches alone:", g1 === box1Alone, "box2 matches alone:", g2 === box2Alone);
