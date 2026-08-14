import { randomUUID } from "node:crypto";
import { accountInfo, loadAuth, refreshAuth } from "./auth.js";

const BASE_URL = "https://chatgpt.com/backend-api/codex";
const CLIENT_VERSION = "0.147.0";

export async function codexFetch(path, init = {}, retry = true) {
  let auth = await loadAuth();
  const info = accountInfo(auth);
  if (!info.accountId) throw new Error("The ChatGPT OAuth token does not identify a Codex account/workspace.");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${auth.tokens.access_token}`);
  headers.set("chatgpt-account-id", info.accountId);
  headers.set("originator", "sol");
  headers.set("user-agent", `sol-claude-router/0.1.0 codex_cli_rs/${CLIENT_VERSION}`);
  headers.set("session-id", randomUUID());
  if (info.fedramp) headers.set("x-openai-fedramp", "true");
  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (response.status === 401 && retry) {
    auth = await refreshAuth(auth);
    return codexFetch(path, init, false);
  }
  return response;
}

export async function getModels() {
  const response = await codexFetch(`/models?client_version=${encodeURIComponent(CLIENT_VERSION)}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw await upstreamError(response, "model catalog");
  const body = await response.json();
  return body.models || [];
}

export async function createResponse(body, signal) {
  const response = await codexFetch("/responses", {
    method: "POST",
    signal,
    headers: { accept: "text/event-stream", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw await upstreamError(response, "response");
  return response;
}

async function upstreamError(response, operation) {
  const body = await response.json().catch(async () => ({ message: await response.text().catch(() => "") }));
  const error = new Error(`Codex ${operation} failed (${response.status}): ${body.error?.message || body.message || response.statusText}`);
  error.status = response.status;
  error.upstream = body;
  return error;
}
