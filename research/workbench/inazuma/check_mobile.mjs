import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }).then(c=>c.newPage());
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0,400)));
await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', ROM);
await page.waitForURL('**/editor', { timeout: 300000 });
await page.waitForTimeout(12000);

for (let i=0; i<12; i++) {
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
}
const entryCards = await page.locator('text=/inazuma\\/(evet|mcht|unitbase|item|command)/').count();
console.log('عدد بطاقات النصوص الظاهرة على شاشة جوال (بلا فلتر):', entryCards);
await page.screenshot({ path: `${SHOTS}/mobile_nofilter.png`, fullPage: false });

const body = await page.evaluate(() => document.body.innerText);
console.log('يحتوي "لا توجد نصوص"؟', body.includes('لا توجد نصوص') || body.includes('لا توجد'));
console.log(body.slice(0, 100).replace(/\n/g,' | '));
await browser.close();
