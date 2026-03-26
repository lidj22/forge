/**
 * Agent Bus — lightweight in-memory message router for workspace agents.
 *
 * Responsibilities:
 * - Point-to-point and broadcast messaging
 * - Request-response pattern (async await reply)
 * - Message log persistence (for UI and recovery)
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { BusMessage } from './types';

export class AgentBus extends EventEmitter {
  private log: BusMessage[] = [];
  private pendingRequests = new Map<string, { resolve: (msg: BusMessage) => void; timer: NodeJS.Timeout }>();

  // ─── Send (point-to-point) ─────────────────────────────

  send(from: string, to: string, type: BusMessage['type'], payload: BusMessage['payload']): BusMessage {
    const msg: BusMessage = {
      id: randomUUID(),
      from,
      to,
      type,
      payload,
      timestamp: Date.now(),
    };
    this.log.push(msg);
    this.emit('message', msg);

    // Check if this resolves a pending request
    if (type === 'response' && payload.replyTo) {
      const pending = this.pendingRequests.get(payload.replyTo);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(payload.replyTo);
        pending.resolve(msg);
      }
    }

    return msg;
  }

  // ─── Broadcast ─────────────────────────────────────────

  broadcast(from: string, type: BusMessage['type'], payload: BusMessage['payload']): BusMessage {
    return this.send(from, '*', type, payload);
  }

  // ─── Request-Response ──────────────────────────────────

  /**
   * Send a request and wait for a response.
   * Times out after `timeoutMs` (default 5 minutes).
   */
  request(from: string, to: string, payload: BusMessage['payload'], timeoutMs = 300_000): Promise<BusMessage> {
    const msg = this.send(from, to, 'request', payload);

    return new Promise<BusMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(msg.id);
        reject(new Error(`Bus request timed out after ${timeoutMs}ms: ${payload.action}`));
      }, timeoutMs);

      this.pendingRequests.set(msg.id, { resolve, timer });
    });
  }

  // ─── Convenience: notify task complete ─────────────────

  notifyTaskComplete(agentId: string, files: string[], summary?: string): BusMessage {
    return this.broadcast(agentId, 'notify', {
      action: 'task_complete',
      content: summary,
      files,
    });
  }

  notifyStepComplete(agentId: string, stepLabel: string, files?: string[]): BusMessage {
    return this.broadcast(agentId, 'notify', {
      action: 'step_complete',
      content: `Step "${stepLabel}" completed`,
      files,
    });
  }

  notifyError(agentId: string, error: string): BusMessage {
    return this.broadcast(agentId, 'notify', {
      action: 'error',
      content: error,
    });
  }

  // ─── Query ─────────────────────────────────────────────

  /** Get all messages for a specific agent (sent to it or broadcast) */
  getMessagesFor(agentId: string): BusMessage[] {
    return this.log.filter(m => m.to === agentId || m.to === '*');
  }

  /** Get all messages from a specific agent */
  getMessagesFrom(agentId: string): BusMessage[] {
    return this.log.filter(m => m.from === agentId);
  }

  /** Get all messages between two agents */
  getConversation(a: string, b: string): BusMessage[] {
    return this.log.filter(m =>
      (m.from === a && m.to === b) || (m.from === b && m.to === a)
    );
  }

  /** Get full message log */
  getLog(): readonly BusMessage[] {
    return this.log;
  }

  /** Load log from persisted state (for recovery) */
  loadLog(messages: BusMessage[]): void {
    this.log = [...messages];
  }

  /** Clear all messages and pending requests */
  clear(): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
    }
    this.pendingRequests.clear();
    this.log = [];
  }
}
