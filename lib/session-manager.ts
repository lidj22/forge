import { randomUUID } from 'node:crypto';
import { getDb } from '@/src/core/db/database';
import { getDbPath, loadTemplate } from '@/src/config';
import { chatStream, type ChatResult } from '@/src/core/providers/chat';
import { getMemoryMessages } from '@/src/core/memory/strategy';
import type { Session, SessionStatus, Message, ProviderName, MemoryConfig } from '@/src/types';

// Re-export the SessionManager but as a singleton for server-side use
class SessionManager {
  private db;

  constructor() {
    this.db = getDb(getDbPath());
  }

  create(opts: { name: string; templateId: string; provider?: ProviderName; model?: string }): Session {
    const template = loadTemplate(opts.templateId);
    if (!template) throw new Error(`Template not found: ${opts.templateId}`);

    const id = randomUUID().slice(0, 8);
    const provider = opts.provider || template.provider;
    const model = opts.model || template.model || '';
    const memoryConfig = JSON.stringify(template.memory);

    this.db.prepare(`
      INSERT INTO sessions (id, name, template_id, provider, model, status, memory_config, system_prompt)
      VALUES (?, ?, ?, ?, ?, 'idle', ?, ?)
    `).run(id, opts.name, opts.templateId, provider, model, memoryConfig, template.systemPrompt);

    return this.get(id)!;
  }

  get(id: string): Session | null {
    const row = this.db.prepare(`
      SELECT s.*, COUNT(m.id) as message_count,
        (SELECT content FROM messages WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      WHERE s.id = ?
      GROUP BY s.id
    `).get(id) as any;

    if (!row) return null;
    return this.rowToSession(row);
  }

  getByName(name: string): Session | null {
    const row = this.db.prepare(`
      SELECT s.*, COUNT(m.id) as message_count,
        (SELECT content FROM messages WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      WHERE s.name = ?
      GROUP BY s.id
    `).get(name) as any;

    if (!row) return null;
    return this.rowToSession(row);
  }

  list(status?: SessionStatus): Session[] {
    let query = `
      SELECT s.*, COUNT(m.id) as message_count,
        (SELECT content FROM messages WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
    `;
    const params: string[] = [];
    if (status) {
      query += ' WHERE s.status = ?';
      params.push(status);
    }
    query += ' GROUP BY s.id ORDER BY s.updated_at DESC';

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(r => this.rowToSession(r));
  }

  updateStatus(id: string, status: SessionStatus) {
    this.db.prepare(`UPDATE sessions SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
  }

  addMessage(sessionId: string, role: string, content: string, provider: string, model: string) {
    this.db.prepare(`
      INSERT INTO messages (session_id, role, content, provider, model)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, role, content, provider, model);
    this.db.prepare(`UPDATE sessions SET updated_at = datetime('now') WHERE id = ?`).run(sessionId);
  }

  getMessages(sessionId: string, limit?: number): Message[] {
    let query = 'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC';
    const params: (string | number)[] = [sessionId];
    if (limit) {
      query = `SELECT * FROM (
        SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?
      ) ORDER BY created_at ASC`;
      params.push(limit);
    }
    return this.db.prepare(query).all(...params) as Message[];
  }

  getMemoryMessages(sessionId: string): Message[] {
    const session = this.get(sessionId);
    if (!session) return [];
    const allMessages = this.getMessages(sessionId);
    return getMemoryMessages(allMessages, session.memory);
  }

  delete(id: string) {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  recordUsage(sessionId: string, result: ChatResult) {
    this.db.prepare(`
      INSERT INTO usage (provider, model, session_id, input_tokens, output_tokens, cost)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(result.provider, result.model, sessionId, result.inputTokens, result.outputTokens, 0);
  }

  getUsageSummary() {
    return this.db.prepare(`
      SELECT provider,
        SUM(input_tokens) as totalInput,
        SUM(output_tokens) as totalOutput,
        SUM(cost) as totalCost
      FROM usage
      WHERE created_at >= date('now', '-30 days')
      GROUP BY provider
    `).all() as any[];
  }

  private rowToSession(row: any): Session {
    return {
      id: row.id,
      name: row.name,
      templateId: row.template_id,
      provider: row.provider,
      model: row.model,
      status: row.status,
      memory: JSON.parse(row.memory_config),
      systemPrompt: row.system_prompt,
      messageCount: row.message_count || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastMessage: row.last_message || undefined,
    };
  }
}

// Singleton
let instance: SessionManager | null = null;
export function getSessionManager(): SessionManager {
  if (!instance) instance = new SessionManager();
  return instance;
}
