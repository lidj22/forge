<p align="center">
  <img src="app/icon.ico" width="80" height="80" alt="Forge">
</p>

<h1 align="center">Forge</h1>

<p align="center">
  <strong>Self-hosted Multi-Agent Vibe Coding Platform</strong><br>
  Multi-agent workspace · Browser terminal · AI tasks · Remote access · Telegram bot
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@aion0/forge"><img src="https://img.shields.io/npm/v/@aion0/forge" alt="npm"></a>
  <a href="https://github.com/aiwatching/forge/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@aion0/forge" alt="MIT"></a>
  <a href="https://github.com/aiwatching/forge"><img src="https://img.shields.io/github/stars/aiwatching/forge?style=social" alt="stars"></a>
</p>

<p align="center">
  <a href="https://www.youtube.com/watch?v=F3fiSiP3pZY">Watch Demo</a>
</p>

---

## Demo & Install Guide

[![Forge Install Guide](https://img.youtube.com/vi/F3fiSiP3pZY/maxresdefault.jpg)](https://www.youtube.com/watch?v=F3fiSiP3pZY)

## Install

```bash
npm install -g @aion0/forge
forge server start
```

Open `http://localhost:8403`. First launch prompts you to set an admin password.

**Requirements:** Node.js >= 20, tmux, [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)

## What is Forge?

Forge turns Claude Code into a **multi-agent remote coding platform**. Define a team of AI agents (PM, Engineer, QA, Reviewer), set dependencies, and let them collaborate through a message-driven workflow. Or use it as a single-agent Vibe Coding environment with persistent sessions.

- **Multi-Agent Workspace** — Define agent teams with roles, dependencies, and communication
- **Vibe Code anywhere** — iPad, phone, any browser. Persistent tmux sessions survive refresh/restart
- **Background AI tasks** — Submit prompts that run while you sleep. Live output, cost tracking
- **Pipeline workflows** — Chain Claude Code steps in YAML (design -> implement -> review)
- **Remote access** — One-click Cloudflare Tunnel, no account needed
- **Telegram bot** — Create tasks, check status, take notes from your phone
- **Skills marketplace** — Browse & install Claude Code slash commands

No API keys required. Uses your existing Claude Code subscription. Code never leaves your machine.

## Architecture

```
                        +------------------------------------------+
                        |         Forge Web Dashboard               |
                        |  +--------+ +--------+ +-----------+     |
                        |  |Terminal | |Workspace| | Projects  |    |
                        |  | (tmux) | | (DAG)  | | (git/code)|    |
                        |  +--------+ +--------+ +-----------+     |
                        +------------------------------------------+
                                        |
                        +------------------------------------------+
                        |     Next.js API + SSE (port 8403)        |
                        +------------------------------------------+
                            |              |              |
                  +---------+    +---------+    +---------+
                  | Terminal |   | Workspace|   | Telegram |
                  | Server   |   | Daemon   |   | Bot      |
                  | (8404)   |   | (8405)   |   |          |
                  +---------+    +---------+    +---------+
                                      |
                        +------------------------------------------+
                        |        Agent Orchestrator                 |
                        |  +------+ +------+ +------+ +--------+  |
                        |  |  PM  | | Eng  | |  QA  | |Reviewer|  |
                        |  +------+ +------+ +------+ +--------+  |
                        |      |        |        |         |       |
                        |  [Message Bus: notification + ticket]    |
                        |  [Watch Manager: file/git monitoring]    |
                        +------------------------------------------+
                                      |
                        +------------------------------------------+
                        |  CLI Backends: Claude / Codex / Aider    |
                        |  API Backends: Anthropic / Google / OpenAI|
                        +------------------------------------------+
```

## Multi-Agent Workspace (v0.5.0)

Define a team of agents with roles, dependencies, and steps. The daemon orchestrates execution while agents communicate through a structured message system.

### Agent Flow

```
  Input (Requirements)
       |
       v
  +----+----+
  |   PM    | -- Analyze requirements, write PRD
  +---------+
       |
       v
  +---------+
  |Engineer | -- Implement based on PRD
  +---------+
      / \
     v   v
+------+ +--------+
|  QA  | |Reviewer| -- Test & review in parallel
+------+ +--------+
```

### Three-Layer State Model

Each agent (Smith) has three independent status layers:

| Layer | Values | Description |
|-------|--------|-------------|
| **Smith** | `down` / `active` | Daemon process lifecycle |
| **Mode** | `auto` / `manual` | `auto` = daemon-driven, `manual` = user in terminal |
| **Task** | `idle` / `running` / `done` / `failed` | Current work status |

### Message System

Two message categories prevent loops while enabling flexible communication:

```
  Notification (follows DAG)          Ticket (any direction)
  ========================           =====================
  PM ---done---> Engineer             QA ---bug_report---> Engineer
  Engineer ---done---> QA             Engineer ---fixed---> QA
  QA ---done---> Reviewer             (1-to-1, retry limits)

  - Upstream to downstream only       - Ignores DAG direction
  - Auto-broadcast on completion       - Independent lifecycle
  - Reverse direction = discard        - open/in_progress/fixed/closed
```

Every message carries a `causedBy` field linking to the triggering inbox message, enabling:
- Loop prevention (downstream notifications silently discarded)
- Outbox tracking (verify your message was processed)
- Audit trail (every message traces back to its trigger)

### Watch Manager

Agents can autonomously monitor file changes, git commits, or custom commands:

```
  Watch Target          Detection         Action
  ================     ===========       ========
  directory:src/   --> mtime check  -->  log (report only)
  git              --> HEAD hash    -->  analyze (auto-execute)
  agent_output:qa  --> output dirs  -->  approve (user decides)
  command:npm test --> stdout diff  -->
```

### Agent Profiles

Reusable configurations for different CLI tools and API endpoints:

```yaml
# settings.yaml
agents:
  claude-opus:
    base: claude
    name: Claude Opus
    model: claude-opus-4-6

  forti-k2:
    base: claude
    name: Forti K2
    model: forti-k2
    env:
      ANTHROPIC_BASE_URL: http://my-server:7001/
      ANTHROPIC_AUTH_TOKEN: sk-xxx
```

## Features

| | |
|---|---|
| **Multi-Agent Workspace** | Define agent teams (PM, Engineer, QA, Reviewer) with DAG dependencies, message bus, watch monitoring |
| **Agent Profiles** | Reusable CLI/API configurations with env vars, model overrides, custom endpoints |
| **Vibe Coding** | Browser tmux terminal, multi-tab, split panes, WebGL rendering, Ctrl+F search |
| **AI Tasks** | Background Claude Code execution with live streaming output |
| **Pipelines** | YAML DAG workflows with parallel execution, conversation mode, visual editor |
| **Remote Access** | Cloudflare Tunnel with 2FA (password + session code) |
| **Docs Viewer** | Obsidian / markdown rendering with AI assistant |
| **Projects** | File browser, git operations, code viewer with syntax highlighting, diff view |
| **Skills** | Marketplace with incremental sync, version tracking, auto-install |
| **Telegram** | Tasks, sessions, notes, tunnel control from mobile |
| **CLI** | `forge task`, `forge watch`, `forge status`, and more |

## Quick Start

```bash
forge server start              # start (background by default)
forge server start --foreground # run in foreground
forge server start --dev        # dev mode with hot-reload
forge server stop               # stop
forge server restart             # restart
```

### From source

```bash
git clone https://github.com/aiwatching/forge.git
cd forge && pnpm install
./start.sh          # production
./start.sh dev      # development
```

## CLI

```bash
forge task <project> <prompt>   # submit a task
forge tasks                     # list tasks
forge watch <id>                # live stream output
forge status                    # process status
forge tcode                     # show tunnel URL + session code
forge projects                  # list projects
forge flows                     # list workflows
forge run <flow>                # run a workflow
forge --reset-password          # reset admin password
```

## Telegram Bot

Create a bot via [@BotFather](https://t.me/botfather), add the token in Settings.

`/task` -- create task | `/tasks` -- list | `/sessions` -- AI summary | `/note` -- quick note | `/tunnel_start` -- start tunnel | `/watch` -- monitor session

## Data

All data in `~/.forge/` -- settings, database, terminal state, workflows, workspaces, logs. Configurable via `--dir` flag.

## License

[MIT](LICENSE)
