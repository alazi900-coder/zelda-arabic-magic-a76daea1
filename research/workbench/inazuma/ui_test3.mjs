import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 1050 } });
page.on('pageerror', e => console.log('PAGE EXCEPTION:', String(e).slice(0, 200)));

await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
await page.screenshot({ path: `${SHOTS}/shot_upload.png` });
console.log('uploading ROM…');
await page.setInputFiles('input[type=file]', ROM);
await page.waitForURL('**/editor', { timeout: 240000 });
await page.waitForTimeout(10000);

// open the collapsed build panel
const buildToggle = page.getByText('المعالجة والبناء', { exact: false }).first();
if (await buildToggle.count()) {
  await buildToggle.click();
  await page.waitForTimeout(2500);
  console.log('build panel opened');
}

const text = await page.evaluate(() => document.body.innerText);
for (const needle of ['بناء روم', 'حوارات القصة', 'القوائم والنظام', 'أوصاف اللاعبين']) {
  console.log(`  "${needle}": ${text.includes(needle) ? 'FOUND' : 'missing'}`);
}
console.log('  mr01b04 still listed:', text.includes('mr01b04'));

// capture the build controls
const buildBtn = page.getByRole('button', { name: /بناء روم/ }).first();
if (await buildBtn.count()) {
  await buildBtn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/shot_build.png` });
}

// capture the rows with the category filter open
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.80));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/shot_rows.png` });

await browser.close();
console.log('done');
