# Projects

## Setup

Add project directories in Settings → **Project Roots** (e.g. `~/Projects`). Forge scans subdirectories automatically.

## Features

### Code Tab
- File tree browser
- Syntax-highlighted code viewer
- Git diff view (click changed files)
- Git operations: commit, push, pull
- Commit history

### Skills & Commands Tab
- View installed skills/commands for this project
- Scope indicator: G (global), P (project), G+P (both)
- Edit files, update from marketplace, uninstall

### CLAUDE.md Tab
- View and edit project's CLAUDE.md
- Apply rule templates (built-in or custom)
- Templates auto-injected with dedup markers

### Issues Tab
- Enable GitHub Issue Auto-fix per project
- Configure scan interval and label filters
- Manual trigger: enter issue # and click Fix Issue
- Processed issues history with retry/delete
- Auto-chains: fix → create PR → review

### Workspace Tab
- Configure multi-agent workspace (Forge Smiths)
- Add smiths with roles, steps, and dependencies
- Start/stop daemon, monitor execution
- See [Workspace documentation](11-workspace.md) for details

## Favorites

Click ★ next to a project to favorite it. Favorites appear at the top of the sidebar.

## Terminal

### Opening a Terminal

There are two ways to open a terminal for a project:

**1. Project Header Button**
- Click **Terminal** in the project header → opens with default agent (claude)
- Click **▾** dropdown to select a different agent or profile
- If the agent supports sessions (claude-code), a dialog shows: New Session / Resume Latest / Browse Sessions
- Non-session agents (codex, aider) open directly

**2. Terminal Tab "+" Button**
- Click **+** in the terminal tab bar → select a project root → expand to see projects
- Click an agent button (C = Claude, X = Codex, A = Aider, ● = Profile) to open
- The terminal launches with the agent's configured env vars and model

### Agent & Profile Selection

When selecting an agent or profile for a terminal:
- **Base agents** (Claude, Codex, Aider): Use their default configuration
- **Profiles** (e.g., Forti K2, Claude Opus): Apply the profile's environment variables and model override
- Environment variables are exported in the terminal before launching the CLI
- Model is passed via `--model` flag (for claude-code agents)

### Terminal Features
- Full xterm.js terminal with tmux session persistence
- Split panes (horizontal/vertical)
- Multiple tabs per project
- Tab state preserved across page refreshes
- Tabs can be renamed and reordered
