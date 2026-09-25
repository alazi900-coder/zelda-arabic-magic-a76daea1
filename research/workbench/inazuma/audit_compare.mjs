import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [label, f] of [["الأصلي (قبل الإنزال)", "FONT12_AR_CLEAN_TEST.NFTR"], ["بعد الإنزال", "FONT12_AR_FIXED.NFTR"]]) {
  const page = await browser.newContext({ viewport: { width: 1500, height: 1000 } }).then(c=>c.newPage());
  await page.goto('file:///home/user/zelda-arabic-magic-a76daea1/tools/inazuma-font-editor.html');
  await page.setInputFiles('#file', [`/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/${f}`]);
  await page.waitForTimeout(1200);
  await page.click('#tabEdit'); await page.waitForTimeout(1000);
  const full = await page.$$eval('#audit .sec, #audit .w, #audit .b', els => els.map(e=>e.textContent));
  console.log(`=== ${label} ===`);
  console.log(full.filter(t => t.includes('—') && /\d/.test(t)).join('\n'));
  await page.close();
}
await browser.close();
