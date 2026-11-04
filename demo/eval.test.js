import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateCorpus } from "../scripts/generate-evals.mjs";
import { checkCorpus, validatePlan } from "./eval/validator.js";
import { RULESET } from "./eval/rules.js";
import {
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
  predictionSchema,
} from "./eval/protocol.js";
import { summarizeBatch } from "./eval/metrics.js";
import { simulate } from "./eval/simulation.js";
const corpus = JSON.parse(
  await readFile(new URL("./eval/cases.json", import.meta.url)),
);
const settings = {
  provider: "simulation",
  model: "reference",
  temperature: 0,
  maxOutputTokens: 2048,
  promptVersion: "2.0.0",
  stage: "audit",
  trials: 1,
};
async function batchFor(profile = "reference", stage = "audit", trials = 1) {
  const b = await createBatch(corpus, "development", {
    ...settings,
    model: profile,
    stage,
    trials,
  });
  for (let t = 1; t <= trials; t++)
    for (const id of b.caseIds) {
      const c = corpus.cases.find((c) => c.id === id);
      await addAttempt(b, c, await simulate(c, profile, stage, t));
    }
  return b;
}
test("public corpus is reproducible, families do not cross splits, reference and full-week cases agree", () => {
  assert.deepEqual(generateCorpus(), corpus);
  assert.equal(corpus.cases.length, 136);
  assert.ok(checkCorpus(corpus).every((x) => x.passed));
  assert.deepEqual(
    [...new Set(corpus.cases.map((c) => c.input.fixtures.length))].sort(
      (a, b) => a - b,
    ),
    [3, 6, 10, 16],
  );
  for (const split of ['development','validation']) {
    assert.equal(new Set(corpus.cases.filter(c=>c.split===split&&c.sourceNotes.length).map(c=>c.expected.verdict)).size,3);
  }
  const seen = new Map();
  for (const c of corpus.cases) {
    assert.ok(!seen.has(c.familyId) || seen.get(c.familyId) === c.split);
    seen.set(c.familyId, c.split);
  }
  assert.equal(
    new Set(corpus.cases.map((c) => canonical(modelPacket(c)))).size,
    corpus.cases.length,
  );
});
test("private challenge instances use reserved compound families, unique IDs and valid reference labels", () => {
  const a = generateCorpus({ privateChallenge: true, seed: "secret-a" }),
    b = generateCorpus({ privateChallenge: true, seed: "secret-b" });
  assert.equal(a.cases.length, 16);
  assert.notDeepEqual(a, b);
  assert.ok(checkCorpus(a).every((x) => x.passed));
  assert.ok(
    a.cases.every(
      (c) =>
        c.split === "private" &&
        !corpus.cases.some((p) => p.familyId === c.familyId),
    ),
  );
});
test("packets exclude expected labels, case titles, families and gold extraction; stage isolates evidence", () => {
  const c = corpus.cases.find((c) => c.sourceNotes.length),
    packet = modelPacket(c, "evidence");
  for (const key of [
    "expected",
    "expectedFacts",
    "title",
    "familyId",
    "expertReview",
    "caseId",
  ])
    assert.equal(key in packet, false);
  assert.deepEqual(packet.scenario.committeeNotes, []);
  assert.ok(packet.sourceNotes.length);
  assert.ok(modelPacket(c, "audit").scenario.committeeNotes.length);
});
test("reference oracle boundaries and precedence are checked independently", () => {
  const c = structuredClone(corpus.cases[0].input),
    a = c.proposedPlan.assignments[0],
    r = c.referees.find((r) => r.id === a.refereeId);
  r.eligible = null;
  assert.equal(validatePlan(c).verdict, "insufficient_information");
  r.availability[a.fixtureId] = "unavailable";
  assert.equal(validatePlan(c).verdict, "invalid");
  const d = structuredClone(corpus.cases[0].input);
  d.evidence[0].knownAt = d.planningCutoff;
  assert.equal(validatePlan(d).verdict, "invalid");
  const e = structuredClone(corpus.cases[0].input),
    ref = e.referees.find(
      (r) => r.id === e.proposedPlan.assignments[0].refereeId,
    );
  ref.otherDuties = ["2027-03-03"];
  assert.equal(validatePlan(e).verdict, "valid");
  ref.otherDuties = ["2027-03-04"];
  assert.equal(validatePlan(e).verdict, "invalid");
});
test("response contract rejects wrong probabilities, contradictory labels, duplicate categories and facts", async () => {
  const p = (await simulate(corpus.cases[0], "reference", "audit", 1))
    .prediction;
  assert.throws(() =>
    predictionSchema.parse({
      ...p,
      probabilities: {
        valid: 0.4,
        invalid: 0.4,
        insufficient_information: 0.4,
      },
    }),
  );
  assert.throws(() => predictionSchema.parse({ ...p, verdict: "invalid" }));
  assert.throws(() =>
    predictionSchema.parse({ ...p, categories: ["notes", "notes"] }),
  );
});
test("fixed batch coverage and duplicate slots cannot be changed by imports", async () => {
  const b = await batchFor();
  assert.equal(
    (await importBatch(b, corpus)).attempts.length,
    b.caseIds.length,
  );
  const c = corpus.cases.find((c) => c.id === b.caseIds[0]);
  await assert.rejects(addAttempt(b, c, b.attempts[0]), /Duplicate/);
  for (const mutate of [
    (b) => b.caseIds.pop(),
    (b) => b.attempts.push(b.attempts[0]),
    (b) => (b.attempts[0].packetHash = "0".repeat(64)),
    (b) => (b.settings.stage = "evidence"),
    (b) => (b.datasetHash = "wrong"),
  ]) {
    const altered = structuredClone(b);
    mutate(altered);
    await assert.rejects(importBatch(altered, corpus));
  }
  const claimed = structuredClone(b);
  claimed.source = "live";
  claimed.settings.provider = "external";
  assert.equal((await importBatch(claimed, corpus)).source, "imported");
});
test("unsafe clearance includes unresolved references and errors stay in the planned denominator", async () => {
  const b = await batchFor("overconfident");
  const m = summarizeBatch(b, corpus);
  assert.ok(m.unknownClearance.numerator > 0);
  assert.ok(m.invalidClearance.numerator > 0);
  assert.equal(
    m.unsafeClearance.numerator,
    m.unknownClearance.numerator + m.invalidClearance.numerator,
  );
  const perfect = await batchFor(),
    p = summarizeBatch(perfect, corpus);
  assert.equal(p.endToEndAccuracy.value, 1);
  assert.equal(p.unsafeClearance.value, 0);
  assert.equal(p.pairedConsistency.value, 1);
  assert.equal(p.invariance.value, 1);
  const errors = await batchFor("errors"),
    e = summarizeBatch(errors, corpus);
  assert.ok(e.errors > 0);
  assert.equal(e.endToEndAccuracy.denominator, errors.caseIds.length);
  assert.equal(e.completed + e.errors, e.planned);
  assert.ok(e.endToEndAccuracy.value < 1);
  assert.equal(e.accuracy.value, 1);
  const partial = await createBatch(corpus, "development", settings);
  const pm = summarizeBatch(partial, corpus);
  assert.equal(pm.unrun, partial.caseIds.length);
  assert.equal(pm.unsafeClearance.value, null);
  assert.equal(pm.endToEndAccuracy.value, 0);
});
test("repeated trials remain separate and do not change first-trial metrics", async () => {
  const b = await batchFor("reference", "audit", 2);
  const first = summarizeBatch(b, corpus, 1),
    second = summarizeBatch(b, corpus, 2);
  assert.equal(first.planned, b.caseIds.length);
  assert.equal(first.completed, second.completed);
  assert.equal(b.attempts.length, 2 * first.completed);
});
test("extraction and citation failures are distinguished from supplied-fact reasoning", async () => {
  const b = await batchFor("reference", "evidence");
  const m = summarizeBatch(b, corpus);
  assert.equal(m.extraction.value, 1);
  assert.equal(m.citations.value, 1);
  assert.equal(m.downstream.value, 1);
  const c = corpus.cases.find(
      (c) => c.sourceNotes.length && c.expected.verdict === "invalid",
    ),
    p = (await simulate(c, "updates", "evidence", 1)).prediction;
  const e = evidenceScore(c, p);
  assert.equal(e.exact, false);
  assert.equal(e.citations, false);
  assert.equal(e.downstreamCorrect, false);
  assert.equal(e.reasoningAgreesWithExtracted, true);
  const cite = (await simulate(c, "reference", "evidence", 1)).prediction;
  cite.facts[0].evidenceIds = ["note-future"];
  assert.equal(evidenceScore(c, cite).exact, true);
  assert.equal(evidenceScore(c, cite).citations, false);
});
test("blind review and adjudication require distinct identities, current cases and a chronological trail", async () => {
  const pack = await blindReviewPacket(corpus);
  assert.equal(pack.cases.length, 136);
  assert.ok(
    pack.cases.every(
      (c) =>
        !("expected" in c) &&
        !("title" in c) &&
        /^review-[a-f0-9]{20}$/.test(c.id),
    ),
  );
  const blindReview = await validateReview(
    {
      caseId: pack.cases[0].id,
      caseHash: pack.cases[0].caseHash,
      rulesetHash: pack.rulesetHash,
      reviewer: "Blind reviewer",
      role: "domain",
      independent: true,
      verdict: "valid",
      categories: [],
      notes: "Reviewed the source pack independently.",
      recordedAt: "2026-11-05T09:00:00Z",
    },
    corpus,
  );
  assert.equal(blindReview.caseId, corpus.cases[0].id);
  const c = corpus.cases[0],
    base = {
      caseId: c.id,
      caseHash: await digest(c),
      rulesetHash: await digest(RULESET),
      independent: true,
      verdict: c.expected.verdict,
      categories: c.expected.categories,
      notes: "Independently checked the supplied evidence.",
    };
  const domain = await validateReview(
    {
      ...base,
      reviewer: "Domain person",
      role: "domain",
      recordedAt: "2026-11-05T10:00:00Z",
    },
    corpus,
  );
  const technical = await validateReview(
    {
      ...base,
      reviewer: "Technical person",
      role: "technical",
      verdict: "invalid",
      categories: ["notes"],
      recordedAt: "2026-11-05T11:00:00Z",
    },
    corpus,
  );
  assert.equal(reviewState([domain], c).state, "pending");
  assert.equal(reviewState([domain, technical], c).state, "disputed");
  const adjudicator = {
    ...base,
    reviewer: "Third person",
    role: "adjudicator",
    recordedAt: "2026-11-05T12:00:00Z",
  };
  assert.equal(
    reviewState([domain, technical, adjudicator], c).state,
    "adjudicated",
  );
  assert.equal(
    reviewState(
      [domain, technical, { ...adjudicator, reviewer: domain.reviewer }],
      c,
    ).state,
    "disputed",
  );
  assert.equal(
    reviewState([domain, { ...technical, reviewer: domain.reviewer }], c).state,
    "pending",
  );
  await assert.rejects(
    validateReview({ ...domain, caseHash: "old" }, corpus),
    /stale/,
  );
  await assert.rejects(
    validateReview({ ...domain, independent: false }, corpus),
  );
  await assert.rejects(
    validateReview({ ...domain, rulesetHash: "0".repeat(64) }, corpus),
    /ruleset/,
  );
});
