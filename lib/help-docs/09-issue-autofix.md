# Issue Auto-fix

## Overview

Automatically scan GitHub Issues, fix code, create PRs — all hands-free. Uses the built-in `issue-auto-fix` pipeline workflow.

## Prerequisites

- `gh` CLI installed and authenticated: `gh auth login`
- Project has a GitHub remote

## Setup (via Project Pipeline Binding)

1. Go to **Projects → select project → Pipelines tab**
2. Click **+ Add** and select `issue-auto-fix`
3. Enable the binding
4. Set a **Schedule** (e.g., Every 30 min) for automatic scanning, or leave as "Manual only"
5. Click **Run** to manually trigger with an `issue_id`

## Flow

```
Setup → Fetch Issue → Fix Code (new branch) → Push & Create PR → Notify
```

1. **Setup**: Checks for clean working directory, detects repo and base branch
2. **Fetch Issue**: `gh issue view` fetches issue data (skips if no issue_id)
3. **Fix Code**: Claude analyzes issue and fixes code on `fix/<id>-<description>` branch
4. **Push & PR**: Pushes branch and creates Pull Request via `gh pr create`
5. **Notify**: Switches back to original branch, reports PR URL

## Input Fields

| Input | Description | Required |
|-------|-------------|----------|
| `issue_id` | GitHub issue number | Yes (skips if empty) |
| `project` | Project name | Yes |
| `base_branch` | Base branch for fix | No (auto-detect) |
| `extra_context` | Additional instructions | No |

## Safety

- Checks for uncommitted changes before starting (aborts if dirty)
- Always works on new branches (never modifies main/master)
- Cleans up old fix branches for the same issue
- Switches back to original branch after completion
- Uses `--force-with-lease` for safe push

## Legacy Issue Scanner

The old issue scanner (`Projects → Issues tab`) is still functional for existing configurations. It uses `issue_autofix_config` DB table for per-project scan settings. New projects should use the pipeline binding approach above.
