/**
 * WorkspaceOrchestrator — manages a group of agents within a workspace.
 *
 * Responsibilities:
 * - Create/remove agents
 * - Run agents (auto-select backend, inject upstream context)
 * - Listen to agent events → trigger downstream agents
 * - Approval gating
 * - Parallel execution (independent agents run concurrently)
 * - Error recovery (restart from lastCheckpoint)
 */

import { EventEmitter } from 'node:events';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  WorkspaceAgentConfig,
  AgentState,
  AgentStatus,
  WorkerEvent,
  BusMessage,
  Artifact,
  WorkspaceState,
} from './types';
import { AgentWorker } from './agent-worker';
import { AgentBus } from './agent-bus';
import { ApiBackend } from './backends/api-backend';
import { CliBackend } from './backends/cli-backend';
import { appendAgentLog, saveWorkspace, startAutoSave, stopAutoSave } from './persistence';

// ─── Orchestrator Events ─────────────────────────────────

export type OrchestratorEvent =
  | WorkerEvent
  | { type: 'bus_message'; message: BusMessage }
  | { type: 'approval_required'; agentId: string; upstreamId: string }
  | { type: 'user_input_request'; agentId: string; fromAgent: string; question: string }
  | { type: 'workspace_status'; running: number; done: number; total: number }
  | { type: 'workspace_complete' };

// ─── Orchestrator class ──────────────────────────────────

export class WorkspaceOrchestrator extends EventEmitter {
  readonly workspaceId: string;
  readonly projectPath: string;
  readonly projectName: string;

  private agents = new Map<string, { config: WorkspaceAgentConfig; worker: AgentWorker | null; state: AgentState }>();
  private bus: AgentBus;
  private approvalQueue = new Set<string>();
  private createdAt = Date.now();

  constructor(workspaceId: string, projectPath: string, projectName: string) {
    super();
    this.workspaceId = workspaceId;
    this.projectPath = projectPath;
    this.projectName = projectName;
    this.bus = new AgentBus();

    // Forward bus messages as orchestrator events
    this.bus.on('message', (msg: BusMessage) => {
      this.emit('event', { type: 'bus_message', message: msg } satisfies OrchestratorEvent);
      this.handleBusMessage(msg);
    });

    // Start auto-save (every 10 seconds)
    startAutoSave(workspaceId, () => this.getFullState());
  }

  // ─── Agent Management ──────────────────────────────────

  addAgent(config: WorkspaceAgentConfig): void {
    const state: AgentState = {
      status: 'idle',
      history: [],
      artifacts: [],
    };
    this.agents.set(config.id, { config, worker: null, state });
    this.saveNow();
    this.emitAgentsChanged();
  }

  removeAgent(id: string): void {
    const entry = this.agents.get(id);
    if (entry?.worker) {
      entry.worker.stop();
    }
    this.agents.delete(id);
    this.approvalQueue.delete(id);

    // Clean up dangling dependsOn references in other agents
    for (const [, other] of this.agents) {
      const idx = other.config.dependsOn.indexOf(id);
      if (idx !== -1) {
        other.config.dependsOn.splice(idx, 1);
      }
    }

    this.saveNow();
    this.emitAgentsChanged();
  }

  updateAgentConfig(id: string, config: WorkspaceAgentConfig): void {
    const entry = this.agents.get(id);
    if (!entry) return;
    if (entry.worker && entry.state.status === 'running') {
      entry.worker.stop();
    }
    entry.config = config;
    entry.state = { status: 'idle', history: [], artifacts: [] };
    entry.worker = null;
    this.saveNow();
    this.emitAgentsChanged();
  }

  getAgentState(id: string): Readonly<AgentState> | undefined {
    return this.agents.get(id)?.state;
  }

  getAllAgentStates(): Record<string, AgentState> {
    const result: Record<string, AgentState> = {};
    for (const [id, entry] of this.agents) {
      result[id] = entry.worker?.getState() ?? entry.state;
    }
    return result;
  }

  // ─── Execution ─────────────────────────────────────────

