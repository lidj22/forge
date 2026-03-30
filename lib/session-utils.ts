/**
 * Shared session utilities for client-side components.
 * Resolves fixedSessionId from workspace primary agent.
 */

/** Fetch the fixedSessionId for a project's primary agent. Auto-sets latest if empty. */
export async function resolveFixedSession(projectPath: string): Promise<string | null> {
  try {
    const wsRes = await fetch(`/api/workspace?projectPath=${encodeURIComponent(projectPath)}`);
    const ws = await wsRes.json();
    if (!ws?.agents) return null;

    const primary = ws.agents.find((a: any) => a.primary);
    if (!primary) return null;

    // Already bound
    if (primary.fixedSessionId) return primary.fixedSessionId;

    // Not bound — find latest session and bind it
    const projectName = projectPath.replace(/\/+$/, '').split('/').pop() || '';
    const sessRes = await fetch(`/api/claude-sessions/${encodeURIComponent(projectName)}`);
    const sessions = await sessRes.json();
    if (!Array.isArray(sessions) || sessions.length === 0) return null;

    // Pick latest (first in sorted list)
    const latestId = sessions[0].sessionId || sessions[0].id;
    if (!latestId) return null;

    // Save binding
    primary.fixedSessionId = latestId;
    await fetch(`/api/workspace/${ws.id}/smith`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', agentId: primary.id, config: primary }),
    });

    return latestId;
  } catch {
    return null;
  }
}

/** Build the resume flag: --resume <id> if fixedSession exists, else -c if hasSession */
export function buildResumeFlag(fixedSessionId: string | null, hasExistingSessions: boolean): string {
  if (fixedSessionId) return ` --resume ${fixedSessionId}`;
  if (hasExistingSessions) return ' -c';
  return '';
}
