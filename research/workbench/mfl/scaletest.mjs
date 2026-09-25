import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const FD = '/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/fontfiles';
const OUT = '/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/mfl';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0,200)));
await page.goto('http://localhost:8799/tools/inazuma-font-editor.html');
await page.evaluate(() => indexedDB.deleteDatabase('inazuma-font-editor'));
await page.reload(); await page.waitForTimeout(400);
await page.setInputFiles('#file', [`${FD}/FONT12.NFTR`, `${FD}/FONT8.NFTR`]);
await page.waitForTimeout(2000);
await page.click('#tabEdit'); await page.waitForTimeout(700);

for (const scale of ['1', '12']) {
  await page.selectOption('#sheetScale', scale);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSheetOut')]);
  const path = `${OUT}/sheet_${scale}x.png`;
  await dl.saveAs(path);
  await page.waitForTimeout(400);
  console.log(`export ${scale}x:`, (await page.textContent('#toast')).trim());

  // unmodified re-import must be a no-op
  await page.setInputFiles('#sheetFile', path);
  await page.waitForTimeout(1000);
  console.log(`  re-import untouched:`, (await page.textContent('#toast')).trim());

  // paint exactly one font pixel white in cell 0 and re-import
  const g = await page.evaluate((sc) => {
    const f = FONTS[cur], slots = sheetSlots();
    return { G: sheetGeometry(f, slots.length, +sc), first: slots[0], cw: f.cw, ch: f.ch };
  }, scale);
  await page.evaluate(async ({ path, G }) => {
    const bmp = await createImageBitmap(await (await fetch(path)).blob());
    const cv = document.createElement('canvas');
    cv.width = bmp.width; cv.height = bmp.height;
    const c = cv.getContext('2d'); c.drawImage(bmp, 0, 0);
    const o = cellOrigin(G, 0);
    c.fillStyle = '#ffffff';
    c.fillRect(o.x, o.y, G.scale, G.scale);      // font pixel (0,0) of cell 0
    window.__p = await new Promise(r => cv.toBlob(r, 'image/png'));
  }, { path: `/scratch/sheet_${scale}x.png`, G: g.G });
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([window.__p], 's.png', { type: 'image/png' }));
    const i = document.getElementById('sheetFile'); i.files = dt.files;
    i.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(1000);
  console.log(`  after painting one pixel:`, (await page.textContent('#toast')).trim(),
    '| pixel(0,0) =', await page.evaluate((s) => getPixel(FONTS[cur], s, 0, 0), g.first));
  // put it back
  await page.evaluate((s) => { setPixel(FONTS[cur], s, 0, 0, 0); afterEdit(); }, g.first);
  await page.waitForTimeout(300);
}
// FONT8 sheet size at 1x
await page.selectOption('#fontSel', '1'); await page.waitForTimeout(600);
await page.selectOption('#sheetScale', '1');
console.log('\nFONT8 1x sheet:', await page.evaluate(() => JSON.stringify(sheetGeometry(FONTS[cur], sheetSlots().length, 1))));
await browser.close();
console.log('page errors:', errs.length ? errs : 'none');
