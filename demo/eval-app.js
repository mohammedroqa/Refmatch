import { RULESET } from "./eval/rules.js";
import { checkCorpus, validatePlan } from "./eval/validator.js";
import {
  modelPacket,
  summarizeRuns,
  HARNESS_VERSION,
} from "./eval/protocol.js";
import {
  predictionSchema,
  reviewDraftBundleSchema,
} from "../scripts/eval-contract.mjs";
import {
  createSimulationAttempt,
  isSimulation,
  SIMULATED_PROVIDERS,
  SIMULATION_DISCLOSURE,
} from "./eval/simulation.js";
const $ = (id) => document.getElementById(id);
const text = (tag, value, className) => {
  const n = document.createElement(tag);
  n.textContent = value;
  if (className) n.className = className;
  return n;
};
const pretty = (value) => JSON.stringify(value, null, 2);
const digest = async (value) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const label = (value) => value.replaceAll("_", " ");
const percent = (value) =>
  value === null ? "—" : (value * 100).toFixed(1) + "%";
const STORE = "refmatch-eval-lab-v1";
let corpus,
  datasetHash,
  rulesetHash,
  rows = [],
  reviews = {},
  aiDrafts = null,
  aiDraftError = "Loading review drafts…",
  models = [],
  running = false,
  controller,
  simulationActive = false;
const reportError = (error) => {
  $("error").textContent = error.message || String(error);
  $("error").hidden = false;
};
const on = (id, event, fn) =>
  $(id).addEventListener(event, async (e) => {
    try {
      $("error").hidden = true;
      await fn(e);
    } catch (error) {
      reportError(error);
    }
  });
const selectedCase = () =>
  corpus.cases.find((c) => c.id === $("case-select").value);
