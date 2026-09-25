import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const FD = '/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/fontfiles';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
await page.goto('file:///home/user/zelda-arabic-magic-a76daea1/tools/inazuma-font-editor.html');

const heap = async () => Math.round(await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize / 1048576 : -1));
console.log('heap after load (MB):', await heap());

await page.setInputFiles('#file', [`${FD}/FONT12.NFTR`, `${FD}/FONT12N.NFTR`, `${FD}/FONT8.NFTR`]);
await page.waitForTimeout(2000);
console.log('heap after 3 fonts (MB):', await heap());
console.log('canvases in DOM:', await page.evaluate(() => document.querySelectorAll('canvas').length));

// Persistence: does anything survive a reload?
await page.evaluate(() => { try { window.__ls = Object.keys(localStorage).length; } catch (e) { window.__ls = 'blocked'; } });
console.log('localStorage keys written by the tool:', await page.evaluate(() => window.__ls));
console.log('has beforeunload handler:', await page.evaluate(() => typeof window.onbeforeunload === 'function'));

// Simulate editing: toggle pixels on the selected glyph 20 times, re-render between.
for (let i = 0; i < 20; i++) {
  await page.evaluate(() => {
    const cells = document.querySelectorAll('#grid .cell');
    if (cells.length) cells[Math.floor(Math.random() * cells.length)].click();
  });
  await page.waitForTimeout(60);
}
console.log('heap after 20 slot switches (MB):', await heap());
console.log('canvases in DOM after:', await page.evaluate(() => document.querySelectorAll('canvas').length));
await page.screenshot({ path: '/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/mfl/fonttool.png', fullPage: false });
await browser.close();
