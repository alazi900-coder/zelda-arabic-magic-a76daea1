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

// ابحث بالضبط عن "joined you"
const search = page.locator('input[placeholder*="ابحث"]').first();
await search.click();
await search.fill('joined you');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/search_joined.png` });

const box = page.locator('textarea[placeholder*="أدخل الترجمة"]').first();
const count = await box.count();
console.log('عدد صناديق النتائج:', count);
if (count > 0) {
  await box.scrollIntoViewIfNeeded();
  await box.click();
  await box.fill('انضم إليك');
  await page.keyboard.down('Control'); await page.keyboard.press('Enter'); await page.keyboard.up('Control');
  await page.waitForTimeout(2000);
  const body = await page.evaluate(() => document.body.innerText);
  const m = body.match(/رموز تقنية مختلفة[^\n]*/);
  console.log('الحالة:', m ? m[0] : 'لا تحذير');
  await page.screenshot({ path: `${SHOTS}/verify_precise_before_fix.png` });

  // اضغط زرّ إصلاح إن وُجد
  const fixBtn = page.getByRole('button', { name: /إصلاح/ }).first();
  if (await fixBtn.count()) {
    await fixBtn.click();
    await page.waitForTimeout(1500);
    const body2 = await page.evaluate(() => document.body.innerText);
    const m2 = body2.match(/رموز تقنية مختلفة[^\n]*/);
    console.log('بعد الضغط على إصلاح:', m2 ? m2[0] : 'لا تحذير — أُصلح!');
    console.log('قيمة الصندوق الآن:', await box.inputValue());
  }
  await page.screenshot({ path: `${SHOTS}/verify_precise_after_fix.png` });
}
await browser.close();
