# Issue Auto-fix

## Overview

Automatically scan GitHub Issues, fix code, create PRs — all hands-free. Uses the built-in `issue-fix-and-review` pipeline workflow with integrated issue scanning.

## Prerequisites

- `gh` CLI installed and authenticated: `gh auth login`
- Project has a GitHub remote

## Setup

1. Go to **Projects → select project → Pipelines tab**
2. Click **+ Add** and select `issue-fix-and-review`
3. Enable the binding
4. Check **Auto-scan GitHub Issues** to enable automatic scanning
5. Configure:
   - **Schedule**: How often to scan (e.g., Every 30 min)
   - **Labels**: Filter issues by label (comma-separated, empty = all)
   - **Base Branch**: Leave empty for auto-detect (main/master)
6. Click **Scan** to manually trigger a scan

## Flow

```
Scan Issues → For each new issue:
  Setup → Fetch Issue → Fix Code (new branch) → Push & Create PR → Notify
```

1. **Scan**: `gh issue list` finds open issues matching labels
2. **Dedup**: Already-processed issues are skipped (tracked in `pipeline_runs`)
3. **Setup**: Checks for clean working directory, detects repo and base branch
4. **Fetch Issue**: `gh issue view` fetches issue data
5. **Fix Code**: Claude analyzes issue and fixes code on `fix/<id>-<description>` branch
6. **Push & PR**: Pushes branch and creates Pull Request via `gh pr create`
7. **Notify**: Switches back to original branch, reports PR URL

## Manual Trigger

- **Run** button: Triggers the workflow with custom input (requires `issue_id`)
- **Scan** button: Scans for all open issues and triggers fixes for new ones

## Dedup

Each processed issue is tracked with a `dedup_key` (e.g., `issue:42`) in the pipeline runs table. Once an issue has been processed, it won't be triggered again even if it's still open. To re-process an issue, delete its run from the execution history.

## Safety

- Checks for uncommitted changes before starting (aborts if dirty)
- Always works on new branches (never modifies main/master)
- Cleans up old fix branches for the same issue
- Switches back to original branch after completion
- Uses `--force-with-lease` for safe push
- Running pipelines are not re-triggered (one fix per issue at a time)
