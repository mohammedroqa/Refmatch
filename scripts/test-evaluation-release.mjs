import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const base = process.env.REFMATCH_TEST_URL || "http://127.0.0.1:4173";
await mkdir("test-results/evaluation-v2", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
const upload = (name, value) => ({
  name,
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify(value)),
});
async function run(page) {
  await page.locator("#run-batch").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#run-status").textContent.startsWith("Finished"),
    {},
    { timeout: 60000 },
  );
}
async function download(page, id) {
  const pending = page.waitForEvent("download");
  await page.locator("#" + id).click();
  const file = await pending;
  assert.equal(await file.failure(), null);
  return JSON.parse(await readFile(await file.path(), "utf8"));
}
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/demo/eval.html", { waitUntil: "networkidle" });
  assert.match(await page.locator("#reference-status").innerText(), /136\/136/);
  await run(page);
  let summary = JSON.parse(await page.locator("#metrics-json").textContent());
  assert.equal(summary.selectedTrial.endToEndAccuracy.value, 1);
  assert.equal(summary.selectedTrial.unsafeClearance.value, 0);
  const report = await download(page, "export-report");
  assert.equal(report.source, "simulation");
  assert.equal(report.attempts.length, report.caseIds.length);
  await page
    .locator("#import-file")
    .setInputFiles(upload("duplicate.json", report));
  await page.locator("#error").waitFor();
  assert.match(await page.locator("#error").innerText(), /already present/);
  assert.equal(await page.locator("#batch-select option").count(), 1);
  const tampered = structuredClone(report);
  tampered.id = "tampered";
  tampered.attempts[0].packetHash = "0".repeat(64);
  await page
    .locator("#import-file")
    .setInputFiles(upload("tampered.json", tampered));
  await page.waitForFunction(() =>
    document.querySelector("#error").textContent.includes("hash mismatch"),
  );
  assert.equal(await page.locator("#batch-select option").count(), 1);
  await page.locator("#stage").selectOption("evidence");
  await page.locator("#split").selectOption("validation");
  await page.locator("#profile").selectOption("overconfident");
  await run(page);
  summary = JSON.parse(await page.locator("#metrics-json").textContent());
  assert.ok(summary.selectedTrial.unknownClearance.numerator > 0);
  assert.ok(summary.selectedTrial.extraction.value < 1);
  await page.locator("#failure-filter").selectOption("unsafe");
  await page.locator("#attempts button").first().click();
  assert.match(
    await page.locator("#stage-diagnosis").innerText(),
    /Extraction differs/,
  );
  assert.match(await page.locator("#evidence").innerText(), /note-latest/);
  await page.locator("#profile").selectOption("reference");
  await run(page);
  summary = JSON.parse(await page.locator("#metrics-json").textContent());
  assert.equal(summary.selectedTrial.extraction.value, 1);
  assert.equal(summary.selectedTrial.citations.value, 1);
  assert.equal(summary.selectedTrial.downstream.value, 1);
  const blind = await download(page, "export-blind");
  assert.equal(blind.cases.length, 136);
  assert.ok(
    blind.cases.every((c) => !c.expected && !c.title && !c.expectedFacts),
  );
  await page.locator("#case-select").selectOption({ index: 0 });
  async function review(name, role, verdict, categories) {
    await page.locator("#reviewer").fill(name);
    await page.locator("#review-role").selectOption(role);
    await page.locator("#review-verdict").selectOption(verdict);
    await page.locator("#review-categories").selectOption(categories);
    await page
      .locator("#review-notes")
      .fill("Isolated browser test: checked the case and recorded a review.");
    await page.locator("#review-independent").check();
    await page.locator("#review-form button").click();
  }
  await review("Domain reviewer", "domain", "valid", []);
  await review("Technical reviewer", "technical", "invalid", ["notes"]);
  assert.match(
    await page.locator("#review-status").innerText(),
    /third reviewer/,
  );
  await review("Third reviewer", "adjudicator", "valid", []);
  assert.match(
    await page.locator("#review-status").innerText(),
    /adjudication retained/,
  );
  const reviews = await download(page, "export-reviews");
  assert.equal(reviews.reviews.length, 3);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("#batch-select option").count(), 3);
  assert.match(
    await page.locator("#review-status").innerText(),
    /adjudication retained/,
  );
  await page.locator("#stage").selectOption("audit");
  await page.locator("#run-batch").click();
  await page.locator("#stop").click();
  await page.waitForFunction(() =>
    document.querySelector("#run-status").textContent.startsWith("Stopped"),
  );
  summary = JSON.parse(await page.locator("#metrics-json").textContent());
  assert.ok(summary.selectedTrial.unrun > 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS complete batches, scoring, extraction, failure explorer, imports, review/adjudication, persistence and cancellation",
  );
  results.push({ workflow: "full", passed: true });
  await context.close();
  // Reimport the exported report into a fresh browser, preserving simulation provenance.
  const fresh = await browser.newContext();
  const imported = await fresh.newPage();
  await imported.goto(base + "/demo/eval.html");
  await imported
    .locator("#import-file")
    .setInputFiles(upload("batch.json", report));
  await imported.waitForFunction(() =>
    document.querySelector("#batch-meta").textContent.includes("SIMULATED"),
  );
  await imported
    .locator("#import-reviews")
    .setInputFiles(upload("reviews.json", reviews));
  await imported.waitForFunction(() =>
    document
      .querySelector("#review-status")
      .textContent.includes("adjudication retained"),
  );
  await fresh.close();
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      isMobile: width < 768,
      hasTouch: width < 1024,
    });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + "/demo/eval.html", { waitUntil: "networkidle" });
    await p.locator("#stage").selectOption("evidence");
    await run(p);
    assert.ok(
      (await p.evaluate(() => document.documentElement.scrollWidth)) <=
        width + 1,
      `${width}px overflow`,
    );
    await p
      .locator("#case-input")
      .evaluate((e) => (e.closest("details").open = true));
    await p.locator("#case-input").focus();
    await p.keyboard.press("ArrowDown");
    const r = await download(p, "export-report");
    assert.ok(r.attempts.length > 0);
    assert.equal(r.source, "simulation");
    await p.evaluate(() => scrollTo(0, 0));
    await p.screenshot({
      path: `test-results/evaluation-v2/${width}.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    results.push({ width, passed: true });
    console.log(
      `PASS ${width}px touch/keyboard, simulation, export, no overflow or script errors`,
    );
    await ctx.close();
  }
} finally {
  await browser.close();
  await writeFile(
    "test-results/evaluation-v2/results.json",
    JSON.stringify(results, null, 2),
  );
}
