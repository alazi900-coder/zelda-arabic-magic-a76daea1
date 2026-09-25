import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1050 } });
const page = await ctx.newPage();

page.on('dialog', async (d) => {
  console.log('DIALOG:', d.type(), '|', d.message().slice(0, 200));
  await d.accept();
});
page.on('console', m => console.log('CONSOLE', m.type(), ':', m.text().slice(0, 250)));
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
page.on('request', req => {
  const u = req.url();
  if (u.includes('functions') || u.includes('enhance') || u.includes('supabase')) {
    console.log('REQUEST:', req.method(), u.slice(0, 150));
  }
});
page.on('response', async (res) => {
  const u = res.url();
  if (u.includes('functions') || u.includes('enhance') || u.includes('supabase')) {
    console.log('RESPONSE:', res.status(), u.slice(0, 150));
  }
});

await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', ROM);
await page.waitForURL('**/editor', { timeout: 240000 });
await page.waitForTimeout(8000);
console.log('editor open');

const toggle = page.getByText('المعالجة والبناء', { exact: false }).first();
await toggle.click();
await page.waitForTimeout(1500);

const freeBtn = page.getByRole('button', { name: /ترجمة شاملة مجانية/ });
console.log('free-translate button count:', await freeBtn.count());
await freeBtn.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${SHOTS}/diag_before_click.png` });

console.log('clicking…');
await freeBtn.click();
console.log('clicked, waiting 20s and watching…');
await page.waitForTimeout(20000);
await page.screenshot({ path: `${SHOTS}/diag_after_click.png` });

const text = await page.evaluate(() => document.body.innerText);
const m = text.match(/[\d,]+\s*\n?\s*مترجم/);
console.log('translated counter now:', m ? m[0] : 'not found');

await page.waitForTimeout(15000);
await page.screenshot({ path: `${SHOTS}/diag_after_35s.png` });
const text2 = await page.evaluate(() => document.body.innerText);
const m2 = text2.match(/[\d,]+\s*\n?\s*مترجم/);
console.log('translated counter at 35s:', m2 ? m2[0] : 'not found');

await browser.close();
console.log('diag done');