  /**
   * Complete an Input node — set its content and mark as done.
   * If re-submitted, resets downstream agents so they can re-run.
   */
  completeInput(agentId: string, content: string): void {
    const entry = this.agents.get(agentId);
    if (!entry || entry.config.type !== 'input') return;

    const isUpdate = entry.state.status === 'done';
    entry.config.content = content;
    entry.state.status = 'done';
    entry.state.completedAt = Date.now();
    entry.state.artifacts = [{ type: 'text', summary: content.slice(0, 200) }];

    this.emit('event', { type: 'status', agentId, status: 'done' } satisfies WorkerEvent);
    this.emit('event', { type: 'done', agentId, summary: 'Input provided' } satisfies WorkerEvent);
    this.bus.notifyTaskComplete(agentId, [], content.slice(0, 200));

    // If re-submitting, reset downstream agents to idle so they can be re-triggered
    if (isUpdate) {
      this.resetDownstream(agentId);
    }

    this.triggerDownstream(agentId);
    this.saveNow();
  }

  /** Reset an agent and all its downstream to idle (for re-run) */
  resetAgent(agentId: string): void {
    const entry = this.agents.get(agentId);
    if (!entry) return;
    if (entry.worker) entry.worker.stop();
    entry.worker = null;
    entry.state = { status: 'idle', history: [], artifacts: [] };
    this.emit('event', { type: 'status', agentId, status: 'idle' } satisfies WorkerEvent);
    this.saveNow();
  }

  /** Reset all agents that depend on the given agent (recursively) */
  private resetDownstream(agentId: string): void {
    for (const [id, entry] of this.agents) {
      if (id === agentId) continue;
      if (!entry.config.dependsOn.includes(agentId)) continue;
      if (entry.state.status === 'idle') continue;
      console.log(`[workspace] Resetting ${entry.config.label} (${id}) to idle (upstream ${agentId} changed)`);
      if (entry.worker) entry.worker.stop();
      entry.worker = null;
      entry.state = { status: 'idle', history: [], artifacts: [] };
      this.emit('event', { type: 'status', agentId: id, status: 'idle' } satisfies WorkerEvent);
      // Recursively reset agents that depend on this one
      this.resetDownstream(id);
    }
  }

  /** Validate that an agent can run (sync check). Throws on error. */
  validateCanRun(agentId: string): void {
    const entry = this.agents.get(agentId);
    if (!entry) throw new Error(`Agent "${agentId}" not found`);
    if (entry.config.type === 'input') return;
    if (entry.state.status === 'running') throw new Error(`Agent "${entry.config.label}" is already running`);
    for (const depId of entry.config.dependsOn) {
      const dep = this.agents.get(depId);
      if (!dep) throw new Error(`Dependency "${depId}" not found (deleted?). Edit the agent to fix.`);
      if (dep.state.status !== 'done') throw new Error(`Dependency "${dep.config.label}" not completed yet`);
    }
  }

