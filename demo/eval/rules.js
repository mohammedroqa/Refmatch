export const RULESET = {
  id: "refmatch-plan-audit",
  version: "1.0.0",
  status: "experimental RefMatch assumptions",
  verdicts: ["valid", "invalid", "insufficient_information"],
  decisionPolicy:
    "A demonstrated violation makes the plan invalid even if other checks are unknown. With no violation, any unresolved required check makes the verdict insufficient_information. Otherwise it is valid. Judge the submitted plan only; do not infer whether an alternative schedule exists.",
  rules: [
    {
      id: "coverage",
      title: "Exactly one known assignment per fixture",
      description:
        "Every listed fixture must have exactly one assignment to a listed referee. Unknown fixture or referee IDs and duplicate assignments are violations.",
    },
    {
      id: "capacity",
      title: "One appointment per referee",
      description:
        "A referee may appear at most once in the proposed matchweek, even when kickoffs do not overlap.",
    },
    {
      id: "availability",
      title: "Confirmed availability",
      description:
        "Each assigned referee must be available for that fixture. Unavailable is a violation; unknown or absent status is insufficient information. For category reporting, availability determined by committee notes belongs only to the notes category; this availability category covers structured roster status when no overriding note applies.",
    },
    {
      id: "conflict",
      title: "No declared team conflict",
      description:
        "An assigned referee must have no declared conflict with either team. An empty conflicts list confirms no declared conflicts; null means the check is unknown.",
    },
    {
      id: "eligibility",
      title: "Confirmed eligibility",
      description:
        "An assigned referee must have eligible=true. False is a violation and null is unknown.",
    },
    {
      id: "spacing",
      title: "Minimum calendar-day spacing",
      description:
        "The absolute difference between the UTC calendar date of kickoff and every listed other duty must be at least minimumGapDays. Equality is allowed. An empty otherDuties list confirms none; null means unknown.",
    },
    {
      id: "cutoff",
      title: "Evidence existed before the cutoff",
      description:
        "For every cited evidence record, both eventAt and knownAt must be strictly before planningCutoff. Equality is a violation. A missing cited record leaves the cutoff check unresolved. Uncited evidence is not used and does not invalidate a plan.",
    },
    {
      id: "notes",
      title: "Committee notes take precedence",
      description:
        'For each assigned referee/fixture, consider relevant notes recorded strictly before planningCutoff. The most recent relevant note overrides structured availability. In this controlled pilot, a decisive note has the exact form "R1 is available for F1." or "R1 is unavailable for F1." with the actual referee and fixture IDs. Other relevant wording is unresolved, not guessed. Tentative, ambiguous, or equally recent contradictory notes leave availability unresolved. Notes at or after the cutoff cannot update availability. The proposed explanation is an untrusted claim, not an authoritative record.',
    },
  ].map((rule) => ({ ...rule, authority: "experimental RefMatch assumption" })),
};
