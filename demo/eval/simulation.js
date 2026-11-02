import { modelPacket, HARNESS_VERSION } from "./protocol.js";
export const SIMULATION_VERSION = "1.0.0";
export const SIMULATED_PROVIDERS = ["jev", "openai", "anthropic", "google"];
export const SIMULATION_DISCLOSURE =
  "SIMULATED: scripted, reference-assisted demo outputs. No model was called. These are not predictions of provider behavior or evidence of model accuracy, calibration, speed, or relative quality. The same script is used for every provider.";
// The controls exercise the results workflow, not any provider's capabilities.
export const SIMULATION_SCRIPT = {
  "invalid-02": {
    verdict: "valid",
    categories: [],
    recipe: "A scripted missed spacing violation.",
  },
  "valid-09": {
    verdict: "invalid",
    categories: ["cutoff"],
    recipe: "A scripted false alarm at the evidence boundary.",
  },
  "unknown-05": {
    verdict: "valid",
    categories: [],
    recipe: "A scripted overconfident clearance of ambiguous notes.",
  },
  "combined-01": {
    verdict: "invalid",
    categories: ["eligibility"],
    recipe: "A scripted correct verdict with an incomplete category diagnosis.",
  },
  "invalid-04": {
    error:
      "Scripted response failure for demonstration; no real provider request failed.",
    recipe: "A scripted failed attempt, retained in the report.",
  },
};
export function isSimulation(row) {
  return (
    row.simulation?.isSimulation === true ||
    /simulation|scripted-demo/i.test(
      [row.source, row.requestedModel, row.model].join(" "),
    )
  );
}
export function createSimulationAttempt({
  caseData,
  provider,
  datasetHash,
  rulesetHash,
  packetHash,
  id,
  startedAt,
}) {
  if (!SIMULATED_PROVIDERS.includes(provider))
    throw new Error("Unsupported simulation provider.");
  const script = SIMULATION_SCRIPT[caseData.id];
  const verdict = script?.verdict ?? caseData.expected.verdict;
  const categories = script?.categories ?? [...caseData.expected.categories];
  const prediction = script?.error
    ? undefined
    : {
        verdict,
        probabilities: Object.fromEntries(
          ["valid", "invalid", "insufficient_information"].map((label) => [
            label,
            label === verdict ? 0.82 : 0.09,
          ]),
        ),
        categories,
      };
  return {
    id,
    caseId: caseData.id,
    provider,
    requestedModel: "scripted-demo-v1",
    resolvedModel: null,
    source: "simulation (scripted)",
    status: script?.error ? "error" : "completed",
    prediction,
    error: script?.error,
    expected: structuredClone(caseData.expected),
    simulation: {
      isSimulation: true,
      version: SIMULATION_VERSION,
      disclosure: SIMULATION_DISCLOSURE,
      recipe:
        script?.recipe ??
        "Reference-assisted demonstration answer; not independent inference.",
      providerBehaviorEmulated: false,
    },
    startedAt,
    completedAt: startedAt,
    latencyMs: null,
    costUsd: 0,
    usage: null,
    rawResponse: null,
    harnessVersion: HARNESS_VERSION,
    datasetHash,
    rulesetHash,
    packetHash,
    packet: modelPacket(caseData.input),
    expertReview: caseData.expertReview,
    requestSettings: { networkCalls: 0, modelCalls: 0 },
  };
}
