import { createHash } from "node:crypto";
import { DEFAULT_MODEL, resolveModel } from "./models.js";

export const MODEL = DEFAULT_MODEL.id;

export function translateRequest(request, fallbackModel = DEFAULT_MODEL) {
  const model = resolveModel(request.model, fallbackModel);
  const names = createToolNameMap(request.tools || []);
  const input = [];
  const system = textBlocks(request.system);
  if (system) input.push(message("developer", [{ type: "input_text", text: system }]));

  for (const source of request.messages || []) {
    const role = source.role === "system" ? "developer" : source.role;
    const blocks = typeof source.content === "string" ? [{ type: "text", text: source.content }] : source.content || [];
    let parts = [];
    const flush = () => {
      if (parts.length) input.push(message(role, parts));
      parts = [];
    };
    for (const block of blocks) {
      if (block.type === "text") parts.push({ type: role === "assistant" ? "output_text" : "input_text", text: block.text || "" });
      else if (block.type === "image" && block.source?.type === "base64") parts.push({ type: "input_image", image_url: `data:${block.source.media_type};base64,${block.source.data}` });
      else if (block.type === "document" && block.source?.type === "base64" && block.source.media_type === "application/pdf") parts.push({ type: "input_file", filename: "document.pdf", file_data: `data:application/pdf;base64,${block.source.data}` });
      else if (block.type === "thinking" && role === "assistant" && block.signature) {
        flush();
        input.push({ type: "reasoning", encrypted_content: block.signature, summary: block.thinking ? [{ type: "summary_text", text: block.thinking }] : [] });
      } else if (block.type === "tool_use") {
        flush();
        input.push({ type: "function_call", call_id: shorten(block.id, 64), name: names.forward.get(block.name) || shorten(block.name, 64), arguments: JSON.stringify(block.input || {}) });
      } else if (block.type === "tool_result") {
        flush();
        input.push({ type: "function_call_output", call_id: shorten(block.tool_use_id, 64), output: toolOutput(block) });
      }
    }
    flush();
  }

  return {
    body: {
      model: model.id,
      instructions: "",
      input,
      tools: request.tools?.map((tool) => ({
        type: "function",
        name: names.forward.get(tool.name),
        description: tool.description || "",
        parameters: normalizeSchema(tool.input_schema),
        strict: false
      })),
      tool_choice: toolChoice(request.tool_choice, names.forward),
      parallel_tool_calls: request.tool_choice?.disable_parallel_tool_use !== true,
      reasoning: reasoning(request, model),
      store: false,
      stream: true,
      include: ["reasoning.encrypted_content"]
    },
    reverseToolNames: names.reverse
  };
}

function message(role, content) {
  return { type: "message", role, content };
}

function textBlocks(value) {
  if (typeof value === "string") return value;
  return (value || []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
}

function toolOutput(block) {
  const content = block.content;
  const prefix = block.is_error ? "Tool error:\n" : "";
  if (typeof content === "string") return prefix + content;
  if (!Array.isArray(content)) return prefix;
  const parts = content.map((part) => part.type === "text"
    ? { type: "input_text", text: part.text || "" }
    : part.type === "image" && part.source?.type === "base64"
      ? { type: "input_image", image_url: `data:${part.source.media_type};base64,${part.source.data}` }
      : undefined).filter(Boolean);
  return block.is_error ? prefix + parts.map((part) => part.text || "[image]").join("\n") : parts;
}

function normalizeSchema(schema) {
  const result = structuredClone(schema || {});
  if (!result.type) result.type = "object";
  if (result.type === "object" && !result.properties) result.properties = {};
  delete result.$schema;
  return result;
}

function reasoning(request, model) {
  const type = request.thinking?.type;
  let effort = request.output_config?.effort || model.defaultEffort;
  if (effort === "ultracode") effort = "xhigh";
  if (type === "disabled") effort = "none";
  else if (!request.output_config?.effort && type === "enabled") {
    const budget = request.thinking.budget_tokens || 0;
    effort = budget >= 32000 ? "xhigh" : budget >= 16000 ? "high" : budget >= 4000 ? "medium" : "low";
  }
  if (effort !== "none" && !model.efforts.includes(effort)) throw Object.assign(new Error(`${model.id} does not support ${effort} reasoning effort`), { status: 400 });
  return { effort, summary: type === "disabled" ? "none" : "auto" };
}

function toolChoice(choice, names) {
  if (!choice || choice.type === "auto") return "auto";
  if (choice.type === "any") return "required";
  if (choice.type === "none") return "none";
  if (choice.type === "tool") return { type: "function", name: names.get(choice.name) || shorten(choice.name, 64) };
  return "auto";
}

function createToolNameMap(tools) {
  const forward = new Map();
  const reverse = new Map();
  for (const tool of tools) {
    let name = shorten(tool.name, 64);
    let suffix = 1;
    while (reverse.has(name) && reverse.get(name) !== tool.name) name = `${shorten(tool.name, 60)}_${suffix++}`;
    forward.set(tool.name, name);
    reverse.set(name, tool.name);
  }
  return { forward, reverse };
}

function shorten(value = "", limit) {
  if (value.length <= limit) return value;
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 12);
  return `${value.slice(0, limit - hash.length - 1)}_${hash}`;
}
