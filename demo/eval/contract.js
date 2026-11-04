import { z } from "zod";
export const verdicts = ["valid", "invalid", "insufficient_information"];
export const categories = [
  "coverage",
  "capacity",
  "availability",
  "conflict",
  "eligibility",
  "spacing",
  "cutoff",
  "notes",
];
const ids = z
  .array(z.string().min(1).max(120))
  .max(100)
  .refine((a) => new Set(a).size === a.length, "Duplicate IDs");
export const predictionSchema = z
  .object({
    verdict: z.enum(verdicts),
    probabilities: z
      .object(
        Object.fromEntries(
          verdicts.map((v) => [v, z.number().finite().min(0).max(1)]),
        ),
      )
      .strict(),
    categories: z
      .array(z.enum(categories))
      .max(8)
      .refine((a) => new Set(a).size === a.length, "Duplicate categories"),
    facts: z
      .array(
        z
          .object({
            refereeId: z.string().min(1),
            fixtureId: z.string().min(1),
            status: z.enum(["available", "unavailable", "unknown"]),
            evidenceIds: ids.min(1),
          })
          .strict(),
      )
      .max(40)
      .default([]),
    explanation: z.string().max(6000).default(""),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      Math.abs(Object.values(p.probabilities).reduce((a, b) => a + b, 0) - 1) >
      0.0001
    )
      ctx.addIssue({
        code: "custom",
        message: "Probabilities must sum to one",
      });
    if (
      p.probabilities[p.verdict] < Math.max(...Object.values(p.probabilities))
    )
      ctx.addIssue({
        code: "custom",
        message: "Verdict must have maximum probability",
      });
    if ((p.verdict === "valid") !== (p.categories.length === 0))
      ctx.addIssue({
        code: "custom",
        message:
          "A clear verdict requires no unresolved or violated categories",
      });
    const keys = p.facts.map((f) => `${f.refereeId}/${f.fixtureId}`);
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: "custom", message: "Duplicate facts" });
  });
export const settingsSchema = z
  .object({
    provider: z.enum([
      "simulation",
      "openai",
      "anthropic",
      "google",
      "external",
    ]),
    model: z.string().min(1).max(150),
    temperature: z.number().finite().min(0).max(2),
    maxOutputTokens: z.number().int().min(128).max(8192),
    promptVersion: z.literal("2.0.0"),
    stage: z.enum(["audit", "evidence"]),
    trials: z.number().int().min(1).max(5),
  })
  .strict();
export const attemptSchema = z
  .object({
    caseId: z.string(),
    trial: z.number().int().min(1).max(5),
    status: z.enum(["completed", "error"]),
    prediction: predictionSchema.optional(),
    error: z.string().max(1000).optional(),
    latencyMs: z.number().finite().nonnegative().nullable(),
    resolvedModel: z.string().max(150).nullable(),
    usage: z.record(z.string(), z.unknown()).nullable(),
    rawResponse: z.string().max(50000).nullable(),
    packetHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .refine(
    (a) => (a.status === "completed" ? !!a.prediction : !a.prediction),
    "Completed attempt needs a prediction; failed attempt cannot have one",
  );
export const reviewSchema = z
  .object({
    caseId: z.string(),
    caseHash: z.string(),
    rulesetHash: z.string().regex(/^[a-f0-9]{64}$/),
    reviewer: z.string().trim().min(2).max(100),
    role: z.enum(["domain", "technical", "adjudicator"]),
    independent: z.literal(true),
    verdict: z.enum(verdicts),
    categories: z
      .array(z.enum(categories))
      .max(8)
      .refine((a) => new Set(a).size === a.length, "Duplicate categories"),
    notes: z.string().trim().min(10).max(4000),
    recordedAt: z.string().datetime(),
  })
  .strict()
  .refine(
    (r) => (r.verdict === "valid") === (r.categories.length === 0),
    "Review verdict and categories disagree",
  );
