import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";
const SHOTS = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/shots";

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
page.on('console', m => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text().slice(0, 200)); });
page.on('pageerror', e => console.log('PAGE EXCEPTION:', String(e).slice(0, 300)));

console.log('1. opening /inazuma');
await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
await page.screenshot({ path: `${SHOTS}/ui_1_upload.png` });

console.log('2. uploading the real ROM (256 MB)');
await page.setInputFiles('input[type=file]', ROM);

console.log('3. waiting for the editor');
await page.waitForURL('**/editor', { timeout: 180000 });
await page.waitForTimeout(8000);
await page.screenshot({ path: `${SHOTS}/ui_2_editor.png` });

const rowCount = await page.evaluate(() => {
  return new Promise((resolve) => {
    const req = indexedDB.open('keyval-store');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('keyval', 'readonly').objectStore('keyval').get('editorState');
      tx.onsuccess = () => resolve(tx.result?.entries?.length ?? -1);
      tx.onerror = () => resolve(-2);
    };
    req.onerror = () => resolve(-3);
  });
});
console.log('   rows loaded into the editor:', rowCount);

console.log('4. done');
await browser.close();
