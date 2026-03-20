/**
 * Centralized directory paths for Forge.
 *
 * Shared (configDir):  ~/.forge/          — only bin/ (cloudflared)
 * Instance (dataDir):  ~/.forge/data/     — settings, db, state, flows, etc.
 *                      or --dir / FORGE_DATA_DIR
 * Claude (claudeDir):  ~/.claude/         — or configured in settings
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, renameSync, copyFileSync } from 'node:fs';

/** Shared config directory — only binaries, fixed at ~/.forge/ */
export function getConfigDir(): string {
  return join(homedir(), '.forge');
}

/** Instance data directory — all instance-specific data */
export function getDataDir(): string {
  return process.env.FORGE_DATA_DIR || join(getConfigDir(), 'data');
}

// ─── Migration from old layout (~/.forge/*) to new (~/.forge/data/*) ───

const MIGRATE_FILES = [
  'settings.yaml',
  '.encrypt-key',
  '.env.local',
  'session-code.json',
  'terminal-state.json',
  'tunnel-state.json',
  'preview.json',
  'forge.pid',
  'forge.log',
];
const MIGRATE_DIRS = ['flows', 'pipelines'];

let migrated = false;

/** Migrate old ~/.forge/ flat layout to ~/.forge/data/ if needed */
export function migrateDataDir(): void {
  if (migrated) return;
  migrated = true;

  // Only migrate default data dir, not custom --dir
  if (process.env.FORGE_DATA_DIR) return;

  const configDir = getConfigDir();
  const dataDir = join(configDir, 'data');

  // Check if old layout exists (settings.yaml in root, not in data/)
  const oldSettings = join(configDir, 'settings.yaml');
  const newSettings = join(dataDir, 'settings.yaml');
  if (!existsSync(oldSettings) || existsSync(newSettings)) return;

  console.log('[forge] Migrating data from ~/.forge/ to ~/.forge/data/...');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  // Migrate files
  for (const file of MIGRATE_FILES) {
    const src = join(configDir, file);
    const dest = join(dataDir, file);
    if (existsSync(src) && !existsSync(dest)) {
      try { copyFileSync(src, dest); console.log(`  ${file}`); } catch {}
    }
  }

  // Migrate old data.db → data/workflow.db
  const oldDb = join(configDir, 'data.db');
  const newDb = join(dataDir, 'workflow.db');
  if (existsSync(oldDb) && !existsSync(newDb)) {
    try { copyFileSync(oldDb, newDb); console.log('  data.db → workflow.db'); } catch {}
  }

  // Migrate directories
  for (const dir of MIGRATE_DIRS) {
    const src = join(configDir, dir);
    const dest = join(dataDir, dir);
    if (existsSync(src) && !existsSync(dest)) {
      try { renameSync(src, dest); console.log(`  ${dir}/`); } catch {}
    }
  }

  console.log('[forge] Migration complete. Old files kept as backup.');
}

/** Claude Code home directory — skills, commands, sessions */
export function getClaudeDir(): string {
  // Env var takes precedence
  if (process.env.CLAUDE_HOME) return process.env.CLAUDE_HOME;
  // Try to read from settings (lazy require to avoid circular dependency)
  try {
    const { loadSettings } = require('./settings');
    const settings = loadSettings();
    if (settings.claudeHome) return settings.claudeHome.replace(/^~/, homedir());
  } catch {}
  return join(homedir(), '.claude');
}
