# Workspace (Forge Smiths)

## Overview

Workspace is a multi-agent orchestration system. You define a team of **Smiths** (agents) with roles, dependencies, and steps. Smiths run as long-lived daemons, communicate via a message bus, and can be controlled manually or automatically.

## Concepts

| Term | Description |
|------|-------------|
| **Smith** | A long-running agent instance in the workspace |
| **Agent Profile** | A reusable configuration (CLI type + env vars + model) that can be assigned to any smith |
| **Message Bus** | Inter-agent communication system (notify, request, response) |
| **Input Node** | User-provided requirements node (append-only history) |
| **Daemon** | Background execution loop that keeps smiths alive and consuming messages |

## Two-Layer State Model

Each smith has two independent status layers:

| Layer | Values | Description |
|-------|--------|-------------|
| **Smith Status** | `down` / `active` | Whether the daemon process is running |
| **Task Status** | `idle` / `running` / `done` / `failed` | Current work status |
| **Mode** | `auto` / `manual` | `auto` = daemon-driven, `manual` = user opens terminal |

## Creating a Workspace

1. Go to **Projects → select project → Workspace tab**
2. Click **+ Add Agent** to create smiths
3. Configure each smith:
   - **Label**: Display name (e.g., "Engineer", "Reviewer", "QA")
   - **Agent/Profile**: Which CLI agent or profile to use
   - **Role**: System prompt describing the smith's responsibilities
   - **Steps**: Task prompts the smith will execute
   - **Depends On**: Other smiths that must complete first
   - **Work Dir**: Subdirectory to work in (optional, relative to project root)
   - **Outputs**: Output directories this smith produces

## Agent Configuration

### Using Base Agents
Select a detected CLI agent directly: `claude`, `codex`, `aider`.

### Using Profiles
Select a profile (e.g., `forti-k2`, `claude-opus`) to use customized env vars, model, and CLI type. Profiles are configured in Settings.

## Running the Workspace

### Start Daemon
Click **▶ Start** to launch the daemon. All smiths become `active` and begin executing their steps based on dependency order.

### Execution Flow
1. Input nodes are completed first (user provides requirements)
2. Smiths with no unmet dependencies start executing
3. On completion, a smith broadcasts to downstream smiths via the message bus
4. Downstream smiths wake up and begin their steps
5. The cycle continues until all smiths are `done` or `failed`

### Manual Mode (Open Terminal)
Click the **⌨️** button on any smith to open a terminal:
- Smith switches to `manual` mode
- A tmux session opens with the configured CLI + profile env/model
- Forge Skills are auto-installed for inter-agent communication
- You can work interactively, then close to return to daemon control

## Message Bus

Smiths communicate through the message bus. Messages have types and statuses:

### Message Types
| Type | Description |
|------|-------------|
| `notify` | One-way notification (e.g., "I'm done with feature X") |
| `request` | Asks another smith to do something (e.g., fix_request, review_request) |
| `response` | Reply to a request |
| `artifact` | Shares file outputs |

### Message Status Flow
`pending` → `running` → `done` / `failed`

### Sending Messages from Terminal
When in manual mode, smiths can use Forge Skills to communicate:
- `/forge-send` — Send a message to another smith
- `/forge-inbox` — Check incoming messages
- `/forge-status` — Check all smiths' status
- `/forge-workspace-sync` — Sync progress back to workspace

### Inline Bus Markers
In automated (daemon) mode, smiths can send messages by writing in their output:
```
[SEND:ReviewerLabel:fix_request] Please fix the auth bug in login.ts
```

## Controls

| Action | Description |
|--------|-------------|
| **Start** | Launch daemon, begin executing all agents |
| **Stop** | Stop daemon, kill all workers |
| **Pause** | Pause a specific smith (stops consuming messages) |
| **Resume** | Resume a paused smith |
| **Retry** | Retry a failed smith |
| **Reset** | Reset smith to idle, clear history |
| **Reset Downstream** | Reset a smith and all its dependents |

## Inbox Management

Each smith has an inbox showing messages from other smiths:
- **Pending**: Waiting to be processed
- **Running**: Currently being handled
- **Done**: Successfully processed
- **Failed**: Processing failed (can retry or delete)

## UI Layout

The workspace shows a **node graph** with:
- Color-coded smith nodes (status-based colors)
- Dependency edges between nodes
- Real-time status updates via SSE (Server-Sent Events)
- Click a node to see: log, memory, inbox
- Floating terminals for manual mode

## Workspace API

All workspace operations go through the daemon HTTP API (port 8405):

```bash
# List workspaces
curl http://localhost:8403/api/workspace

# Get workspace state
curl http://localhost:8403/api/workspace/<id>

# Agent operations
curl -X POST http://localhost:8403/api/workspace/<id>/agents \
  -H 'Content-Type: application/json' \
  -d '{"action":"start"}'     # start daemon
  -d '{"action":"stop"}'      # stop daemon
  -d '{"action":"run", "agentId":"engineer-123"}'        # run one smith
  -d '{"action":"pause", "agentId":"engineer-123"}'      # pause
  -d '{"action":"resume", "agentId":"engineer-123"}'     # resume
  -d '{"action":"retry", "agentId":"engineer-123"}'      # retry failed
  -d '{"action":"reset", "agentId":"engineer-123"}'      # reset to idle
  -d '{"action":"open_terminal", "agentId":"engineer-123"}'  # manual mode
  -d '{"action":"message", "agentId":"engineer-123", "content":"fix the bug"}'

# Stream real-time events (SSE)
curl http://localhost:8403/api/workspace/<id>/stream
```

## Persistence

- Workspace state: `~/.forge/workspaces/<id>/state.json`
- Auto-saved every 10 seconds
- Atomic writes (temp file → rename) for crash safety
- Synchronous save on daemon shutdown

## Tips

1. **Start with Input nodes** — define requirements before adding agent smiths
2. **Use profiles** for agents that need custom API endpoints or models
3. **Set dependencies** so downstream agents wait for upstream completion
4. **Use Work Dir** to isolate each smith's changes to a subdirectory
5. **Open Terminal** when you need to intervene manually or debug
6. **Check Inbox** when a smith is stuck — it may have unprocessed messages
7. **Retry failed smiths** after fixing the underlying issue
