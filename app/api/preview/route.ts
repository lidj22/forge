import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_FILE = join(homedir(), '.forge', 'preview.json');

function getConfig(): { port: number } {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return { port: 0 };
  }
}

function saveConfig(config: { port: number }) {
  const dir = dirname(CONFIG_FILE);
  mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// GET — get current preview config
export async function GET() {
  return NextResponse.json(getConfig());
}

// POST — set preview port
export async function POST(req: Request) {
  const { port } = await req.json();
  const p = parseInt(port) || 0;
  saveConfig({ port: p });
  return NextResponse.json({ port: p, ok: true });
}
