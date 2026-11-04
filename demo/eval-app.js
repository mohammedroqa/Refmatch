import { RULESET } from "./eval/rules.js";
import { checkCorpus, validatePlan } from "./eval/validator.js";
import { categories } from "./eval/contract.js";
import {
  VERSION,
  canonical,
  digest,
  modelPacket,
  createBatch,
  addAttempt,
  importBatch,
  blindReviewPacket,
  validateReview,
  reviewState,
  evidenceScore,
} from "./eval/protocol.js";
import { summarizeBatch } from "./eval/metrics.js";
import { simulate, PROFILES } from "./eval/simulation.js";
const $ = (id) => document.getElementById(id),
  pretty = (v) => JSON.stringify(v, null, 2),
  STORE = "refmatch-evals-v2";
let corpus,
  batches = [],
  reviews = [],
  models = [],
  running = false,
  controller,
  datasetHash;
const node = (tag, text, cls) => {
  const n = document.createElement(tag);
  n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
function error(e) {
  $("error").textContent = e.message || String(e);
  $("error").hidden = false;
}
function on(id, event, fn) {
  $(id).addEventListener(event, async (e) => {
    try {
      $("error").hidden = true;
      await fn(e);
    } catch (e) {
      error(e);
    }
  });
}
function save() {
  try {
    localStorage.setItem(
      STORE,
      JSON.stringify({ datasetHash, batches, reviews }),
    );
    $("storage-status").textContent =
      "Saved in this browser. Download reports and reviews for an external record.";
  } catch {
    $("storage-status").textContent =
      "Browser storage is unavailable or full. Download your reports before leaving.";
  }
}
function download(name, value, type = "application/json") {
  const url = URL.createObjectURL(
    new Blob([typeof value === "string" ? value : pretty(value)], { type }),
  );
  const a = node("a", "");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const current = () => batches.find((b) => b.id === $("batch-select").value);
const selectedCase = () =>
  corpus.cases.find((c) => c.id === $("case-select").value) || corpus.cases[0];
const trial = () => Number($("trial-select").value || 1);
function option(select, value, label) {
  const o = node("option", label);
  o.value = value;
  select.append(o);
}
const label = (v) => v.replaceAll("_", " ");
const percent = (m) =>
  m?.value == null ? "—" : (m.value * 100).toFixed(1) + "%";
const fraction = (m) => `${m.numerator}/${m.denominator}`;
const interval = (v) =>
  v
    ? `${(100 * v[0]).toFixed(1)}–${(100 * v[1]).toFixed(1)}%`
    : "Not estimable";
const sourceLabel = (b) =>
  b.source === "simulation"
    ? "SIMULATED"
    : b.source === "imported"
      ? "IMPORTED · user-supplied"
      : "LIVE · local provider";
function updateControls() {
  const live = $("mode").value === "live";
  $("profile-label").hidden = live;
  $("provider-label").hidden = !live;
  $("run-batch").textContent = live ? "Run live batch" : "Run simulation batch";
  for (const e of $("batch-form").querySelectorAll("input,select,button"))
    e.disabled = running;
  $("stop").disabled = false;
  $("stop").hidden = !running;
  $("run-batch").disabled =
    running || (live && !models.some((m) => m.available));
  for (const id of [
    "import-file",
    "import-reviews",
    "batch-select",
    "trial-select",
  ])
    $(id).disabled = running;
}
function renderBatchOptions(id = current()?.id) {
  $("batch-select").replaceChildren();
  if (!batches.length) option($("batch-select"), "", "No batches yet");
  for (const b of batches)
    option(
      $("batch-select"),
      b.id,
      `${sourceLabel(b)} · ${b.settings.model} · ${b.split} / ${b.settings.stage} · ${b.id.slice(0, 6)}`,
    );
  if (id) $("batch-select").value = id;
  const b = current();
  const old = trial();
  $("trial-select").replaceChildren();
  for (let i = 1; i <= (b?.settings.trials || 1); i++)
    option($("trial-select"), i, `Trial ${i}`);
  $("trial-select").value = String(Math.min(old, b?.settings.trials || 1));
}
function metric(title, m, detail) {
  const div = node("div", "", "metric");
  div.append(
    node("span", title),
    node("strong", percent(m)),
    node("small", `${fraction(m)} · ${detail}`),
  );
  return div;
}
function renderResults() {
  const b = current(),
    out = $("results");
  out.replaceChildren();
  $("attempts").replaceChildren();
  $("batch-comparison").replaceChildren();
  $("export-report").disabled = !b;
  $("export-csv").disabled = !b;
  if (!b) {
    out.append(
      node(
        "p",
        "Run a simulation or import a validated batch to explore results.",
        "empty",
      ),
    );
    $("batch-meta").textContent = "";
    $("metrics-json").textContent = "No results.";
    return;
  }
  const m = summarizeBatch(b, corpus, trial());
  $("batch-meta").textContent =
    `${sourceLabel(b)} · ${b.id} · ${b.caseIds.length} frozen cases × ${b.settings.trials} trials · ${b.settings.model} · temperature ${b.settings.temperature} · max output ${b.settings.maxOutputTokens} · prompt ${b.settings.promptVersion}`;
  if (b.source === "simulation")
    out.append(
      node(
        "p",
        "SIMULATED — Reference-assisted scripted outputs. No provider calls, measured latency or model performance.",
        "status-badge",
      ),
    );
  const grid = node("div", "", "metrics");
  grid.append(
    metric(
      "Unsafe clearance",
      m.unsafeClearance,
      "invalid or unresolved labelled valid",
    ),
    metric(
      "Unresolved checks cleared",
      m.unknownClearance,
      "unknown reference labelled valid",
    ),
    metric(
      "Invalid plans cleared",
      m.invalidClearance,
      "invalid reference labelled valid",
    ),
    metric(
      "End-to-end accuracy",
      m.endToEndAccuracy,
      "all planned cases, including errors and unrun",
    ),
    metric(
      "Paired-case consistency",
      m.pairedConsistency,
      "complete pairs with both verdicts correct",
    ),
    metric(
      "Variant consistency",
      m.invariance,
      "complete groups with all verdicts correct",
    ),
  );
  if (b.settings.stage === "evidence")
    grid.append(
      metric("Extracted status match", m.extraction, "exact fact set"),
      metric(
        "Supporting citation match",
        m.citations,
        "facts and supporting source IDs",
      ),
      metric(
        "Audit from extracted facts",
        m.downstream,
        "deterministic verdict matches reference",
      ),
    );
  out.append(
    grid,
    node(
      "p",
      `Coverage: ${m.completed} completed, ${m.errors} errors, ${m.unrun} unrun / ${m.planned} planned. ${m.families} families. A low unsafe-clearance rate with incomplete coverage does not establish reliability.`,
    ),
    node(
      "p",
      `Descriptive family-bootstrap 95% intervals: unsafe clearance ${interval(m.unsafeInterval)}; end-to-end accuracy ${interval(m.accuracyInterval)}. Brier score ${m.brier?.toFixed(3) ?? "—"}. ${m.calibrationNote}`,
    ),
  );
  $("metrics-json").textContent = pretty({
    selectedTrial: m,
    otherTrials: Array.from({ length: b.settings.trials }, (_, i) => ({
      trial: i + 1,
      ...summarizeBatch(b, corpus, i + 1),
    })),
  });
  const filter = $("failure-filter").value;
  for (const id of b.caseIds) {
    const c = corpus.cases.find((c) => c.id === id),
      a = b.attempts.find((a) => a.caseId === id && a.trial === trial());
    if (filter === "failures" && !m.failures.includes(id)) continue;
    if (
      filter === "unsafe" &&
      !(c.expected.verdict !== "valid" && a?.prediction?.verdict === "valid")
    )
      continue;
    const tr = node("tr", "");
    tr.append(
      node("td", `${id}\n${c.familyId}`),
      node("td", label(c.expected.verdict)),
      node(
        "td",
        a?.status === "completed"
          ? label(a.prediction.verdict)
          : a?.status || "unrun",
      ),
    );
    const td = node("td", ""),
      button = node("button", "Inspect");
    button.addEventListener("click", () => {
      $("case-select").value = id;
      renderCase();
      $("case-heading").scrollIntoView();
    });
    td.append(button);
    tr.append(td);
    $("attempts").append(tr);
  }
  if (!$("attempts").children.length) {
    const tr = node("tr", ""),
      td = node("td", "No cases match this filter.");
    td.colSpan = 4;
    tr.append(td);
    $("attempts").append(tr);
  }
  const table = node("table", ""),
    head = node("tr", "");
  for (const t of [
    "Batch / source",
    "Coverage",
    "Unsafe clearance",
    "Accuracy",
    "Settings",
  ])
    head.append(node("th", t));
  table.append(head);
  for (const other of batches.filter(
    (x) =>
      x.datasetHash === b.datasetHash &&
      x.split === b.split &&
      x.settings.stage === b.settings.stage &&
      x.settings.trials === b.settings.trials,
  )) {
    const score = summarizeBatch(other, corpus, trial()),
      tr = node("tr", "");
    for (const v of [
      `${sourceLabel(other)} ${other.id.slice(0, 6)}`,
      `${score.completed}/${score.planned}`,
      `${percent(score.unsafeClearance)} (${fraction(score.unsafeClearance)})`,
      percent(score.endToEndAccuracy),
      `${other.settings.model}; temp ${other.settings.temperature}; ${other.settings.maxOutputTokens} tokens`,
    ])
      tr.append(node("td", v));
    table.append(tr);
  }
  $("batch-comparison").append(table);
}
function diff(a, b, path = "") {
  if (canonical(a) === canonical(b)) return [];
  if (!a || !b || typeof a !== "object" || typeof b !== "object")
    return [{ path, before: a, after: b }];
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) =>
    diff(a[k], b[k], `${path}/${k}`),
  );
}
function renderCase() {
  const c = selectedCase(),
    b = current(),
    a = b?.attempts.find((a) => a.caseId === c.id && a.trial === trial()),
    stage = b?.settings.stage || $("stage").value;
  $("case-meta").textContent =
    `${c.id} · ${c.familyId} · ${c.split} · ${c.input.fixtures.length} fixtures / ${c.input.referees.length} referees`;
  $("case-input").textContent = pretty(modelPacket(c, stage));
  $("evidence").replaceChildren();
  for (const source of c.sourceNotes || []) {
    const div = node("div", "", "source");
    div.append(
      node("small", `${source.id} · ${source.recordedAt}`),
      node("p", source.text),
    );
    $("evidence").append(div);
  }
  if (!c.sourceNotes?.length)
    $("evidence").append(
      node(
        "p",
        "This case isolates structured rule checks. Relevant fixture/referee IDs and evidence records appear in the findings and model input.",
      ),
    );
  const audit = validatePlan(c.input);
  $("reference-verdict").textContent =
    `Authored reference: ${label(c.expected.verdict)} · categories: ${c.expected.categories.join(", ") || "none"}`;
  $("findings").replaceChildren();
  for (const [status, findings] of [
    ["Violation", audit.violations],
    ["Unresolved", audit.unresolved],
  ])
    for (const f of findings)
      $("findings").append(
        node("li", `${status} · ${f.rule} · ${f.subject}: ${f.detail}`),
      );
  if (!audit.violations.length && !audit.unresolved.length)
    $("findings").append(
      node(
        "li",
        "All required checks clear under the supplied experimental rules.",
      ),
    );
  $("model-response").textContent = a?.prediction
    ? pretty({
        prediction: a.prediction,
        rawResponse: a.rawResponse,
        expectedFacts: stage === "evidence" ? c.expectedFacts : undefined,
      })
    : a?.error || "No response for this case in the selected batch/trial.";
  $("stage-diagnosis").textContent =
    a?.prediction && stage === "evidence"
      ? (() => {
          const e = evidenceScore(c, a.prediction);
          return `Extraction ${e.exact ? "matches" : "differs from"} reference; citations ${e.citations ? "match" : "differ"}. Deterministic verdict from extracted facts: ${label(e.downstreamVerdict)}. Model rule reasoning ${e.reasoningAgreesWithExtracted ? "agrees" : "disagrees"} with that verdict.`;
        })()
      : "Rule audit supplies reference facts, isolating rule application from evidence reading.";
  const paired = corpus.cases.filter(
    (x) =>
      x.id !== c.id &&
      ((c.pairId && x.pairId === c.pairId) ||
        x.invarianceId === c.invarianceId),
  );
  $("paired-cases").replaceChildren();
  for (const peer of paired) {
    const button = node(
      "button",
      peer.pairId && peer.pairId === c.pairId
        ? "Inspect paired change"
        : `Inspect ${peer.input.fixtures.length}-fixture variant`,
    );
    button.addEventListener("click", () => {
      $("case-select").value = peer.id;
      renderCase();
    });
    $("paired-cases").append(button);
  }
  const pair = paired.find((x) => c.pairId && x.pairId === c.pairId);
  $("pair-diff").textContent = pair
    ? pretty({ comparedWith: pair.id, changes: diff(pair.input, c.input) })
    : "No decisive-change pair for this case. Size and ordering variants remain in the same family.";
  renderReviews();
}
function renderReviews() {
  const c = selectedCase();
  $("review-status").textContent = reviewState(reviews, c).message;
  $("review-history").textContent = pretty(
    reviews.filter((r) => r.caseId === c.id),
  );
  const counts = corpus.cases.reduce((acc, c) => {
    const s = reviewState(reviews, c).state;
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  $("review-coverage").textContent =
    `Local review coverage: ${pretty(counts)}. Reference labels never change silently.`;
}
async function run(e) {
  e.preventDefault();
  if (running) return;
  const live = $("mode").value === "live",
    model = models.find((m) => m.provider === $("provider").value),
    profile = $("profile").value;
  if (live && !model?.available)
    throw new Error("Use a configured local model connection.");
  if (batches.length >= 30)
    throw new Error(
      "This browser has 30 batches. Export them before using a fresh browser profile.",
    );
  const b = await createBatch(
    corpus,
    $("split").value,
    {
      provider: live ? model.provider : "simulation",
      model: live ? model.model : profile,
      temperature: Number($("temperature").value),
      maxOutputTokens: Number($("max-tokens").value),
      promptVersion: VERSION,
      stage: $("stage").value,
      trials: Number($("trials").value),
    },
    live ? "live" : "simulation",
  );
  batches.push(b);
  renderBatchOptions(b.id);
  running = true;
  controller = new AbortController();
  updateControls();
  save();
  try {
    outer: for (let t = 1; t <= b.settings.trials; t++)
      for (const id of b.caseIds) {
        if (controller.signal.aborted) break outer;
        const c = corpus.cases.find((c) => c.id === id);
        let attempt;
        if (!live) attempt = await simulate(c, profile, b.settings.stage, t);
        else {
          const packetHash = await digest(modelPacket(c, b.settings.stage));
          attempt = {
            caseId: id,
            trial: t,
            packetHash,
            latencyMs: null,
            resolvedModel: null,
            usage: null,
            rawResponse: null,
          };
          try {
            const response = await fetch("/api/eval/run", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ caseId: id, settings: b.settings }),
              signal: controller.signal,
            });
            const result = await response.json();
            if (!response.ok)
              throw new Error(result.error || "Provider request failed.");
            attempt = { ...attempt, ...result, status: "completed" };
          } catch (e) {
            attempt = {
              ...attempt,
              status: "error",
              error: e.message.slice(0, 1000),
            };
          }
        }
        await addAttempt(b, c, attempt);
        save();
        $("run-status").textContent =
          `${sourceLabel(b)} · ${b.attempts.length}/${b.caseIds.length * b.settings.trials} attempts recorded.`;
        if (b.attempts.length % 8 === 0) renderResults();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
  } finally {
    running = false;
    updateControls();
    renderResults();
    renderCase();
    $("run-status").textContent =
      `${controller.signal.aborted ? "Stopped" : "Finished"} · ${b.attempts.length}/${b.caseIds.length * b.settings.trials} attempts. ${live ? "Provider responses recorded; failed attempts are retained." : "SIMULATED: zero provider calls. No measured model performance."}`;
    controller = null;
    save();
  }
}
async function readUpload(id) {
  const file = $(id).files[0];
  if (!file) return null;
  if (file.size > 10000000) throw new Error("Maximum import size is 10 MB.");
  const value = JSON.parse(await file.text());
  $(id).value = "";
  return value;
}
async function main() {
  const response = await fetch("eval/cases.json");
  if (!response.ok) throw new Error("Case dataset is unavailable.");
  corpus = await response.json();
  datasetHash = await digest(corpus);
  const checks = checkCorpus(corpus);
  if (checks.some((c) => !c.passed))
    throw new Error("Reference consistency check failed; evaluation disabled.");
  $("reference-status").textContent =
    `${checks.length}/${checks.length} authored references agree with the deterministic validator. This does not establish model accuracy or expert sign-off.`;
  $("dataset-summary").textContent =
    `${corpus.cases.length} synthetic cases · ${new Set(corpus.cases.map((c) => c.familyId)).size} families · 3, 6, 10 and 16 fixtures · ${corpus.cases.filter((c) => c.sourceNotes.length).length} evidence-reading cases. ${corpus.splitPolicy}`;
  for (const split of ["development", "validation"]) {
    const cs = corpus.cases.filter((c) => c.split === split);
    $(split + "-count").textContent =
      `${cs.length} cases / ${new Set(cs.map((c) => c.familyId)).size} families`;
  }
  $("policy").textContent = RULESET.decisionPolicy;
  for (const r of RULESET.rules)
    $("rules").append(node("li", `${r.title}: ${r.description}`));
  for (const c of corpus.cases)
    option($("case-select"), c.id, c.title + " · " + c.id);
  for (const r of categories) option($("review-categories"), r, r);
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (saved && saved.datasetHash === datasetHash) {
      for (const b of (saved.batches || []).slice(0, 30)) {
        const checked = await importBatch(b, corpus);
        checked.source = b.source === "simulation" ? "simulation" : "imported";
        if (!batches.some((x) => x.id === checked.id)) batches.push(checked);
      }
      for (const r of saved.reviews || [])
        reviews.push(await validateReview(r, corpus));
    } else if (saved)
      $("storage-status").textContent =
        "A different dataset was saved. Starting a new version without reusing its results.";
  } catch {
    $("storage-status").textContent =
      "Some saved records could not be validated. Export verified records before leaving.";
  }
  if (document.documentElement.dataset.deployment !== "static")
    try {
      const r = await fetch("/api/eval/status");
      if (r.ok) models = (await r.json()).models;
    } catch {}
  for (const m of models.filter((m) => m.available))
    option($("provider"), m.provider, `${m.provider} · ${m.model}`);
  $("backend-status").textContent = models.some((m) => m.available)
    ? "Configured provider connections are available for explicitly started live batches. Charges may apply."
    : "Simulation is available here. Live runs use the local runner with your configured provider account.";
  renderBatchOptions(batches.at(-1)?.id);
  renderResults();
  renderCase();
  updateControls();
  on("batch-form", "submit", run);
  on("mode", "change", updateControls);
  on("stage", "change", renderCase);
  on("stop", "click", () => controller?.abort());
  on("batch-select", "change", () => {
    renderBatchOptions();
    renderResults();
    renderCase();
  });
  on("trial-select", "change", () => {
    renderResults();
    renderCase();
  });
  on("case-select", "change", renderCase);
  on("failure-filter", "change", renderResults);
  on("check-corpus", "click", () => {
    $("reference-status").textContent =
      `${checkCorpus(corpus).filter((c) => c.passed).length}/${corpus.cases.length} reference checks passed; not model results.`;
  });
  on("export-report", "click", () =>
    download(`refmatch-${current().id}.json`, current()),
  );
  on("export-csv", "click", () => {
    const b = current(),
      escape = (v) =>
        '"' +
        String(v ?? "")
          .replace(/^[=+@-]/, "'")
          .replaceAll('"', '""') +
        '"';
    const rows = [
      ["batch", "source", "case", "trial", "status", "expected", "predicted"],
      ...b.attempts.map((a) => [
        b.id,
        sourceLabel(b),
        a.caseId,
        a.trial,
        a.status,
        corpus.cases.find((c) => c.id === a.caseId).expected.verdict,
        a.prediction?.verdict,
      ]),
    ];
    download(
      `refmatch-${b.id}.csv`,
      rows.map((row) => row.map(escape).join(",")).join("\n"),
      "text/csv",
    );
  });
  on("import-file", "change", async () => {
    const value = await readUpload("import-file");
    if (!value) return;
    if (batches.length >= 30) throw new Error("Batch limit reached.");
    const b = await importBatch(value, corpus);
    if (batches.some((x) => x.id === b.id))
      throw new Error(
        "This batch is already present. Duplicate imports are not counted.",
      );
    batches.push(b);
    save();
    renderBatchOptions(b.id);
    renderResults();
    renderCase();
  });
  on("export-blind", "click", async () =>
    download("refmatch-blind-review.json", await blindReviewPacket(corpus)),
  );
  on("export-reviews", "click", () =>
    download("refmatch-review-trail.json", {
      version: VERSION,
      datasetHash,
      reviews,
    }),
  );
  on("review-form", "submit", async (e) => {
    e.preventDefault();
    const c = selectedCase();
    const r = await validateReview(
      {
        caseId: c.id,
        caseHash: await digest(c),
        rulesetHash: await digest(RULESET),
        reviewer: $("reviewer").value,
        role: $("review-role").value,
        independent: $("review-independent").checked,
        verdict: $("review-verdict").value,
        categories: [...$("review-categories").selectedOptions].map(
          (o) => o.value,
        ),
        notes: $("review-notes").value,
        recordedAt: new Date().toISOString(),
      },
      corpus,
    );
    reviews.push(r);
    save();
    renderReviews();
  });
  on("import-reviews", "change", async () => {
    const value = await readUpload("import-reviews");
    if (!value) return;
    if (
      value.version !== VERSION ||
      value.datasetHash !== datasetHash ||
      !Array.isArray(value.reviews) ||
      value.reviews.length > 2000
    )
      throw new Error(
        "Review trail does not match this dataset or exceeds the limit.",
      );
    const parsed = await Promise.all(
      value.reviews.map((r) => validateReview(r, corpus)),
    );
    const seen = new Set(reviews.map(canonical));
    for (const r of parsed)
      if (!seen.has(canonical(r))) {
        reviews.push(r);
        seen.add(canonical(r));
      }
    save();
    renderReviews();
  });
}
main().catch(error);
