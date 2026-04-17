# Preships

Pre-ship checks for AI-assisted web development.

Preships is a CLI-first QA agent that runs deterministic UI checks and writes actionable reports to `.preships/report.md`.

## Install

```bash
npm install -g preships
```

## Links

- GitHub: [https://github.com/nrsundberg/preships](https://github.com/nrsundberg/preships)
- npm: [https://www.npmjs.com/package/preships](https://www.npmjs.com/package/preships)
- Docs: [https://preships.io](https://preships.io)

## Quick Start

```bash
cd your-repo
preships init --url http://localhost:3000
preships run
preships report
```

## Commands

- `preships init` - initialize repo config/instructions and run local environment checks with setup hints (`--skip-env-check` to disable)
- `preships run` - run checks now; add `--llm` for an optional LLM review after deterministic checks, or set `llmChecks = true` in `.preships/config.toml` (use `--no-llm` to skip)
- `preships watch` - run git-aware selective checks on file changes (skips docs-only edits)
- `preships report` - print latest markdown report
- `preships status` - show local run status
- `preships info` - show system specs, model requirements, dependency status
- `preships chat` - interactive chat to tune goals/config
- `preships config get|set` - manage global config
- `preships login` - log in to cloud with browser flow (or `--api-key`)
- `preships completion <bash|zsh|fish>` - print a shell completion script

## Shell Completions

Generate a completion script for your shell:

```bash
preships completion zsh
preships completion bash
preships completion fish
```

Install completions (recommended locations):

```bash
# zsh (oh-my-zsh/custom path)
preships completion zsh > "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/preships/_preships"

# bash (user-local bash-completion path)
mkdir -p "$HOME/.local/share/bash-completion/completions"
preships completion bash > "$HOME/.local/share/bash-completion/completions/preships"

# fish
mkdir -p "$HOME/.config/fish/completions"
preships completion fish > "$HOME/.config/fish/completions/preships.fish"
```

Restart your shell (or `source` the generated file) after installation.

## Deterministic Check Behavior

- `checkTypes` are normalized (trimmed, lowercased, deduplicated) and executed in a stable order.
- Unknown check types are retained, but always run after built-in checks in alphabetical order.
- Invalid or empty check configuration fails fast with explicit validation issues.
- Reports are written with stable check/issue ordering so repeated runs are comparable.

## Monorepo Structure

```
packages/cli        → published npm package (preships)
apps/web            → preships.io — public site + docs (React Router v7 + Cloudflare Workers)
apps/console        → console.preships.io — admin dashboard, billing, usage (React Router v7 + Cloudflare Workers + D1)
```

## Workspace Commands

```bash
npm install           # install all workspaces
npm run build         # build all workspaces
npm run dev:cli       # develop CLI
npm run dev:web       # develop public site
npm run dev:console   # develop admin console
```

React Router framework defaults are used for client entrypoints, and each app
now includes an explicit `entry.server.tsx` for Cloudflare Worker SSR.

## Console Auth Deploy Checklist

- Create/configure a D1 database for `apps/console` and bind it to the Worker per `apps/console/wrangler.jsonc`.
- Set Wrangler **secrets** for `BETTER_AUTH_SECRET` and any Stripe/webhook secrets; set **vars** for `BETTER_AUTH_URL` (must match the deployed console origin).
- Configure OAuth provider credentials for Google and GitHub in the Cloudflare environment (client ID + secret); do not commit real secrets.
- **Apply all SQL migrations** under [`apps/console/migrations/`](apps/console/migrations/) to the bound D1 database. Migrations are applied in **lexicographic order by full filename** (not only the numeric prefix). Duplicate prefixes (`0003_*`, `0007_*`) are intentional; order is unambiguous when sorting by full path. Canonical order:
  1. `0001_cli_device_sessions.sql`
  2. `0002_organizations_memberships.sql`
  3. `0003_org_domain_tables.sql`
  4. `0003_organization_billing_profiles.sql`
  5. `0003_org_usage.sql`
  6. `0004_dashboard_metrics.sql`
  7. `0005_org_page_domain_foundation.sql`
  8. `0006_api_key_token_hash.sql`
  9. `0007_org_invites.sql`
  10. `0007_org_usage_model_daily.sql`
- **Stripe (billing):** configure product/price IDs and `STRIPE_WEBHOOK_SECRET` (and related vars) in the Worker environment; empty or placeholder price IDs will block real checkout until set.
- Deploy `@preships/console` and verify:
  - `/login` + `/signup` routes
  - `/login/device` approval flow from `preships login`
  - protected routes redirect when signed out
  - org/billing/usage routes if you rely on those features

## Current Stage

Shipped in-repo:

- CLI command framework (init, run, watch, report, status, info, chat, config, login)
- Global/repo config management (TOML)
- SQLite storage layer (runs, checks, patterns, feedback, token usage)
- Deterministic checks: Playwright-driven `styles`, `console`, and `network`; Lighthouse category scores for `lighthouse`; axe-core for `accessibility`; optional LLM review (`llm-review`) via `--llm` or repo `llmChecks`
- Report generation (`.preships/report.md`)
- Tailwind v4 on both web apps
- React Router v7 + Cloudflare Workers scaffolds for both sites

See [GOALS.md](GOALS.md) for the broader roadmap (LLM checks, cloud gateway, Connect Four PoC, and more).

## License

MIT
