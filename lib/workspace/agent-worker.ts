/**
 * AgentWorker — manages the lifecycle of a single workspace agent.
 *
 * Responsibilities:
 * - Multi-step execution with context accumulation
 * - Pause / resume / stop
 * - Bus message injection between steps
 * - Event emission for UI and orchestrator
 */

import { EventEmitter } from 'node:events';
import type {
  WorkspaceAgentConfig,
  AgentState,
  AgentStatus,
  AgentBackend,
  WorkerEvent,
  Artifact,
  BusMessage,
} from './types';
import type { TaskLogEntry } from '@/src/types';

export interface AgentWorkerOptions {
  config: WorkspaceAgentConfig;
  backend: AgentBackend;
  projectPath: string;
  // Bus communication callbacks (injected by orchestrator)
  onBusSend?: (to: string, content: string) => void;
  onBusRequest?: (to: string, question: string) => Promise<string>;
  peerAgentIds?: string[];
}

export class AgentWorker extends EventEmitter {
  readonly config: WorkspaceAgentConfig;
  private state: AgentState;
  private backend: AgentBackend;
  private projectPath: string;
  private busCallbacks: {
    onBusSend?: (to: string, content: string) => void;
    onBusRequest?: (to: string, question: string) => Promise<string>;
    peerAgentIds?: string[];
  };

  // Control
  private abortController: AbortController | null = null;
  private paused = false;
  private pauseResolve: (() => void) | null = null;

  // Bus messages queued between steps
  private pendingMessages: TaskLogEntry[] = [];

  constructor(opts: AgentWorkerOptions) {
    super();
    this.config = opts.config;
    this.backend = opts.backend;
    this.projectPath = opts.projectPath;
    this.busCallbacks = {
      onBusSend: opts.onBusSend,
      onBusRequest: opts.onBusRequest,
      peerAgentIds: opts.peerAgentIds,
    };
    this.state = {
      status: 'idle',
      history: [],
      artifacts: [],
    };
  }

  // ─── Public API ──────────────────────────────────────

  /**
   * Execute all steps starting from `startStep`.
   * For recovery, pass `lastCheckpoint + 1`.
   */
  async execute(startStep = 0, upstreamContext?: string): Promise<void> {
    const { steps } = this.config;
    if (steps.length === 0) {
      this.setStatus('done');
      this.emitEvent({ type: 'done', agentId: this.config.id, summary: 'No steps defined' });
      return;
    }

    this.abortController = new AbortController();
    this.setStatus('running');
    this.state.startedAt = Date.now();
    this.state.error = undefined;

    for (let i = startStep; i < steps.length; i++) {
      // Check pause
      await this.waitIfPaused();

      // Check abort
      if (this.abortController.signal.aborted) {
        this.setStatus('interrupted');
        return;
      }

      const step = steps[i];
      this.state.currentStep = i;
      this.emitEvent({ type: 'step', agentId: this.config.id, stepIndex: i, stepLabel: step.label });

      // Consume pending bus messages → append to history as context
      if (this.pendingMessages.length > 0) {
        for (const msg of this.pendingMessages) {
          this.state.history.push(msg);
        }
        this.pendingMessages = [];
      }

      try {
        const result = await this.backend.executeStep({
          config: this.config,
          step,
          stepIndex: i,
          history: this.state.history,
          projectPath: this.projectPath,
          upstreamContext: i === startStep ? upstreamContext : undefined,
          onBusSend: this.busCallbacks.onBusSend,
          onBusRequest: this.busCallbacks.onBusRequest,
          peerAgentIds: this.busCallbacks.peerAgentIds,
          abortSignal: this.abortController.signal,
          onLog: (entry) => {
            this.state.history.push(entry);
            this.emitEvent({ type: 'log', agentId: this.config.id, entry });
          },
        });

        // Record the assistant's final response for this step
        this.state.history.push({
          type: 'result',
          subtype: 'step_complete',
          content: result.response,
          timestamp: new Date().toISOString(),
        });

        // Collect artifacts
        for (const artifact of result.artifacts) {
          this.state.artifacts.push(artifact);
          this.emitEvent({ type: 'artifact', agentId: this.config.id, artifact });
        }

        // Checkpoint: this step succeeded
        this.state.lastCheckpoint = i;

      } catch (err: any) {
        this.state.error = err?.message || String(err);
        this.setStatus('failed');
        this.emitEvent({ type: 'error', agentId: this.config.id, error: this.state.error! });
        return;
      }
    }

    // All steps done
    this.setStatus('done');
    this.state.completedAt = Date.now();

    const summary = this.state.artifacts.length > 0
      ? `Completed. Artifacts: ${this.state.artifacts.map(a => a.path || a.summary).join(', ')}`
      : 'Completed.';
    this.emitEvent({ type: 'done', agentId: this.config.id, summary });
  }

  /** Stop execution (abort current step) */
  stop(): void {
    this.abortController?.abort();
    this.backend.abort();
    if (this.state.status === 'running' || this.state.status === 'paused') {
      this.setStatus('interrupted');
    }
    // If paused, release the pause wait
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
  }

  /** Pause after current step completes */
  pause(): void {
    if (this.state.status !== 'running') return;
    this.paused = true;
    this.setStatus('paused');
  }

  /** Resume from paused state */
  resume(): void {
    if (this.state.status !== 'paused') return;
    this.paused = false;
    this.setStatus('running');
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
  }

  /**
   * Inject a message from the bus (or human) into the pending queue.
   * Will be consumed at the start of the next step.
   */
  injectMessage(entry: TaskLogEntry): void {
    this.pendingMessages.push(entry);
  }

  /** Get current state snapshot (immutable copy) */
  getState(): Readonly<AgentState> {
    return { ...this.state };
  }

  /** Get the config */
  getConfig(): Readonly<WorkspaceAgentConfig> {
    return this.config;
  }

  // ─── Private ─────────────────────────────────────────

  private setStatus(status: AgentStatus): void {
    this.state.status = status;
    this.emitEvent({ type: 'status', agentId: this.config.id, status });
  }

  private emitEvent(event: WorkerEvent): void {
    this.emit('event', event);
  }

  private waitIfPaused(): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise<void>(resolve => {
      this.pauseResolve = resolve;
    });
  }
}
