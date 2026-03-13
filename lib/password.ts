/**
 * Auto-generated login password.
 * On first startup (or if no MW_PASSWORD env is set), generates a random password
 * and saves it to ~/.my-workflow/password. CLI can read it via `mw password`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

const PASSWORD_FILE = join(homedir(), '.my-workflow', 'password');

function generatePassword(): string {
  // 8-char alphanumeric, easy to type
  return randomBytes(6).toString('base64url').slice(0, 8);
}

/**
 * Get the current password. Priority:
 * 1. MW_PASSWORD env var (user explicitly set)
 * 2. Saved password file (~/.my-workflow/password)
 * 3. Generate new one, save, and return
 */
export function getPassword(): string {
  // If user explicitly set MW_PASSWORD, use it
  if (process.env.MW_PASSWORD && process.env.MW_PASSWORD !== 'auto') {
    return process.env.MW_PASSWORD;
  }

  // Try to read saved password
  if (existsSync(PASSWORD_FILE)) {
    const saved = readFileSync(PASSWORD_FILE, 'utf-8').trim();
    if (saved) return saved;
  }

  // Generate and save new password
  const password = generatePassword();
  const dir = dirname(PASSWORD_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(PASSWORD_FILE, password, { mode: 0o600 });
  return password;
}

/** Read password from file (for CLI use) */
export function readPasswordFile(): string | null {
  try {
    return readFileSync(PASSWORD_FILE, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}
