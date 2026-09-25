import pkg from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pkg;

const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
page.on('pageerror', err => console.log('[pageerror]', err.message));

await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
await page.locator('input[type=file]').setInputFiles(ROM);
await page.waitForURL('**/editor', { timeout: 120000 });
await page.waitForTimeout(3000);

const locs = await page.locator('text=أسماء المهارات').all();
console.log('matches for "أسماء المهارات" BEFORE any click:', locs.length);
for (const l of locs) {
  const tag = await l.evaluate(el => el.tagName);
  const cls = await l.evaluate(el => el.className);
  console.log(' -', tag, cls.slice(0,120));
}

await page.locator('text=أسماء المهارات').first().click();
await page.waitForTimeout(1500);

const locs2 = await page.locator('text=أسماء المهارات').all();
console.log('matches for "أسماء المهارات" AFTER selecting:', locs2.length);
for (const l of locs2) {
  const tag = await l.evaluate(el => el.tagName);
  const cls = await l.evaluate(el => el.className);
  const txt = (await l.textContent() || '').slice(0,60);
  console.log(' -', tag, cls.slice(0,120), '|', txt);
}
