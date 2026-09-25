import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";
const OUT = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma-FULL-AR.nds";
const LOG = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/translate_progress.log";

const fs = await import('node:fs');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1050 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', e => log('PAGE EXCEPTION: ' + String(e).slice(0, 300)));

log('opening /inazuma');
await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
log('uploading ROM…');
await page.setInputFiles('input[type=file]', ROM);
await page.waitForURL('**/editor', { timeout: 240000 });
await page.waitForTimeout(8000);
log('editor open');

// open the AI panel section that holds the free-translate button
const buildToggle = page.getByText('المعالجة والبناء', { exact: false }).first();
await buildToggle.click();
await page.waitForTimeout(1500);

const freeBtn = page.getByRole('button', { name: /ترجمة شاملة مجانية/ }).first();
await freeBtn.scrollIntoViewIfNeeded();
log('clicking "ترجمة شاملة مجانية"');
await freeBtn.click();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SHOTS}/translate_started.png` });

// poll progress: read the "مترجم" stat tile and the translating flag
async function readProgress() {
  return page.evaluate(() => {
    const body = document.body.innerText;
    const m = body.match(/([\d,]+)\s*\n?\s*مترجم/);
    const total = body.match(/([\d,]+)\s*\n?\s*إجمالي النصوص/);
    return { translated: m ? m[1] : null, total: total ? total[1] : null };
  });
}

let lastTranslated = null;
let stallCount = 0;
const start = Date.now();
while (true) {
  await page.waitForTimeout(30000);
  const { translated, total } = await readProgress();
  const elapsedMin = ((Date.now() - start) / 60000).toFixed(1);
  log(`progress: ${translated} / ${total} translated (${elapsedMin} min elapsed)`);

  // is the translate button still disabled (i.e. still running)?
  const stillTranslating = await freeBtn.isDisabled().catch(() => false);
  if (!stillTranslating) {
    log('translate button re-enabled -- translation pass finished or stopped');
    break;
  }
  if (translated === lastTranslated) {
    stallCount++;
    if (stallCount >= 10) { // 5 minutes with no progress
      log('no progress for 5 minutes, treating as stalled and stopping wait');
      break;
    }
  } else {
    stallCount = 0;
  }
  lastTranslated = translated;

  // safety cap: 3 hours
  if (Date.now() - start > 3 * 60 * 60 * 1000) {
    log('hit 3-hour cap, stopping wait regardless of state');
    break;
  }
}

await page.screenshot({ path: `${SHOTS}/translate_finished.png` });
const finalProgress = await readProgress();
log(`final: ${finalProgress.translated} / ${finalProgress.total}`);

// now build
log('building the ROM…');
const buildBtn = page.getByRole('button', { name: /بناء روم/ }).first();
await buildBtn.scrollIntoViewIfNeeded();
try {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 300000 }),
    buildBtn.click(),
  ]);
  await download.saveAs(OUT);
  log('downloaded: ' + download.suggestedFilename() + ' -> ' + OUT);
} catch (e) {
  log('BUILD FAILED: ' + String(e).slice(0, 500));
  await page.screenshot({ path: `${SHOTS}/build_failed.png` });
}
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SHOTS}/after_build.png` });

await browser.close();
log('done');
