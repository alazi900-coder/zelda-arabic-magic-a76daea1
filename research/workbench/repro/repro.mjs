import pkg from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pkg;

const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
page.on('console', msg => console.log('[console]', msg.type(), msg.text()));
page.on('pageerror', err => console.log('[pageerror]', err.message));

await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
console.log('loaded /inazuma');

const fileInput = await page.locator('input[type=file]');
await fileInput.setInputFiles(ROM);
console.log('file set, waiting for navigation to /editor...');

await page.waitForURL('**/editor', { timeout: 120000 });
console.log('navigated to editor:', page.url());

await page.waitForTimeout(3000);

// Count of entries text shown, e.g. "N نص"
const countText = await page.locator('text=/\\d+ نص/').first().textContent().catch(() => null);
console.log('entries count label BEFORE any filter click:', countText);

// Check "no matching text" message
const noMatch = await page.locator('text=لا توجد نصوص مطابقة').count();
console.log('"no matching text" message visible:', noMatch);

await page.screenshot({ path: '/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/repro/before_filter.png', fullPage: false });

await browser.close();
