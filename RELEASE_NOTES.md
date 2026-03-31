# Forge v0.5.10

Released: 2026-03-31

## Changes since v0.5.9

### Features
- feat: disable terminal mode for non-claude agents (codex/aider)
- feat: warn when non-claude agent uses terminal mode
- feat: abort + done buttons for pending and running messages
- feat: session file monitor — detect agent running/done from .jsonl

### Bug Fixes
- fix: remove daemon check from open_terminal API
- fix: allow opening terminal without daemon running
- fix: Forge agent skips notification messages that don't need replies
- fix: sync daemonActiveFromStream from agent smithStatus
- fix: open terminal also checks agent smithStatus, not just daemon flag
- fix: session monitor done is internal log, not user-facing
- fix: use cliType instead of agentId for agent type decisions
- fix: headless log shows agent name not misleading cli command
- fix: use crypto.randomUUID() instead of require('node:crypto') in ESM
- fix: auto-persist all log events to disk for LogPanel
- fix: add message_done action to agents API endpoint
- fix: codex headless uses 'exec' subcommand, not interactive mode
- fix: headless agents with no steps now execute, show correct agent name
- fix: include base/cliType in availableAgents, fix forti-k2 detection
- fix: split terminal launch into 4 separate short commands
- fix: split daemon tmux send-keys into 3 short commands
- fix: split env vars and CLI command to prevent terminal truncation
- fix: headless mode shows blue when active, gray only when down
- fix: auto-bind boundSessionId in startAgentSessionMonitor fallback
- fix: Done button available for both pending and running messages
- fix: restore auto-bind for boundSessionId in ensurePersistentSession
- fix: warn instead of auto-bind when boundSessionId missing
- fix: auto-bind boundSessionId for existing tmux sessions + start monitor
- fix: stopDaemon skips killing attached tmux sessions + resets running tasks
- fix: first poll records baseline, doesn't trigger running
- fix: getAllAgentStates preserves entry.state.taskStatus over worker state
- fix: faster poll interval (1s) + debug logging for session monitor
- fix: use dynamic import instead of require in session monitor (ESM)
- fix: add error handling + debug logging to session monitor startup

### Other
- debug: log emit task_status from session monitor
- debug: log stateChange event reception in orchestrator
- debug: add error logging to checkFile catch block
- disable nextjs telemetry


**Full Changelog**: https://github.com/aiwatching/forge/compare/v0.5.9...v0.5.10
