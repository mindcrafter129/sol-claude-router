export const MODELS = {
  sol: {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    description: "Latest frontier agentic coding model",
    contextWindow: 272000,
    defaultEffort: "low",
    efforts: ["low", "medium", "high", "xhigh", "max", "ultra"]
  },
  terra: {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    description: "Balanced agentic coding model for everyday work",
    contextWindow: 272000,
    defaultEffort: "medium",
    efforts: ["low", "medium", "high", "xhigh", "max", "ultra"]
  },
  luna: {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    description: "Fast and affordable agentic coding model",
    contextWindow: 272000,
    defaultEffort: "medium",
    efforts: ["low", "medium", "high", "xhigh", "max"]
  }
};

export const DEFAULT_MODEL = MODELS.sol;

export function resolveModel(value, fallback = DEFAULT_MODEL) {
  if (!value) return fallback;
  const normalized = value.toLowerCase().replace(/\[1m\]$/, "");
  const alias = { opus: "sol", sonnet: "terra", haiku: "luna" }[normalized] || normalized;
  const model = MODELS[alias] || Object.values(MODELS).find((candidate) => candidate.id === alias);
  if (!model) throw Object.assign(new Error(`Unsupported Codex model: ${value}`), { status: 400 });
  return model;
}

export function modelIds() {
  return Object.values(MODELS).map((model) => model.id);
}
