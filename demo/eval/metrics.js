import { categories } from "./contract.js";
import { evidenceScore } from "./protocol.js";
const rate = (n, d) => ({
  numerator: n,
  denominator: d,
  value: d ? n / d : null,
});
// Resample complete families, never individual related cases. Descriptive only.
function familyInterval(items, numerator, denominator) {
  const groups = Map.groupBy(items, (x) => x.c.familyId);
  const families = [...groups.values()];
  if (families.length < 2) return null;
  let seed = 2026;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const values = [];
  for (let b = 0; b < 500; b++) {
    let n = 0,
      d = 0;
    for (let i = 0; i < families.length; i++)
      for (const x of families[Math.floor(random() * families.length)]) {
        n += numerator(x);
        d += denominator(x);
      }
    if (d) values.push(n / d);
  }
  values.sort((a, b) => a - b);
  return values.length
    ? [
        values[Math.floor(values.length * 0.025)],
        values[Math.min(values.length - 1, Math.floor(values.length * 0.975))],
      ]
    : null;
}
export function summarizeBatch(batch, corpus, trial = 1) {
  const selected = batch.caseIds.map((id) =>
    corpus.cases.find((c) => c.id === id),
  );
  const items = selected.map((c) => ({
    c,
    a: batch.attempts.find((a) => a.caseId === c.id && a.trial === trial),
  }));
  const completed = items.filter((x) => x.a?.status === "completed"),
    errors = items.filter((x) => x.a?.status === "error").length;
  const correct = (x) =>
    Number(
      x.a?.status === "completed" &&
        x.a.prediction.verdict === x.c.expected.verdict,
    );
  const unsafe = (x) =>
    Number(
      x.c.expected.verdict !== "valid" &&
        x.a?.status === "completed" &&
        x.a.prediction.verdict === "valid",
    );
  const eligible = (x) =>
    Number(x.c.expected.verdict !== "valid" && x.a?.status === "completed");
  const invalid = completed.filter((x) => x.c.expected.verdict === "invalid");
  const unresolved = completed.filter(
    (x) => x.c.expected.verdict === "insufficient_information",
  );
  const confusion = Object.fromEntries(
    ["valid", "invalid", "insufficient_information"].map((v) => [
      v,
      Object.fromEntries(
        ["valid", "invalid", "insufficient_information", "error", "unrun"].map(
          (p) => [p, 0],
        ),
      ),
    ]),
  );
  for (const { c, a } of items)
    confusion[c.expected.verdict][
      a?.status === "completed"
        ? a.prediction.verdict
        : a?.status === "error"
          ? "error"
          : "unrun"
    ]++;
  const ruleMetrics = categories.map((rule) => {
    let tp = 0,
      fp = 0,
      fn = 0;
    for (const { c, a } of completed) {
      const e = c.expected.categories.includes(rule),
        p = a.prediction.categories.includes(rule);
      tp += Number(e && p);
      fp += Number(!e && p);
      fn += Number(e && !p);
    }
    return {
      rule,
      tp,
      fp,
      fn,
      precision: rate(tp, tp + fp),
      recall: rate(tp, tp + fn),
    };
  });
  const groupMetric = (key, requireChange) => {
    let passed = 0,
      total = 0;
    for (const group of Map.groupBy(
      items.filter((x) => x.c[key]),
      (x) => x.c[key],
    ).values()) {
      if (group.length < 2 || group.some((x) => x.a?.status !== "completed"))
        continue;
      if (
        requireChange &&
        new Set(group.map((x) => x.c.expected.verdict)).size < 2
      )
        continue;
      total++;
      passed += Number(group.every((x) => correct(x)));
    }
    return rate(passed, total);
  };
  const ev =
    batch.settings.stage === "evidence"
      ? completed
          .filter((x) => x.c.sourceNotes?.length)
          .map((x) => evidenceScore(x.c, x.a.prediction))
      : [];
  const brier = completed.length
    ? completed.reduce(
        (s, { c, a }) =>
          s +
          ["valid", "invalid", "insufficient_information"].reduce(
            (s, v) =>
              s +
              (a.prediction.probabilities[v] -
                Number(c.expected.verdict === v)) **
                2,
            0,
          ),
        0,
      ) / completed.length
    : null;
  const latency = completed
    .map((x) => x.a.latencyMs)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return {
    trial,
    planned: items.length,
    completed: completed.length,
    errors,
    unrun: items.length - completed.length - errors,
    coverage: rate(completed.length + errors, items.length),
    accuracy: rate(
      completed.reduce((s, x) => s + correct(x), 0),
      completed.length,
    ),
    endToEndAccuracy: rate(
      items.reduce((s, x) => s + correct(x), 0),
      items.length,
    ),
    unsafeClearance: rate(
      completed.reduce((s, x) => s + unsafe(x), 0),
      completed.filter((x) => eligible(x)).length,
    ),
    invalidClearance: rate(
      invalid.filter((x) => x.a.prediction.verdict === "valid").length,
      invalid.length,
    ),
    unknownClearance: rate(
      unresolved.filter((x) => x.a.prediction.verdict === "valid").length,
      unresolved.length,
    ),
    falseAlarms: rate(
      completed.filter(
        (x) =>
          x.c.expected.verdict === "valid" &&
          x.a.prediction.verdict === "invalid",
      ).length,
      completed.filter((x) => x.c.expected.verdict === "valid").length,
    ),
    unsafeInterval: familyInterval(items, unsafe, eligible),
    accuracyInterval: familyInterval(items, correct, () => 1),
    families: new Set(selected.map((c) => c.familyId)).size,
    pairedConsistency: groupMetric("pairId", true),
    invariance: groupMetric("invarianceId", false),
    extraction: rate(ev.filter((x) => x.exact).length, ev.length),
    citations: rate(ev.filter((x) => x.citations).length, ev.length),
    downstream: rate(ev.filter((x) => x.downstreamCorrect).length, ev.length),
    confusion,
    ruleMetrics,
    brier,
    calibrationNote:
      completed.length < 200
        ? "Small sample: Brier is descriptive; no calibration claim."
        : "Brier describes this batch only; assess calibration on independently held-out data.",
    latencyMedian: latency.length
      ? latency[Math.floor((latency.length - 1) / 2)]
      : null,
    failures: items
      .filter(
        (x) =>
          x.a?.status === "error" ||
          (x.a?.status === "completed" &&
            (!correct(x) ||
              JSON.stringify([...x.a.prediction.categories].sort()) !==
                JSON.stringify([...x.c.expected.categories].sort()) ||
              (batch.settings.stage === "evidence" &&
                (!evidenceScore(x.c, x.a.prediction).exact ||
                  !evidenceScore(x.c, x.a.prediction).citations)))),
      )
      .map((x) => x.c.id),
  };
}
