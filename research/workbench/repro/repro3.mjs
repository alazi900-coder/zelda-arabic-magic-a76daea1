import pkg from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pkg;

const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
page.on('pageerror', err => console.log('[pageerror]', err.message));

await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
await page.locator('input[type=file]').setInputFiles(ROM);
await page.waitForURL('**/editor', { timeout: 120000 });
await page.waitForTimeout(3000);

async function dumpCounts(label) {
  const all = await page.locator('text=/\\d+ نص/').allTextContents();
  const selectedBadge = await page.locator('text=/فئة محددة/').allTextContents();
  const noMatch = await page.locator('text=لا توجد نصوص مطابقة').count();
  console.log(label, JSON.stringify({ all, selectedBadge, noMatch }));
}

await dumpCounts('1) fresh load');

// Find the category card labeled "أسماء المهارات"
const card = page.locator('button:has-text("أسماء المهارات"), div:has-text("أسماء المهارات")').last();
console.log('card count found:', await page.locator('text=أسماء المهارات').count());

await page.locator('text=أسماء المهارات').first().click();
await page.waitForTimeout(1500);
await dumpCounts('2) after clicking أسماء المهارات');

await page.screenshot({ path: '/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/repro/step2.png', fullPage: true });

await browser.close();
