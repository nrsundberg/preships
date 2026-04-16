# Preships

**preships.io** · `npm install -g preships`

## What It Is

A standalone, agent-agnostic QA tool that watches your web application and tests it like a human would — clicking through flows, checking visual quality, monitoring performance, and reporting issues back to whatever coding agent (or human) is building it.

It works as a CLI daemon that pairs with any AI coding agent (Cursor, Claude Code, Codex, or anything else) and closes the feedback loop that's currently broken: coding agents can build UI but can't see or test it.

Pre-ship checks. Before you ship.

---

## Project Goals

### Core Mission
- Eliminate the gap between "the agent wrote the code" and "a human has to manually test everything"
- Work with any coding agent, not tied to a specific IDE or platform
- Run fully local and offline with no account required for the base experience
- Support airgapped / enterprise environments with self-hosted infrastructure

### Design Principles
- **The CLI is the product.** The cloud is optional convenience and monetization.
- **Deterministic checks first.** DOM inspection, computed styles, Lighthouse, console errors, and network timing are free, fast, and reliable. LLM-based reasoning is the escalation path, not the default.
- **One command to start.** `preships init` should get someone from zero to a working QA agent in under 5 minutes, including installing local model dependencies if needed.
- **Agent-agnostic by design.** Communicate via files and git, not proprietary APIs. Any agent that can read a file can work with Preships.
- **Open source CLI, managed cloud.** The CLI is MIT/Apache 2 licensed. The cloud service and admin app are the business.

---

## High-Level Deliverables

### 1. CLI / npm Package (`preships`)
- Published to npm, installable via `npm install -g preships`
- Commands: `init`, `watch`, `run`, `report`, `config`, `login`, `status`
- Shell completions for zsh, bash, fish
- Guided first-run setup:
  - Hardware/GPU detection
  - Ollama installation + model pull if needed
  - Coding agent detection + instruction file generation (.cursor/rules/, AGENTS.md, etc.)
  - Quick demo scan against localhost if something is running
- Playwright-based browser automation (headless Chromium, WebKit, mobile emulation)
- Deterministic checks: Lighthouse audits, accessibility/508, computed style validation, console error monitoring, network timing
- LLM-powered checks: test plan interpretation, visual screenshot analysis, interaction flow reasoning
- Tiered model routing with auto-escalation (local → cheap hosted → powerful hosted)
- Git-based trigger: watch for commits, diff to determine what changed, run relevant checks
- SQLite for run history, learned patterns, token usage tracking
- File-based reporting (.preships/report.md) for agent consumption
- Per-repo config via .preships/ directory with plan docs, status, and reports
- Multi-repo support from a single daemon via ~/.preships/state.db
- User feedback collection: ratings every ~100 interactions, error report submission on failures

### 2. Cloud API / Backend
- User registration and authentication
- API key management (bring your own keys for Claude, OpenAI, etc.)
- Model proxy / gateway for managed billing users
- Usage tracking and metering (per model, per repo, per run)
- Budget limits and alerts
- Aggregate routing intelligence (learn which models work best for which check types from anonymized usage data)
- Feedback/error report ingestion and review queue
- Stripe integration for usage-based billing

### 3. Admin / Dashboard Web App
- User registration, login, account management
- Billing dashboard: usage breakdown by model, repo, day
- Run history and reports across repos
- Feedback review queue (for internal team)
- Self-hostable for enterprise/airgapped deployments
- Hosted version on Cloudflare (Workers / Pages)

### 4. GitHub / Open Source Presence
- Public GitHub repo for the CLI
- README with clear getting-started, architecture overview, and contribution guide
- GitHub Actions CI/CD for npm publishing
- GitHub repo links to npm package page (`preships`) in README and release metadata
- npm package metadata links back to GitHub repo and docs home
- Issue templates, contributing guidelines
- Monorepo currently includes `apps/web` and `apps/console`; cloud/backend
  components can remain private even if hosted separately

---

## Quality / Must-Have Goals

### User Experience
- Beautiful, clear terminal output (colors, spinners, structured results)
- Reports that are easy to read for both humans and AI agents
- Admin dashboard with clean, modern UI
- Errors always explain what went wrong and suggest a fix
- Never nag the user — feedback prompts are rare and skippable

