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
for (const label of ['حوارات القصة','تعليقات المباراة','أوصاف اللاعبين','أوصاف الأغراض','أسماء المهارات','نصوص أخرى']) {
  const m = body.match(new RegExp(`${label}[\\s\\S]{0,40}?([\\d,]+)`));
  console.log(`  ${label.padEnd(18)} ${m ? m[1] : 'غير ظاهر'}`);
}
const card = page.getByText('حوارات القصة', { exact: false }).first();
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/cats_full5.png` });

// اضغط "أوصاف الأغراض" وتحقّق من محتواها
const itemsCard = page.getByText('أوصاف الأغراض', { exact: false }).first();
await itemsCard.click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOTS}/cats_items_filtered.png` });
const rowsTxt = await page.evaluate(() => document.body.innerText);
console.log('\nنموذج بعد فلترة "أوصاف الأغراض":');
console.log(rowsTxt.split('\n').filter(l => l.trim()).slice(0, 20).join(' | '));

await browser.close();
