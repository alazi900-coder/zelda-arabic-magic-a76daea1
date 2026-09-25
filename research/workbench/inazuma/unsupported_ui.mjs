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
console.log('editor open');

// اكتب ترجمة فيها رقم عربي هندي (١) لا خانة له في الخط، في أول صندوق ترجمة
const box = page.locator('textarea').first();
await box.scrollIntoViewIfNeeded();
await box.click();
await box.fill('مرحبا ١');
await page.waitForTimeout(1500);
// اضغط خارج الصندوق لتأكيد الحفظ
await page.keyboard.press('Tab');
await page.waitForTimeout(1500);

// افتح قسم المعالجة والبناء
const toggle = page.getByText('المعالجة والبناء', { exact: false }).first();
await toggle.click();
await page.waitForTimeout(1500);

const btn = page.getByRole('button', { name: /عرض الحروف بلا خانة/ });
console.log('زر موجود؟', await btn.count());
console.log('نصّ الزر:', await btn.textContent().catch(()=>'?'));
await btn.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${SHOTS}/unsupported_panel.png` });

await btn.click();
await page.waitForTimeout(2000);
const body = await page.evaluate(() => document.body.innerText);
console.log('بعد الضغط، هل ظهرت النصوص المفلترة؟', body.includes('مرحبا'));
await page.screenshot({ path: `${SHOTS}/unsupported_filtered.png` });

await browser.close();
