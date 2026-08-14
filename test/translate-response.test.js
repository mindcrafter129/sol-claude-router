import assert from "node:assert/strict";
import test from "node:test";
import { AnthropicStream, terminalToMessage } from "../src/translate-response.js";

function parse(chunks) {
  return chunks.map((chunk) => JSON.parse(chunk.split("\ndata: ")[1]));
}

test("streams text, tool arguments, usage, and stop ordering", () => {
  const stream = new AnthropicStream("gpt-5.6-sol", new Map([["short", "mcp__server__tool"]]));
  const events = [
    { type: "response.created", response: { id: "resp_1", model: "gpt-5.6-sol" } },
    { type: "response.output_text.delta", delta: "Checking." },
    { type: "response.output_item.added", output_index: 1, item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "short" } },
    { type: "response.function_call_arguments.delta", output_index: 1, item_id: "fc_1", delta: '{"path":' },
    { type: "response.function_call_arguments.delta", output_index: 1, item_id: "fc_1", delta: '"a.txt"}' },
    { type: "response.output_item.done", output_index: 1, item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "short", arguments: '{"path":"a.txt"}' } },
    { type: "response.completed", response: { usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 25 }, output_tokens: 12 } } }
  ];
  const output = parse(events.flatMap((event) => stream.consume(event)));
  assert.deepEqual(output.map((event) => event.type), [
    "message_start", "content_block_start", "content_block_delta", "content_block_stop",
    "content_block_start", "content_block_delta", "content_block_delta", "content_block_stop",
    "message_delta", "message_stop"
  ]);
  assert.equal(output[4].content_block.name, "mcp__server__tool");
  assert.equal(output[8].delta.stop_reason, "tool_use");
  assert.deepEqual(output[8].usage, { input_tokens: 75, output_tokens: 12, cache_read_input_tokens: 25 });
});

test("ignores duplicate Codex response.created events", () => {
  const stream = new AnthropicStream("gpt-5.6-sol");
  const first = stream.consume({ type: "response.created", response: { id: "resp_1", usage: null } });
  const duplicate = stream.consume({ type: "response.created", response: { id: "resp_1" } });
  assert.equal(first.length, 1);
  assert.equal(duplicate.length, 0);
});

test("streams reasoning summary with encrypted signature before block stop", () => {
  const stream = new AnthropicStream("gpt-5.6-sol");
  const output = parse([
    ...stream.consume({ type: "response.created", response: { id: "resp_1" } }),
    ...stream.consume({ type: "response.reasoning_summary_text.delta", delta: "Inspecting files" }),
    ...stream.consume({ type: "response.output_item.done", item: { type: "reasoning", encrypted_content: "signature" } })
  ]);
  assert.deepEqual(output.slice(1).map((event) => event.type), ["content_block_start", "content_block_delta", "content_block_delta", "content_block_stop"]);
  assert.equal(output[3].delta.type, "signature_delta");
});

test("builds non-stream tool use response", () => {
  const message = terminalToMessage({ type: "response.completed", response: {
    id: "resp_2", model: "gpt-5.6-sol", usage: { input_tokens: 4, output_tokens: 2 },
    output: [{ type: "function_call", call_id: "call_2", name: "read", arguments: '{"path":"b.txt"}' }]
  } }, "gpt-5.6-sol");
  assert.equal(message.stop_reason, "tool_use");
  assert.deepEqual(message.content[0], { type: "tool_use", id: "call_2", name: "read", input: { path: "b.txt" } });
});

test("maps streamed failures and context exhaustion", () => {
  const stream = new AnthropicStream("gpt-5.6-sol");
  const failure = parse(stream.consume({ type: "response.failed", error: { type: "invalid_request", code: "context_length_exceeded", message: "too long" } }));
  assert.equal(failure[0].type, "error");
  assert.equal(failure[0].error.type, "invalid_request_error");

  const terminal = terminalToMessage({ type: "response.incomplete", response: { incomplete_details: { reason: "model_context_window_exceeded" }, output: [] } }, "gpt-5.6-sol");
  assert.equal(terminal.stop_reason, "model_context_window_exceeded");
});
