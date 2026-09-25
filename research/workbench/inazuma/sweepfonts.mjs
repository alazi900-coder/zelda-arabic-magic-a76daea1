import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const FD = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/fontfiles";
const N = "/usr/share/fonts/truetype/noto/";
const FONTS = [
  ["ExtraCondensed", N+"NotoSansArabic-ExtraCondensed.ttf"],
  ["ExtraCondSemiBold", N+"NotoSansArabic-ExtraCondensedSemiBold.ttf"],
  ["Condensed", N+"NotoSansArabic-Condensed.ttf"],
  ["SemiCondensed", N+"NotoSansArabic-SemiCondensed.ttf"],
  ["NaskhMedium", N+"NotoNaskhArabic-Medium.ttf"],
];
const target = process.argv[2]; // 'FONT8.NFTR' or 'FONT12.NFTR'
const sizes = target === 'FONT8.NFTR' ? ['7','8','9','10'] : ['10','11','12','13'];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
page: for (const [nm, path] of FONTS) {
  const page = await browser.newContext({viewport:{width:1400,height:900}}).then(c=>c.newPage());
  page.on('dialog', async d => await d.accept());
  await page.goto('file:///home/user/zelda-arabic-magic-a76daea1/tools/inazuma-font-editor.html');
  await page.setInputFiles('#file', [`${FD}/${target}`]);
  await page.waitForTimeout(900);
  await page.click('#tabGen'); await page.waitForTimeout(300);
  await page.setInputFiles('#genFile', path); await page.waitForTimeout(2200);
  for (const size of sizes) for (const thr of ['70','90','110']) {
    await page.click('#tabGen'); await page.waitForTimeout(250);
    await page.fill('#gSize', size); await page.dispatchEvent('#gSize','input');
    await page.fill('#gThr', thr); await page.dispatchEvent('#gThr','input'); await page.waitForTimeout(1300);
    const made = ((await page.textContent('#genStat')).match(/تولّد (\d+)/)||['','?'])[1];
    await page.click('#btnGenApply'); await page.waitForTimeout(1600);
    await page.click('#tabEdit'); await page.waitForTimeout(800);
    const notes = ((await page.textContent('#audit')).replace(/\s+/g,' ').match(/(\d+) ملاحظة/)||['','0'])[1];
    await page.click('#tabTest'); await page.waitForTimeout(800);
    const broken = ((await page.textContent('#testStat')).match(/(\d+) كلمة فيها/)||['','0'])[1];
    console.log(`${nm.padEnd(18)} size=${size} thr=${thr} :: ولّد=${made} ملاحظات=${notes} كلمات معطوبة=${broken}`);
    await page.click('#tabGen'); await page.waitForTimeout(250);
    await page.click('#btnGenUndo'); await page.waitForTimeout(1100);
  }
  await page.close();
}
await browser.close();
