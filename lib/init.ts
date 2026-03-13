/**
 * Server-side initialization — called once on first API request.
 * Starts background services: task runner, Telegram bot.
 */

import { ensureRunnerStarted } from './task-manager';
import { startTelegramBot, stopTelegramBot } from './telegram-bot';
import { startWatcherLoop } from './session-watcher';
import { getPassword } from './password';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

let initialized = false;

export function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  // Ensure MW_PASSWORD is set (auto-generate if not configured)
  if (!process.env.MW_PASSWORD) {
    const password = getPassword();
    process.env.MW_PASSWORD = password;
  }
  console.log(`[init] Login password: ${process.env.MW_PASSWORD}`);
  console.log('[init] Forgot? Run: mw password');

  // Start background task runner
  ensureRunnerStarted();

  // Start Telegram bot if configured
  startTelegramBot();

  // Start terminal WebSocket server as separate process (node-pty needs native module)
  startTerminalProcess();

  // Start session watcher loop
  startWatcherLoop();

  console.log('[init] Background services started');
}

/** Restart Telegram bot (e.g. after settings change) */
export function restartTelegramBot() {
  stopTelegramBot();
  startTelegramBot();
}

let terminalChild: ReturnType<typeof spawn> | null = null;

function startTerminalProcess() {
  if (terminalChild) return;

  // Check if port 3001 is already in use
  const net = require('node:net');
  const tester = net.createServer();
  tester.once('error', () => {
    // Port in use — terminal server already running
    console.log('[terminal] Port 3001 already in use, skipping');
  });
  tester.once('listening', () => {
    tester.close();
    // Port free — start terminal server
    const script = join(process.cwd(), 'lib', 'terminal-standalone.ts');
    terminalChild = spawn('npx', ['tsx', script], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'CLAUDECODE')) } as NodeJS.ProcessEnv,
      detached: false,
    });
    terminalChild.on('exit', () => { terminalChild = null; });
    console.log('[terminal] Started standalone server (pid:', terminalChild.pid, ')');
  });
  tester.listen(3001);
}