function persist() {
  try {
    localStorage.setItem(
      STORE,
      JSON.stringify({ datasetHash, rulesetHash, rows, reviews }),
    );
  } catch {
    reportError(
      new Error(
        "Browser storage is unavailable or full. Results remain in memory; download a report to retain them.",
      ),
    );
  }
}
function download(name, value, type = "application/json") {
  const blob = new Blob([typeof value === "string" ? value : pretty(value)], {
    type,
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function referenceChecks() {
  const checks = checkCorpus(corpus),
    passed = checks.filter((c) => c.passed).length;
  $("reference-status").textContent =
    passed +
    "/" +
    checks.length +
    " reference checks passed. This validates dataset consistency, not AI performance or expert review.";
  if (passed !== checks.length)
    throw new Error(
      "Reference mismatch: " +
        checks
          .filter((c) => !c.passed)
          .map((c) => c.id)
          .join(", "),
    );
}
function populateCases() {
  const previous = $("case-select").value,
    filter = $("case-filter").value;
  $("case-select").replaceChildren();
  for (const c of corpus.cases.filter(
    (c) => filter === "all" || c.expected.verdict === filter,
  )) {
    const o = text("option", c.id + " · " + c.title);
    o.value = c.id;
    $("case-select").append(o);
  }
  if ([...$("case-select").options].some((o) => o.value === previous))
    $("case-select").value = previous;
  renderCase();
}
function renderCase() {
  const c = selectedCase(),
    actual = validatePlan(c.input);
  $("case-title").textContent = c.title;
  $("case-meta").textContent =
    c.id +
    " · " +
    (c.pairId || "unpaired") +
    " · synthetic · public development · expert review pending";
  $("case-input").textContent = pretty(modelPacket(c.input));
  $("reference-verdict").textContent = label(actual.verdict);
  $("findings").replaceChildren();
  for (const finding of [...actual.violations, ...actual.unresolved])
    $("findings").append(
      text(
        "li",
        finding.rule + " / " + finding.subject + ": " + finding.detail,
      ),
    );
  if (!actual.violations.length && !actual.unresolved.length)
    $("findings").append(text("li", "All required checks clear."));
  renderReviewDraft(c);
  const review = reviews[c.id];
  $("reviewer").value = review?.reviewer || "";
  $("review-notes").value = review?.notes || "";
  $("review-outcome").value = review?.outcome || "agree";
  $("review-status").textContent = review
    ? "Local review: " +
      review.outcome +
      " · " +
      review.reviewer +
      " · " +
      review.recordedAt
    : "No local human review recorded.";
}
function renderReviewDraft(c) {
  const draft = aiDrafts?.reviews.find((r) => r.caseId === c.id);
  $("ai-review-content").replaceChildren();
  $("ai-review-status").textContent = draft
    ? "AI-assisted draft · " +
      label(draft.caseReadiness) +
      " · human sign-off pending"
    : aiDraftError;
  if (!draft) return;
  for (const [title, value] of [
    [
      "Verdict assessment",
      label(draft.reviewVerdict) +
        "; " +
        draft.labelAssessment +
        " with the current reference",
    ],
    ["Reasoning", draft.analysis],
    ["Limitation", draft.limitation],
    ["Recommended next step", draft.recommendation],
  ]) {
    $("ai-review-content").append(text("h4", title), text("p", value));
  }
}
async function loadReviewDrafts() {
  try {
    const response = await fetch("eval/review-drafts.json");
    if (!response.ok) throw new Error("Review drafts are unavailable.");
    const bundle = reviewDraftBundleSchema.parse(await response.json());
    if (
      bundle.datasetHash !== datasetHash ||
      bundle.rulesetHash !== rulesetHash ||
      bundle.reviews.length !== corpus.cases.length ||
      new Set(bundle.reviews.map((r) => r.caseId)).size !== corpus.cases.length
    )
      throw new Error(
        "Review drafts do not match the current dataset and rules.",
      );
    for (const draft of bundle.reviews) {
      const c = corpus.cases.find((c) => c.id === draft.caseId);
      if (!c || draft.caseHash !== (await digest(c)))
        throw new Error(
          "A review draft is stale or refers to an unknown case.",
        );
    }
    aiDrafts = bundle;
  } catch (error) {
    aiDraftError =
      error.name === "ZodError"
        ? "Review drafts failed validation; no draft sign-off is applied."
        : error.message;
  }
  renderReviewDraft(selectedCase());
}
function updateButtons() {
  const model = models.find((m) => m.provider === $("provider").value);
  for (const id of ["run-case", "run-all"])
    $(id).disabled = running || !model?.available;
  $("provider").disabled = running;
  $("stop").hidden = !running || simulationActive;
  $("stop-simulation").hidden = !simulationActive;
  for (const id of [
    "simulate-case",
    "simulate-provider",
    "simulate-all",
    "simulation-provider",
  ])
    $(id).disabled = running;
  for (const id of ["import-file", "clear-results"]) $(id).disabled = running;
}
async function loadModels() {
  try {
    const response = await fetch("/api/eval/status");
    if (!response.ok) throw new Error();
    const status = await response.json();
    models = status.models;
    $("backend-status").textContent = models.some((m) => m.available)
      ? "Server model connections loaded. Only configured providers can run."
      : "No model credentials are configured. Configure server keys and model IDs, then restart the preview. Reference checks and imports work now.";
  } catch {
    models = ["jev", "openai", "anthropic", "google"].map((provider) => ({
      provider,
      available: false,
      reason: "Live runs require the local RefMatch evaluation server",
    }));
    $("backend-status").textContent =
      "Static or offline mode: case inspection, reference checks, reviews and imports are available. Live model runs require the RefMatch server.";
  }
  $("provider").replaceChildren();
  for (const model of models) {
    const o = text(
      "option",
      model.provider + " · " + (model.available ? model.model : model.reason),
    );
    o.value = model.provider;
    $("provider").append(o);
  }
  const available = models.find((m) => m.available);
  if (available) $("provider").value = available.provider;
  updateButtons();
}
function grouped() {
  const groups = new Map();
  for (const row of rows) {
    const key = [
      row.provider,
      row.requestedModel,
      row.resolvedModel || "version not reported",
      row.source,
    ].join(" / ");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups].map(([name, attempts]) => ({
    name,
    isSimulation: attempts.some(isSimulation),
    metrics: summarizeRuns(attempts),
  }));
}
function renderResults() {
  $("results").replaceChildren();
  const groups = grouped();
  if (!groups.length)
    $("results").append(
      text(
        "p",
        "No model results. Reference checks are shown separately above.",
        "muted",
      ),
    );
  for (const group of groups) {
    const card = text("article", "", "score-card");
    card.append(
      text("h3", (group.isSimulation ? "SIMULATED — " : "") + group.name),
    );
    if (group.isSimulation)
      card.append(text("p", SIMULATION_DISCLOSURE, "simulation-disclosure"));
    const m = group.metrics;
    card.append(
      text(
        "p",
        m.completed +
          " completed / " +
          m.attempted +
          " attempts · " +
          m.errors +
          " errors",
        "muted",
      ),
    );
    const grid = text("div", "", "metrics");
    const metrics = [
      [
        group.isSimulation ? "Demo verdict accuracy" : "Verdict accuracy",
        percent(m.accuracy),
      ],
      ["End-to-end accuracy", percent(m.endToEndAccuracy)],
      ["Invalid plans accepted", percent(m.invalidAcceptanceRate)],
      ["Missed invalid plans", percent(m.missedViolationRate)],
      ["False alarms", percent(m.falseAlarmRate)],
      ["Category exact match", percent(m.categoryExactMatch)],
      [
        group.isSimulation
          ? "Scripted Brier (demo only)"
          : "Multiclass Brier ↓",
        m.brier === null ? "—" : m.brier.toFixed(3),
      ],
      [
        "Median latency",
        m.latencyMs.median === null ? "—" : m.latencyMs.median + " ms",
      ],
    ];
    for (const [name, value] of metrics) {
      const metric = text("div", "", "metric");
      metric.append(text("span", name), text("strong", value));
      grid.append(metric);
    }
    card.append(
      grid,
      text(
        "p",
        (group.isSimulation
          ? "Simulation only. No provider calls; provider cost $0; model latency unmeasured. "
          : "") +
          "Invalid-case denominator: " +
          m.denominators.invalid +
          "; valid-case denominator: " +
          m.denominators.valid +
          ". Estimated cost: " +
          (m.estimatedCostUsd === null
            ? "unknown"
            : "$" + m.estimatedCostUsd.toFixed(6)) +
          " (" +
          m.costedAttempts +
          "/" +
          m.attempted +
          " attempts costed).",
        "muted",
      ),
    );
    const details = text("details", "");
    details.append(
      text(
        "summary",
        "Confusion matrix, category detection and calibration bins",
      ),
      text(
        "pre",
        pretty({
          confusion: m.confusion,
          categories: m.categories,
          calibrationBins: m.calibrationBins,
          p95LatencyMs: m.latencyMs.p95,
        }),
      ),
    );
    card.append(details);
    $("results").append(card);
  }
  $("attempts").replaceChildren();
  for (const row of rows) {
    const tr = document.createElement("tr");
    const correct =
      row.status === "completed" &&
      row.expected.verdict === row.prediction.verdict;
    const cats =
      correct &&
      JSON.stringify([...row.expected.categories].sort()) ===
        JSON.stringify([...row.prediction.categories].sort());
    for (const v of [
      row.caseId,
      row.provider +
        " / " +
        (row.resolvedModel || row.requestedModel) +
        " / " +
        row.source,
      label(row.expected.verdict),
      row.prediction ? label(row.prediction.verdict) : "—",
      row.status === "error"
        ? "Error"
        : correct
          ? cats
            ? "Correct"
            : "Verdict correct; categories differ"
          : "Incorrect",
      Number.isFinite(row.latencyMs) ? row.latencyMs + " ms" : "—",
    ])
      tr.append(text("td", v));
    const td = text("td", ""),
      button = text("button", "Inspect");
    button.type = "button";
    button.addEventListener("click", () => {
      $("attempt-detail").textContent = pretty(row);
      $("attempt-detail").hidden = false;
      $("attempt-detail").focus();
    });
    td.append(button);
    tr.append(td);
    $("attempts").append(tr);
  }
}
async function runCases(cases) {
  if (running) return;
  const provider = $("provider").value,
    model = models.find((m) => m.provider === provider);
  if (!model?.available)
    throw new Error("Configure a model connection before running.");
  running = true;
  updateButtons();
  let count = 0;
  try {
    for (const c of cases) {
      controller = new AbortController();
      const started = performance.now(),
        startedAt = new Date().toISOString();
      const packet = modelPacket(c.input),
        packetHash = await digest(packet);
      let result;
      try {
        const response = await fetch("/api/eval/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, caseId: c.id }),
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Evaluation request failed.");
        if (
          body.datasetHash !== datasetHash ||
          body.rulesetHash !== rulesetHash ||
          body.packetHash !== packetHash
        )
          throw new Error(
            "Server and browser benchmark versions differ. Reload before running.",
          );
        if (body.status === "completed")
          predictionSchema.parse(body.prediction);
        result = { ...body, expected: c.expected, source: "live" };
      } catch (error) {
        result = {
          id: crypto.randomUUID(),
          caseId: c.id,
          provider,
          requestedModel: model.model,
          resolvedModel: null,
          source: "live",
          status: "error",
          error: controller.signal.aborted
            ? "Stopped; the provider may still have charged for this attempt."
            : error.message,
          startedAt,
          completedAt: new Date().toISOString(),
          latencyMs: Math.round(performance.now() - started),
          costUsd: null,
          usage: null,
          expected: c.expected,
          datasetHash,
          rulesetHash,
          packet,
          packetHash,
          harnessVersion: HARNESS_VERSION,
        };
      }
      rows.push(result);
      count++;
      persist();
      renderResults();
      $("run-status").textContent =
        count +
        "/" +
        cases.length +
        " attempts recorded. " +
        (result.status === "error"
          ? result.error
          : "Latest: " + c.id + " → " + label(result.prediction.verdict));
      if (controller.signal.aborted || result.status === "error") break;
    }
  } finally {
    running = false;
    controller = null;
    updateButtons();
  }
}
async function simulateCases(cases, providers) {
  if (running) return;
  running = true;
  simulationActive = true;
  controller = new AbortController();
  updateButtons();
  const signal = controller.signal;
  let count = 0;
  try {
    for (const provider of providers) {
      for (const c of cases) {
        if (signal.aborted) break;
        const row = createSimulationAttempt({
          caseData: c,
          provider,
          datasetHash,
          rulesetHash,
          packetHash: await digest(modelPacket(c.input)),
          id: crypto.randomUUID(),
          startedAt: new Date().toISOString(),
        });
        if (row.prediction) predictionSchema.parse(row.prediction);
        rows.push(row);
        count++;
        persist();
        renderResults();
        $("simulation-status").textContent =
          "SIMULATED — " +
          provider +
          " · " +
          c.id +
          " · " +
          count +
          "/" +
          cases.length * providers.length +
          " scripted attempts. " +
          (row.prediction ? label(row.prediction.verdict) : "scripted error");
        // Allow progress and cancellation to render; this delay is not model latency.
        await new Promise((resolve) => {
          const timer = setTimeout(done, 30);
          function done() {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            resolve();
          }
          signal.addEventListener("abort", done, { once: true });
        });
      }
      if (signal.aborted) break;
    }
    $("simulation-status").textContent =
      (signal.aborted ? "Simulation stopped. " : "Simulation complete. ") +
      count +
      " scripted attempts recorded; zero API calls or credits used. Not measured model results.";
  } finally {
    running = false;
    simulationActive = false;
    controller = null;
    updateButtons();
  }
}
async function importRows(value) {
  if (value.datasetHash && value.datasetHash !== datasetHash)
    throw new Error("Imported report uses a different dataset.");
  if (value.rulesetHash && value.rulesetHash !== rulesetHash)
    throw new Error("Imported report uses a different ruleset.");
  const supplied = Array.isArray(value) ? value : value.rows;
  if (!Array.isArray(supplied) || !supplied.length || supplied.length > 500)
    throw new Error("Supply 1–500 predictions or an exported report.");
  const imported = [];
  for (const item of supplied) {
    if (item.datasetHash && item.datasetHash !== datasetHash)
      throw new Error("Imported attempt uses a different dataset.");
    if (item.rulesetHash && item.rulesetHash !== rulesetHash)
      throw new Error("Imported attempt uses a different ruleset.");
    const c = corpus.cases.find((c) => c.id === item.caseId);
    if (!c) throw new Error("Unknown imported case: " + item.caseId);
    const status = item.status || "completed";
    if (!["completed", "error"].includes(status))
      throw new Error("Invalid attempt status.");
    const prediction =
      status === "completed"
        ? predictionSchema.parse(item.prediction)
        : undefined;
    const provider = String(item.provider || "external").slice(0, 80),
      requestedModel = String(
        item.requestedModel || item.model || "unspecified",
      ).slice(0, 128);
    if (
      item.packetHash &&
      item.packetHash !== (await digest(modelPacket(c.input)))
    )
      throw new Error("Imported packet differs from case " + c.id);
    const row = {
      id: crypto.randomUUID(),
      caseId: c.id,
      provider,
      requestedModel,
      resolvedModel:
        typeof item.resolvedModel === "string"
          ? item.resolvedModel.slice(0, 128)
          : null,
      source: isSimulation(item)
        ? "simulation (imported scripted)"
        : "imported (user-supplied)",
      simulation: isSimulation(item)
        ? {
            isSimulation: true,
            version: String(item.simulation?.version || "external"),
            disclosure: SIMULATION_DISCLOSURE,
            recipe: String(
              item.simulation?.recipe || "Imported scripted demonstration",
            ),
            providerBehaviorEmulated: false,
          }
        : undefined,
      status,
      prediction,
      error:
        status === "error"
          ? String(item.error || "Imported failed attempt").slice(0, 2000)
          : undefined,
      expected: c.expected,
      latencyMs:
        !isSimulation(item) &&
        Number.isFinite(item.latencyMs) &&
        item.latencyMs >= 0
          ? item.latencyMs
          : null,
      costUsd: isSimulation(item)
        ? 0
        : Number.isFinite(item.costUsd) && item.costUsd >= 0
          ? item.costUsd
          : null,
      datasetHash,
      rulesetHash,
      packet: modelPacket(c.input),
      packetHash: await digest(modelPacket(c.input)),
      importedAt: new Date().toISOString(),
      harnessVersion: HARNESS_VERSION,
      rawResponse: item.rawResponse ?? null,
    };
    imported.push(row);
  }
  rows.push(...imported);
  persist();
  renderResults();
  $("run-status").textContent =
    imported.length +
    " user-supplied attempts imported; not verified live calls.";
}
function report() {
  return {
    format: "refmatch-eval-report-v1",
    exportedAt: new Date().toISOString(),
    harnessVersion: HARNESS_VERSION,
    datasetId: corpus.id,
    datasetVersion: corpus.version,
    datasetHash,
    rulesetHash,
    ruleset: RULESET,
    provenance: corpus.provenance,
    splitPolicy: corpus.splitPolicy,
    expertReview: corpus.expertReview,
    metrics: grouped(),
    rows,
    reviews,
    aiReviewDrafts: aiDrafts,
    hasSimulation: rows.some(isSimulation),
    simulationDisclosure: rows.some(isSimulation)
      ? SIMULATION_DISCLOSURE
      : null,
  };
}
async function main() {
  const response = await fetch("eval/cases.json");
  if (!response.ok) throw new Error("Could not load benchmark cases.");
  corpus = await response.json();
  datasetHash = await digest(corpus);
  rulesetHash = await digest(RULESET);
  $("dataset-summary").textContent =
    corpus.cases.length +
    " cases · 10 valid / 14 invalid / 6 insufficient information · 10 paired contrasts · frozen planning timestamps. All cases are public development data.";
  $("policy").textContent = RULESET.decisionPolicy;
  for (const rule of RULESET.rules) {
    const li = text("li", rule.title + " — " + rule.description);
    li.append(text("small", rule.id + " · " + rule.authority));
    $("rules").append(li);
  }
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (
      saved?.datasetHash === datasetHash &&
      (!saved.rulesetHash || saved.rulesetHash === rulesetHash)
    ) {
      reviews = saved.reviews || {};
      for (const row of saved.rows || []) {
        const c = corpus.cases.find((c) => c.id === row.caseId);
        if (!c) continue;
        if (row.status === "completed") predictionSchema.parse(row.prediction);
        rows.push({ ...row, expected: c.expected });
      }
    }
  } catch {
    reportError(
      new Error(
        "Saved evaluation data could not be restored. Import a downloaded report if available.",
      ),
    );
  }
  referenceChecks();
  populateCases();
  renderResults();
  on("check-corpus", "click", referenceChecks);
  on("case-filter", "change", populateCases);
  on("case-select", "change", renderCase);
  on("provider", "change", updateButtons);
  on("export-cases", "click", () =>
    download("refmatch-eval-cases-1.0.0.json", {
      ...corpus,
      ruleset: RULESET,
      datasetHash,
      rulesetHash,
    }),
  );
  on("review-form", "submit", async (e) => {
    e.preventDefault();
    const c = selectedCase();
    const reviewer = $("reviewer").value.trim();
    if (!reviewer) throw new Error("Enter a reviewer name.");
    reviews[c.id] = {
      reviewer,
      outcome: $("review-outcome").value,
      notes: $("review-notes").value,
      recordedAt: new Date().toISOString(),
      datasetHash,
      rulesetHash,
      caseHash: await digest(c),
    };
    persist();
    renderCase();
  });
  on("simulate-case", "click", () =>
    simulateCases([selectedCase()], [$("simulation-provider").value]),
  );
  on("simulate-provider", "click", () =>
    simulateCases(corpus.cases, [$("simulation-provider").value]),
  );
  on("simulate-all", "click", () =>
    simulateCases(corpus.cases, SIMULATED_PROVIDERS),
  );
  on("stop-simulation", "click", () => controller?.abort());
  on("run-case", "click", () => runCases([selectedCase()]));
  on("run-all", "click", () => runCases(corpus.cases));
  on("stop", "click", () => controller?.abort());
  on("import-file", "change", async () => {
    const file = $("import-file").files[0];
    if (!file) return;
    if (file.size > 10_000_000) throw new Error("Import limit is 10 MB.");
    await importRows(JSON.parse(await file.text()));
    $("import-file").value = "";
  });
  on("export-report", "click", () =>
    download("refmatch-eval-report.json", report()),
  );
  on("export-csv", "click", () => {
    const escape = (value) =>
      '"' +
      String(value ?? "")
        .replace(/^[=+@-]/, "'")
        .replaceAll('"', '""') +
      '"';
    const columns = [
      "caseId",
      "provider",
      "requestedModel",
      "resolvedModel",
      "source",
      "isSimulation",
      "status",
      "expected",
      "predicted",
      "latencyMs",
      "costUsd",
    ];
    const values = rows.map((r) => [
      r.caseId,
      r.provider,
      r.requestedModel,
      r.resolvedModel,
      r.source,
      isSimulation(r),
      r.status,
      r.expected.verdict,
      r.prediction?.verdict,
      r.latencyMs,
      r.costUsd,
    ]);
    download(
      "refmatch-eval-scores.csv",
      [columns, ...values].map((row) => row.map(escape).join(",")).join("\n"),
      "text/csv",
    );
  });
  on("clear-results", "click", () => {
    rows = [];
    persist();
    renderResults();
    $("attempt-detail").hidden = true;
    $("run-status").textContent =
      "Results cleared. Local human reviews are retained.";
  });
  await Promise.all([loadModels(), loadReviewDrafts()]);
}
main().catch(reportError);
