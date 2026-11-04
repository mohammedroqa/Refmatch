import { readFile } from "node:fs/promises";
import { modelConnections, callModel } from "./eval-provider.mjs";
import { modelPacket } from "../demo/eval/protocol.js";
export function createEvalApi(
  root,
  { env = process.env, fetchImpl = fetch } = {},
) {
  let running = false;
  return async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    const send = (status, value) => {
      if (!res.destroyed) {
        res.writeHead(status);
        res.end(JSON.stringify(value));
      }
    };
    const host = req.headers.host || "";
    if (
      !/^(localhost|127\.0\.0\.1):\d+$/.test(host) ||
      (req.headers.origin && req.headers.origin !== `http://${host}`)
    )
      return send(403, { error: "Local same-origin requests only." });
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/api/eval/status" && req.method === "GET")
      return send(200, { models: modelConnections(env) });
    if (path !== "/api/eval/run" || req.method !== "POST")
      return send(405, { error: "Unsupported evaluation request." });
    if (
      req.headers.origin !== `http://${host}` ||
      !req.headers["content-type"]?.startsWith("application/json")
    )
      return send(403, { error: "Same-origin JSON required." });
    if (running)
      return send(409, { error: "An evaluation request is already running." });
    running = true;
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 65536)
          return send(413, { error: "Request too large." });
      }
      const value = JSON.parse(body),
        corpus = JSON.parse(
          await readFile(`${root}/demo/eval/cases.json`, "utf8"),
        );
      const c = corpus.cases.find((c) => c.id === value.caseId);
      if (!c) return send(400, { error: "Unknown case." });
      const result = await callModel(
        modelPacket(c, value.settings.stage),
        value.settings,
        { env, fetchImpl, signal: controller.signal },
      );
      send(200, result);
    } catch (error) {
      send(400, {
        error: /Provider|Configure/.test(error.message)
          ? error.message
          : "Evaluation request failed or was cancelled.",
      });
    } finally {
      running = false;
    }
  };
}
