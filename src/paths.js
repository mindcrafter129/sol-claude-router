import os from "node:os";
import path from "node:path";

export const appHome = process.env.SOL_HOME || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "sol");
export const codexHome = path.join(appHome, "codex");
export const authFile = path.join(codexHome, "auth.json");
export const configFile = path.join(codexHome, "config.toml");
