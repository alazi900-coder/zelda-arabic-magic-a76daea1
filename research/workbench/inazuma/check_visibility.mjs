import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext({ viewport: { width: 900, height: 1400 } }).then(c=>c.newPage());
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0,400)));
await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', ROM);
await page.waitForURL('**/editor', { timeout: 300000 });
await page.waitForTimeout(12000);

// انزل لقائمة النصوص مباشرة بدون اختيار أي بطاقة فلتر
const body1 = await page.evaluate(() => document.body.innerText);
console.log('يحتوي "inazuma/evet"؟', body1.includes('inazuma/evet'));
const entryCards = await page.locator('text=/inazuma\\/(evet|mcht|unitbase|item|command)/').count();
console.log('عدد بطاقات النصوص الظاهرة (بلا فلتر):', entryCards);
await page.screenshot({ path: `${SHOTS}/nofilter_top.png` });

// انزل للأسفل قليلاً
await page.mouse.wheel(0, 1500);
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/nofilter_scroll.png` });
const entryCards2 = await page.locator('text=/inazuma\\/(evet|mcht|unitbase|item|command)/').count();
console.log('بعد التمرير:', entryCards2);

await browser.close();
