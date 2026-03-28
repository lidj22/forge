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

No API keys required. Uses your existing Claude Code subscription. Code never leaves your machine.

## Architecture

```mermaid
graph TB
    subgraph Dashboard["Forge Web Dashboard"]
        Terminal["Terminal<br/>(tmux)"]
        Workspace["Workspace<br/>(multi-agent)"]
        Projects["Projects<br/>(git/code)"]
        Tasks["Tasks<br/>(background)"]
        Skills["Skills<br/>(marketplace)"]
    end

    subgraph Services["Backend Services"]
        API["Next.js API + SSE<br/>port 8403"]
        TermSrv["Terminal Server<br/>port 8404"]
        WsDaemon["Workspace Daemon<br/>port 8405"]
        TgBot["Telegram Bot"]
    end

    subgraph Orchestrator["Agent Orchestrator"]
        Bus["Message Bus<br/>notification + ticket"]
        Watch["Watch Manager<br/>file/git monitoring"]
        Memory["Smith Memory<br/>observations"]
    end

    subgraph Backends["Agent Backends"]
        Claude["Claude Code"]
        Codex["OpenAI Codex"]
        Aider["Aider"]
        APIBackend["API Backend<br/>(Anthropic/Google/OpenAI)"]
    end

    Dashboard --> API
    API --> TermSrv
    API --> WsDaemon
    API --> TgBot
    WsDaemon --> Orchestrator
    Orchestrator --> Backends

    style Dashboard fill:#1a1a2e,stroke:#30363d,color:#e5e5e5
    style Services fill:#0d1117,stroke:#30363d,color:#e5e5e5
    style Orchestrator fill:#161b22,stroke:#58a6ff,color:#e5e5e5
    style Backends fill:#0d1117,stroke:#3fb950,color:#e5e5e5
```

## Multi-Agent Workspace (v0.5.0)

Define a team of agents with roles, dependencies, and steps. The daemon orchestrates execution while agents communicate through a structured message system.

### Agent Workflow

```mermaid
graph LR
    Input["📋 Input<br/>(Requirements)"]
    PM["🎯 PM<br/>Analyze & Plan"]
    Eng["🔨 Engineer<br/>Implement"]
    QA["🧪 QA<br/>Test & Verify"]
    Rev["👁 Reviewer<br/>Code Review"]

    Input -->|requirements| PM
    PM -->|PRD| Eng
    Eng -->|code| QA
    Eng -->|code| Rev
    QA -->|results| Rev

    style Input fill:#f0883e,stroke:#f0883e,color:#fff
    style PM fill:#a371f7,stroke:#a371f7,color:#fff
    style Eng fill:#58a6ff,stroke:#58a6ff,color:#fff
    style QA fill:#3fb950,stroke:#3fb950,color:#fff
    style Rev fill:#f778ba,stroke:#f778ba,color:#fff
```

### Three-Layer State Model

Each agent (Smith) maintains three independent status layers:

```mermaid
graph LR
    subgraph Smith["Smith Status"]
        S1["🔴 down"]
        S2["🟢 active"]
    end
    subgraph Mode["Agent Mode"]
        M1["⚙️ auto"]
        M2["⌨️ manual"]
    end
    subgraph Task["Task Status"]
        T1["⬚ idle"]
        T2["🔵 running"]
        T3["✅ done"]
        T4["❌ failed"]
    end

    S1 -->|"start daemon"| S2
    S2 -->|"stop daemon"| S1
    M1 -->|"open terminal"| M2
    M2 -->|"close terminal"| M1
    T1 -->|"message arrives"| T2
    T2 -->|"success"| T3
    T2 -->|"error"| T4
    T4 -->|"retry"| T2

    style Smith fill:#161b22,stroke:#3fb950,color:#e5e5e5
    style Mode fill:#161b22,stroke:#d2a8ff,color:#e5e5e5
    style Task fill:#161b22,stroke:#58a6ff,color:#e5e5e5
```

### Message System

Two message categories prevent loops while enabling flexible communication:

```mermaid
graph TB
    subgraph Notification["📨 Notification (follows DAG)"]
        direction LR
        N1["PM"] -->|"upstream_complete"| N2["Engineer"]
        N2 -->|"upstream_complete"| N3["QA"]
        N3 -->|"upstream_complete"| N4["Reviewer"]
    end

    subgraph Ticket["🎫 Ticket (any direction)"]
        direction LR
        T1["QA"] -->|"bug_report"| T2["Engineer"]
        T2 -->|"fixed"| T1
    end

    subgraph CausedBy["🔗 CausedBy Chain"]
        direction LR
        C1["Every message traces<br/>back to its trigger"] --> C2["Loop prevention"]
        C1 --> C3["Outbox tracking"]
        C1 --> C4["Audit trail"]
    end

    style Notification fill:#0d1117,stroke:#58a6ff,color:#e5e5e5
    style Ticket fill:#0d1117,stroke:#a371f7,color:#e5e5e5
    style CausedBy fill:#0d1117,stroke:#f0883e,color:#e5e5e5
```

### Watch Manager

Agents can autonomously monitor file changes, git commits, or custom commands:

```mermaid
graph LR
    subgraph Targets["Watch Targets"]
        D["📁 Directory"]
        G["🔀 Git commits"]
        A["🤖 Agent output"]
        C["⚡ Command"]
    end

    Check{"Periodic<br/>Check"}

    subgraph Actions["On Change"]
        L["📝 Log only"]
        AN["🔍 Auto analyze"]
        AP["✋ Require approval"]
    end

    Targets --> Check
    Check -->|"changes detected"| Actions
    Check -->|"no changes"| Check

    style Targets fill:#161b22,stroke:#58a6ff,color:#e5e5e5
    style Actions fill:#161b22,stroke:#3fb950,color:#e5e5e5
    style Check fill:#f0883e,stroke:#f0883e,color:#fff
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
forge server restart            # restart
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
