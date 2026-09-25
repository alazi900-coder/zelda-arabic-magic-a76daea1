import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { readFileSync, writeFileSync } from 'node:fs';
const { chromium } = pw;
const HERE = '/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/mfl';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 400)));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 200)); });

await page.goto('file:///home/user/zelda-arabic-magic-a76daea1/tools/mfl-layout-editor.html');
await page.setInputFiles('#file', `${HERE}/ItemIcon.mfl`);
await page.waitForTimeout(600);

console.log('info:', (await page.textContent('#info')).replace(/\s+/g, ' ').trim());
const paneRows = await page.$$eval('#panes tr', rs => rs.slice(1).map(r =>
  [...r.querySelectorAll('td')].map(td => td.querySelector('input') ? td.querySelector('input').value : td.textContent.trim())));
console.log('panes:');
paneRows.forEach(r => console.log('  ', r.join(' | ')));
const partRows = await page.$$eval('#parts tr', rs => rs.slice(1).map(r =>
  [...r.querySelectorAll('td')].map(td => td.querySelector('input') ? td.querySelector('input').value : td.textContent.trim())));
console.log('parts:');
partRows.forEach(r => console.log('  ', r.join(' | ')));

await page.screenshot({ path: `${HERE}/tool.png`, fullPage: true });

// Move item_icon (pane 9) by +8 in X, then save and diff.
const inputs = await page.$$('#panes tr');
const target = inputs[10]; // header + pane index 9
const xin = await target.$('input');
await xin.fill('8');
await xin.dispatchEvent('input');
await page.waitForTimeout(300);
console.log('diff:', (await page.textContent('#diff')).replace(/\s+/g, ' ').trim());

const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#save')]);
await dl.saveAs(`${HERE}/ItemIcon_edited.mfl`);
await page.screenshot({ path: `${HERE}/tool_edited.png`, fullPage: true });
await browser.close();

const a = readFileSync(`${HERE}/ItemIcon.mfl`), b = readFileSync(`${HERE}/ItemIcon_edited.mfl`);
console.log('\nsize before/after:', a.length, b.length);
const diff = [];
for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
console.log('bytes changed:', diff.length, 'at', diff.map(o => '0x' + o.toString(16).toUpperCase()).join(' '));
const paneBase = 0x20 + 9 * 68;
console.log('expected X field of pane 9 at 0x' + (paneBase + 8).toString(16).toUpperCase());
console.log('new X reads back as:', b.readFloatLE(paneBase + 8));
