import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext({ viewport: { width: 1500, height: 1100 } }).then(c=>c.newPage());
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0,400)));
await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', ROM);
await page.waitForURL('**/editor', { timeout: 300000 });
await page.waitForTimeout(12000);

const box = page.locator('textarea[placeholder*="أدخل الترجمة"]').first();
await box.scrollIntoViewIfNeeded();
await box.click();
await box.fill('مرحبا ١');
await page.keyboard.down('Control'); await page.keyboard.press('Enter'); await page.keyboard.up('Control');
await page.waitForTimeout(2000);

const after = await page.evaluate(() => document.body.innerText);
console.log('بعد الحفظ: عدد المترجم', (after.match(/([\d,]+)\s*\/\s*35,?183/) || [])[0]);

const toggle = page.getByText('المعالجة والبناء', { exact: false }).first();
await toggle.click();
await page.waitForTimeout(1500);
const btn = page.getByRole('button', { name: /عرض الحروف بلا خانة/ });
console.log('نصّ الزر:', await btn.textContent().catch(()=>'?'));
await btn.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${SHOTS}/unsupported_panel3.png` });

const disabled = await btn.isDisabled();
console.log('الزر معطّل؟', disabled);
if (!disabled) {
  await btn.click();
  await page.waitForTimeout(2000);
  const body = await page.evaluate(() => document.body.innerText);
  console.log('ظهرت مرحبا بعد الفلترة؟', body.includes('مرحبا'));
  await page.screenshot({ path: `${SHOTS}/unsupported_filtered3.png` });
}
await browser.close();
