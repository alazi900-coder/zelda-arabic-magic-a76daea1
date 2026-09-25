import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const F = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/FONT12_AR_CLEAN_TEST.NFTR";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext({ viewport: { width: 1500, height: 1000 } }).then(c=>c.newPage());
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0,400)));
await page.goto('file:///home/user/zelda-arabic-magic-a76daea1/tools/inazuma-font-editor.html');
try {
  await page.setInputFiles('#file', [F]);
  await page.waitForTimeout(1500);
  console.log('badge:', await page.textContent('#fileBadge'));
  await page.click('#tabEdit'); await page.waitForTimeout(1200);
  console.log('modCount:', await page.textContent('#modCount'));
  console.log('audit:', (await page.textContent('#audit')).replace(/\s+/g,' ').slice(0,600));
  await page.click('#tabTest'); await page.waitForTimeout(1500);
  console.log('testStat:', await page.textContent('#testStat'));
  await page.screenshot({ path: `${SHOTS}/user_font_test.png` });
  await page.click('#tabEdit'); await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/user_font_grid.png` });
} catch (e) {
  console.log('ERROR:', String(e).slice(0,500));
}
await browser.close();
