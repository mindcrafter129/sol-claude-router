import assert from "node:assert/strict";
import test from "node:test";
import { MODELS, resolveModel } from "../src/models.js";
import { MODEL, translateRequest } from "../src/translate-request.js";

test("translates Claude system, tools, calls, and results to Codex Responses items", () => {
  const longName = `mcp__server__${"tool".repeat(20)}`;
  const request = {
    system: [{ type: "text", text: "You are a coding agent." }],
    tools: [{ name: longName, description: "Read a file", input_schema: { properties: { path: { type: "string" } }, required: ["path"] } }],
    messages: [
      { role: "user", content: [{ type: "text", text: "Read it" }] },
      { role: "assistant", content: [{ type: "tool_use", id: "call_1", name: longName, input: { path: "a.txt" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: "hello" }] }
    ],
    tool_choice: { type: "tool", name: longName },
    thinking: { type: "enabled", budget_tokens: 20000 }
  };
  const { body, reverseToolNames } = translateRequest(request);
  assert.equal(body.model, MODEL);
  assert.deepEqual(body.input[0], { type: "message", role: "developer", content: [{ type: "input_text", text: "You are a coding agent." }] });
  assert.equal(body.input[2].type, "function_call");
  assert.equal(body.input[2].arguments, '{"path":"a.txt"}');
  assert.deepEqual(body.input[3], { type: "function_call_output", call_id: "call_1", output: "hello" });
  assert.ok(body.tools[0].name.length <= 64);
  assert.equal(reverseToolNames.get(body.tools[0].name), longName);
  assert.deepEqual(body.tool_choice, { type: "function", name: body.tools[0].name });
  assert.equal(body.reasoning.effort, "high");
});

test("round-trips Codex encrypted reasoning through Claude thinking signatures", () => {
  const { body } = translateRequest({
    messages: [{ role: "assistant", content: [{ type: "thinking", thinking: "summary", signature: "encrypted-reasoning" }] }]
  });
  assert.deepEqual(body.input[0], { type: "reasoning", encrypted_content: "encrypted-reasoning", summary: [{ type: "summary_text", text: "summary" }] });
});

test("routes Claude model aliases to Sol, Terra, and Luna", () => {
  assert.equal(translateRequest({ model: "opus", messages: [] }).body.model, MODELS.sol.id);
  assert.equal(translateRequest({ model: "sonnet", messages: [] }).body.model, MODELS.terra.id);
  assert.equal(translateRequest({ model: "haiku", messages: [] }).body.model, MODELS.luna.id);
  assert.equal(translateRequest({ model: MODELS.terra.id, messages: [] }).body.model, MODELS.terra.id);
  assert.equal(resolveModel("terra"), MODELS.terra);
});

test("maps ultracode to xhigh and rejects unsupported Luna ultra effort", () => {
  const ultracode = translateRequest({ model: "gpt-5.6-sol", thinking: { type: "adaptive" }, output_config: { effort: "ultracode" }, messages: [] });
  assert.equal(ultracode.body.reasoning.effort, "xhigh");
  assert.throws(
    () => translateRequest({ model: "gpt-5.6-luna", thinking: { type: "adaptive" }, output_config: { effort: "ultra" }, messages: [] }),
    /does not support ultra/
  );
});
