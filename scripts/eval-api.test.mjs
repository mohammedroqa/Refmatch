import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { callModel, modelConnections } from "./eval-provider.mjs";
import { createEvalApi } from "./eval-api.mjs";
const settings = {
  provider: "openai",
  model: "test-model",
  temperature: 0,
  maxOutputTokens: 2048,
  promptVersion: "2.0.0",
  stage: "audit",
  trials: 1,
};
const prediction = {
  verdict: "valid",
  probabilities: { valid: 1, invalid: 0, insufficient_information: 0 },
  categories: [],
  facts: [],
  explanation: "All checks clear.",
};
test("provider adapters pass frozen settings and parse real transport response shapes using mock transport", async () => {
  for (const provider of ["openai", "anthropic", "google"]) {
    const env = {
      OPENAI_API_KEY: "unit-only",
      ANTHROPIC_API_KEY: "unit-only",
      GEMINI_API_KEY: "unit-only",
      [`REFMATCH_EVAL_${provider.toUpperCase()}_MODEL`]: "test-model",
    };
    let sent;
    const fetchImpl = async (url, request) => {
      sent = { url, ...request };
      const payload =
        provider === "openai"
          ? {
              model: "resolved-test",
              choices: [{ message: { content: JSON.stringify(prediction) } }],
              usage: { total_tokens: 10 },
            }
          : provider === "anthropic"
            ? {
                model: "resolved-test",
                content: [{ type: "text", text: JSON.stringify(prediction) }],
                usage: { input_tokens: 10 },
              }
            : {
                modelVersion: "resolved-test",
                candidates: [
                  {
                    content: { parts: [{ text: JSON.stringify(prediction) }] },
                  },
                ],
                usageMetadata: { totalTokenCount: 10 },
              };
      return new Response(JSON.stringify(payload));
    };
    const result = await callModel(
      { task: "test only" },
      { ...settings, provider },
      { env, fetchImpl },
    );
    assert.equal(result.resolvedModel, "resolved-test");
    assert.deepEqual(result.prediction, prediction);
    assert.ok(sent.signal);
    assert.equal(
      JSON.parse(sent.body).temperature ??
        JSON.parse(sent.body).generationConfig?.temperature,
      0,
    );
  }
});
test("missing credentials, mismatched models and invalid outputs fail without inventing results", async () => {
  assert.ok(modelConnections({}).every((m) => !m.available));
  await assert.rejects(callModel({}, settings, { env: {} }), /Configure/);
  const env = {
    OPENAI_API_KEY: "unit-only",
    REFMATCH_EVAL_OPENAI_MODEL: "test-model",
  };
  await assert.rejects(
    callModel({}, { ...settings, model: "other" }, { env }),
    /Configure/,
  );
  await assert.rejects(
    callModel({}, settings, {
      env,
      fetchImpl: async () =>
        new Response("private provider error", { status: 429 }),
    }),
    /HTTP 429/,
  );
  await assert.rejects(
    callModel({}, settings, {
      env,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "not JSON" } }] }),
        ),
    }),
    /contract/,
  );
});
test("evaluation API rejects cross-origin runs and exposes no keys in status", async (t) => {
  let calls = 0;
  const api = createEvalApi(process.cwd(), {
    env: {
      OPENAI_API_KEY: "unit-secret",
      REFMATCH_EVAL_OPENAI_MODEL: "test-model",
    },
    fetchImpl: async () => {
      calls++;
      throw Error("should not run");
    },
  });
  const server = createServer(api);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const status = await (await fetch(base + "/api/eval/status")).text();
  assert.ok(!status.includes("unit-secret"));
  assert.match(status, /test-model/);
  const rejected = await fetch(base + "/api/eval/run", {
    method: "POST",
    headers: {
      Origin: "https://outside.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(rejected.status, 403);
  assert.equal(calls, 0);
  const absent = await fetch(base + "/api/eval/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(absent.status, 403);
});
