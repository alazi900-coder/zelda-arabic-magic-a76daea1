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

const card = page.getByText('حوارات القصة', { exact: false }).first();
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/cats_cards.png` });

async function shown() {
  const t = await page.evaluate(() => document.body.innerText);
  const m = t.match(/عرض\s*([\d,]+)|([\d,]+)\s*نتيجة|من\s*([\d,]+)\s*نص/);
  return m ? m[0] : null;
}

for (const label of ['أوصاف اللاعبين','القوائم والنظام','حوارات القصة']) {
  const c = page.getByText(label, { exact: false }).first();
  await c.scrollIntoViewIfNeeded(); await c.click();
  await page.waitForTimeout(2500);
  const rows = await page.locator('[data-entry-key], [data-testid="entry-row"]').count();
  const txt = await page.evaluate(() => document.body.innerText);
  const mm = txt.match(/([\d,]+)\s*(?:نص|سطر|نتيجة)/g);
  console.log(`${label.padEnd(18)} → صفوف ظاهرة=${rows} | أرقام: ${mm ? mm.slice(0,4).join(' , ') : '—'}`);
  await page.screenshot({ path: `${SHOTS}/cat_${label.replace(/ /g,'_')}.png` });
  await c.click(); await page.waitForTimeout(1500); // ألغِ التحديد
}
await browser.close();
