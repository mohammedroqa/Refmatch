import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const base=process.env.REFMATCH_TEST_URL||'http://127.0.0.1:4173';
const live=process.argv.includes('--live-ai');
await mkdir('test-results',{recursive:true});
const downloadsPath=resolve('test-results/weekly-downloads'); await mkdir(downloadsPath,{recursive:true});
const browser=await chromium.launch({headless:true,downloadsPath,executablePath:process.env.CHROMIUM_PATH||(existsSync('/snap/bin/chromium')?'/snap/bin/chromium':undefined),args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
if(!live)await context.route('**/api/assistant-status',route=>route.fulfill({json:{available:false,provider:'google'}}));
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
const check=async(name,fn)=>{await fn();console.log(`PASS ${name}`);};
const selectedNames=()=>page.locator('.fixture-bottom strong').allTextContents();
try{
  await check('Home to 2026/27 matchweek: real evidence and distinct assignments',async()=>{
    await page.goto(base);await page.getByRole('link',{name:/Open the matchweek planner/}).click();
    await page.locator('.fixture-card').first().waitFor();
    assert.equal(await page.locator('#season-select').inputValue(),'2026');
    assert.equal(await page.locator('#week-select option').count(),38);
    assert.equal(await page.locator('.fixture-card').count(),10);
    const names=await selectedNames();assert.equal(new Set(names).size,10);assert.ok(!names.includes('Unassigned'));
    assert.match(await page.locator('#source-status').innerText(),/2023-10-25.*2026-10-25/);
    assert.equal(await page.locator('#approve').isDisabled(),true);
  });
  await check('Candidate explanations, comparison and manual lock recalculate the weekly plan',async()=>{
    assert.equal(await page.locator('#team-briefs .team-card').count(),2);
    assert.equal(await page.locator('#weekly-comparison tbody tr').count(),7);
    await page.locator('#weekly-rankings .ranked-row').nth(2).click();
    const name=await page.locator('#candidate-evidence h3').innerText();
    await page.locator('#lock-referee').click();
    assert.equal(await page.locator('.fixture-card.is-selected .fixture-bottom strong').innerText(),name);
    assert.equal(new Set(await selectedNames()).size,10);
    await page.locator('#unlock-referee').click();
  });
  await check('Unavailability, conflicts and duty dates change allocation and survive reload',async()=>{
    const name=(await selectedNames())[0];
    const card=page.locator('.roster-card').filter({has:page.getByRole('heading',{name,exact:true})});
    await card.locator('[data-setting=availability]').selectOption('unavailable');
    assert.ok(!(await selectedNames()).includes(name));await page.reload();await page.locator('.fixture-card').first().waitFor();
    assert.ok(!(await selectedNames()).includes(name));
    await card.locator('[data-setting=availability]').selectOption('unknown');
    await card.locator('summary').click();
    const conflict=await page.locator('.fixture-card').first().getAttribute('data-fixture');
    const home=conflict.split(':')[1];
    await card.locator('[data-setting=conflicts]').selectOption([home]);
    await page.locator('.fixture-card').first().click();
    assert.match(await page.locator('#weekly-exclusions').textContent(),/Declared team conflict/);
    await card.locator('[data-setting=conflicts]').selectOption([]);
    await card.locator('[data-setting=commitments]').fill('2026-02-30');await card.locator('[data-setting=commitments]').press('Tab');
    assert.equal(await page.locator('#error').isVisible(),true);
    await card.locator('[data-setting=commitments]').fill('');await card.locator('[data-setting=commitments]').press('Tab');
  });
  await check('Confirm selected referees, approve locally and download full evidence',async()=>{
    for(const name of await selectedNames()){
      const card=page.locator('.roster-card').filter({has:page.getByRole('heading',{name,exact:true})});
      await card.locator('[data-setting=availability]').selectOption('available');
      await card.locator('[data-setting=cleared]').check();
    }
    assert.equal(await page.locator('#approve').isEnabled(),true);
    await page.locator('#reviewer').fill('Browser verification');await page.locator('#approve').click();
    assert.match(await page.locator('#approval-status').innerText(),/Approved locally by Browser verification/);
    const downloading=page.waitForEvent('download');await page.locator('#download-week').click();const download=await downloading;
    const report=JSON.parse(await readFile(await download.path(),'utf8'));
    assert.equal(report.approval.reviewer,'Browser verification');assert.equal(report.result.assignments.length,10);
    assert.ok(report.evidenceMatches.every(m=>m.date<report.planningDate&&m.date>=report.result.evidence.start));
    assert.equal(report.result.modelVersion,'2.0.0');assert.equal(report.rules.version,'2.0.0');assert.ok(report.sources.length>=6);
    await page.locator('#minimum-gap').fill('4');await page.locator('#minimum-gap').press('Tab');
    assert.doesNotMatch(await page.locator('#approval-status').innerText(),/Approved locally by/);
  });
  await check('Planning date changes evidence; other matchweeks and sparse histories work',async()=>{
    await page.locator('#cutoff').fill('2026-08-21');await page.locator('#cutoff').press('Tab');
    assert.match(await page.locator('#source-status').innerText(),/before 2026-08-21/);
    await page.locator('#week-select').selectOption('1');
    assert.match(await page.locator('#allocation-note').innerText(),/of 10 fixtures/);
    await page.locator('#cutoff').fill('2026-10-25');await page.locator('#cutoff').press('Tab');
    await page.locator('#week-select').selectOption('9');
  });
  await check('Mobile layout, keyboard access and protected server files',async()=>{
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('#week-select').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
    await page.screenshot({path:'test-results/weekly-mobile.png',fullPage:true});
    for(const path of ['/.env','/scripts/refresh-weekly.py','/.cache/weekly/bootstrap.json'])assert.equal((await page.request.get(base+path)).status(),404);
    const csrf=await page.request.post(base+'/api/weekly-refresh',{headers:{Origin:'https://example.com','Content-Type':'application/json'},data:{}});assert.equal(csrf.status(),403);
    await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'test-results/weekly-desktop.png',fullPage:true});
  });
  if(live)await check('Live weekly assistant uses current evidence and compares candidates',async()=>{
    await page.locator('#assistant-input').waitFor();
    await page.waitForFunction(()=>!document.querySelector('#assistant-input').disabled,{},{timeout:20000});
    await page.locator('#assistant-input').fill('Use the tools to explain the current matchweek, its evidence cutoff, and how many fixtures are assigned.');await page.locator('#assistant-input').press('Enter');
    await page.waitForFunction(()=>!document.querySelector('#assistant-input').disabled,{},{timeout:70000});
    const text=await page.locator('#assistant-messages').innerText();assert.ok(!text.includes('Connection interrupted'));assert.match(text,/2026|matchweek/i);
  });
  assert.deepEqual(errors,[]);console.log('Weekly browser verification passed.');
  await writeFile('test-results/weekly-verification.json',JSON.stringify({passed:true,liveAI:live,completedAt:new Date().toISOString()},null,2));
}catch(error){await writeFile('test-results/weekly-verification.json',JSON.stringify({passed:false,error:error.message,completedAt:new Date().toISOString()},null,2));throw error;}
finally{await browser.close();}
