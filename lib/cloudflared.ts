/**
 * Cloudflare Tunnel (cloudflared) integration.
 * Zero-config mode: no account needed, gives a temporary public URL.
 */

import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, chmodSync, createWriteStream, unlinkSync } from 'node:fs';
import { homedir, platform, arch } from 'node:os';
import { join } from 'node:path';
import https from 'node:https';
import http from 'node:http';

const BIN_DIR = join(homedir(), '.my-workflow', 'bin');
const BIN_NAME = platform() === 'win32' ? 'cloudflared.exe' : 'cloudflared';
const BIN_PATH = join(BIN_DIR, BIN_NAME);

// ─── Download URL resolution ────────────────────────────────────

function getDownloadUrl(): string {
  const os = platform();
  const cpu = arch();
  const base = 'https://github.com/cloudflare/cloudflared/releases/latest/download';

  if (os === 'darwin') {
    // macOS universal binary
    return `${base}/cloudflared-darwin-amd64.tgz`;
  }
  if (os === 'linux') {
    if (cpu === 'arm64') return `${base}/cloudflared-linux-arm64`;
    return `${base}/cloudflared-linux-amd64`;
  }
  if (os === 'win32') {
    return `${base}/cloudflared-windows-amd64.exe`;
  }
  throw new Error(`Unsupported platform: ${os}/${cpu}`);
}

// ─── Download helper ────────────────────────────────────────────

function followRedirects(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'my-workflow' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        followRedirects(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        return;
      }
      const file = createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    }).on('error', reject);
  });
}

export async function downloadCloudflared(): Promise<string> {
  if (existsSync(BIN_PATH)) return BIN_PATH;

  mkdirSync(BIN_DIR, { recursive: true });
  const url = getDownloadUrl();
  const isTgz = url.endsWith('.tgz');
  const tmpPath = isTgz ? `${BIN_PATH}.tgz` : BIN_PATH;

  console.log(`[cloudflared] Downloading from ${url}...`);
  await followRedirects(url, tmpPath);

  if (isTgz) {
    // Extract tgz (macOS)
    execSync(`tar -xzf "${tmpPath}" -C "${BIN_DIR}"`, { encoding: 'utf-8' });
    try { unlinkSync(tmpPath); } catch {}
  }

  if (platform() !== 'win32') {
    chmodSync(BIN_PATH, 0o755);
  }

  console.log(`[cloudflared] Installed to ${BIN_PATH}`);
  return BIN_PATH;
}

export function isInstalled(): boolean {
  return existsSync(BIN_PATH);
}

// ─── Tunnel process management ──────────────────────────────────

let tunnelProcess: ChildProcess | null = null;
let tunnelUrl: string | null = null;
let tunnelStatus: 'stopped' | 'starting' | 'running' | 'error' = 'stopped';
let tunnelError: string | null = null;
let tunnelLog: string[] = [];

const MAX_LOG_LINES = 100;

function pushLog(line: string) {
  tunnelLog.push(line);
  if (tunnelLog.length > MAX_LOG_LINES) tunnelLog.shift();
}

export async function startTunnel(localPort: number = 3000): Promise<{ url?: string; error?: string }> {
  if (tunnelProcess) {
    return tunnelUrl ? { url: tunnelUrl } : { error: 'Tunnel is starting...' };
  }

  tunnelStatus = 'starting';
  tunnelUrl = null;
  tunnelError = null;
  tunnelLog = [];

  let binPath: string;
  try {
    binPath = await downloadCloudflared();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    tunnelStatus = 'error';
    tunnelError = msg;
    return { error: msg };
  }

  return new Promise((resolve) => {
    let resolved = false;

    tunnelProcess = spawn(binPath, ['tunnel', '--url', `http://localhost:${localPort}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const handleOutput = (data: Buffer) => {
      const text = data.toString();
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        pushLog(line);

        // cloudflared prints the URL in a line like:
        // | https://xxx-xxx-xxx.trycloudflare.com |
        // or: INFO[...] +---+---------------------------+---+
        const urlMatch = line.match(/(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/);
        if (urlMatch && !tunnelUrl) {
          tunnelUrl = urlMatch[1];
          tunnelStatus = 'running';
          console.log(`[cloudflared] Tunnel URL: ${tunnelUrl}`);
          if (!resolved) {
            resolved = true;
            resolve({ url: tunnelUrl });
          }
        }
      }
    };

    tunnelProcess.stdout?.on('data', handleOutput);
    tunnelProcess.stderr?.on('data', handleOutput);

    tunnelProcess.on('error', (err) => {
      tunnelStatus = 'error';
      tunnelError = err.message;
      pushLog(`[error] ${err.message}`);
      if (!resolved) {
        resolved = true;
        resolve({ error: err.message });
      }
    });

    tunnelProcess.on('exit', (code) => {
      tunnelProcess = null;
      if (tunnelStatus !== 'error') {
        tunnelStatus = 'stopped';
      }
      tunnelUrl = null;
      pushLog(`[exit] cloudflared exited with code ${code}`);
      if (!resolved) {
        resolved = true;
        resolve({ error: `cloudflared exited with code ${code}` });
      }
    });

    // Timeout: if no URL after 30s, report error
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (!tunnelUrl) {
          tunnelStatus = 'error';
          tunnelError = 'Timeout waiting for tunnel URL';
          resolve({ error: 'Timeout waiting for tunnel URL (30s)' });
        }
      }
    }, 30000);
  });
}

export function stopTunnel() {
  if (tunnelProcess) {
    tunnelProcess.kill('SIGTERM');
    tunnelProcess = null;
  }
  tunnelUrl = null;
  tunnelStatus = 'stopped';
  tunnelError = null;
}

export function getTunnelStatus() {
  return {
    status: tunnelStatus,
    url: tunnelUrl,
    error: tunnelError,
    installed: isInstalled(),
    log: tunnelLog.slice(-20),
  };
}
