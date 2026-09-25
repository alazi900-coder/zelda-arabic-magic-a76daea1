import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";
const OUT = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma-FROM-UI.nds";

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1050 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGE EXCEPTION:', String(e).slice(0, 200)));

await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
console.log('uploading ROM…');
await page.setInputFiles('input[type=file]', ROM);
await page.waitForURL('**/editor', { timeout: 240000 });
await page.waitForTimeout(10000);

// find Endou's description through the editor's own search
console.log('searching for the line…');
const search = page.getByPlaceholder('بحث عن نصوص').first();
await search.scrollIntoViewIfNeeded();
await search.fill('No one has more love');
await page.waitForTimeout(4000);
await page.screenshot({ path: `${SHOTS}/shot_search.png` });

const box = page.getByPlaceholder(/أدخل الترجمة/).first();
await box.scrollIntoViewIfNeeded();
await box.click();
await box.fill('مرحبا بكم في اينازوما');
await page.keyboard.press('Control+Enter');
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SHOTS}/shot_translated.png` });
console.log('translation typed and saved');

// open the build panel and press build
const toggle = page.getByText('المعالجة والبناء', { exact: false }).first();
await toggle.click();
await page.waitForTimeout(2000);
const buildBtn = page.getByRole('button', { name: /بناء روم/ }).first();
await buildBtn.scrollIntoViewIfNeeded();
console.log('building…');
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 300000 }),
  buildBtn.click(),
]);
await download.saveAs(OUT);
console.log('downloaded:', download.suggestedFilename(), '->', OUT);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SHOTS}/shot_built.png` });

await browser.close();
console.log('done');
