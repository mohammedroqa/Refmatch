import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.REFMATCH_TEST_URL || 'http://127.0.0.1:4173';
const liveAI = process.argv.includes('--live-ai');
const scriptedAI = process.argv.includes('--scripted-ai');
const studioTransport = process.argv.includes('--studio');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/snap/bin/chromium') ? '/snap/bin/chromium' : undefined);
const artifactDir = process.env.REFMATCH_ARTIFACT_DIR || 'test-results';
await mkdir(artifactDir, { recursive: true });
const downloadsPath = resolve(artifactDir, 'downloads');
await mkdir(downloadsPath, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath, downloadsPath, args: ['--no-sandbox'] });
const errors = [], sportsRequests = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/figshare\.com/.test(request.url())) sportsRequests.push(request.url()); });
const waitFor = async (fn, message, timeout = 10000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(message);
};
const top = () => page.locator('.ranked-row .ranked-identity strong').first().innerText();
const included = id => page.locator(`#availability-list input[data-referee="${id}"]`);
const check = async (label, fn) => { await fn(); console.log(`PASS ${label}`); };
const submit = async text => {
  await page.locator('#assistant-input').fill(text);
  await page.locator('#assistant-input').press('Enter');
  await waitFor(() => page.locator('#assistant-input').isEnabled(), 'Assistant response did not finish', 70000);
};
const lead = 'r384965', second = 'r385909', thin = 'r385720';
try {
  await check('Home → real historical fixture → calculated recommendation', async () => {
    await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.candidate-identity strong').first().innerText(), 'Michael Oliver');
    await page.locator('#exclude-leading').check();
    assert.equal(await page.locator('.candidate-identity strong').first().innerText(), 'Mike Dean');
    await page.locator('#exclude-leading').uncheck();
    await page.goto(base + '/demo/historical.html');
    await page.locator('.ranked-row').first().waitFor();
    assert.equal(await top(), 'Michael Oliver');
    assert.equal(await page.locator('#fixture-select option').count(), 380);
    assert.equal(await page.locator('#availability-list input').count(), 21);
    assert.equal(await page.locator('.risk-card').count(), 4);
    assert.match(await page.locator('#data-provenance').innerText(), /380 real matches.*20 teams.*21 referees/);
    assert.match(await page.locator('#fixture-evidence').innerText(), /2018-02-10.*260 earlier league matches/);
    assert.match(await page.locator('#team-profiles').innerText(), /Tottenham Hotspur.*26 earlier league matches/s);
    assert.match(await page.locator('#detail-panel').innerText(), /Conflict status: unknown/i);
  });
  await check('Real comparison cards, sample requirements and traceable history', async () => {
    assert.match(await page.locator('#comparison-summary').innerText(), /6 fit points/);
    assert.equal(await page.locator('#comparison-factors tbody tr').count(), 7);
    await page.getByText('Inspect the five most recent source matches', { exact: true }).click();
    assert.equal(await page.locator('.history-evidence li').count(), 5);
    await page.selectOption('#compare-right', thin);
    assert.match(await page.locator('#comparison-summary').innerText(), /earlier league appointments/);
    assert.equal(await page.locator('#comparison-cards .is-excluded .detail-score').innerText(), '—');
    await page.selectOption('#compare-right', second);
  });
  await check('Scenario exclusion, before/after and undo', async () => {
    await included(lead).uncheck();
    assert.equal(await top(), 'Mike Dean');
    assert.match(await page.locator('#change-summary').innerText(), /Michael Oliver led at 88%.*Mike Dean leads at 82%/);
    assert.match(await page.locator('#comparison-cards').innerText(), /actual availability is unknown/);
    await page.getByRole('button', { name: 'Undo change', exact: true }).click();
    assert.equal(await top(), 'Michael Oliver');
  });
  await check('Team behaviour, table stakes, and earlier referees', async () => {
    assert.deepEqual(await page.locator('.team-card .team-facts strong').allTextContents(), ['#5', '49', '26', '+27', '#6', '45', '26', '+16']);
    assert.match(await page.locator('#match-brief').innerText(), /Matchweek 27.*Mid-season/is);
    assert.match(await page.locator('#head-to-head').innerText(), /Arsenal 2–0 Tottenham Hotspur.*Mike Dean/s);
    await page.locator('.team-history summary').first().click();
    assert.match(await page.locator('.team-history').first().innerText(), /Referee: Not recorded in source/);
    assert.equal(await page.locator('#league-table tbody tr').count(), 20);
    assert.equal(await page.locator('#league-table .selected-team').count(), 2);
    assert.match(await page.locator('#fixture-evidence').innerText(), /target result and actual appointed referee are withheld/);
  });
  await check('Draft assignment, evidence download, and invalidation', async () => {
    await page.locator(`.ranked-row[data-referee="${lead}"]`).click();
    await page.locator('#propose-referee').click();
    assert.match(await page.locator('#proposal-summary').innerText(), /Draft proposal: Michael Oliver/);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#download-proposal').click();
    const download = await downloadPromise;
    const report = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.equal(report.proposal.refereeId, lead);
    assert.equal(report.evidence.cutoff, '2018-02-10T00:00:00Z');
    assert.equal(report.operationalStatus.availability, 'unknown');
    assert.equal('score' in report.fixture, false);
    assert.equal('refereeId' in report.fixture, false);
    await included(lead).uncheck();
    assert.match(await page.locator('#proposal-summary').innerText(), /No referee proposed/);
    assert.ok(await page.locator('#download-proposal').isDisabled());
    await page.getByRole('button', { name: 'Undo change', exact: true }).click();
  });
  await check('Plan the next meeting from an earlier date and preserve valid plans on errors', async () => {
    await page.locator('.meeting-finder summary').click();
    await page.selectOption('#planning-first', 't1624');
    await page.selectOption('#planning-second', 't1609');
    await page.locator('#planning-date').fill('2018-02-01');
    await page.getByRole('button', { name: 'Find next meeting', exact: true }).click();
    assert.equal(await page.locator('#fixture-select').inputValue(), 'm2499987');
    assert.match(await page.locator('#fixture-evidence').innerText(), /2018-02-01.*250 earlier league matches/);
    assert.deepEqual(await page.locator('.team-card .team-facts strong').allTextContents(), ['#5', '48', '25', '+27', '#6', '42', '25', '+12']);
    await page.locator('#planning-date').fill('2018-05-13');
    await page.getByRole('button', { name: 'Find next meeting', exact: true }).click();
    assert.match(await page.locator('#planning-error').innerText(), /No next meeting/);
    assert.match(await page.locator('#fixture-evidence').innerText(), /2018-02-01.*250 earlier league matches/);
    await page.selectOption('#fixture-select', 'm2499987');
    await page.locator('.meeting-finder summary').click();
  });
  await check('Fixture isolation, withheld target outcome, and insufficient early-season history', async () => {
    await included(lead).uncheck();
    await page.selectOption('#fixture-select', 'm2499830');
    assert.equal(await top(), 'Martin Atkinson');
    assert.ok(await included(lead).isChecked());
    await page.selectOption('#fixture-select', 'm2499975');
    assert.match(await page.locator('#fixture-evidence').innerText(), /actual appointed referee are withheld/);
    await page.selectOption('#fixture-select', 'm2499719');
    assert.equal(await page.locator('.ranked-row').count(), 0);
    assert.match(await page.locator('#detail-panel').innerText(), /No recommendation/);
    assert.ok(await page.locator('#propose-referee').isDisabled());
    assert.deepEqual(await page.locator('.risk-card-top strong').allTextContents(), ['—', '—', '—', '—']);
    await page.selectOption('#fixture-select', 'm2499987');
    assert.equal(await top(), 'Mike Dean');
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
  });
  await check('Empty candidate pool and reset', async () => {
    for (const input of await page.locator('#availability-list input').all()) await input.uncheck();
    assert.equal(await page.locator('.ranked-row').count(), 0);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    assert.equal(await top(), 'Michael Oliver');
  });
  if (liveAI || scriptedAI) {
    await waitFor(() => page.locator('#assistant-input').isEnabled(), 'Assistant did not connect', 20000);
    await check(`${liveAI ? 'Live' : 'Scripted'} comparison with real referee names`, async () => {
      await submit('Compare Michael Oliver and Mike Dean for this fixture. Why does Oliver lead?');
      assert.equal(await page.locator('.chat-error').count(), 0);
      assert.ok(await page.locator('.chat-tool').count() >= 1);
      assert.match(await page.locator('.assistant-message').last().innerText(), /Oliver|88|Dean/);
      assert.equal(await page.locator('#compare-left').inputValue(), lead);
      assert.equal(await page.locator('#compare-right').inputValue(), second);
    });
    await check(`${liveAI ? 'Live' : 'Scripted'} conversational exclusion → real-data result`, async () => {
      await submit('Exclude Michael Oliver from this hypothetical scenario and show what changed.');
      assert.equal(await page.locator('.chat-error').count(), 0);
      assert.equal(await top(), 'Mike Dean');
      assert.equal(await included(lead).isChecked(), false);
      assert.match(await page.locator('.assistant-message').last().innerText(), /Dean|82/);
      await page.locator('#compare-title').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${artifactDir}/release-comparison.png` });
    });
    if (liveAI) await check('Live assistant searches and switches historical fixtures', async () => {
      await submit('Switch to Arsenal vs Tottenham Hotspur on 2017-11-18.');
      assert.equal(await page.locator('.chat-error').count(), 0);
      assert.equal(await page.locator('#fixture-select').inputValue(), 'm2499830');
      assert.match(await page.locator('#fixture-evidence').innerText(), /110 earlier league matches/);
      await page.selectOption('#fixture-select', 'm2499987');
    });
    await check('Assistant service failure preserves working manual controls', async () => {
      await page.route('**/api/copilotkit/agent/*/run', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Test service interruption"}' }));
      await submit('Explain the current recommendation.');
      assert.ok(await page.locator('.chat-error').count() > 0);
      await page.getByRole('button', { name: 'Reset', exact: true }).click();
      assert.equal(await top(), 'Michael Oliver');
      await page.unroute('**/api/copilotkit/agent/*/run');
    });
    if (scriptedAI) {
      await check('Assistant retries after a failed response', async () => {
        const count = await page.locator('.chat-error').count();
        await submit('Explain the current recommendation.');
        assert.equal(await page.locator('.chat-error').count(), count);
        assert.match(await page.locator('.assistant-message').last().innerText(), /Michael Oliver.*88/);
      });
      await check('Stop prevents a delayed candidate change', async () => {
        await page.locator('#assistant-input').fill('Slow request: exclude Michael Oliver.');
        await page.locator('#assistant-input').press('Enter');
        await page.getByRole('button', { name: 'Stop', exact: true }).click();
        await waitFor(() => page.locator('#assistant-input').isEnabled(), 'Stopped request stayed busy');
        await new Promise(resolve => setTimeout(resolve, 1800));
        assert.equal(await top(), 'Michael Oliver');
      });
      await check('A changed fixture rejects an in-flight stale action', async () => {
        await page.locator('#assistant-input').fill('Slow request: exclude Michael Oliver.');
        await page.locator('#assistant-input').press('Enter');
        await page.selectOption('#fixture-select', 'm2499830');
        await waitFor(() => page.locator('#assistant-input').isEnabled(), 'Stale request did not finish');
        assert.ok(await included(lead).isChecked());
        assert.match(await page.locator('.assistant-message').last().innerText(), /changed during this request/);
        await page.selectOption('#fixture-select', 'm2499987');
      });
      if (studioTransport) {
        await check('Studio sign-in requirement preserves the ranking', async () => {
          await submit('Simulate required sign-in');
          assert.match(await page.locator('.chat-error').last().innerText(), /requires user sign-in/);
          assert.equal(await top(), 'Michael Oliver');
        });
        await check('Invalid Studio response makes no scenario changes', async () => {
          await submit('Simulate invalid agent response');
          assert.match(await page.locator('.chat-error').last().innerText(), /without a valid RefMatch action/);
          assert.equal(await top(), 'Michael Oliver');
        });
      }
    }
  }
  await check('Snapshot-only sports data and protected server files', async () => {
    assert.deepEqual(sportsRequests, []);
    for (const path of ['/.env', '/.env.example', '/scripts/copilot-runtime.mjs', '/node_modules/openai/package.json']) assert.equal((await page.request.get(base + path)).status(), 404);
    assert.equal((await page.request.get(base + '/api/assistant-status', { headers: { Origin: 'https://example.com' } })).status(), 403);
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${artifactDir}/release-desktop.png`, fullPage: true });
  await check('Mobile layout, keyboard interaction and offline chat', async () => {
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    mobile.on('pageerror', error => errors.push(error.message));
    await mobile.route('**/api/assistant-status', route => route.fulfill({ json: { available: false } }));
    await mobile.goto(base + '/demo/historical.html', { waitUntil: 'networkidle' });
    assert.match(await mobile.locator('#assistant-status').innerText(), /Assistant offline/);
    assert.equal(await mobile.locator('#assistant-input').isDisabled(), true);
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await mobile.selectOption('#compare-right', thin);
    assert.match(await mobile.locator('#comparison-summary').innerText(), /earlier league appointments/);
    await mobile.locator(`#availability-list input[data-referee="${lead}"]`).focus();
    await mobile.keyboard.press('Space');
    assert.match(await mobile.locator('.ranked-row').first().innerText(), /Mike Dean/);
    await mobile.screenshot({ path: `${artifactDir}/release-mobile.png`, fullPage: true });
    await mobile.close();
  });
  assert.deepEqual(errors, [], 'Browser JavaScript errors');
  console.log(`Historical-data browser checks passed${liveAI ? ' with live Gemini calls' : scriptedAI ? ' with simulated provider responses' : ''}.`);
} finally { await browser.close(); }
