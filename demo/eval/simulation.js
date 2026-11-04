import { digest, modelPacket } from "./protocol.js";
export const PROFILES = {
  reference: "Reference-assisted answers",
  overconfident: "Overconfident clearance",
  updates: "Missed committee updates",
  errors: "Intermittent response failures",
};
export async function simulate(c, profile, stage, trial) {
  const code = [...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) + trial;
  const failed = profile === "errors" && code % 7 === 0;
  let verdict = c.expected.verdict,
    categories = [...c.expected.categories],
    facts = stage === "evidence" ? structuredClone(c.expectedFacts || []) : [];
  if (profile === "overconfident" && verdict !== "valid" && code % 3 !== 0) {
    verdict = "valid";
    categories = [];
    facts = facts.map((f) => ({ ...f, status: "available" }));
  }
  if (profile === "updates" && c.sourceNotes?.length) {
    verdict = "valid";
    categories = [];
    facts = facts.map((f) => ({
      ...f,
      status: "available",
      evidenceIds: ["note-early"],
    }));
  }
  return {
    caseId: c.id,
    trial,
    status: failed ? "error" : "completed",
    ...(failed
      ? { error: "Scripted response failure; no provider was contacted." }
      : {
          prediction: {
            verdict,
            categories,
            facts,
            probabilities: Object.fromEntries(
              ["valid", "invalid", "insufficient_information"].map((v) => [
                v,
                v === verdict ? 0.82 : 0.09,
              ]),
            ),
            explanation:
              "SIMULATED: reference-assisted demonstration with scripted changes. This is not measured model reasoning.",
          },
        }),
    latencyMs: null,
    resolvedModel: null,
    usage: null,
    rawResponse: null,
    packetHash: await digest(modelPacket(c, stage)),
  };
}
