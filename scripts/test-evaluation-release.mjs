import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const base = process.env.REFMATCH_TEST_URL || 'http://127.0.0.1:4175';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
const results = [];
try {
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 1024 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/demo/eval.html', { waitUntil: 'networkidle' });
    await page.locator('#check-corpus').click();
    assert.match(await page.locator('#reference-status').innerText(), /30/);
    assert.equal(await page.locator('#run-case').isDisabled(), true);
    await page.locator('#simulate-all').click();
    await page.waitForFunction(() => document.querySelector('#simulation-status').textContent.includes('Simulation complete'), {}, { timeout: 30000 });
    assert.equal(await page.locator('#attempts tr').count(), 120);
    assert.match(await page.locator('#simulation-status').innerText(), /zero API calls or credits/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= width + 1, `${width}px overflow`);
    const downloading = page.waitForEvent('download');
    await page.locator('#export-report').click();
    const download = await downloading;
    const report = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.equal(report.rows.length, 120);
    assert.ok(report.rows.every(row => row.simulation?.isSimulation));
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#attempts tr').count(), 120);
    await page.locator('#clear-results').click();
    assert.equal(await page.locator('#attempts tr').count(), 0);
    await page.locator('#import-file').setInputFiles({ name: 'report.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(report)) });
    await page.waitForFunction(() => document.querySelectorAll('#attempts tr').length === 120);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `test-results/evaluation-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    results.push({ width, passed: true, simulatedAttempts: 120 });
    console.log(`PASS Evaluation Lab ${width}px: reference checks, 120 simulations, export, persistence, clear and import`);
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile('test-results/evaluation-release.json', JSON.stringify(results, null, 2));
}
