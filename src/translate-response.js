export class AnthropicStream {
  constructor(model, reverseToolNames = new Map()) {
    this.model = model;
    this.reverseToolNames = reverseToolNames;
    this.index = 0;
    this.open = undefined;
    this.calls = new Map();
    this.hasTool = false;
    this.started = false;
  }

  consume(event) {
    const output = [];
    const type = event.type;
    if (type === "response.created") {
      if (this.started) return output;
      this.started = true;
      output.push(sse("message_start", { type: "message_start", message: { id: event.response?.id || `msg_${crypto.randomUUID()}`, type: "message", role: "assistant", model: event.response?.model || this.model, content: [], stop_reason: null, stop_sequence: null, usage: usage(event.response?.usage) } }));
    } else if (type === "response.reasoning_summary_part.added") {
      this.close(output);
      this.openBlock(output, "thinking", { type: "thinking", thinking: "", signature: "" });
    } else if (type === "response.reasoning_summary_text.delta") {
      this.openBlock(output, "thinking", { type: "thinking", thinking: "", signature: "" });
      output.push(sse("content_block_delta", { type: "content_block_delta", index: this.open.index, delta: { type: "thinking_delta", thinking: event.delta || "" } }));
    } else if (type === "response.output_text.delta") {
      this.closeIfDifferent(output, "text");
      this.openBlock(output, "text", { type: "text", text: "" });
      output.push(sse("content_block_delta", { type: "content_block_delta", index: this.open.index, delta: { type: "text_delta", text: event.delta || "" } }));
    } else if (type === "response.output_item.added" && event.item?.type === "function_call") {
      this.close(output);
      this.startCall(output, event.item, event.output_index);
    } else if (["response.function_call_arguments.delta", "response.custom_tool_call_input.delta"].includes(type)) {
      const call = this.findCall(event);
      if (call) output.push(sse("content_block_delta", { type: "content_block_delta", index: call.index, delta: { type: "input_json_delta", partial_json: event.delta || "" } }));
    } else if (type === "response.output_item.done") {
      if (event.item?.type === "reasoning") {
        if (event.item.encrypted_content) {
          this.openBlock(output, "thinking", { type: "thinking", thinking: "", signature: "" });
          output.push(sse("content_block_delta", { type: "content_block_delta", index: this.open.index, delta: { type: "signature_delta", signature: event.item.encrypted_content } }));
        }
        if (this.open?.kind === "thinking") this.close(output);
      } else if (event.item?.type === "function_call") {
        const call = this.findCall(event) || this.startCall(output, event.item, event.output_index);
        if (call && !call.receivedDelta && event.item.arguments) output.push(sse("content_block_delta", { type: "content_block_delta", index: call.index, delta: { type: "input_json_delta", partial_json: event.item.arguments } }));
        if (call && !call.closed) {
          output.push(sse("content_block_stop", { type: "content_block_stop", index: call.index }));
          call.closed = true;
        }
      } else if (event.item?.type === "message" && !event.item.content?.some((part) => part.type === "output_text" && part.text && this.sawTextDelta)) {
        for (const part of event.item.content || []) if (part.type === "output_text" && part.text) {
          this.closeIfDifferent(output, "text");
          this.openBlock(output, "text", { type: "text", text: "" });
          output.push(sse("content_block_delta", { type: "content_block_delta", index: this.open.index, delta: { type: "text_delta", text: part.text } }));
        }
      }
    } else if (type === "response.completed" || type === "response.incomplete") {
      this.close(output);
      for (const item of event.response?.output || []) if (item.type === "function_call" && !this.findCall({ item })) {
        const call = this.startCall(output, item);
        if (item.arguments) output.push(sse("content_block_delta", { type: "content_block_delta", index: call.index, delta: { type: "input_json_delta", partial_json: item.arguments } }));
      }
      for (const call of this.calls.values()) if (!call.closed) {
        output.push(sse("content_block_stop", { type: "content_block_stop", index: call.index }));
        call.closed = true;
      }
      const response = event.response || {};
      output.push(sse("message_delta", { type: "message_delta", delta: { stop_reason: stopReason(response, this.hasTool), stop_sequence: response.stop_sequence || null }, usage: usage(response.usage) }));
      output.push(sse("message_stop", { type: "message_stop" }));
    } else if (type === "error" || type === "response.failed") {
      const error = event.error || event.response?.error || {};
      output.push(sse("error", { type: "error", error: { type: mapErrorType(error), message: error.message || "Codex request failed" } }));
    }
    if (type === "response.output_text.delta") this.sawTextDelta = true;
    const call = this.findCall(event);
    if (call && type.endsWith(".delta")) call.receivedDelta = true;
    return output;
  }

  ensureStarted() {
    if (this.started) return [];
    this.started = true;
    return [sse("message_start", { type: "message_start", message: { id: `msg_${crypto.randomUUID()}`, type: "message", role: "assistant", model: this.model, content: [], stop_reason: null, stop_sequence: null, usage: usage() } })];
  }

  openBlock(output, kind, content) {
    if (this.open?.kind === kind) return;
    this.close(output);
    this.open = { kind, index: this.index++ };
    output.push(sse("content_block_start", { type: "content_block_start", index: this.open.index, content_block: content }));
  }

  closeIfDifferent(output, kind) {
    if (this.open && this.open.kind !== kind) this.close(output);
  }

  close(output) {
    if (!this.open) return;
    output.push(sse("content_block_stop", { type: "content_block_stop", index: this.open.index }));
    this.open = undefined;
  }

  startCall(output, item, outputIndex) {
    const key = item.call_id || item.id || `output:${outputIndex}`;
    if (this.calls.has(key)) return this.calls.get(key);
    const call = { index: this.index++, id: item.call_id || item.id || `call_${crypto.randomUUID()}`, closed: false, receivedDelta: false };
    this.calls.set(key, call);
    if (item.id) this.calls.set(item.id, call);
    if (outputIndex !== undefined) this.calls.set(`output:${outputIndex}`, call);
    this.hasTool = true;
    output.push(sse("content_block_start", { type: "content_block_start", index: call.index, content_block: { type: "tool_use", id: call.id, name: this.reverseToolNames.get(item.name) || item.name || "tool", input: {} } }));
    return call;
  }

  findCall(event) {
    return this.calls.get(event.call_id) || this.calls.get(event.item_id) || this.calls.get(event.item?.call_id) || this.calls.get(event.item?.id) || this.calls.get(`output:${event.output_index}`);
  }
}

