import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext({ viewport: { width: 1500, height: 1100 } }).then(c=>c.newPage());
await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', ROM);
await page.waitForURL('**/editor', { timeout: 300000 });
await page.waitForTimeout(12000);

const info = await page.$$eval('textarea', els => els.map((e,i) => ({
  i, placeholder: e.placeholder, value: e.value.slice(0,40), rows: e.rows,
  near: e.closest('[data-key], [data-entry], tr, .entry-row')?.outerHTML?.slice(0,120) || null
})));
console.log(JSON.stringify(info, null, 1));
await browser.close();
