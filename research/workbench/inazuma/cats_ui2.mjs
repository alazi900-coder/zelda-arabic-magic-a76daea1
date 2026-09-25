import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext({ viewport: { width: 1500, height: 1100 } }).then(c=>c.newPage());
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0,300)));
await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', ROM);
await page.waitForURL('**/editor', { timeout: 300000 });
await page.waitForTimeout(12000);

const body = await page.evaluate(() => document.body.innerText);
console.log('يحتوي "حوارات القصة"؟', body.includes('حوارات القصة'));
console.log('يحتوي "نصوص أخرى"؟', body.includes('نصوص أخرى'));
const idx = body.indexOf('حوارات القصة');
if (idx >= 0) console.log('السياق:\n' + body.slice(Math.max(0, idx-260), idx+260).split('\n').filter(l=>l.trim()).join(' | '));
else {
  // ابحث عن قسم الفلاتر
  const k = body.indexOf('تصنيف');
  console.log('قرب "تصنيف":', k>=0 ? body.slice(k-100, k+400).split('\n').filter(l=>l.trim()).join(' | ') : 'غير موجود');
}
const el = page.getByText('حوارات القصة', { exact: false }).first();
if (await el.count()) { await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(600); }
await page.screenshot({ path: `${SHOTS}/cats_section.png` });
await browser.close();
