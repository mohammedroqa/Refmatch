import { predictionSchema, settingsSchema } from "../demo/eval/contract.js";
export function modelConnections(env = process.env) {
  return [
    {
      provider: "openai",
      model: env.REFMATCH_EVAL_OPENAI_MODEL,
      key: env.OPENAI_API_KEY,
    },
    {
      provider: "anthropic",
      model: env.REFMATCH_EVAL_ANTHROPIC_MODEL,
      key: env.ANTHROPIC_API_KEY,
    },
    {
      provider: "google",
      model: env.REFMATCH_EVAL_GOOGLE_MODEL,
      key: env.GEMINI_API_KEY || env.GOOGLE_API_KEY,
    },
  ].map(({ key, ...m }) => ({
    ...m,
    model: m.model || "",
    available: !!key && !!m.model,
  }));
}
export async function callModel(
  packet,
  rawSettings,
  { env = process.env, fetchImpl = fetch, signal } = {},
) {
  const settings = settingsSchema.parse(rawSettings),
    connection = modelConnections(env).find(
      (c) => c.provider === settings.provider,
    );
  if (!connection?.available || connection.model !== settings.model)
    throw new Error(
      "Configure a server key and exact model ID before running.",
    );
  let url,
    headers = { "Content-Type": "application/json" },
    body;
  const prompt = JSON.stringify(packet);
  if (settings.provider === "openai") {
    url = "https://api.openai.com/v1/chat/completions";
    headers.Authorization = `Bearer ${env.OPENAI_API_KEY}`;
    body = {
      model: settings.model,
      temperature: settings.temperature,
      max_completion_tokens: settings.maxOutputTokens,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    };
  } else if (settings.provider === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    headers["x-api-key"] = env.ANTHROPIC_API_KEY;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model: settings.model,
      max_tokens: settings.maxOutputTokens,
      temperature: settings.temperature,
      messages: [{ role: "user", content: prompt }],
    };
  } else {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`;
    headers["x-goog-api-key"] = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
    body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: settings.temperature,
        maxOutputTokens: settings.maxOutputTokens,
        responseMimeType: "application/json",
      },
    };
  }
  const start = performance.now();
  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
      : AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw new Error(
      `Provider request failed (HTTP ${response.status}). No automatic retry.`,
    );
  const data = await response.json();
  const text =
    settings.provider === "openai"
      ? data.choices?.[0]?.message?.content
      : settings.provider === "anthropic"
        ? data.content
            ?.filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("")
        : data.candidates?.[0]?.content?.parts
            ?.map((p) => p.text || "")
            .join("");
  if (typeof text !== "string" || text.length > 50000)
    throw new Error("Provider returned no usable bounded text.");
  let prediction;
  try {
    prediction = predictionSchema.parse(
      JSON.parse(text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")),
    );
  } catch {
    throw new Error("Provider output failed the evaluation response contract.");
  }
  return {
    prediction,
    latencyMs: Math.round(performance.now() - start),
    resolvedModel: data.model || data.modelVersion || null,
    usage: data.usage || data.usageMetadata || null,
    rawResponse: text,
  };
}
