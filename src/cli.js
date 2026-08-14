#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { accountInfo, clearAuth, loadAuth, prepareAuthHome } from "./auth.js";
import { getModels } from "./codex.js";
import { DEFAULT_MODEL, MODELS, modelIds, resolveModel } from "./models.js";
import { codexHome } from "./paths.js";
import { startServer } from "./server.js";

const inputArgs = process.argv.slice(2);
const command = inputArgs[0];

try {
  if (command === "login") await login();
  else if (command === "logout") await logout();
  else if (command === "status") await status();
  else if (command === "--help" || command === "-h" || command === "help") help();
  else {
    const selection = launchSelection(inputArgs);
    await launch(selection.args, selection.model);
  }
} catch (error) {
  console.error(`sol: ${error.message}`);
  process.exitCode = 1;
}

async function login() {
  await prepareAuthHome();
  const codex = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../node_modules/@openai/codex/bin/codex.js");
  const code = await run(process.execPath, [codex, "login"], { ...process.env, CODEX_HOME: codexHome });
  if (code !== 0) throw new Error(`Codex login exited with code ${code}.`);
  await verifyModels(true);
}

async function logout() {
  try {
    await loadAuth({ refresh: false });
    const codex = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../node_modules/@openai/codex/bin/codex.js");
    const code = await run(process.execPath, [codex, "logout"], { ...process.env, CODEX_HOME: codexHome });
    if (code !== 0) throw new Error(`Codex logout exited with code ${code}.`);
  } catch (error) {
    if (!error.message.startsWith("Not logged in.")) throw error;
  }
  await clearAuth();
  console.log("Logged out of the dedicated Sol router ChatGPT session.");
}

async function status() {
  const auth = await loadAuth();
  const info = accountInfo(auth);
  const models = await getModels();
  console.log(`ChatGPT OAuth: logged in${info.email ? ` as ${info.email}` : ""}`);
  if (info.plan) console.log(`Plan: ${info.plan}`);
  let unavailable = false;
  for (const model of Object.values(MODELS)) {
    const available = hasModel(models, model.id);
    console.log(`Model ${model.id}: ${available ? "available" : "not exposed to this account"}`);
    unavailable ||= !available;
  }
  if (unavailable) process.exitCode = 2;
}

async function launch(args, selectedModel) {
  await verifyModel(selectedModel, false);
  const localToken = randomBytes(32).toString("base64url");
  const router = await startServer(localToken, { defaultModel: selectedModel });
  const env = { ...process.env };
  for (const key of ["ANTHROPIC_API_KEY", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"]) delete env[key];
  Object.assign(env, {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${router.port}`,
    ANTHROPIC_AUTH_TOKEN: localToken,
    ANTHROPIC_MODEL: selectedModel.id,
    ANTHROPIC_DEFAULT_OPUS_MODEL: MODELS.sol.id,
    ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: MODELS.sol.name,
    ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION: MODELS.sol.description,
    ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES: "effort,thinking",
    ANTHROPIC_DEFAULT_SONNET_MODEL: MODELS.terra.id,
    ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: MODELS.terra.name,
    ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION: MODELS.terra.description,
    ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES: "effort,thinking",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: MODELS.luna.id,
    ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME: MODELS.luna.name,
    ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION: MODELS.luna.description,
    ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES: "effort,thinking",
    CLAUDE_CODE_MAX_CONTEXT_TOKENS: String(selectedModel.contextWindow)
  });
  try {
    const code = await run("claude", ["--model", selectedModel.id, ...args], env);
    process.exitCode = code;
  } finally {
    await router.close();
  }
}

async function verifyModel(model, verbose) {
  await loadAuth();
  const models = await getModels();
  if (!hasModel(models, model.id)) throw new Error(`${model.id} is not exposed by the authenticated Codex model catalog. No fallback model was selected.`);
  if (verbose) console.log(`${model.id}: available`);
}

async function verifyModels(verbose) {
  for (const model of Object.values(MODELS)) await verifyModel(model, verbose);
  if (verbose) console.log("Login succeeded. Sol, Terra, and Luna are available to this ChatGPT account.");
}

function hasModel(models, id) {
  return models.some((model) => model.id === id || model.slug === id || model.model === id);
}

function launchSelection(args) {
  const output = [...args];
  let model = DEFAULT_MODEL;
  if (isModelSelector(output[0])) model = resolveModel(output.shift());
  const modelFlag = output.indexOf("--model");
  if (modelFlag >= 0) {
    if (!output[modelFlag + 1]) throw new Error("--model requires sol, terra, luna, or a full GPT-5.6 model ID.");
    model = resolveModel(output[modelFlag + 1]);
    output.splice(modelFlag, 2);
  }
  return { model, args: output };
}

function isModelSelector(value) {
  if (!value) return false;
  return ["sol", "terra", "luna", ...modelIds()].includes(value.toLowerCase());
}

function run(executable, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: "inherit", windowsHide: false });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

function help() {
  console.log("Usage: sol [sol|terra|luna] [Claude Code arguments]\n       sol --model <sol|terra|luna> [--effort <level>]\n       sol login\n       sol logout\n       sol status");
}
