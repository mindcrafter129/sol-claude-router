import http from "node:http";
import { encode } from "gpt-tokenizer";
import { createResponse } from "./codex.js";
import { DEFAULT_MODEL } from "./models.js";
import { translateRequest } from "./translate-request.js";
import { AnthropicStream, terminalToMessage } from "./translate-response.js";

export async function startServer(token, { createResponseFn = createResponse, defaultModel = DEFAULT_MODEL } = {}) {
  const server = http.createServer((request, response) => handle(request, response, token, createResponseFn, defaultModel));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, port: server.address().port, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function handle(request, response, token, createResponseFn, defaultModel) {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  if (!authorized(request, token)) return json(response, 401, anthropicError("authentication_error", "Invalid local router token"));
  if (request.method === "GET" && pathname === "/health") return json(response, 200, { status: "ok", model: defaultModel.id });
  if (request.method !== "POST" || !["/v1/messages", "/v1/messages/count_tokens"].includes(pathname)) return json(response, 404, anthropicError("not_found_error", "Route not found"));
  try {
    const body = await readJson(request);
    if (pathname.endsWith("count_tokens")) return json(response, 200, { input_tokens: countTokens(body, defaultModel) });
    await messages(request, response, body, createResponseFn, defaultModel);
  } catch (error) {
    if (response.headersSent) {
      if (!response.writableEnded) response.write(`event: error\ndata: ${JSON.stringify(anthropicError(errorType(error), error.message))}\n\n`);
      response.end();
    } else json(response, error.status && error.status >= 400 && error.status < 600 ? error.status : 500, anthropicError(errorType(error), error.message));
  }
}

async function messages(request, response, body, createResponseFn, defaultModel) {
  const controller = new AbortController();
  request.on("aborted", () => controller.abort());
  response.on("close", () => { if (!response.writableEnded) controller.abort(); });
  const translated = translateRequest(body, defaultModel);
  if (process.env.SOL_DEBUG === "1") console.error(`[sol] request_model=${translated.body.model} effort=${translated.body.reasoning?.effort || "-"}`);
  const upstream = await createResponseFn(translated.body, controller.signal);
  const events = parseSse(upstream.body);
  if (body.stream) {
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    const stream = new AnthropicStream(translated.body.model, translated.reverseToolNames);
    for await (const event of events) {
      if (response.destroyed) break;
      debugEvent(event);
      const chunks = stream.consume(event);
      if (!stream.started) chunks.unshift(...stream.ensureStarted());
      if (process.env.SOL_DEBUG === "1") console.error(`[sol] translated_chunks=${chunks.length} started=${stream.started} created_match=${event.type === "response.created"}`);
      for (const chunk of chunks) {
        debugChunk(chunk);
        response.write(chunk);
      }
    }
    response.end();
  } else {
    let terminal;
    for await (const event of events) {
      debugEvent(event);
      if (["response.completed", "response.incomplete"].includes(event.type)) terminal = event;
    }
    if (!terminal) throw new Error("Codex stream ended without a terminal response.");
    json(response, 200, terminalToMessage(terminal, translated.body.model, translated.reverseToolNames));
  }
}

function debugEvent(event) {
  if (process.env.SOL_DEBUG !== "1") return;
  const item = event.item || event.response?.output?.[0];
  const deltaLength = typeof event.delta === "string" ? event.delta.length : "-";
  console.error(`[sol] upstream=${event.type || "unknown"} item=${item?.type || "-"} delta_length=${deltaLength} output_types=${(event.response?.output || []).map((value) => value.type).join(",") || "-"}`);
}

function debugChunk(chunk) {
  if (process.env.SOL_DEBUG !== "1") return;
  const name = /^event: ([^\n]+)/.exec(chunk)?.[1] || "unknown";
  let deltaLength = "-";
  try {
    const data = JSON.parse(chunk.split("\ndata: ")[1]);
    if (typeof data.delta?.text === "string") deltaLength = data.delta.text.length;
    if (typeof data.delta?.partial_json === "string") deltaLength = data.delta.partial_json.length;
  } catch {}
  console.error(`[sol] downstream=${name} delta_length=${deltaLength}`);
}

export async function* parseSse(stream) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream) {
    buffer += (typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true })).replace(/\r\n/g, "\n");
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
      if (data && data !== "[DONE]") yield JSON.parse(data);
    }
  }
}

function countTokens(body, defaultModel) {
  const translated = translateRequest(body, defaultModel).body;
  return encode(JSON.stringify({ instructions: translated.instructions, input: translated.input, tools: translated.tools })).length;
}

function authorized(request, token) {
  return request.headers.authorization === `Bearer ${token}` || request.headers["x-api-key"] === token;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024 * 1024) throw Object.assign(new Error("Request body is too large"), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Request body is not valid JSON"), { status: 400 }); }
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function anthropicError(type, message) {
  return { type: "error", error: { type, message } };
}

function errorType(error) {
  if (error.status === 429) return "rate_limit_error";
  if (error.status === 529 || error.status === 503) return "overloaded_error";
  if (error.status === 401 || error.status === 403) return "authentication_error";
  if (error.status === 400 || error.status === 413) return "invalid_request_error";
  return "api_error";
}
