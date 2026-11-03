import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.REFMATCH_TEST_URL || 'http://127.0.0.1:4173';
const directory = 'test-results/responsive';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
const results = [];
try {
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    for (const path of ['/', '/demo/', '/demo/historical.html', '/brand/', '/video/']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 1024 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      page.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(`${request.url()}: ${request.failure()?.errorText}`); });
      try {
        await page.goto(base + path, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(100);
        const layout = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth, brokenImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.src) }));
        assert.ok(layout.content <= width + 1, `Overflow at ${width}px: content ${layout.content}px, viewport ${layout.width}px`);
        assert.deepEqual(layout.brokenImages, []);
        if (path === '/demo/') {
          const today = new Date().toISOString().slice(0, 10);
          assert.equal(await page.locator('#cutoff').inputValue(), today);
          const data = await (await page.request.get(base + '/demo/weekly.snapshot.json')).json();
          const next = [...new Set(data.fixtures.map(f => f.gameweek))].sort((a,b) => a-b).find(week => data.fixtures.filter(f => f.gameweek === week).every(f => f.kickoff && f.kickoff.slice(0,10) >= today && !f.started));
          assert.equal(Number(await page.locator('#week-select').inputValue()), next);
          await page.locator('.fixture-card').nth(1).click();
          await page.locator('#weekly-rankings .ranked-row').nth(1).click();
          await page.locator('#lock-referee').click();
          const downloading = page.waitForEvent('download');
          await page.locator('#download-week').click();
          assert.equal(await (await downloading).failure(), null);
        }
        if (path === '/') {
          await page.locator('#exclude-leading').check();
          assert.equal(await page.locator('.candidate-identity strong').first().innerText(), 'Mike Dean');
          await page.locator('#exclude-leading').uncheck();
        }
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: `${directory}/${width}-${path.replaceAll('/', '_')}.png`, fullPage: true });
        assert.deepEqual(errors, []);
        results.push({ width, path, passed: true });
        console.log(`PASS ${width}px ${path}`);
      } catch (error) {
        results.push({ width, path, passed: false, error: error.message, browserErrors: errors });
        console.error(`FAIL ${width}px ${path}: ${error.message}`);
      } finally { await context.close(); }
    }
  }
} finally {
  await browser.close();
  await writeFile(`${directory}/results.json`, JSON.stringify({ base, completedAt: new Date().toISOString(), results }, null, 2));
}
assert.ok(results.every(result => result.passed), 'Responsive verification failed; see test-results/responsive/results.json');
