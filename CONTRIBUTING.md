# Contributing

Thanks for helping improve Sol Claude Router. Changes should keep the router small, local-only, and compatible with both Claude Code and the authenticated Codex backend.

## Requirements

- Windows
- Node.js 22 or newer
- npm
- Claude Code installed as `claude`
- A ChatGPT account with Codex access for optional live tests

## Setup

```powershell
git clone https://github.com/mindcrafter129/sol-claude-router.git
cd sol-claude-router
npm install
npm test
npm link
```

Run `sol login` only when you need to perform a live Codex test. Unit tests do not require authentication.

## Project structure

| Path | Responsibility |
| --- | --- |
| `src/cli.js` | Commands, Claude Code launch, and process-scoped environment |
| `src/auth.js` | Dedicated Codex credential storage and token refresh |
| `src/codex.js` | Authenticated Codex HTTP client and model discovery |
| `src/models.js` | Supported model IDs, aliases, effort levels, and context limits |
| `src/server.js` | Loopback Anthropic-compatible HTTP server and cancellation |
| `src/translate-request.js` | Anthropic Messages to Codex Responses translation |
| `src/translate-response.js` | Codex Responses events to Anthropic Messages translation |
| `test/` | Protocol, streaming, tool, error, and cancellation tests |

## Development workflow

1. Create a focused branch.
2. Make the smallest change that solves the problem.
3. Add or update tests for protocol behavior.
4. Run the full verification commands.
5. Open a pull request with the reason for the change and verification results.

```powershell
npm test
npm audit --omit=dev
npm pack --dry-run
```

`npm pack` runs the test suite again through the `prepack` script.

## Protocol changes

Do not guess undocumented model IDs, event names, OAuth fields, headers, or context limits. Verify changes against current primary sources or the authenticated model catalog and include the source or observed event shape in the pull request.

Translation changes should cover relevant cases with fixtures, including:

- Text streaming and event ordering
- Tool definitions, calls, argument deltas, and results
- Parallel tool calls
- Reasoning summaries and encrypted reasoning
- Usage and cached-token accounting
- Upstream errors and context exhaustion
- Client cancellation

Use metadata-only diagnostics for live debugging. Never log prompts, tool arguments, OAuth tokens, or credential-file contents.

## Live testing

Live tests use your ChatGPT subscription and may consume account limits. Keep prompts minimal and use disposable files. Never commit `%LOCALAPPDATA%\sol\codex`, Codex auth files, browser data, access tokens, or refresh tokens.

Normal `claude` behavior must remain unchanged after every test. Router settings belong only in the child Claude Code process.

## Pull requests

Pull requests should include:

- A concise description of the behavior change
- Tests covering the change
- Commands used for verification
- Any authenticated catalog or protocol assumptions
- Documentation updates for user-visible changes

Keep unrelated refactors out of the same pull request. Do not include generated `.tgz` files or `node_modules`.

## Commit messages

Use short, imperative commit subjects, for example:

```text
Add Terra model selection
Fix duplicate response start events
Document npm installation
```

## Security issues

Do not open a public issue for a suspected vulnerability or credential leak. Follow [SECURITY.md](SECURITY.md) instead.
