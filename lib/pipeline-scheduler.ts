/**
 * Pipeline Scheduler — manages project-pipeline bindings and scheduled execution.
 * Replaces issue-scanner with a generic approach.
 *
 * Each project can bind multiple workflows. Each binding has:
 * - config: JSON with workflow-specific settings (e.g. interval, labels for issue pipelines)
 * - enabled: on/off toggle
 * - scheduled execution via interval
 */

import { getDb } from '@/src/core/db/database';
import { getDbPath } from '@/src/config';
import { startPipeline, getPipeline } from './pipeline';
import { randomUUID } from 'node:crypto';

function db() { return getDb(getDbPath()); }

export interface ProjectPipelineBinding {
  id: number;
  projectPath: string;
  projectName: string;
  workflowName: string;
  enabled: boolean;
  config: Record<string, any>; // interval, labels, baseBranch, etc.
  createdAt: string;
}

export interface PipelineRun {
  id: string;
  projectPath: string;
  workflowName: string;
  pipelineId: string;
  status: string;
  summary: string;
  createdAt: string;
}

// ─── Bindings CRUD ───────────────────────────────────────

export function getBindings(projectPath: string): ProjectPipelineBinding[] {
  return (db().prepare('SELECT * FROM project_pipelines WHERE project_path = ? ORDER BY created_at ASC')
    .all(projectPath) as any[]).map(r => ({
      id: r.id,
      projectPath: r.project_path,
      projectName: r.project_name,
      workflowName: r.workflow_name,
      enabled: !!r.enabled,
      config: JSON.parse(r.config || '{}'),
      createdAt: r.created_at,
    }));
}

export function addBinding(projectPath: string, projectName: string, workflowName: string, config?: Record<string, any>): void {
  db().prepare(`
    INSERT OR REPLACE INTO project_pipelines (project_path, project_name, workflow_name, config)
    VALUES (?, ?, ?, ?)
  `).run(projectPath, projectName, workflowName, JSON.stringify(config || {}));
}

export function removeBinding(projectPath: string, workflowName: string): void {
  db().prepare('DELETE FROM project_pipelines WHERE project_path = ? AND workflow_name = ?')
    .run(projectPath, workflowName);
}

export function updateBinding(projectPath: string, workflowName: string, updates: { enabled?: boolean; config?: Record<string, any> }): void {
  if (updates.enabled !== undefined) {
    db().prepare('UPDATE project_pipelines SET enabled = ? WHERE project_path = ? AND workflow_name = ?')
      .run(updates.enabled ? 1 : 0, projectPath, workflowName);
  }
  if (updates.config) {
    db().prepare('UPDATE project_pipelines SET config = ? WHERE project_path = ? AND workflow_name = ?')
      .run(JSON.stringify(updates.config), projectPath, workflowName);
  }
}

// ─── Runs ────────────────────────────────────────────────

export function recordRun(projectPath: string, workflowName: string, pipelineId: string): string {
  const id = randomUUID().slice(0, 8);
  db().prepare(`
    INSERT INTO pipeline_runs (id, project_path, workflow_name, pipeline_id, status)
    VALUES (?, ?, ?, ?, 'running')
  `).run(id, projectPath, workflowName, pipelineId);
  return id;
}

export function updateRun(pipelineId: string, status: string, summary?: string): void {
  if (summary) {
    db().prepare('UPDATE pipeline_runs SET status = ?, summary = ? WHERE pipeline_id = ?')
      .run(status, summary, pipelineId);
  } else {
    db().prepare('UPDATE pipeline_runs SET status = ? WHERE pipeline_id = ?')
      .run(status, pipelineId);
  }
}

export function getRuns(projectPath: string, workflowName?: string, limit = 20): PipelineRun[] {
  const query = workflowName
    ? 'SELECT * FROM pipeline_runs WHERE project_path = ? AND workflow_name = ? ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM pipeline_runs WHERE project_path = ? ORDER BY created_at DESC LIMIT ?';
  const params = workflowName ? [projectPath, workflowName, limit] : [projectPath, limit];
  return (db().prepare(query).all(...params) as any[]).map(r => ({
    id: r.id,
    projectPath: r.project_path,
    workflowName: r.workflow_name,
    pipelineId: r.pipeline_id,
    status: r.status,
    summary: r.summary || '',
    createdAt: r.created_at,
  }));
}

export function deleteRun(id: string): void {
  db().prepare('DELETE FROM pipeline_runs WHERE id = ?').run(id);
}

// ─── Trigger ─────────────────────────────────────────────

export function triggerPipeline(projectPath: string, projectName: string, workflowName: string, extraInput?: Record<string, any>): { pipelineId: string; runId: string } {
  const input: Record<string, string> = {
    project: projectName,
    ...extraInput,
  };

  const pipeline = startPipeline(workflowName, input);
  const runId = recordRun(projectPath, workflowName, pipeline.id);
  console.log(`[pipeline-scheduler] Triggered ${workflowName} for ${projectName} (pipeline: ${pipeline.id})`);
  return { pipelineId: pipeline.id, runId };
}

// ─── Status sync (called from pipeline completion) ───────

export function syncRunStatus(pipelineId: string): void {
  const pipeline = getPipeline(pipelineId);
  if (!pipeline) return;

  // Build summary from outputs
  let summary = '';
  for (const [nodeId, node] of Object.entries(pipeline.nodes)) {
    if (node.outputs && Object.keys(node.outputs).length > 0) {
      for (const [key, val] of Object.entries(node.outputs)) {
        if (val && typeof val === 'string' && val.length < 500) {
          summary += `${nodeId}.${key}: ${val.slice(0, 200)}\n`;
        }
      }
    }
  }

  updateRun(pipelineId, pipeline.status, summary.trim());
}
