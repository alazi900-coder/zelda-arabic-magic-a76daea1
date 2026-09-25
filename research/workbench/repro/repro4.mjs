import pkg from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pkg;

const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";
const S = (n) => `/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/repro/${n}.png`;

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
await page.locator('text=أسماء المهارات').first().click();
await page.waitForTimeout(1500);
await dumpCounts('2) after selecting أسماء المهارات');

// Deselect it (click again to toggle off) -- simulates going back to "no filter"
await page.locator('text=أسماء المهارات').first().click();
await page.waitForTimeout(1500);
await dumpCounts('3) after DEselecting (should show all again)');
await page.screenshot({ path: S('step3_deselected') });

// Now reload while NO filter selected -- does the bug appear after a reload?
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await dumpCounts('4) after reload with NO filter (workspace restore)');
await page.screenshot({ path: S('step4_after_reload') });

await browser.close();
