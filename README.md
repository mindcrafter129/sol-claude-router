# Sol Claude Router

`sol` launches Claude Code against a loopback Anthropic Messages endpoint backed by the authenticated ChatGPT Codex Responses service. It supports `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`. It never uses an OpenAI API key and never changes Claude Code's global configuration.

## Commands

```powershell
sol login
sol status
sol
sol terra
sol luna --effort low
sol logout
```

The first optional argument selects `sol`, `terra`, or `luna`; remaining arguments are passed to Claude Code. Inside a session, `/model` maps Opus to Sol, Sonnet to Terra, and Haiku to Luna. Use `/effort` to select `low`, `medium`, `high`, `xhigh`, `max`, or `ultracode`; Luna does not expose the catalog's separate `ultra` inference level. The router binds only to `127.0.0.1`, uses a new random local bearer token for every launch, and exits with Claude Code.

Authentication is performed by the pinned official `@openai/codex` CLI. Its dedicated credential cache is stored under `%LOCALAPPDATA%\sol\codex` with a user-and-SYSTEM-only Windows ACL. `sol logout` delegates revocation to the official CLI before removing the local cache.

At login, status, and launch, the router queries the authenticated Codex model catalog. If the selected model is not exposed to the selected ChatGPT workspace, it exits instead of silently substituting a model.

Claude Code receives the authenticated Codex catalog's current 272,000-token context-window override for these three subscription models. This differs from the public Platform API metadata for GPT-5.6 Sol.

## Protocol notes

- Anthropic `system` content becomes a Codex developer message.
- Claude tool definitions, `tool_use`, and `tool_result` blocks map to Responses function tools, calls, and outputs.
- Responses text, function argument, reasoning summary, encrypted reasoning, terminal usage, and errors map to Anthropic Messages events.
- Client disconnects abort the upstream request.
- `/v1/messages/count_tokens` uses the GPT tokenizer locally. The authenticated backend does not expose a stable Anthropic-compatible counting contract, so this count is suitable for compaction decisions but is not a billing measurement.

The ChatGPT Codex backend is subscription- and workspace-entitlement-dependent and is not the public OpenAI Platform API. Its internal compatibility surface may change independently of the public Responses API.
