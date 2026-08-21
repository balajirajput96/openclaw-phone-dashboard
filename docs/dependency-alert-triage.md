# Dependency Alert Triage

This repository may receive security alerts for both direct and transitive dependencies. Alerts are not auto-fixed because a bulk upgrade can break the streamed chat interface, the database layer, or the production build.

## Safe review sequence

Begin in GitHub’s **Security** tab and group alerts by the top-level dependency path. Prioritize actively used production packages, especially any package exposed in the server request path. Development-only tooling and deeply transitive packages should be reviewed after the application’s direct runtime dependencies.

For each proposed upgrade, create a focused branch or pull request. Update the smallest applicable direct dependency or supported override, regenerate the lockfile through the package manager, and review the resulting dependency diff. Never run a blanket `audit fix --force` command.

Validate every focused change with:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

Merge only after the targeted alert is resolved in GitHub and the health workflow completes successfully. If a package upgrade introduces a breaking change, preserve the failure evidence, revert the focused branch, and record the compatibility blocker rather than weakening application security controls or suppressing the alert.

## Current maintenance rule

The hourly workflow reports regressions; it does not modify dependencies. Dependency remediation remains a deliberate, reviewable change so that the owner-only authentication gate, persisted sessions, and streamed response path stay protected.