  /** Run a specific agent. Checks dependencies first. userInput is for root agents (no dependencies). */
  async runAgent(agentId: string, userInput?: string): Promise<void> {
    const entry = this.agents.get(agentId);
    if (!entry) throw new Error(`Agent "${agentId}" not found`);

    // Input nodes are completed via completeInput(), not run
    if (entry.config.type === 'input') {
      if (userInput) this.completeInput(agentId, userInput);
      return;
    }

    if (entry.state.status === 'running') return;

    // Allow re-running done/failed/interrupted agents — reset them first
    if (entry.state.status === 'done' || entry.state.status === 'failed' || entry.state.status === 'interrupted') {
      console.log(`[workspace] Re-running ${entry.config.label} (was ${entry.state.status})`);
      if (entry.worker) entry.worker.stop();
      entry.worker = null;
      // For failed: keep lastCheckpoint for resume. For done: full reset.
      if (entry.state.status === 'done') {
        entry.state = { status: 'idle', history: [], artifacts: [] };
      } else {
        entry.state.status = 'idle';
      }
    }

    const { config } = entry;

    // Check if all dependencies are done
    for (const depId of config.dependsOn) {
      const dep = this.agents.get(depId);
      if (!dep || dep.state.status !== 'done') {
        throw new Error(`Dependency "${dep?.config.label || depId}" not completed yet`);
      }
    }

    // Build upstream context from dependencies (includes Input node content)
    let upstreamContext = this.buildUpstreamContext(config);
    if (userInput) {
      const prefix = '## Additional Instructions:\n' + userInput;
      upstreamContext = upstreamContext ? prefix + '\n\n---\n\n' + upstreamContext : prefix;
    }

    // Create backend
    const backend = this.createBackend(config);

    // Create worker with bus callbacks for inter-agent communication
    const peerAgentIds = Array.from(this.agents.keys()).filter(id => id !== agentId);
    const worker = new AgentWorker({
      config,
      backend,
      projectPath: this.projectPath,
      peerAgentIds,
      onBusSend: (to, content) => {
        this.bus.send(agentId, to, 'notify', { action: 'agent_message', content });
      },
      onBusRequest: async (to, question) => {
        const response = await this.bus.request(agentId, to, { action: 'question', content: question });
        return response.payload.content || '(no response)';
      },
    });
    entry.worker = worker;

    // Forward worker events
    worker.on('event', (event: WorkerEvent) => {
      // Sync state
      entry.state = worker.getState() as AgentState;

      // Persist log entries to disk
      if (event.type === 'log') {
        appendAgentLog(this.workspaceId, agentId, event.entry);
      }

      this.emit('event', event);

      // On step complete → notify bus
      if (event.type === 'step') {
        const step = config.steps[event.stepIndex];
        if (step) {
          this.bus.notifyStepComplete(agentId, step.label);
        }
      }

      // On done → notify bus + trigger downstream + check pending rerun
      if (event.type === 'done') {
        const files = entry.state.artifacts.filter(a => a.path).map(a => a.path!);
        console.log(`[workspace] Agent "${config.label}" (${agentId}) completed. Artifacts: ${files.length}.`);

        // Broadcast update_notify so other agents know this one changed
        this.bus.send(agentId, '*', 'notify', {
          action: 'update_notify',
          content: `${config.label} completed: ${event.summary}`,
          files,
        });

        this.triggerDownstream(agentId);
        this.emitWorkspaceStatus();
        this.checkWorkspaceComplete();

        // If flagged for re-run (received update_notify while running), re-run now
        if ((entry as any)._pendingRerun) {
          delete (entry as any)._pendingRerun;
          console.log(`[workspace] Agent "${config.label}" has pending rerun, re-executing...`);
          setTimeout(() => {
            this.runAgent(agentId).catch(err => {
              console.error(`[workspace] Pending rerun failed:`, err.message);
            });
          }, 500);
        }
      }

      // On error → notify bus
      if (event.type === 'error') {
        this.bus.notifyError(agentId, event.error);
        this.emitWorkspaceStatus();
      }
    });

    // Inject any pending bus messages addressed to this agent
    const pendingMsgs = this.bus.getMessagesFor(agentId)
      .filter(m => m.from !== agentId); // don't inject own messages
    for (const msg of pendingMsgs) {
      worker.injectMessage({
        type: 'system',
        subtype: 'bus_message',
        content: `[From ${msg.from}]: ${msg.payload.content || msg.payload.action}`,
        timestamp: new Date(msg.timestamp).toISOString(),
      });
    }

    // Start from checkpoint if recovering from failure
    const startStep = entry.state.status === 'failed' && entry.state.lastCheckpoint !== undefined
      ? entry.state.lastCheckpoint + 1
      : 0;

    this.emitWorkspaceStatus();

    // Execute (non-blocking — fire and forget, events handle the rest)
    worker.execute(startStep, upstreamContext).catch(err => {
      entry.state.status = 'failed';
      entry.state.error = err?.message || String(err);
      this.emit('event', { type: 'error', agentId, error: entry.state.error! } satisfies WorkerEvent);
    });
  }

  /** Run all agents that have no unmet dependencies */
  async runAll(): Promise<void> {
    const ready = this.getReadyAgents();
    await Promise.all(ready.map(id => this.runAgent(id)));
  }

  /** Pause a running agent */
  pauseAgent(agentId: string): void {
    const entry = this.agents.get(agentId);
    entry?.worker?.pause();
  }

  /** Resume a paused agent */
  resumeAgent(agentId: string): void {
    const entry = this.agents.get(agentId);
    entry?.worker?.resume();
  }

  /** Stop a running agent */
  stopAgent(agentId: string): void {
    const entry = this.agents.get(agentId);
    entry?.worker?.stop();
  }

  /** Retry a failed agent from its last checkpoint */
  async retryAgent(agentId: string): Promise<void> {
    const entry = this.agents.get(agentId);
    if (!entry || entry.state.status !== 'failed') return;
    await this.runAgent(agentId);
  }

