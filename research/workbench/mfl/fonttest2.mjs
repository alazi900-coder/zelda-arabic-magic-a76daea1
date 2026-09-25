import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const FD = '/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/fontfiles';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0,200)));
await page.goto('http://localhost:8799/tools/inazuma-font-editor.html');
// start clean
await page.evaluate(() => indexedDB.deleteDatabase('inazuma-font-editor'));
await page.reload(); await page.waitForTimeout(400);
await page.setInputFiles('#file', [`${FD}/FONT12.NFTR`, `${FD}/FONT12T.NFTR`]);
await page.waitForTimeout(2000);
await page.click('#tabEdit'); await page.waitForTimeout(700);

// every filter must export without throwing
for (const mode of ['all', 'used', 'empty', 'arabic']) {
  await page.evaluate((m) => { filterMode = m; renderFilters(); renderGrid(); }, mode);
  await page.waitForTimeout(400);
  const n = await page.evaluate(() => sheetSlots().length);
  const g = await page.evaluate(() => JSON.stringify(sheetGeometry(FONTS[cur], sheetSlots().length)));
  console.log(`filter ${mode.padEnd(7)} slots=${String(n).padStart(3)}  ${g}`);
}

// the 2bpp font: open it, edit with a mid level, re-encode, check only that pixel moved
await page.evaluate(() => { filterMode = 'arabic'; renderFilters(); renderGrid(); });
await page.selectOption('#fontSel', '1');
await page.waitForTimeout(800);
console.log('opened:', await page.evaluate(() => `${FONTS[cur].name} ${FONTS[cur].depth}bpp levels=${PAL.length}`));
const res = await page.evaluate(() => {
  const f = FONTS[cur], g = 33; // Latin 'A'
  const before = encodeNftr(f);
  setPixel(f, g, 0, 0, 2);
  const after = encodeNftr(f);
  let diff = 0;
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) diff++;
  const readBack = decodeNftr(after, f.name);
  return { diffBytes: diff, readsBackAs: getPixel(readBack, g, 0, 0) };
});
console.log('2bpp write level 2 -> bytes changed:', res.diffBytes, ', reads back as:', res.readsBackAs);
await browser.close();
console.log('page errors:', errs.length ? errs : 'none');
