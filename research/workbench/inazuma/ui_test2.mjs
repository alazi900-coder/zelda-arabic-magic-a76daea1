import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on('pageerror', e => console.log('PAGE EXCEPTION:', String(e).slice(0, 200)));

await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
console.log('uploading ROM…');
await page.setInputFiles('input[type=file]', ROM);
await page.waitForURL('**/editor', { timeout: 240000 });
await page.waitForTimeout(10000);
console.log('editor open');

// the row list: find the section that lists entries and shoot it
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOTS}/ui_3_bottom.png` });

// walk down in steps so one of them catches the filter bar + rows
for (const [i, frac] of [[1, 0.25], [2, 0.45], [3, 0.62], [4, 0.78]]) {
  await page.evaluate((f) => window.scrollTo(0, document.body.scrollHeight * f), frac);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/ui_scroll_${i}.png` });
}

// what does the page actually say about this game?
const text = await page.evaluate(() => document.body.innerText);
for (const needle of ['حوارات القصة', 'القوائم والنظام', 'أوصاف اللاعبين', 'بناء روم', 'inazuma/']) {
  console.log(`  "${needle}": ${text.includes(needle) ? 'FOUND' : 'missing'}`);
}
const m = text.match(/إجمالي النصوص|34999/);
console.log('  row total marker:', m ? 'FOUND' : 'missing');

await browser.close();
console.log('done');