  /** Send a message to a running agent (human intervention) */
  sendMessageToAgent(agentId: string, content: string): void {
    const entry = this.agents.get(agentId);
    if (!entry) return;

    const logEntry = {
      type: 'system' as const,
      subtype: 'user_message',
      content: `[User]: ${content}`,
      timestamp: new Date().toISOString(),
    };

    // Always log to bus
    this.bus.send('user', agentId, 'notify', {
      action: 'user_message',
      content,
    });

    if (entry.worker) {
      // Agent is running — inject into pending messages for next step
      entry.worker.injectMessage(logEntry);
    } else {
      // Agent is idle/done — store in history so it's available on next run
      entry.state.history.push(logEntry);
    }

    // Emit so UI can show the message
    this.emit('event', { type: 'log', agentId, entry: logEntry } satisfies WorkerEvent);
  }

  /** Approve a waiting agent to start execution */
  approveAgent(agentId: string): void {
    if (!this.approvalQueue.has(agentId)) return;
    this.approvalQueue.delete(agentId);
    this.runAgent(agentId).catch(() => {});
  }

  /** Reject an approval (set agent back to idle) */
  rejectApproval(agentId: string): void {
    this.approvalQueue.delete(agentId);
    const entry = this.agents.get(agentId);
    if (entry) {
      entry.state.status = 'idle';
      this.emit('event', { type: 'status', agentId, status: 'idle' } satisfies WorkerEvent);
    }
  }

  // ─── Bus Access ────────────────────────────────────────

  getBus(): AgentBus {
    return this.bus;
  }

  getBusLog(): readonly BusMessage[] {
    return this.bus.getLog();
  }

  // ─── State Snapshot (for persistence) ──────────────────

  /** Get full workspace state for auto-save */
  getFullState(): WorkspaceState {
    return {
      id: this.workspaceId,
      projectPath: this.projectPath,
      projectName: this.projectName,
      agents: Array.from(this.agents.values()).map(e => e.config),
      agentStates: this.getAllAgentStates(),
      nodePositions: {},
      busLog: [...this.bus.getLog()],
      createdAt: this.createdAt,
      updatedAt: Date.now(),
    };
  }

  getSnapshot(): {
    agents: WorkspaceAgentConfig[];
    agentStates: Record<string, AgentState>;
    busLog: BusMessage[];
  } {
    return {
      agents: Array.from(this.agents.values()).map(e => e.config),
      agentStates: this.getAllAgentStates(),
      busLog: [...this.bus.getLog()],
    };
  }

  /** Restore from persisted state */
  loadSnapshot(data: {
    agents: WorkspaceAgentConfig[];
    agentStates: Record<string, AgentState>;
    busLog: BusMessage[];
  }): void {
    this.agents.clear();
    for (const config of data.agents) {
      const state = data.agentStates[config.id] || { status: 'idle' as const, history: [], artifacts: [] };
      // Mark interrupted agents as recoverable
      if (state.status === 'running') {
        state.status = 'interrupted';
      }
      this.agents.set(config.id, { config, worker: null, state });
    }
    this.bus.loadLog(data.busLog);
  }

  /** Stop all agents, save final state, and clean up */
  shutdown(): void {
    stopAutoSave(this.workspaceId);
    // Final save before shutdown
    try { saveWorkspace(this.getFullState()); } catch {}
    for (const [, entry] of this.agents) {
      entry.worker?.stop();
    }
    this.bus.clear();
  }

  // ─── Private ───────────────────────────────────────────

  private createBackend(config: WorkspaceAgentConfig) {
    switch (config.backend) {
      case 'api':
        return new ApiBackend();
      case 'cli':
      default:
        return new CliBackend();
    }
  }

