import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext({ viewport: { width: 1400, height: 1100 } }).then(c=>c.newPage());
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0,400)));
await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', ROM);
await page.waitForURL('**/editor', { timeout: 300000 });
await page.waitForTimeout(12000);

// اكتب ترجمة تُسقط %s (بالضبط سيناريو المستخدم)
const box = page.locator('textarea[placeholder*="أدخل الترجمة"]').first();
await box.scrollIntoViewIfNeeded();
await box.click();
await box.fill('انضم إليك');
await page.keyboard.down('Control'); await page.keyboard.press('Enter'); await page.keyboard.up('Control');
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SHOTS}/verify_row.png` });

const body1 = await page.evaluate(() => document.body.innerText);
const m1 = body1.match(/رموز تقنية مختلفة[^\n]*/);
console.log('حالة السطر بعد الحفظ:', m1 ? m1[0] : 'لم يظهر تحذير');

// افتح لوحة الفحص العميق
const btn = page.getByText('فحص عميق للمشاكل الحرجة', { exact: false }).first();
if (await btn.count()) {
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await page.waitForTimeout(1500);
}
const body2 = await page.evaluate(() => document.body.innerText);
console.log('يحتوي فحص عميق على "تقسيم" (أسطر منفردة)؟', body2.includes('joined') || body2.includes('انضم'));
await page.screenshot({ path: `${SHOTS}/verify_deep.png` });

await browser.close();
