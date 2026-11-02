// Independent audit of a submitted plan. Deliberately imports no planning/scoring engine.
import { RULESET } from "./rules.js";
const day = (value) => Date.parse(value.slice(0, 10) + "T00:00:00Z") / 86400000;

function noteAvailability(input, refereeId, fixtureId) {
  const relevant = input.committeeNotes.filter(
    (note) =>
      note.recordedAt < input.planningCutoff &&
      note.text.split(/[^A-Za-z0-9_-]+/).includes(refereeId) &&
      note.text.split(/[^A-Za-z0-9_-]+/).includes(fixtureId),
  );
  if (!relevant.length) return null;
  const latest = relevant.reduce((a, b) =>
    a.recordedAt > b.recordedAt ? a : b,
  ).recordedAt;
  const statuses = relevant
    .filter((n) => n.recordedAt === latest)
    .map((note) => {
      const match =
        /^([A-Za-z0-9_-]+) is (available|unavailable) for ([A-Za-z0-9_-]+)\.$/.exec(
          note.text,
        );
      return match && match[1] === refereeId && match[3] === fixtureId
        ? match[2]
        : "unknown";
    });
  return {
    status: new Set(statuses).size === 1 ? statuses[0] : "unknown",
    recordedAt: latest,
  };
}

export function validatePlan(input) {
  const violations = [],
    unresolved = [];
  const add = (list, rule, subject, detail) =>
    list.push({ rule, subject, detail });
  const fixtures = new Map(input.fixtures.map((f) => [f.id, f]));
  const referees = new Map(input.referees.map((r) => [r.id, r]));
  for (const fixture of input.fixtures) {
    const count = input.proposedPlan.assignments.filter(
      (a) => a.fixtureId === fixture.id,
    ).length;
    if (count !== 1)
      add(
        violations,
        "coverage",
        fixture.id,
        "Expected one assignment; received " + count + ".",
      );
  }
  const used = new Set();
  for (const assignment of input.proposedPlan.assignments) {
    const { fixtureId, refereeId } = assignment;
    const fixture = fixtures.get(fixtureId),
      referee = referees.get(refereeId);
    if (!fixture || !referee) {
      add(
        violations,
        "coverage",
        fixtureId + "/" + refereeId,
        "Unknown fixture or referee.",
      );
      continue;
    }
    if (used.has(refereeId))
      add(
        violations,
        "capacity",
        refereeId,
        "Referee is assigned more than once in the round.",
      );
    used.add(refereeId);
    const subject = fixtureId + "/" + refereeId;
    const note = noteAvailability(input, refereeId, fixtureId);
    const availability =
      note?.status ?? referee.availability[fixtureId] ?? "unknown";
    if (availability === "unavailable")
      add(
        violations,
        note ? "notes" : "availability",
        subject,
        "Referee is unavailable" +
          (note ? " under the latest committee note." : "."),
      );
    if (availability === "unknown")
      add(
        unresolved,
        note ? "notes" : "availability",
        subject,
        "Availability is not confirmed.",
      );
    if (referee.eligible === false)
      add(
        violations,
        "eligibility",
        subject,
        "Referee is explicitly ineligible.",
      );
    if (referee.eligible === null)
      add(
        unresolved,
        "eligibility",
        subject,
        "Eligibility has not been confirmed.",
      );
    if (referee.conflicts === null)
      add(
        unresolved,
        "conflict",
        subject,
        "Conflict declarations are missing.",
      );
    else if (
      referee.conflicts.includes(fixture.home) ||
      referee.conflicts.includes(fixture.away)
    )
      add(
        violations,
        "conflict",
        subject,
        "Declared conflict with a fixture team.",
      );
    if (referee.otherDuties === null)
      add(
        unresolved,
        "spacing",
        subject,
        "Other duties have not been checked.",
      );
    else
      for (const duty of referee.otherDuties) {
        const gap = Math.abs(day(fixture.kickoff) - day(duty));
        if (gap < input.minimumGapDays)
          add(
            violations,
            "spacing",
            subject,
            "Duty on " +
              duty +
              " is " +
              gap +
              " calendar days away; minimum is " +
              input.minimumGapDays +
              ".",
          );
      }
  }
  for (const id of input.proposedPlan.citedEvidence) {
    const record = input.evidence.find((e) => e.id === id);
    if (!record)
      add(unresolved, "cutoff", id, "Cited evidence record is missing.");
    else if (
      record.eventAt >= input.planningCutoff ||
      record.knownAt >= input.planningCutoff
    )
      add(
        violations,
        "cutoff",
        id,
        "Cited evidence did not exist strictly before the cutoff.",
      );
  }
  return {
    verdict: violations.length
      ? "invalid"
      : unresolved.length
        ? "insufficient_information"
        : "valid",
    violations,
    unresolved,
    rulesetVersion: RULESET.version,
  };
}

export function checkCorpus(corpus) {
  return corpus.cases.map((c) => {
    const actual = validatePlan(c.input);
    const categories = [
      ...new Set(
        [...actual.violations, ...actual.unresolved].map((v) => v.rule),
      ),
    ].sort();
    return {
      id: c.id,
      passed:
        actual.verdict === c.expected.verdict &&
        JSON.stringify(categories) ===
          JSON.stringify([...c.expected.categories].sort()),
      expected: c.expected,
      actual,
    };
  });
}