  /** Build context string from upstream agents' outputs */
  private buildUpstreamContext(config: WorkspaceAgentConfig): string | undefined {
    if (config.dependsOn.length === 0) return undefined;

    const sections: string[] = [];

    for (const depId of config.dependsOn) {
      const dep = this.agents.get(depId);
      if (!dep || dep.state.status !== 'done') continue;

      const label = dep.config.label;

      // Input nodes: use their content directly
      if (dep.config.type === 'input') {
        if (dep.config.content) {
          sections.push(`### ${label}:\n${dep.config.content}`);
        }
        continue;
      }

      const artifacts = dep.state.artifacts.filter(a => a.path);

      if (artifacts.length === 0) {
        const lastResult = [...dep.state.history].reverse().find(h => h.type === 'result');
        if (lastResult) {
          sections.push(`### From ${label}:\n${lastResult.content}`);
        }
        continue;
      }

      // Read file artifacts
      for (const artifact of artifacts) {
        if (!artifact.path) continue;
        const fullPath = resolve(this.projectPath, artifact.path);
        try {
          if (existsSync(fullPath)) {
            const content = readFileSync(fullPath, 'utf-8');
            const truncated = content.length > 10000
              ? content.slice(0, 10000) + '\n... (truncated)'
              : content;
            sections.push(`### From ${label} — ${artifact.path}:\n${truncated}`);
          }
        } catch {
          sections.push(`### From ${label} — ${artifact.path}: (could not read file)`);
        }
      }
    }

    return sections.length > 0 ? sections.join('\n\n---\n\n') : undefined;
  }

  /** After an agent completes, check if any downstream agents should be triggered */
  private triggerDownstream(completedAgentId: string): void {
    console.log(`[workspace] triggerDownstream for ${completedAgentId}. Checking ${this.agents.size} agents...`);
    for (const [id, entry] of this.agents) {
      if (id === completedAgentId) continue;
      if (entry.state.status !== 'idle') {
        console.log(`[workspace]   ${entry.config.label} (${id}): skip — status=${entry.state.status}`);
        continue;
      }
      if (!entry.config.dependsOn.includes(completedAgentId)) {
        console.log(`[workspace]   ${entry.config.label} (${id}): skip — doesn't depend on ${completedAgentId} (deps: ${entry.config.dependsOn.join(',')})`);
        continue;
      }

      // Check if ALL dependencies are done
      const allDepsDone = entry.config.dependsOn.every(depId => {
        const dep = this.agents.get(depId);
        return dep && dep.state.status === 'done';
      });

      if (!allDepsDone) continue;

      // Approval gate
      if (entry.config.requiresApproval) {
        entry.state.status = 'waiting_approval';
        this.approvalQueue.add(id);
        this.emit('event', {
          type: 'approval_required',
          agentId: id,
          upstreamId: completedAgentId,
        } satisfies OrchestratorEvent);
        this.emit('event', {
          type: 'status',
          agentId: id,
          status: 'waiting_approval',
        } satisfies WorkerEvent);
        continue;
      }

      // Auto-trigger
      this.runAgent(id).catch(err => {
        entry.state.status = 'failed';
        entry.state.error = err?.message || String(err);
        this.emit('event', { type: 'error', agentId: id, error: entry.state.error! } satisfies WorkerEvent);
      });
    }
  }

  // ─── Bus-driven behavior ────────────────────────────────

  private handleBusMessage(msg: BusMessage): void {
    const targets = msg.to === '*'
      ? Array.from(this.agents.keys()).filter(id => id !== msg.from)
      : [msg.to];

    for (const targetId of targets) {
      this.routeMessageToAgent(targetId, msg);
    }

    // Check if workspace is globally complete after each message cycle
    this.checkWorkspaceComplete();
  }

