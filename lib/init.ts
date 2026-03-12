/**
 * Server-side initialization — called once on first API request.
 * Starts background services: task runner, Telegram bot.
 */

import { ensureRunnerStarted } from './task-manager';
import { startTelegramBot, stopTelegramBot } from './telegram-bot';

let initialized = false;

export function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  // Start background task runner
  ensureRunnerStarted();

  // Start Telegram bot if configured
  startTelegramBot();

  console.log('[init] Background services started');
}

/** Restart Telegram bot (e.g. after settings change) */
export function restartTelegramBot() {
  stopTelegramBot();
  startTelegramBot();
}