export function terminalToMessage(event, model, reverseToolNames = new Map()) {
  const response = event.response || {};
  const content = [];
  let hasTool = false;
  for (const item of response.output || []) {
    if (item.type === "reasoning" && (item.summary?.length || item.encrypted_content)) content.push({ type: "thinking", thinking: (item.summary || []).map((part) => part.text || "").join("\n\n"), ...(item.encrypted_content ? { signature: item.encrypted_content } : {}) });
    if (item.type === "message") for (const part of item.content || []) if (part.type === "output_text" && part.text) content.push({ type: "text", text: part.text });
    if (item.type === "function_call") {
      hasTool = true;
      let input = {};
      try { input = JSON.parse(item.arguments || "{}"); } catch {}
      content.push({ type: "tool_use", id: item.call_id || item.id, name: reverseToolNames.get(item.name) || item.name, input });
    }
  }
  return { id: response.id || `msg_${crypto.randomUUID()}`, type: "message", role: "assistant", model: response.model || model, content, stop_reason: stopReason(response, hasTool), stop_sequence: response.stop_sequence || null, usage: usage(response.usage) };
}

export function sse(name, data) {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

function usage(value = {}) {
  value ||= {};
  const cached = value.input_tokens_details?.cached_tokens || 0;
  return { input_tokens: Math.max(0, (value.input_tokens || 0) - cached), output_tokens: value.output_tokens || 0, ...(cached ? { cache_read_input_tokens: cached } : {}) };
}

function stopReason(response, hasTool) {
  if (hasTool) return "tool_use";
  const reason = response.incomplete_details?.reason || response.stop_reason;
  if (["max_tokens", "max_output_tokens"].includes(reason)) return "max_tokens";
  if (reason === "content_filter" || reason === "refusal") return "refusal";
  if (reason === "model_context_window_exceeded") return reason;
  return "end_turn";
}

function mapErrorType(error) {
  if (["rate_limit_error", "overloaded_error"].includes(error.type)) return error.type;
  if (error.code === "context_length_exceeded" || error.code === "model_context_window_exceeded") return "invalid_request_error";
  if (error.type === "invalid_request_error" || error.type === "invalid_request") return "invalid_request_error";
  return "api_error";
}
