# Sol Claude Router

![npm](https://img.shields.io/npm/v/sol-claude-router)
![License](https://img.shields.io/github/license/mindcrafter129/sol-claude-router)
![npm downloads](https://img.shields.io/npm/dm/sol-claude-router)

Use GPT-5.6 Sol, Terra, and Luna inside Claude Code through your ChatGPT Codex subscription.

```text
Claude Code
    ↓
Anthropic-compatible localhost router
    ↓
ChatGPT Codex OAuth backend
    ↓
GPT-5.6
```

No OpenAI API key or Platform API credits are required. Running `claude` still uses your normal Claude Code configuration; only sessions launched with `sol` use the router.

## Requirements

- Windows
- Node.js 22 or newer
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed as the `claude` command
- A ChatGPT account with Codex access

Check your setup:

```powershell
node --version
claude --version
```

## Install from npm

```powershell
npm install --global sol-claude-router
```

Then authenticate with the official OpenAI browser flow:

```powershell
sol login
sol status
```

After the initial login, launch Claude Code from any project:

```powershell
cd C:\path\to\project
sol
```

## Models

Choose the startup model from the command line:

```powershell
sol             # GPT-5.6 Sol
sol terra       # GPT-5.6 Terra
sol luna        # GPT-5.6 Luna
```

You can also use the full option:

```powershell
sol --model sol
sol --model terra
sol --model luna
```

Inside Claude Code, run `/model`. The router maps Claude Code's model slots like this:

| Claude Code slot | Codex model |
| --- | --- |
| Opus | GPT-5.6 Sol |
| Sonnet | GPT-5.6 Terra |
| Haiku | GPT-5.6 Luna |

Use the session-only option when changing models in `/model` so your normal `claude` default is not changed.

## Reasoning effort

Set effort when launching:

```powershell
sol --effort low
sol terra --effort medium
sol terra --effort high
sol sol --effort xhigh
sol luna --effort max
```

You can also run `/effort` during a session and select `low`, `medium`, `high`, `xhigh`, `max`, or `ultracode`. Claude Code's `ultracode` mode uses `xhigh` inference plus its workflow features.

## Commands

```powershell
sol login      # Sign in through OpenAI Codex OAuth
sol logout     # Revoke and remove the dedicated login
sol status     # Show login, plan, and model availability
sol --help     # Show CLI help
```

Any other arguments are passed to Claude Code:

```powershell
sol --permission-mode plan
sol terra -p "Explain this project"
```

## Update

```powershell
npm update --global sol-claude-router
```

Check the installed version:

```powershell
npm list --global sol-claude-router
```

## Uninstall

Log out first if you also want to revoke and remove the saved ChatGPT credentials:

```powershell
sol logout
npm uninstall --global sol-claude-router
```

## Credential storage and security

Authentication is performed by the official `@openai/codex` CLI. Credentials are kept separately from your normal Codex and Claude Code configuration under:

```text
%LOCALAPPDATA%\sol\codex
```

On Windows, this directory is restricted to your user account and SYSTEM. The local router binds only to `127.0.0.1`, generates a new bearer token for every launch, and shuts down when Claude Code exits.

The router checks the authenticated Codex model catalog before launch. If the requested model is unavailable to your ChatGPT account, it exits instead of silently choosing another model.

## How tool calls work

Claude Code still owns and executes its normal tools. The router translates:

- Anthropic system prompts and messages to Codex Responses input
- Claude tool definitions to Codex function tools
- `tool_use` and `tool_result` blocks to function calls and outputs
- Codex streaming text, tool arguments, reasoning, usage, and errors back to Anthropic Messages events
- Client disconnects to upstream request cancellation

This keeps Claude Code's file reading, editing, searching, command execution, and multi-turn tool loops working through GPT-5.6.

## Install from source

```powershell
git clone https://github.com/mindcrafter129/sol-claude-router.git
cd sol-claude-router
npm install
npm link
sol login
```

## Development

```powershell
npm install
npm test
npm pack --dry-run
```

The `prepack` script runs the full test suite before npm creates or publishes a package.

## Contributing and support

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes.
- Report vulnerabilities privately using [SECURITY.md](SECURITY.md).
- See [CHANGELOG.md](CHANGELOG.md) for release history.

## Limitations

- The package currently supports Windows only.
- Sol, Terra, and Luna currently report a 272,000-token context window through the authenticated Codex catalog.
- Claude.ai connectors are unavailable in routed sessions because Claude Code uses the local router authentication token.
- The ChatGPT Codex backend is subscription- and workspace-entitlement-dependent and is not the public OpenAI Platform API.
- Internal Codex compatibility behavior can change independently of the public Responses API.

## License

[MIT](LICENSE)
