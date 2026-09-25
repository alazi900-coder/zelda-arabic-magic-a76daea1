import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const FD = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/fontfiles";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext({ viewport: { width: 1500, height: 1000 } }).then(c => c.newPage());
page.on('console', m => console.log('CONSOLE', m.type(), ':', m.text().slice(0,200)));
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0,400)));

await page.goto('file:///home/user/zelda-arabic-magic-a76daea1/tools/inazuma-font-editor.html');
await page.setInputFiles('#file', [`${FD}/FONT12.NFTR`, `${FD}/FONT12N.NFTR`, `${FD}/FONT8.NFTR`]);
await page.waitForTimeout(1500);
console.log('badge:', await page.textContent('#fileBadge'));
await page.screenshot({ path: `${SHOTS}/tool_files.png`, fullPage: true });

// verify
await page.click('#btnVerify');
await page.waitForTimeout(600);
console.log('verify toast:', await page.textContent('#toast'));

// go to edit
await page.click('#tabEdit');
await page.waitForTimeout(1200);
console.log('slotInfo:', await page.textContent('#slotInfo'));
console.log('editTitle:', await page.textContent('#editTitle'));
console.log('modCount:', await page.textContent('#modCount'));
console.log('cells shown:', await page.locator('#grid .cell').count());
console.log('audit head:', (await page.textContent('#audit')).slice(0,300));
await page.screenshot({ path: `${SHOTS}/tool_edit.png`, fullPage: false });

// search a letter
await page.fill('#search', 'ب وسطي');
await page.waitForTimeout(500);
console.log('searchHits:', await page.textContent('#searchHits'));
console.log('editTitle after search:', await page.textContent('#editTitle'));

// test words tab
await page.click('#tabTest');
await page.waitForTimeout(1200);
console.log('testStat:', await page.textContent('#testStat'));
await page.screenshot({ path: `${SHOTS}/tool_test.png`, fullPage: false });

// switch to FONT8
await page.click('#tabEdit'); await page.waitForTimeout(500);
await page.selectOption('#fontSel', { label: /FONT8/ }).catch(async()=>{ await page.selectOption('#fontSel','2'); });
await page.waitForTimeout(1000);
console.log('font8 editTitle:', await page.textContent('#editTitle'));
console.log('font8 cells:', await page.locator('#grid .cell').count());
await page.screenshot({ path: `${SHOTS}/tool_font8.png`, fullPage: false });

await browser.close();
console.log('OK');
