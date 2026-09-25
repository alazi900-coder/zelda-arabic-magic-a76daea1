import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext({ viewport: { width: 1500, height: 1000 } }).then(c=>c.newPage());
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0,300)));
await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', ROM);
await page.waitForURL('**/editor', { timeout: 300000 });
await page.waitForTimeout(12000);
console.log('المحرّر مفتوح');

const body = await page.evaluate(() => document.body.innerText);
for (const label of ['حوارات القصة','القوائم والنظام','أوصاف اللاعبين','نصوص أخرى']) {
  const m = body.match(new RegExp(`${label}[\\s\\S]{0,40}?([\\d,]+)`));
  console.log(`  ${label.padEnd(18)} ${m ? m[1] : 'غير ظاهر'}`);
}
await page.screenshot({ path: `${SHOTS}/cats_fixed.png`, fullPage: false });

// اضغط بطاقة "أوصاف اللاعبين" وتأكّد أن النتائج تتغيّر
const card = page.getByText('أوصاف اللاعبين', { exact: false }).first();
await card.scrollIntoViewIfNeeded(); await card.click();
await page.waitForTimeout(2500);
const after = await page.evaluate(() => document.body.innerText.slice(0, 1200));
console.log('\nبعد الضغط على «أوصاف اللاعبين»:');
console.log(after.split('\n').filter(l => l.trim()).slice(0, 14).join(' | '));
await page.screenshot({ path: `${SHOTS}/cats_players.png` });
await browser.close();
