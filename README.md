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
- `preships run` - run checks now
- `preships watch` - run git-aware selective checks on file changes (skips docs-only edits)
- `preships report` - print latest markdown report
- `preships status` - show local run status
- `preships info` - show system specs, model requirements, dependency status
- `preships chat` - interactive chat to tune goals/config
- `preships config get|set` - manage global config
- `preships login` - set cloud API key
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

React Router framework defaults are used in both apps, so there are no manual
`entry.client.tsx` / `entry.server.tsx` files in `apps/web` or `apps/console`.

## Current Stage

Scaffolded with:
- CLI command framework (init, run, watch, report, status, info, chat, config, login)
- Global/repo config management (TOML)
- SQLite storage layer (runs, checks, patterns, feedback, token usage)
- Deterministic check runner stubs
- Report generation
- Tailwind v4 on both web apps
- React Router v7 + Cloudflare Workers scaffolds for both sites

## License

MIT
