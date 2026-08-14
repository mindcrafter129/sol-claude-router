import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { authFile, codexHome, configFile } from "./paths.js";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const REFRESH_URL = "https://auth.openai.com/oauth/token";
const REFRESH_WINDOW_MS = 5 * 60 * 1000;
let refreshPromise;

export async function prepareAuthHome() {
  await mkdir(codexHome, { recursive: true });
  if (process.platform === "win32") {
    const principal = `${process.env.USERDOMAIN || os.hostname()}\\${process.env.USERNAME || os.userInfo().username}`;
    try {
      execFileSync("icacls.exe", [codexHome, "/inheritance:r", "/grant:r", `${principal}:(OI)(CI)F`, "/grant:r", "SYSTEM:(OI)(CI)F"], { stdio: "ignore" });
    } catch {
      throw new Error(`Could not secure ${codexHome} with a user-only ACL.`);
    }
  }
  await writeFile(configFile, 'cli_auth_credentials_store = "file"\nforced_login_method = "chatgpt"\n', { encoding: "utf8", mode: 0o600 });
}

export async function loadAuth({ refresh = true } = {}) {
  let auth;
  try {
    auth = JSON.parse(await readFile(authFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("Not logged in. Run `sol login` first.");
    throw new Error(`Could not read Codex credentials: ${error.message}`);
  }
  if (auth.auth_mode && !["chatgpt", "Chatgpt"].includes(auth.auth_mode)) {
    throw new Error("The Sol credential store is not using ChatGPT OAuth. Run `sol logout`, then `sol login`.");
  }
  if (!auth.tokens?.access_token || !auth.tokens?.refresh_token) throw new Error("Stored ChatGPT credentials are incomplete. Run `sol login` again.");
  if (refresh && tokenExpiresSoon(auth.tokens.access_token)) return refreshAuth(auth);
  return auth;
}

function tokenExpiresSoon(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return !payload.exp || payload.exp * 1000 <= Date.now() + REFRESH_WINDOW_MS;
  } catch {
    return true;
  }
}

export function accountInfo(auth) {
  const id = typeof auth.tokens.id_token === "string" ? decodeJwt(auth.tokens.id_token) : auth.tokens.id_token;
  return {
    accountId: auth.tokens.account_id || id?.chatgpt_account_id,
    email: id?.email,
    plan: typeof id?.chatgpt_plan_type === "string" ? id.chatgpt_plan_type : id?.chatgpt_plan_type?.type,
    fedramp: Boolean(id?.chatgpt_account_is_fedramp)
  };
}

function decodeJwt(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const claims = payload["https://api.openai.com/auth"] || {};
    return { email: payload.email || payload["https://api.openai.com/profile"]?.email, ...claims };
  } catch {
    return {};
  }
}

export async function refreshAuth(current) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const response = await fetch(REFRESH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: CLIENT_ID, grant_type: "refresh_token", refresh_token: current.tokens.refresh_token })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`ChatGPT token refresh failed (${response.status}): ${body.error_description || body.error || "login required"}`);
    const updated = structuredClone(current);
    updated.tokens.access_token = body.access_token;
    if (body.refresh_token) updated.tokens.refresh_token = body.refresh_token;
    if (body.id_token) updated.tokens.id_token = body.id_token;
    updated.last_refresh = new Date().toISOString();
    await atomicWrite(authFile, `${JSON.stringify(updated, null, 2)}\n`);
    return updated;
  })().finally(() => { refreshPromise = undefined; });
  return refreshPromise;
}

async function atomicWrite(file, contents) {
  const temporary = path.join(path.dirname(file), `.auth-${process.pid}-${Date.now()}.tmp`);
  await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
  await rm(file, { force: true });
  await rename(temporary, file);
}

export async function clearAuth() {
  await rm(authFile, { force: true });
}
