import assert from "node:assert/strict";
import test from "node:test";
import { MODELS } from "../src/models.js";
import { startServer } from "../src/server.js";

test("loopback server enforces local auth and serves token counts", async () => {
  const router = await startServer("secret");
  try {
    const base = `http://127.0.0.1:${router.port}`;
    const denied = await fetch(`${base}/health`);
    assert.equal(denied.status, 401);

    const health = await fetch(`${base}/health`, { headers: { authorization: "Bearer secret" } });
    assert.deepEqual(await health.json(), { status: "ok", model: "gpt-5.6-sol" });

    const count = await fetch(`${base}/v1/messages/count_tokens?beta=true`, {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hello world" }] })
    });
    assert.equal(count.status, 200);
    assert.ok((await count.json()).input_tokens > 0);
  } finally {
    await router.close();
  }
});

test("health reports the selected default model", async () => {
  const router = await startServer("secret", { defaultModel: MODELS.terra });
  try {
    const response = await fetch(`http://127.0.0.1:${router.port}/health`, { headers: { authorization: "Bearer secret" } });
    assert.deepEqual(await response.json(), { status: "ok", model: "gpt-5.6-terra" });
  } finally {
    await router.close();
  }
});

test("client cancellation aborts the upstream Codex request", async () => {
  let markAborted;
  const aborted = new Promise((resolve) => { markAborted = resolve; });
  const createResponseFn = async (_body, signal) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"type":"response.created","response":{"id":"resp_cancel","usage":null}}\n\n'));
      signal.addEventListener("abort", () => {
        markAborted();
        controller.close();
      }, { once: true });
    }
  }), { headers: { "content-type": "text/event-stream" } });
  const router = await startServer("secret", { createResponseFn });
  const controller = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${router.port}/v1/messages`, {
      method: "POST",
      signal: controller.signal,
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({ stream: true, messages: [{ role: "user", content: "wait" }] })
    });
    await response.body.getReader().read();
    controller.abort();
    await Promise.race([aborted, new Promise((_, reject) => setTimeout(() => reject(new Error("upstream was not aborted")), 1000))]);
  } finally {
    controller.abort();
    await router.close();
  }
});
