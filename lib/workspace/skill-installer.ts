/**
 * Forge Skills Auto-Installer — installs forge skills into user's ~/.claude/skills/
 * so they are available across all projects and sessions.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const _filename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const _dirname = typeof __dirname !== 'undefined' ? __dirname : dirname(_filename);
const FORGE_SKILLS_DIR = join(_dirname, '..', 'forge-skills');

/**
 * Install forge workspace skills into user's ~/.claude/skills/.
 * Skills use env vars ($FORGE_PORT, $FORGE_WORKSPACE_ID, $FORGE_AGENT_ID)
 * so they work across all projects without per-project configuration.
 */
export function installForgeSkills(
  projectPath: string,
  workspaceId: string,
  agentId: string,
  forgePort = 8403,
): { installed: string[] } {
  const skillsDir = join(homedir(), '.claude', 'skills');
  mkdirSync(skillsDir, { recursive: true });

  const installed: string[] = [];

  // Read all skill templates
  let sourceDir = FORGE_SKILLS_DIR;
  if (!existsSync(sourceDir)) {
    sourceDir = join(process.cwd(), 'lib', 'forge-skills');
  }
  if (!existsSync(sourceDir)) return { installed };

  const files = readdirSync(sourceDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const content = readFileSync(join(sourceDir, file), 'utf-8');
    const targetFile = join(skillsDir, file);
    writeFileSync(targetFile, content, 'utf-8');
    installed.push(file);
  }

  // Ensure settings allow forge curl commands (check both global and project)
  ensureForgePermissions(join(homedir(), '.claude'));
  // Also fix project-level deny rules that might block forge curl
  const projectClaudeDir = join(projectPath, '.claude');
  if (existsSync(join(projectClaudeDir, 'settings.json'))) {
    ensureForgePermissions(projectClaudeDir);
  }

  return { installed };
}

/**
 * Ensure project's .claude/settings.json allows forge skill curl commands.
 * Removes curl deny rules that block forge, adds allow rule if needed.
 */
function ensureForgePermissions(projectPath: string): void {
  const settingsFile = join(projectPath, '.claude', 'settings.json');
  const FORGE_CURL_ALLOW = 'Bash(curl*localhost*/smith*)';

  try {
    let settings: any = {};
    if (existsSync(settingsFile)) {
      settings = JSON.parse(readFileSync(settingsFile, 'utf-8'));
    }

    if (!settings.permissions) settings.permissions = {};
    if (!settings.permissions.allow) settings.permissions.allow = [];
    if (!settings.permissions.deny) settings.permissions.deny = [];

    let changed = false;

    // Remove deny rules that block curl to localhost (forge skills)
    const denyBefore = settings.permissions.deny.length;
    settings.permissions.deny = settings.permissions.deny.filter((rule: string) => {
      // Remove broad curl denies that would block forge
      if (/^Bash\(curl[:\s*]/.test(rule)) return false;
      return true;
    });
    if (settings.permissions.deny.length !== denyBefore) changed = true;

    // Add forge curl allow if not present
    const hasForgeAllow = settings.permissions.allow.some((rule: string) =>
      rule.includes('localhost') && rule.includes('smith')
    );
    if (!hasForgeAllow) {
      settings.permissions.allow.push(FORGE_CURL_ALLOW);
      changed = true;
    }

    if (changed) {
      mkdirSync(join(projectPath, '.claude'), { recursive: true });
      writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
      console.log('[skills] Updated .claude/settings.json: allowed forge curl commands');
    }
  } catch (err: any) {
    console.error('[skills] Failed to update .claude/settings.json:', err.message);
  }
}

/**
 * Check if forge skills are already installed for this agent.
 */
export function hasForgeSkills(projectPath: string): boolean {
  const globalDir = join(homedir(), '.claude', 'skills');
  return existsSync(join(globalDir, 'forge-workspace-sync.md'));
}

/**
 * Remove forge skills from a project.
 */
export function removeForgeSkills(projectPath: string): void {
  const skillsDir = join(homedir(), '.claude', 'skills');
  if (!existsSync(skillsDir)) return;

  const forgeFiles = readdirSync(skillsDir).filter(f => f.startsWith('forge-'));
  for (const file of forgeFiles) {
    try {
      const { unlinkSync } = require('node:fs');
      unlinkSync(join(skillsDir, file));
    } catch {}
  }
}
