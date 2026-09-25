import pkg from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pkg;

const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";
const S = (n) => `/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/repro/${n}.png`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
page.on('pageerror', err => console.log('[pageerror]', err.message));

console.log('t0', Date.now());
await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
await page.locator('input[type=file]').setInputFiles(ROM);
await page.waitForURL('**/editor', { timeout: 120000 });
console.log('t1 (editor loaded)', Date.now());
await page.waitForTimeout(3000);

async function dumpCounts(label) {
  const listCount = await page.locator('p.text-sm.text-muted-foreground', { hasText: /^\d+ نص$/ }).first().textContent().catch(() => 'NONE');
  const selectedBadge = await page.locator('text=/فئة محددة/').count();
  const noMatch = await page.locator('text=لا توجد نصوص مطابقة').count();
  console.log(label, JSON.stringify({ listCount, selectedBadge, noMatch }));
}

await dumpCounts('1) fresh');

const commandsBtn = page.getByRole('button', { name: /أسماء المهارات/ });
console.log('button matches:', await commandsBtn.count());
await commandsBtn.first().click();
await page.waitForTimeout(1200);
await dumpCounts('2) selected');

await commandsBtn.first().click();
await page.waitForTimeout(1200);
await dumpCounts('3) toggled again (expect: back to full list)');
await page.screenshot({ path: S('step3_toggle') });

await browser.close();
console.log('done', Date.now());