  private routeMessageToAgent(targetId: string, msg: BusMessage): void {
    const target = this.agents.get(targetId);
    if (!target) return;

    const fromLabel = this.agents.get(msg.from)?.config.label || msg.from;
    const action = msg.payload.action;
    const content = msg.payload.content || '';

    console.log(`[workspace] Bus: ${fromLabel} → ${target.config.label}: ${action} "${content.slice(0, 80)}"`);

    const logEntry = {
      type: 'system' as const,
      subtype: 'bus_message',
      content: `[From ${fromLabel}]: ${content || action}`,
      timestamp: new Date(msg.timestamp).toISOString(),
    };

    // ── Input node: request user input ──
    if (target.config.type === 'input') {
      if (action === 'info_request' || action === 'question') {
        // Emit event so frontend can show input dialog
        this.emit('event', {
          type: 'user_input_request',
          agentId: targetId,
          fromAgent: msg.from,
          question: content,
        } satisfies OrchestratorEvent);
      }
      return;
    }

    // ── Agent: behavior depends on action + current status ──
    const status = target.state.status;

    switch (action) {
      case 'fix_request':
      case 'update_request': {
        // Another agent is requesting this agent to re-do work
        // Store the message as context for the re-run
        target.state.history.push(logEntry);

        if (status === 'running') {
          // Stop current execution, then re-run with new context
          console.log(`[workspace] Stopping ${target.config.label} for fix_request, will re-run`);
          target.worker?.stop();
          // Schedule re-run after stop completes
          setTimeout(() => {
            this.runAgent(targetId).catch(err => {
              console.error(`[workspace] Re-run after fix_request failed:`, err.message);
            });
          }, 500);
        } else if (status === 'done' || status === 'idle' || status === 'failed') {
          // Re-run with the fix request as context
          this.runAgent(targetId).catch(err => {
            console.error(`[workspace] Re-run for fix_request failed:`, err.message);
          });
        }
        break;
      }

      case 'update_notify': {
        // An upstream agent has changed its output — downstream should re-validate
        target.state.history.push(logEntry);

        if (status === 'running') {
          // Option: let it finish, then re-run. Inject message for current step.
          if (target.worker) {
            target.worker.injectMessage(logEntry);
          }
          // Mark for re-run after completion
          (target as any)._pendingRerun = true;
        } else if (status === 'done') {
          // Already done — re-run to incorporate changes
          this.runAgent(targetId).catch(err => {
            console.error(`[workspace] Re-run for update_notify failed:`, err.message);
          });
        }
        break;
      }

      case 'task_complete':
      case 'step_complete': {
        // Informational — just inject into running agent's context
        if (target.worker) {
          target.worker.injectMessage(logEntry);
        }
        break;
      }

      default: {
        // Generic message: inject if running, store in history if not
        if (target.worker) {
          target.worker.injectMessage(logEntry);
        } else {
          target.state.history.push(logEntry);
        }
        break;
      }
    }
  }

  /** Check if all agents are done and no pending work remains */
  private checkWorkspaceComplete(): void {
    let allDone = true;
    for (const [, entry] of this.agents) {
      const s = entry.worker?.getState().status ?? entry.state.status;
      if (s === 'running' || s === 'paused' || s === 'waiting_approval') {
        allDone = false;
        break;
      }
      // idle agents with unmet deps don't block completion
      if (s === 'idle' && entry.config.dependsOn.length > 0) {
        const allDepsDone = entry.config.dependsOn.every(depId => {
          const dep = this.agents.get(depId);
          return dep && (dep.state.status === 'done');
        });
        if (allDepsDone) {
          allDone = false; // idle but ready to run = not complete
          break;
        }
      }
    }

    if (allDone && this.agents.size > 0) {
      const hasPendingRequests = this.bus.getLog().some(m =>
        m.type === 'request' && !this.bus.getLog().some(r =>
          r.type === 'response' && r.payload.replyTo === m.id
        )
      );
      if (!hasPendingRequests) {
        console.log('[workspace] All agents complete, no pending requests. Workspace done.');
        this.emit('event', { type: 'workspace_complete' } satisfies OrchestratorEvent);
      }
    }
  }

  /** Get agents that are idle and have all dependencies met */
  private getReadyAgents(): string[] {
    const ready: string[] = [];
    for (const [id, entry] of this.agents) {
      if (entry.state.status !== 'idle') continue;
      const allDepsDone = entry.config.dependsOn.every(depId => {
        const dep = this.agents.get(depId);
        return dep && dep.state.status === 'done';
      });
      if (allDepsDone) ready.push(id);
    }
    return ready;
  }

  private saveNow(): void {
    try { saveWorkspace(this.getFullState()); } catch {}
  }

  /** Emit agents_changed so SSE pushes the updated list to frontend */
  private emitAgentsChanged(): void {
    const agents = Array.from(this.agents.values()).map(e => e.config);
    this.emit('event', { type: 'agents_changed', agents } satisfies WorkerEvent);
  }

  private emitWorkspaceStatus(): void {
    let running = 0, done = 0;
    for (const [, entry] of this.agents) {
      const s = entry.worker?.getState().status ?? entry.state.status;
      if (s === 'running') running++;
      if (s === 'done') done++;
    }
    this.emit('event', {
      type: 'workspace_status',
      running,
      done,
      total: this.agents.size,
    } satisfies OrchestratorEvent);
  }
}
