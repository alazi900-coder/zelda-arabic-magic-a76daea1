import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const FD = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/fontfiles";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";
const N = "/usr/share/fonts/truetype/noto/";
const CANDS = [
  ["أ_نسخ",        N+"NotoNaskhArabic-Medium.ttf",           '11','110'],
  ["ب_متوسط",      N+"NotoSansArabic-SemiCondensed.ttf",     '11','110'],
  ["ج_مضغوط",      N+"NotoSansArabic-Condensed.ttf",         '11','110'],
  ["د_شديد_الضغط", N+"NotoSansArabic-ExtraCondensed.ttf",    '12','100'],
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [nm, ttf, size, thr] of CANDS) {
  const page = await browser.newContext({viewport:{width:1500,height:760}}).then(c=>c.newPage());
  page.on('dialog', async d => await d.accept());
  await page.goto('file:///home/user/zelda-arabic-magic-a76daea1/tools/inazuma-font-editor.html');
  await page.setInputFiles('#file', [`${FD}/FONT12.NFTR`]);
  await page.waitForTimeout(900);
  await page.click('#tabGen'); await page.waitForTimeout(300);
  await page.setInputFiles('#genFile', ttf); await page.waitForTimeout(2300);
  await page.fill('#gSize', size); await page.dispatchEvent('#gSize','input');
  await page.fill('#gThr', thr); await page.dispatchEvent('#gThr','input'); await page.waitForTimeout(1600);
  await page.click('#btnGenApply'); await page.waitForTimeout(2200);
  await page.click('#tabEdit'); await page.waitForTimeout(900);
  const notes = ((await page.textContent('#audit')).replace(/\s+/g,' ').match(/(\d+) ملاحظة/)||['','0'])[1];
  await page.click('#tabTest'); await page.waitForTimeout(1200);
  const stat = await page.textContent('#testStat');
  console.log(`${nm.padEnd(16)} size=${size} thr=${thr} :: ملاحظات=${notes} :: ${stat}`);
  await page.locator('#testList').screenshot({ path: `${SHOTS}/var_${nm}.png` });
  await page.close();
}
await browser.close();
