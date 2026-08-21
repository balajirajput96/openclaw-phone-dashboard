# Repository Health Automation

The **Hourly Health Check** validates the OpenClaw Phone Dashboard repository once per hour. It uses GitHub-hosted runners and does not change application code, dependencies, database records, repository settings, or deployment state.

## What each run does

Each eligible run installs the locked dependency set, then runs the TypeScript check, Vitest suite, and production build. The workflow is limited to its first **2,400 runs** through `github.run_number`; subsequent scheduled runs will be skipped rather than make changes.

## Monitoring

Open the repository’s **Actions** tab, select **Hourly Health Check**, and review the latest run. A failed step includes its command output, allowing the failure to be investigated without exposing project secrets.

## Manual verification

From the workflow page, use **Run workflow** to trigger the same validation on demand. Manual runs count toward the 2,400-run limit.

## Pausing or disabling

To pause checks, open the workflow in the **Actions** tab and use **Disable workflow**. To resume it later, use **Enable workflow**. The workflow has read-only repository permissions and does not push commits or create pull requests.
