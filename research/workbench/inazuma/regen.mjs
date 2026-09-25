import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const FD = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/fontfiles";
const OUT = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/fontfiles_fixed";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";
const TTF = process.argv[2];
const S12 = process.argv[3] || '11', S8 = process.argv[4] || '8';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport:{width:1500,height:1000}, acceptDownloads:true });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0,300)));
page.on('dialog', async d => await d.accept());
const saved = [];
page.on('download', async d => { await d.saveAs(`${OUT}/${d.suggestedFilename()}`); saved.push(d.suggestedFilename()); });

await page.goto('file:///home/user/zelda-arabic-magic-a76daea1/tools/inazuma-font-editor.html');
await page.setInputFiles('#file', [`${FD}/FONT12.NFTR`,`${FD}/FONT12N.NFTR`,`${FD}/FONT8.NFTR`]);
await page.waitForTimeout(1200);

async function gen(sel, size) {
  await page.click('#tabEdit'); await page.waitForTimeout(400);
  await page.selectOption('#fontSel', sel); await page.waitForTimeout(700);
  await page.click('#tabGen'); await page.waitForTimeout(500);
  if (!(await page.textContent('#genBadge')).includes('.ttf')) {
    await page.setInputFiles('#genFile', TTF); await page.waitForTimeout(2500);
  }
  await page.fill('#gSize', size); await page.dispatchEvent('#gSize','input'); await page.waitForTimeout(2000);
  console.log(`  [${sel}] baseline=${await page.inputValue('#gBase')} size=${size} :: ${(await page.textContent('#genStat')).replace(/\s+/g,' ')}`);
  await page.click('#btnGenApply'); await page.waitForTimeout(2500);
}

await gen('0', S12);          // FONT12
await gen('2', S8);           // FONT8

// copy FONT12 -> FONT12N
await page.click('#tabEdit'); await page.waitForTimeout(400);
await page.selectOption('#fontSel','0'); await page.waitForTimeout(800);
await page.click('#btnTwin'); await page.waitForTimeout(1500);

for (const [v,name] of [['0','FONT12'],['1','FONT12N'],['2','FONT8']]) {
  await page.click('#tabEdit'); await page.waitForTimeout(300);
  await page.selectOption('#fontSel', v); await page.waitForTimeout(1200);
  const a = (await page.textContent('#audit')).replace(/\s+/g,' ').slice(0,140);
  await page.click('#tabTest'); await page.waitForTimeout(1200);
  console.log(`  ${name}: ${a} || ${await page.textContent('#testStat')}`);
}
await page.screenshot({ path:`${SHOTS}/fixed_test.png` });

await page.click('#tabEdit'); await page.waitForTimeout(300);
await page.click('#btnExport'); await page.waitForTimeout(2500);
await page.click('#btnSave'); await page.waitForTimeout(5000);
console.log('saved:', saved.join(', '));
await browser.close();
