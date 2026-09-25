import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const FD = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/fontfiles";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";
const TTF = "/usr/share/fonts/truetype/noto/NotoSansArabic-SemiCondensed.ttf";

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext({ viewport: { width: 1500, height: 1000 } }).then(c=>c.newPage());
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0,400)));
page.on('dialog', async d => { console.log('CONFIRM:', d.message().replace(/\n+/g,' | ')); await d.accept(); });

await page.goto('file:///home/user/zelda-arabic-magic-a76daea1/tools/inazuma-font-editor.html');
await page.setInputFiles('#file', [`${FD}/FONT12.NFTR`, `${FD}/FONT12N.NFTR`, `${FD}/FONT8.NFTR`]);
await page.waitForTimeout(1200);

// generate Arabic into FONT12 only
await page.click('#tabGen'); await page.waitForTimeout(400);
await page.setInputFiles('#genFile', TTF); await page.waitForTimeout(2500);
await page.click('#btnGenApply'); await page.waitForTimeout(2500);

await page.click('#tabEdit'); await page.waitForTimeout(1000);
console.log('twin button label:', await page.textContent('#btnTwin'));
console.log('FONT12 mod:', await page.textContent('#modCount'));

// check FONT12N is still untouched
await page.selectOption('#fontSel','1'); await page.waitForTimeout(900);
console.log('FONT12N before copy:', await page.textContent('#modCount'));
console.log('twin label while on N:', await page.textContent('#btnTwin'));

// go back to FONT12 and copy
await page.selectOption('#fontSel','0'); await page.waitForTimeout(900);
await page.click('#btnTwin'); await page.waitForTimeout(1200);
console.log('toast:', await page.textContent('#toast'));

await page.selectOption('#fontSel','1'); await page.waitForTimeout(1200);
console.log('FONT12N after copy:', await page.textContent('#modCount'));
console.log('FONT12N audit:', (await page.textContent('#audit')).slice(0,120));
await page.screenshot({ path: `${SHOTS}/tool_twin.png` });

await page.click('#tabTest'); await page.waitForTimeout(1500);
console.log('FONT12N testStat:', await page.textContent('#testStat'));

// FONT8 should have no twin
await page.click('#tabEdit'); await page.waitForTimeout(400);
await page.selectOption('#fontSel','2'); await page.waitForTimeout(900);
console.log('FONT8 twin label:', await page.textContent('#btnTwin'), '| disabled:', await page.isDisabled('#btnTwin'));

await browser.close();
console.log('OK');
