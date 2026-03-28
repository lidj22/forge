/**
 * Skills Marketplace — sync, install, uninstall from remote registry.
 */

import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join, dirname, basename, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import { getDb } from '@/src/core/db/database';
import { getDbPath } from '@/src/config';
import { loadSettings } from './settings';

type ItemType = 'skill' | 'command';

interface SkillItem {
  name: string;
  type: ItemType;
  displayName: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
  score: number;
  rating: number;
  sourceUrl: string;
  installedGlobal: boolean;
  installedProjects: string[];
  installedVersion: string;
  hasUpdate: boolean;
  deletedRemotely: boolean;
}

function db() {
  return getDb(getDbPath());
}

function getBaseUrl(): string {
  const settings = loadSettings();
  return settings.skillsRepoUrl || 'https://raw.githubusercontent.com/aiwatching/forge-skills/main';
}

function getRepoInfo(): { owner: string; repo: string; branch: string } {
  const url = getBaseUrl();
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?/) ||
                url.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)/);
  if (match) return { owner: match[1], repo: match[2], branch: match[3] || 'main' };
  return { owner: 'aiwatching', repo: 'forge-skills', branch: 'main' };
}

function compareVersions(a: string, b: string): number {
  const pa = (a || '0.0.0').split('.').map(Number);
  const pb = (b || '0.0.0').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// ─── Sync ─────────────────────────────────────────────────────

/** Max info.json enrichments per sync (incremental) */
const ENRICH_BATCH_SIZE = 10;

export async function syncSkills(): Promise<{ synced: number; enriched: number; error?: string }> {
  console.log('[skills] Syncing from registry...');
  const baseUrl = getBaseUrl();

  try {
    // Step 1: Fetch registry.json (always fresh)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const cacheBust = `_t=${Date.now()}`;
    const res = await fetch(`${baseUrl}/registry.json?${cacheBust}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' },
    });
    clearTimeout(timeout);

    if (!res.ok) return { synced: 0, enriched: 0, error: `Registry fetch failed: ${res.status}` };

    const data = await res.json();

    // Parse registry items (v1 + v2 support)
    let rawItems: any[] = [];
    if (data.version === 2) {
      rawItems = [
        ...(data.skills || []).map((s: any) => ({ ...s, type: s.type || 'skill' })),
        ...(data.commands || []).map((c: any) => ({ ...c, type: c.type || 'command' })),
      ];
    } else {
      rawItems = (data.skills || []).map((s: any) => ({ ...s, type: s.type || 'command' }));
    }

    // Step 2: Upsert all items from registry.json directly (fast, no extra fetch)
    const upsertStmt = db().prepare(`
      INSERT OR REPLACE INTO skills (name, type, display_name, description, author, version, tags, score, rating, source_url, archive, synced_at,
        installed_global, installed_projects, installed_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        COALESCE((SELECT synced_at FROM skills WHERE name = ?), datetime('now')),
        COALESCE((SELECT installed_global FROM skills WHERE name = ?), 0),
        COALESCE((SELECT installed_projects FROM skills WHERE name = ?), '[]'),
        COALESCE((SELECT installed_version FROM skills WHERE name = ?), ''))
    `);

    const tx = db().transaction(() => {
      for (const s of rawItems) {
        upsertStmt.run(
          s.name || '', s.type || 'skill',
          s.display_name || '', s.description || '',
          (s.author?.name || s.author || '').toString(), s.version || '',
          JSON.stringify(s.tags || []),
          s.score ?? 0, s.rating ?? 0, s.source?.url || s.source_url || '',
          '', // archive
          s.name || '', s.name || '', s.name || '', s.name || ''
        );
      }
    });
    tx();

    // Step 3: Handle items no longer in registry
    const registryNames = new Set(rawItems.map((s: any) => s.name));
    const dbItems = db().prepare('SELECT name, installed_global, installed_projects FROM skills').all() as any[];
    for (const row of dbItems) {
      if (!registryNames.has(row.name)) {
        const hasLocal = !!row.installed_global || JSON.parse(row.installed_projects || '[]').length > 0;
        if (hasLocal) {
          db().prepare('UPDATE skills SET deleted_remotely = 1 WHERE name = ?').run(row.name);
        } else {
          db().prepare('DELETE FROM skills WHERE name = ?').run(row.name);
        }
      }
    }

    // Step 4: Incremental enrichment — fetch info.json for oldest-synced items
    // Pick items whose synced_at is oldest (or version changed since last enrich)
    const staleItems = db().prepare(`
      SELECT name, type, version FROM skills
      WHERE deleted_remotely = 0
      ORDER BY synced_at ASC
      LIMIT ?
    `).all(ENRICH_BATCH_SIZE) as any[];

    let enriched = 0;
    const enrichStmt = db().prepare(`
      UPDATE skills SET
        version = COALESCE(?, version),
        tags = COALESCE(?, tags),
        score = COALESCE(?, score),
        rating = COALESCE(?, rating),
        description = COALESCE(?, description),
        synced_at = datetime('now')
      WHERE name = ?
    `);

    await Promise.all(staleItems.map(async (s: any) => {
      try {
        const repoDir = s.type === 'skill' ? 'skills' : 'commands';
        let infoRes = await fetch(`${baseUrl}/${repoDir}/${s.name}/info.json?${cacheBust}`, { signal: AbortSignal.timeout(5000) });
        if (!infoRes.ok) {
          const altDir = s.type === 'skill' ? 'commands' : 'skills';
          infoRes = await fetch(`${baseUrl}/${altDir}/${s.name}/info.json?${cacheBust}`, { signal: AbortSignal.timeout(5000) });
        }
        if (infoRes.ok) {
          const info = await infoRes.json();
          enrichStmt.run(
            info.version || null,
            info.tags?.length ? JSON.stringify(info.tags) : null,
            info.score ?? null,
            info.rating ?? null,
            info.description || null,
            s.name
          );
          enriched++;
        } else {
          // No info.json — just update synced_at so it rotates to the back
          db().prepare('UPDATE skills SET synced_at = datetime(\'now\') WHERE name = ?').run(s.name);
        }
      } catch {
        // Timeout/error — update synced_at to avoid retrying immediately
        db().prepare('UPDATE skills SET synced_at = datetime(\'now\') WHERE name = ?').run(s.name);
      }
    }));

    console.log(`[skills] Synced ${rawItems.length} items, enriched ${enriched}/${staleItems.length} from info.json`);
    return { synced: rawItems.length, enriched };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[skills] Sync failed:`, msg);
    return { synced: 0, enriched: 0, error: msg };
  }
}

// ─── List ────────────────────────────────────────────────────

export function listSkills(): SkillItem[] {
  const rows = db().prepare('SELECT * FROM skills ORDER BY type ASC, score DESC, display_name ASC').all() as any[];
  return rows.map(r => {
    const installedVersion = r.installed_version || '';
    const registryVersion = r.version || '';
    const isInstalled = !!r.installed_global || JSON.parse(r.installed_projects || '[]').length > 0;
    return {
      name: r.name,
      type: r.type || 'skill',
      displayName: r.display_name,
      description: r.description,
      author: r.author,
      version: registryVersion,
      tags: JSON.parse(r.tags || '[]'),
      score: r.score,
      rating: r.rating || 0,
      sourceUrl: r.source_url,
      installedGlobal: !!r.installed_global,
      installedProjects: JSON.parse(r.installed_projects || '[]'),
      installedVersion,
      hasUpdate: isInstalled && !!registryVersion && !!installedVersion && compareVersions(registryVersion, installedVersion) > 0,
      deletedRemotely: !!r.deleted_remotely,
    };
  });
}

// ─── Download directory from GitHub ──────────────────────────

/** Recursively list all files in a skill/command directory via GitHub API */
async function listRepoFiles(name: string, type: ItemType): Promise<{ path: string; download_url: string }[]> {
  const repo = getRepoInfo();
  const files: { path: string; download_url: string }[] = [];

  async function recurse(apiUrl: string, prefix: string) {
    const res = await fetch(apiUrl, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return;
    const items = await res.json();
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (item.type === 'file' && item.download_url) {
        files.push({ path: join(prefix, item.name), download_url: item.download_url });
      } else if (item.type === 'dir') {
        await recurse(item.url, join(prefix, item.name));
      }
    }
  }

  // Try skills/ first, then commands/
  const dirs = type === 'skill' ? ['skills', 'commands'] : ['commands', 'skills'];
  for (const dir of dirs) {
    const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${dir}/${name}?ref=${repo.branch}`;
    await recurse(url, '');
    if (files.length > 0) return files;
  }
  return files;
}

async function downloadFile(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.text();
}

// ─── Install ─────────────────────────────────────────────────

function getClaudeHome(): string {
  const settings = loadSettings();
  return settings.claudeHome || join(homedir(), '.claude');
}

function getSkillDir(name: string, type: ItemType, projectPath?: string): string {
  const base = projectPath || getClaudeHome();
  const subdir = type === 'skill' ? 'skills' : 'commands';
  return join(base, '.claude', subdir, name);
}

export async function installGlobal(name: string): Promise<void> {
  const skill = db().prepare('SELECT * FROM skills WHERE name = ?').get(name) as any;
  if (!skill) throw new Error(`Skill "${name}" not found`);

  const type: ItemType = skill.type || 'skill';
  const claudeHome = getClaudeHome();
  const subdir = type === 'skill' ? 'skills' : 'commands';
  const targetDir = join(claudeHome, subdir, name);

  const files = await listRepoFiles(name, type);
  if (files.length === 0) throw new Error(`No files found for ${name}`);

  mkdirSync(targetDir, { recursive: true });
  for (const f of files) {
    const content = await downloadFile(f.download_url);
    const targetPath = join(targetDir, f.path);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, content);
  }

  // Update installed state
  db().prepare('UPDATE skills SET installed_global = 1, installed_version = ? WHERE name = ?')
    .run(skill.version || '', name);
}

export async function installProject(name: string, projectPath: string): Promise<void> {
  const skill = db().prepare('SELECT * FROM skills WHERE name = ?').get(name) as any;
  if (!skill) throw new Error(`Skill "${name}" not found`);

  const type: ItemType = skill.type || 'skill';
  const subdir = type === 'skill' ? 'skills' : 'commands';
  const targetDir = join(projectPath, '.claude', subdir, name);

  const files = await listRepoFiles(name, type);
  if (files.length === 0) throw new Error(`No files found for ${name}`);

  mkdirSync(targetDir, { recursive: true });
  for (const f of files) {
    const content = await downloadFile(f.download_url);
    const targetPath = join(targetDir, f.path);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, content);
  }

  // Update installed state
  const existing = JSON.parse(skill.installed_projects || '[]');
  if (!existing.includes(projectPath)) existing.push(projectPath);
  db().prepare('UPDATE skills SET installed_projects = ?, installed_version = ? WHERE name = ?')
    .run(JSON.stringify(existing), skill.version || '', name);
}

// ─── Uninstall ───────────────────────────────────────────────

export function uninstallGlobal(name: string): void {
  const skill = db().prepare('SELECT * FROM skills WHERE name = ?').get(name) as any;
  if (!skill) return;

  const type: ItemType = skill.type || 'skill';
  const claudeHome = getClaudeHome();
  const subdir = type === 'skill' ? 'skills' : 'commands';
  const targetDir = join(claudeHome, subdir, name);

  if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true });

  db().prepare('UPDATE skills SET installed_global = 0 WHERE name = ?').run(name);
  // Clear installed_version if no project installs remain
  const remaining = JSON.parse(skill.installed_projects || '[]');
  if (remaining.length === 0) {
    db().prepare('UPDATE skills SET installed_version = ? WHERE name = ?').run('', name);
  }
}

export function uninstallProject(name: string, projectPath: string): void {
  const skill = db().prepare('SELECT * FROM skills WHERE name = ?').get(name) as any;
  if (!skill) return;

  const type: ItemType = skill.type || 'skill';
  const subdir = type === 'skill' ? 'skills' : 'commands';
  const targetDir = join(projectPath, '.claude', subdir, name);

  if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true });

  const existing = JSON.parse(skill.installed_projects || '[]').filter((p: string) => p !== projectPath);
  db().prepare('UPDATE skills SET installed_projects = ? WHERE name = ?')
    .run(JSON.stringify(existing), name);
  // Clear installed_version if nothing remains
  if (!skill.installed_global && existing.length === 0) {
    db().prepare('UPDATE skills SET installed_version = ? WHERE name = ?').run('', name);
  }
}

// ─── Refresh install state from filesystem ───────────────────

export function refreshInstallState(projectPaths: string[]): void {
  const claudeHome = getClaudeHome();
  const rows = db().prepare('SELECT name, type FROM skills').all() as any[];

  for (const row of rows) {
    const type: ItemType = row.type || 'skill';
    const subdir = type === 'skill' ? 'skills' : 'commands';

    // Check global
    const globalDir = join(claudeHome, subdir, row.name);
    const globalInstalled = existsSync(globalDir);

    // Check projects
    const installedIn: string[] = [];
    for (const pp of projectPaths) {
      const projDir = join(pp, '.claude', subdir, row.name);
      if (existsSync(projDir)) installedIn.push(pp);
    }

    // Read installed version from info.json if available
    let installedVersion = '';
    const checkDirs = globalInstalled ? [globalDir] : installedIn.length > 0 ? [join(installedIn[0], '.claude', subdir, row.name)] : [];
    for (const d of checkDirs) {
      const infoPath = join(d, 'info.json');
      if (existsSync(infoPath)) {
        try {
          const info = JSON.parse(readFileSync(infoPath, 'utf-8'));
          installedVersion = info.version || '';
        } catch {}
        break;
      }
    }

    db().prepare('UPDATE skills SET installed_global = ?, installed_projects = ?, installed_version = ? WHERE name = ?')
      .run(globalInstalled ? 1 : 0, JSON.stringify(installedIn), installedVersion, row.name);
  }
}

// ─── Check local modifications ───────────────────────────────

export async function checkLocalModified(name: string): Promise<boolean> {
  const skill = db().prepare('SELECT * FROM skills WHERE name = ?').get(name) as any;
  if (!skill) return false;

  const type: ItemType = skill.type || 'skill';
  const claudeHome = getClaudeHome();
  const subdir = type === 'skill' ? 'skills' : 'commands';
  const localDir = join(claudeHome, subdir, name);

  if (!existsSync(localDir)) return false;

  // Compare with remote files
  try {
    const remoteFiles = await listRepoFiles(name, type);
    for (const rf of remoteFiles) {
      const localPath = join(localDir, rf.path);
      if (!existsSync(localPath)) return true;
      const localContent = readFileSync(localPath, 'utf-8');
      const remoteContent = await downloadFile(rf.download_url);
      if (localContent !== remoteContent) return true;
    }
  } catch {
    return false;
  }

  return false;
}

// ─── Purge deleted skill ─────────────────────────────────────

export function purgeDeletedSkill(name: string): void {
  const skill = db().prepare('SELECT * FROM skills WHERE name = ?').get(name) as any;
  if (!skill) return;

  const type: ItemType = skill.type || 'skill';
  const claudeHome = getClaudeHome();
  const subdir = type === 'skill' ? 'skills' : 'commands';

  // Remove global
  const globalDir = join(claudeHome, subdir, name);
  if (existsSync(globalDir)) rmSync(globalDir, { recursive: true, force: true });

  // Remove from projects
  const projects = JSON.parse(skill.installed_projects || '[]');
  for (const pp of projects) {
    const projDir = join(pp, '.claude', subdir, name);
    if (existsSync(projDir)) rmSync(projDir, { recursive: true, force: true });
  }

  db().prepare('DELETE FROM skills WHERE name = ?').run(name);
}
