---
name: codex-bridge
description: Uses OpenAI Codex (codex_exec tool from the skill-codex MCP server) as an independent reviewer or second opinion, and for bounded delegated implementation only when it clearly helps. Follow the Codex policy in kick-sync/CLAUDE.md, which limits when to call it. Use for review of risky or large changes, hard bugs, or architecture second opinions. Do not use for small, clear, low-risk changes.
license: MIT
metadata:
  author: Arystos
  version: 0.8.0
  mcp-server: skill-codex
---

# Codex Bridge

Codex is a peer reviewer, not an authority. It uses the `codex_exec` tool from the `skill-codex` MCP server. The policy in `kick-sync/CLAUDE.md` decides when to call it.

## Workflows

1. Review: scope is `git status --short`, `git diff`, `git diff --cached` and new untracked files (or `git diff <branch>...HEAD`, or `git show <sha>`). If the diff is over about 50,000 characters, summarize and warn. Call `codex_exec` with mode "exec" and requireGit true, asking for findings with severity (CRITICAL, HIGH, MEDIUM, LOW), file and line, description and fix, focused on bugs, security, performance, error handling and readability. Verdict: BLOCKED (any CRITICAL or HIGH), WARNING (only MEDIUM or LOW), APPROVED (none). Add your own agree or disagree for each finding and confirm it in the real code.
2. Consult: frame the question with the needed context, call `codex_exec` in mode "exec", then give Codex's view, your own independent view and a recommendation.
3. Delegate (only when it clearly helps or the owner asks): self-contained prompt with exact paths, the change, constraints and done condition; mode "full-auto" with requireGit true; then `git status --short` and `git diff`, and review everything before keeping it.

## codex_exec parameters

prompt (required); mode "exec" (read-only, default) or "full-auto" (can write); sandbox; sessionId; model; reasoningEffort; review (native `codex exec review`); reviewBase; reviewCommit; cwd; timeoutMs (default 5 min); requireGit.

## Rules

- Say what you send to Codex and why.
- Fail soft: if Codex is missing, not logged in or offline, say so and continue without it.
- Never paste secrets into a Codex prompt.

## Troubleshooting

- Binary missing: `npm i -g @openai/codex`.
- Not authenticated: `codex login` on a local machine, or the `OPENAI_API_KEY` environment variable in a cloud session.
