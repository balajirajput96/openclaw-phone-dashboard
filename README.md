# OpenClaw Phone Dashboard

[![Hourly Health Check](https://github.com/balajirajput96/openclaw-phone-dashboard/actions/workflows/hourly-health.yml/badge.svg)](https://github.com/balajirajput96/openclaw-phone-dashboard/actions/workflows/hourly-health.yml)

An owner-only, mobile-first AI chat workspace with persistent conversations, selectable models, Markdown responses, and server-side streamed LLM output.

## Health automation

The **Hourly Health Check** runs at minute 17 of every hour and can also be started manually from the repository’s **Actions** tab. It performs a locked dependency install, TypeScript check, Vitest suite, and production build with read-only repository permissions. It never upgrades packages, writes database records, commits changes, or deploys the application.

The workflow is bounded to 2,400 runs. Its latest execution status is visible in the badge above. To pause it, use **Actions → Hourly Health Check → Disable workflow**. See [`docs/automation.md`](docs/automation.md) and [`docs/maintenance-baseline.json`](docs/maintenance-baseline.json) for its operating scope and verified state.

## Local development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Before a production change, run:

```bash
pnpm check
pnpm test
pnpm build
```

## Dependency alerts

Security alerts are triaged through the documented, test-first procedure in [`docs/dependency-alert-triage.md`](docs/dependency-alert-triage.md). The project deliberately does not run blanket automatic upgrades.
