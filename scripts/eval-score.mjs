import { readFile, writeFile } from "node:fs/promises";
import { importBatch } from "../demo/eval/protocol.js";
import { summarizeBatch } from "../demo/eval/metrics.js";
const args = process.argv.slice(2),
  get = (flag, fallback) =>
    args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
if (!get("--report")) {
  console.log(
    "node scripts/eval-score.mjs --report PATH [--corpus PATH] [--output PATH]",
  );
  process.exit(0);
}
const corpus = JSON.parse(
  await readFile(get("--corpus", "demo/eval/cases.json"), "utf8"),
);
const batch = await importBatch(
  JSON.parse(await readFile(get("--report"), "utf8")),
  corpus,
);
const result = {
  batchId: batch.id,
  source: batch.source,
  settings: batch.settings,
  split: batch.split,
  trials: Array.from({ length: batch.settings.trials }, (_, i) =>
    summarizeBatch(batch, corpus, i + 1),
  ),
};
if (get("--output"))
  await writeFile(get("--output"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
