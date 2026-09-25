import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 640, height: 384 } });
page.on("console", (msg) => console.log("PAGE:", msg.text()));
page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));
await page.goto("http://localhost:8791/combined_render.html");
await page.waitForFunction(() => window.__renderDone === true, { timeout: 10000 });
const err = await page.evaluate(() => window.__renderError);
if (err) console.log("RENDER ERROR:", err);
await page.screenshot({ path: "combined_shot.png" });
console.log("wrote combined_shot.png");
await browser.close();
