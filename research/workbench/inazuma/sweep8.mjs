import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const FD = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/fontfiles";
const TTF = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext({viewport:{width:1400,height:900}}).then(c=>c.newPage());
page.on('pageerror', e => console.log('ERR:', String(e).slice(0,200)));
page.on('dialog', async d => await d.accept());
await page.goto('file:///home/user/zelda-arabic-magic-a76daea1/tools/inazuma-font-editor.html');
await page.setInputFiles('#file', [`${FD}/FONT8.NFTR`]);
await page.waitForTimeout(1000);
for (const size of ['6','7','8','9']) {
  for (const thr of ['80','110','150']) {
    await page.click('#tabGen'); await page.waitForTimeout(300);
    if (!(await page.textContent('#genBadge')).includes('.ttf')) { await page.setInputFiles('#genFile', TTF); await page.waitForTimeout(2200); }
    await page.fill('#gSize', size); await page.dispatchEvent('#gSize','input');
    await page.fill('#gThr', thr); await page.dispatchEvent('#gThr','input'); await page.waitForTimeout(1400);
    const stat = (await page.textContent('#genStat')).replace(/\s+/g,' ');
    await page.click('#btnGenApply'); await page.waitForTimeout(1800);
    await page.click('#tabEdit'); await page.waitForTimeout(900);
    const audit = (await page.textContent('#audit')).replace(/\s+/g,' ');
    const notes = (audit.match(/^(\d+) ملاحظة/) || ['','0'])[1];
    await page.click('#tabTest'); await page.waitForTimeout(900);
    const t = await page.textContent('#testStat');
    console.log(`size=${size} thr=${thr} :: ملاحظات=${notes||0} :: ${t} :: ${stat}`);
    await page.click('#tabGen'); await page.waitForTimeout(300);
    await page.click('#btnGenUndo'); await page.waitForTimeout(1200);
  }
}
await browser.close();
