# Security Policy

Sol Claude Router handles ChatGPT OAuth credentials and forwards local Claude Code requests to the authenticated Codex backend. Security reports are taken seriously.

## Supported versions

The latest released version receives security fixes. Older versions may be asked to upgrade before a report is investigated.

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| Earlier | No |

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/mindcrafter129/sol-claude-router/security/advisories/new). Do not include credentials, tokens, private prompts, or source code from unrelated projects in the report.

Include when possible:

- A description of the impact
- Reproduction steps using test credentials or redacted data
- Affected version and Windows version
- Whether the issue requires local access
- A suggested fix, if known

Do not open a public GitHub issue until the vulnerability has been reviewed and a disclosure plan has been agreed.

## High-priority reports

Examples include:

- OAuth access or refresh token exposure
- Credential files readable by other local users
- Router access without the generated local bearer token
- Binding the router to a non-loopback interface
- Requests or credentials sent to an unexpected host
- Command injection through router or launcher arguments
- Cross-session leakage of prompts, tools, or responses

## Credential safety

- Never commit `%LOCALAPPDATA%\sol\codex` or any `auth.json` file.
- Never paste access tokens, refresh tokens, browser cookies, or authorization URLs containing active login state into an issue.
- Use `sol logout` to revoke and remove the dedicated router credentials.
- Treat diagnostic logs as sensitive until checked for prompts and tool data.
- Keep Node.js, Claude Code, and the package dependencies updated.

## Expected behavior

The following are normally compatibility or availability issues rather than security vulnerabilities:

- A model is not exposed to a particular ChatGPT plan or workspace.
- The internal Codex backend changes an event or request format.
- Claude.ai connectors are unavailable in routed sessions.
- The router stops when Claude Code exits.

If one of these behaviors causes credential exposure, authorization bypass, or cross-user data access, report it as a security issue.