### Developer Experience
- Plan docs (test manifests) are simple markdown that anyone can write
- Configuration is minimal — sensible defaults for everything
- Works on macOS, Linux, and Windows
- No Docker dependency for basic usage
- Plugin/extension points for custom checks

### Reliability
- Deterministic checks never flake — if Lighthouse says the contrast is bad, it's bad
- LLM-based checks clearly labeled as "AI opinion" vs "definitive"
- Graceful degradation: if the model endpoint is down, deterministic checks still run
- The tool never modifies the user's code — it only reads and reports

### Privacy / Trust
- Open source CLI so users can audit what it does
- Clear disclosure of what data is sent when (error reports, ratings, usage telemetry)
- Everything is opt-in for data sharing
- Airgapped mode sends nothing anywhere, ever
- No screenshots or code are sent in error reports unless the user explicitly approves

---

## Business Model

| Tier | Price | What You Get |
|------|-------|-------------|
| **Free** | $0 | Full CLI, all deterministic checks, local model routing, multi-repo, plan docs, memory/learning. No account needed. |
| **Pro** | ~$20-30/mo | Managed model access with usage allowance, auto-escalation routing, dashboard, usage analytics. |
| **Team** | Per-seat | Shared plan docs and learned patterns, centralized config, volume model pricing. |
| **Enterprise** | License fee | Self-hosted admin app, airgapped support, custom model endpoints, priority support. |

---

## API & Docs Versioning

- Public site (preships.io) docs should be versioned (e.g. `/docs/v1/...`) so major releases don't break existing users' reference material.
- Console API endpoints (console.preships.io) must be versioned (`/api/v1/...`) since we can't guarantee when users will update their CLI. Old CLIs need to keep working against the API until formally deprecated.
- CLI `preships info` command shows system specs, model requirements, and dependency status so users can self-diagnose.

---

## Proof-of-Concept: Connect Four Comparison Test

### Goal
Demonstrate that Preships measurably reduces human-in-the-loop time and improves output quality when an AI agent builds a real application.

### The App
A real-time Connect Four game built with `@tabledeck/game-room` (Cloudflare Durable Objects + Workers). Requirements:
- Two players can join and play in real time
- Good mobile browser experience with touch/drag-and-drop support
- Accessible (508 compliant)
- Strong visuals — polished, not prototype-looking
- In-game chat between players
- Responsive — works well on both desktop and mobile

### Test Setup
Two parallel builds using the same prompt and the same model (Sonnet 4.6 via API):

**Run A — Agent alone (no Preships)**
- Fresh repo, standard prompt, Sonnet 4.6 with API token usage
- Human intervenes only when the agent is stuck or the result is visually broken
- Track: tokens used, dollars spent, total time, number of human interventions, subjective quality score

**Run B — Agent + Preships**
- Fresh repo, same prompt, same model
- Preships running in watch mode on the directory, feeding reports back
- Human intervenes only when both the agent and Preships can't resolve an issue
- Track: same metrics as Run A

### What We're Measuring
| Metric | Description |
|--------|-------------|
| Human-in-the-loop time | Minutes the human spent actively intervening |
| Total tokens | Combined input + output tokens across all model calls |
| Total cost ($) | API spend for the full build |
| Time to usable product | Wall clock time from first prompt to "shippable" |
| Visual quality score | Subjective 1-10 rating of the final product |
| Accessibility score | Lighthouse accessibility audit score |
| Number of human interventions | How many times a human had to step in |
| Issues caught by Preships | (Run B only) List of issues Preships identified and the agent fixed |

### Expected Outcome
Run B should show fewer human interventions, higher accessibility scores, and better visual consistency, at the cost of slightly higher token usage (from Preships' own model calls). The net result should be a faster, higher-quality product with less human time.

---

## Future / Stretch Goals
- Visual diff between runs ("the button moved 12px left since last commit")
- Design system enforcement (import a Figma/token file, check every page against it)
- CI/CD integration (run preships as a GitHub Action on PRs)
- Cross-repo pattern learning ("this team always forgets loading states on modals")
- Browser extension for manual QA sessions that feeds back into the learning database
- Plugin marketplace for community-contributed check types
