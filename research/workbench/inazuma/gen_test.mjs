import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const FD = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/fontfiles";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";
const OUT = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/tool_out";
const TTF = "/usr/share/fonts/truetype/noto/NotoSansArabic-SemiCondensed.ttf";

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0,400)));

await page.goto('file:///home/user/zelda-arabic-magic-a76daea1/tools/inazuma-font-editor.html');
await page.setInputFiles('#file', [`${FD}/FONT12.NFTR`, `${FD}/FONT12N.NFTR`, `${FD}/FONT8.NFTR`]);
await page.waitForTimeout(1200);

// generator on FONT12
await page.click('#tabGen'); await page.waitForTimeout(400);
await page.setInputFiles('#genFile', TTF);
await page.waitForTimeout(2500);
console.log('genStat:', await page.textContent('#genStat'));
await page.screenshot({ path: `${SHOTS}/tool_gen.png` });

await page.click('#btnGenApply');
await page.waitForTimeout(2500);
console.log('after apply toast:', await page.textContent('#toast'));

await page.click('#tabEdit'); await page.waitForTimeout(1500);
console.log('modCount:', await page.textContent('#modCount'));
console.log('audit:', (await page.textContent('#audit')).slice(0,200));
await page.screenshot({ path: `${SHOTS}/tool_after_gen.png` });

await page.click('#tabTest'); await page.waitForTimeout(1500);
console.log('testStat:', await page.textContent('#testStat'));
await page.screenshot({ path: `${SHOTS}/tool_test_after_gen.png` });

// also generate for FONT8 so export works with real drawn data
await page.click('#tabEdit'); await page.waitForTimeout(400);
const opts = await page.$$eval('#fontSel option', os => os.map(o => [o.value, o.textContent]));
console.log('options:', JSON.stringify(opts));
const f8 = opts.find(o => o[1].includes('FONT8'));
await page.selectOption('#fontSel', f8[0]); await page.waitForTimeout(800);
await page.click('#tabGen'); await page.waitForTimeout(800);
await page.fill('#gSize', '8'); await page.dispatchEvent('#gSize','input'); await page.waitForTimeout(1500);
await page.click('#btnGenApply'); await page.waitForTimeout(2000);
console.log('font8 apply toast:', await page.textContent('#toast'));

// export ts
const [dl] = await Promise.all([ page.waitForEvent('download', {timeout:30000}), page.click('#btnExport') ]);
await dl.saveAs(`${OUT}/inazuma-arabic-glyphs.ts`);
console.log('exported:', dl.suggestedFilename());
console.log('export toast:', await page.textContent('#toast'));

// save nftr files
const dls = [];
page.on('download', async d => { dls.push(d.suggestedFilename()); await d.saveAs(`${OUT}/${d.suggestedFilename()}`); });
await page.click('#btnSave');
await page.waitForTimeout(4000);
console.log('saved files:', dls.join(', '));
console.log('save toast:', await page.textContent('#toast'));

await browser.close();
console.log('OK');
