import { chromium } from "playwright";
import path from "path";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 512, height: 256 } });
page.on("console", (msg) => console.log("PAGE:", msg.text()));
page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

const configs = [
  { alphaMode: "none", bg: "checker", out: "shot_none_checker.png" },
  { alphaMode: "test", bg: "checker", out: "shot_test_checker.png" },
  { alphaMode: "test", bg: "ff0000", out: "shot_test_red.png" },
];

for (const cfg of configs) {
  const url = `http://localhost:8791/render.html?alphaMode=${cfg.alphaMode}&bg=${cfg.bg}`;
  await page.goto(url);
  await page.waitForFunction(() => window.__renderDone === true, { timeout: 10000 });
  const err = await page.evaluate(() => window.__renderError);
  if (err) { console.log("RENDER ERROR for", cfg.out, ":", err); continue; }
  await page.screenshot({ path: cfg.out });
  console.log("wrote", cfg.out);
}
await browser.close();
