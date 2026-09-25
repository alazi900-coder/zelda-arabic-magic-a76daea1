import pkg from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pkg;

const ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds";

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
page.on('pageerror', err => console.log('[pageerror]', err.message));

await page.goto('http://127.0.0.1:8080/inazuma', { waitUntil: 'networkidle' });
await page.locator('input[type=file]').setInputFiles(ROM);
await page.waitForURL('**/editor', { timeout: 120000 });
await page.waitForTimeout(3000);
console.log('fresh load done');

// Simulate the user's stale state: write a workspace snapshot carrying the
// dead "iz-menu" id (renamed to "iz-match" in commit d78cf11d) directly into
// IndexedDB, exactly like a workspace saved before that rename would look.
await page.evaluate(async () => {
  const req = indexedDB.open('arabize-editor', 1);
  await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const db = req.result;
  const tx = db.transaction('files', 'readwrite');
  tx.objectStore('files').put({
    version: 1, search: '', filterFile: 'all',
    filterCategory: ['iz-menu'],
    filterStatus: 'all', filterTechnical: 'all', filterTable: 'all', filterColumn: 'all',
    filtersOpen: false,
  }, 'editor-workspace:inazuma');
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
});
console.log('stale iz-menu workspace written');

// Reload the editor directly -- this is what the user does: open the editor,
// not re-upload the ROM. The stale filter should now be restored...
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

async function dumpCounts(label) {
  const listCount = await page.locator('p.text-sm.text-muted-foreground', { hasText: /^\d+ نص$/ }).first().textContent().catch(() => 'NONE');
  const selectedBadge = await page.locator('text=/فئة محددة/').count();
  const noMatch = await page.locator('text=لا توجد نصوص مطابقة').count();
  console.log(label, JSON.stringify({ listCount, selectedBadge, noMatch }));
}
await dumpCounts('after reload WITH stale iz-menu filter restored');

await browser.close();
