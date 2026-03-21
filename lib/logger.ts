/**
 * Simple logger that adds timestamps to all console output.
 * Call `initLogger()` once at startup.
 */

let initialized = false;

export function initLogger() {
  if (initialized) return;
  initialized = true;

  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;

  const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

  console.log = (...args: any[]) => origLog(`[${ts()}]`, ...args);
  console.error = (...args: any[]) => origError(`[${ts()}]`, ...args);
  console.warn = (...args: any[]) => origWarn(`[${ts()}]`, ...args);
}
