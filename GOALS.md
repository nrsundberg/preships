# vibe-checker

## What It Is

A standalone, agent-agnostic QA tool that watches your web application and tests it like a human would — clicking through flows, checking visual quality, monitoring performance, and reporting issues back to whatever coding agent (or human) is building it.

It works as a CLI daemon that pairs with any AI coding agent (Cursor, Claude Code, Codex, or anything else) and closes the feedback loop that's currently broken: coding agents can build UI but can't see or test it.

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
- **One command to start.** `qaagent init` should get someone from zero to a working QA agent in under 5 minutes, including installing local model dependencies if needed.
- **Agent-agnostic by design.** Communicate via files and git, not proprietary APIs. Any agent that can read a file can work with vibe-checker.
- **Open source CLI, managed cloud.** The CLI is MIT/Apache 2 licensed. The cloud service and admin app are the business.

---

## High-Level Deliverables

### 1. CLI / npm Package (`vibe-checker`)
- Published to npm, installable via `npm install -g vibe-checker`
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
- File-based reporting (.qaagent/report.md) for agent consumption
- Per-repo config via .qaagent/ directory with plan docs, status, and reports
- Multi-repo support from a single daemon via ~/.vibe-checker/state.db
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
- Issue templates, contributing guidelines
- Separate private repo(s) for cloud API and admin app

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

## Future / Stretch Goals
- Visual diff between runs ("the button moved 12px left since last commit")
- Design system enforcement (import a Figma/token file, check every page against it)
- CI/CD integration (run vibe-checker as a GitHub Action on PRs)
- Cross-repo pattern learning ("this team always forgets loading states on modals")
- Browser extension for manual QA sessions that feeds back into the learning database
- Plugin marketplace for community-contributed check types
