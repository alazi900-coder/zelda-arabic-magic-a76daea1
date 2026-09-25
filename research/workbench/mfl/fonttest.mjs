import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { readFileSync, writeFileSync } from 'node:fs';
const { chromium } = pw;
const FD = '/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/fontfiles';
const OUT = '/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/mfl';
const URL_ = 'http://localhost:8799/tools/inazuma-font-editor.html';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => { errs.push(String(e).slice(0,200)); console.log('PAGEERROR:', String(e).slice(0, 300)); });

await page.goto(URL_);
await page.setInputFiles('#file', [`${FD}/FONT12.NFTR`, `${FD}/FONT12N.NFTR`, `${FD}/FONT8.NFTR`, `${FD}/FONT12T.NFTR`]);
await page.waitForTimeout(2500);
console.log('1) fonts loaded:', await page.textContent('#fileBadge'));
console.log('   depths:', await page.evaluate(() => FONTS.map(f => `${f.name}=${f.depth}bpp ${f.cw}x${f.ch}`).join(', ')));

// --- decode/encode must be lossless for every depth ---
const lossless = await page.evaluate(() => FONTS.map(f => {
  const out = encodeNftr(f);
  let same = out.length === f.raw.length;
  if (same) for (let i = 0; i < out.length; i++) if (out[i] !== f.raw[i]) { same = false; break; }
  return `${f.name}:${same ? 'identical' : 'DIFFERS'}`;
}).join('  '));
console.log('2) re-encode without edits:', lossless);

// --- sheet round trip, unmodified ---
await page.click('#tabEdit');
await page.waitForTimeout(800);
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSheetOut')]);
await dl.saveAs(`${OUT}/sheet.png`);
await page.waitForTimeout(400);
console.log('3) sheet exported:', await page.textContent('#toast'));

await page.setInputFiles('#sheetFile', `${OUT}/sheet.png`);
await page.waitForTimeout(1200);
console.log('4) re-import unmodified:', await page.textContent('#toast'));
const stillClean = await page.evaluate(() => {
  const f = FONTS[0], p = PRISTINE[0];
  for (let i = 0; i < f.pix.length; i++) if (f.pix[i] !== p.pix[i]) return 'CHANGED at ' + i;
  return 'font untouched';
});
console.log('   ', stillClean);

// --- paint one block white in the sheet, re-import, expect exactly one pixel ---
const geom = await page.evaluate(() => {
  const f = FONTS[cur], slots = sheetSlots();
  return { G: sheetGeometry(f, slots.length), first: slots[0], scale: SHEET_SCALE, pad: SHEET_PAD, label: SHEET_LABEL };
});
console.log('5) sheet geometry:', JSON.stringify(geom.G), 'first slot', geom.first);

await page.evaluate(async ({ scale, pad, label }) => {
  const resp = await fetch('/scratch/sheet.png');
  const bmp = await createImageBitmap(await resp.blob());
  const cv = document.createElement('canvas');
  cv.width = bmp.width; cv.height = bmp.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  // cell 0 is at (pad, label+pad); paint font-pixel (0,0) fully white
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(pad, label + pad, scale, scale);
  window.__painted = await new Promise(r => cv.toBlob(r, 'image/png'));
}, geom);

await page.evaluate(() => {
  const dt = new DataTransfer();
  dt.items.add(new File([window.__painted], 'sheet.png', { type: 'image/png' }));
  const inp = document.getElementById('sheetFile');
  inp.files = dt.files;
  inp.dispatchEvent(new Event('change'));
});
await page.waitForTimeout(1200);
console.log('6) after painting one block:', await page.textContent('#toast'));
console.log('   pixel(0,0) of slot', geom.first, '=', await page.evaluate((g) => getPixel(FONTS[cur], g, 0, 0), geom.first));

// --- autosave survives a reload ---
await page.waitForTimeout(900);
await page.reload();
await page.waitForTimeout(1200);
const barVisible = await page.evaluate(() => !document.getElementById('restoreBar').hidden);
console.log('7) restore bar after reload:', barVisible, '|', await page.textContent('#restoreMsg'));
if (barVisible) {
  await page.click('#btnRestore');
  await page.waitForTimeout(1500);
  console.log('   restored:', await page.textContent('#fileBadge'));
  console.log('   the painted pixel is still there:', await page.evaluate((g) => getPixel(FONTS[cur], g, 0, 0), geom.first));
}
await page.click('#tabEdit'); await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/fontedit.png` });
await browser.close();
console.log('\npage errors:', errs.length ? errs : 'none');
