import pkg from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pkg;

const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";
const SHOT = (n) => `/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/repro/${n}.png`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
page.on('pageerror', err => console.log('[pageerror]', err.message));

await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
await page.locator('input[type=file]').setInputFiles(ROM);
await page.waitForURL('**/editor', { timeout: 120000 });
await page.waitForTimeout(3000);

async function readCount() {
  const countText = await page.locator('text=/\\d+ نص/').first().textContent().catch(() => 'NONE');
  const noMatch = await page.locator('text=لا توجد نصوص مطابقة').count();
  return { countText, noMatch };
}

console.log('1) fresh load:', JSON.stringify(await readCount()));

// Click the "أسماء المهارات" (skill names / command.STR) category card.
const commandsCard = page.locator('text=أسماء المهارات').first();
await commandsCard.scrollIntoViewIfNeeded().catch(() => {});
await commandsCard.click({ timeout: 10000 }).catch(async (e) => {
  console.log('could not click أسماء المهارات directly:', e.message);
});
await page.waitForTimeout(1500);
console.log('2) after selecting أسماء المهارات filter:', JSON.stringify(await readCount()));
await page.screenshot({ path: SHOT('after_select_commands') });

// Now RELOAD the page (simulates returning to the editor later) and see what happens
// BEFORE deselecting the filter.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
console.log('3) after reload WITH filter still selected:', JSON.stringify(await readCount()));
await page.screenshot({ path: SHOT('after_reload_with_filter') });

// Now clear the filter (click "X فئة محددة" clear button) and see what happens.
const clearBtn = page.locator('button:has-text("✕")').first();
const cleared = await clearBtn.click({ timeout: 5000 }).catch(() => null);
await page.waitForTimeout(1500);
console.log('4) after clearing filter:', JSON.stringify(await readCount()));
await page.screenshot({ path: SHOT('after_clear_filter') });

await browser.close();
