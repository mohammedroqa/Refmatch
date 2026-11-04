import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createBatch,
  addAttempt,
  digest,
  modelPacket,
  importBatch,
} from "../demo/eval/protocol.js";
import { callModel, modelConnections } from "./eval-provider.mjs";
const args = process.argv.slice(2),
  get = (flag, fallback) =>
    args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
if (args.includes("--help")) {
  console.log(
    "node [--use-env-proxy] scripts/eval-runner.mjs --corpus PATH --split development|validation|private --stage audit|evidence --provider openai|anthropic|google --output PATH [--resume PATH] [--trials 1] [--temperature 0] [--max-tokens 2048]",
  );
  process.exit(0);
}
const corpus = JSON.parse(
  await readFile(get("--corpus", "demo/eval/cases.json"), "utf8"),
);
const provider = get("--provider", "openai"),
  connection = modelConnections().find((c) => c.provider === provider);
if (!connection?.available)
  throw new Error(
    "Set the provider key and REFMATCH_EVAL_<PROVIDER>_MODEL. See docs/evaluation-v2.md.",
  );
const output = resolve(get("--output", ".eval-private/results.json"));
await mkdir(dirname(output), { recursive: true });
const resume = get("--resume", null);
const batch = resume
  ? await importBatch(JSON.parse(await readFile(resume, "utf8")), corpus)
  : await createBatch(
      corpus,
      get("--split", "development"),
      {
        provider,
        model: connection.model,
        temperature: Number(get("--temperature", "0")),
        maxOutputTokens: Number(get("--max-tokens", "2048")),
        promptVersion: "2.0.0",
        stage: get("--stage", "audit"),
        trials: Number(get("--trials", "1")),
      },
      "live",
    );
if (
  resume &&
  (batch.settings.provider !== provider ||
    batch.settings.model !== connection.model ||
    batch.source === "simulation")
)
  throw new Error(
    "Resume must match provider/model and cannot contain simulated results.",
  );
batch.source = "live";
const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
await writeFile(output, JSON.stringify(batch, null, 2));
for (let trial = 1; trial <= batch.settings.trials; trial++)
  for (const id of batch.caseIds) {
    if (controller.signal.aborted) break;
    if (batch.attempts.some((a) => a.caseId === id && a.trial === trial))
      continue;
    const c = corpus.cases.find((c) => c.id === id),
      packet = modelPacket(c, batch.settings.stage),
      packetHash = await digest(packet);
    let attempt = {
      caseId: id,
      trial,
      packetHash,
      latencyMs: null,
      resolvedModel: null,
      usage: null,
      rawResponse: null,
    };
    try {
      attempt = {
        ...attempt,
        status: "completed",
        ...(await callModel(packet, batch.settings, {
          signal: controller.signal,
        })),
      };
    } catch (error) {
      attempt = {
        ...attempt,
        status: "error",
        error: error.message.slice(0, 1000),
      };
    }
    await addAttempt(batch, c, attempt);
    await writeFile(output, JSON.stringify(batch, null, 2));
    console.log(`${trial} ${id}: ${attempt.status}`);
  }
console.log(
  `Saved ${batch.attempts.length}/${batch.caseIds.length * batch.settings.trials} attempts to ${output}`,
);
