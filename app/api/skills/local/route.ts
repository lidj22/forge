import { NextResponse } from 'next/server';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const SKILLS_DIR = join(homedir(), '.claude', 'skills');
const COMMANDS_DIR = join(homedir(), '.claude', 'commands');

function md5(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

/** Recursively list files in a directory */
function listFiles(dir: string, prefix = ''): { path: string; size: number }[] {
  const files: { path: string; size: number }[] = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = join(dir, entry.name);
    if (entry.isFile()) {
      files.push({ path: relPath, size: statSync(fullPath).size });
    } else if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, relPath));
    }
  }
  return files;
}

function resolveDir(name: string, type: string, projectPath?: string): string {
  if (type === 'skill') {
    return projectPath
      ? join(projectPath, '.claude', 'skills', name)
      : join(SKILLS_DIR, name);
  }
  // Command: could be single file or directory
  const base = projectPath ? join(projectPath, '.claude', 'commands') : COMMANDS_DIR;
  const dirPath = join(base, name);
  if (existsSync(dirPath) && statSync(dirPath).isDirectory()) return dirPath;
  // Single file — return parent dir
  return base;
}

// GET /api/skills/local?name=X&type=skill|command&project=PATH
//   action=files → list installed files
//   action=read&path=FILE → read file content + hash
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'files';
  const name = searchParams.get('name') || '';
  const type = searchParams.get('type') || 'command';
  const projectPath = searchParams.get('project') || '';

  if (action === 'files') {
    if (type === 'skill') {
      const dir = resolveDir(name, type, projectPath || undefined);
      return NextResponse.json({ files: listFiles(dir) });
    } else {
      // Command: check single file first, then directory
      const base = projectPath ? join(projectPath, '.claude', 'commands') : COMMANDS_DIR;
      const singleFile = join(base, `${name}.md`);
      const dirPath = join(base, name);
      if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
        return NextResponse.json({ files: listFiles(dirPath) });
      } else if (existsSync(singleFile)) {
        return NextResponse.json({ files: [{ path: `${name}.md`, size: statSync(singleFile).size }] });
      }
      return NextResponse.json({ files: [] });
    }
  }

  if (action === 'read') {
    const filePath = searchParams.get('path') || '';
    let fullPath: string;
    if (type === 'skill') {
      const dir = resolveDir(name, type, projectPath || undefined);
      fullPath = join(dir, filePath);
    } else {
      const base = projectPath ? join(projectPath, '.claude', 'commands') : COMMANDS_DIR;
      const dirPath = join(base, name);
      if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
        fullPath = join(dirPath, filePath);
      } else {
        fullPath = join(base, filePath);
      }
    }

    if (!existsSync(fullPath)) return NextResponse.json({ content: '', hash: '' });
    const content = readFileSync(fullPath, 'utf-8');
    return NextResponse.json({ content, hash: md5(content) });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// POST /api/skills/local — save edited file
export async function POST(req: Request) {
  const body = await req.json();
  const { name, type, project, path: filePath, content, expectedHash } = body;

  let fullPath: string;
  if (type === 'skill') {
    const dir = project
      ? join(project, '.claude', 'skills', name)
      : join(SKILLS_DIR, name);
    fullPath = join(dir, filePath);
  } else {
    const base = project ? join(project, '.claude', 'commands') : COMMANDS_DIR;
    const dirPath = join(base, name);
    if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
      fullPath = join(dirPath, filePath);
    } else {
      fullPath = join(base, filePath);
    }
  }

  // Check for concurrent modification
  if (expectedHash && existsSync(fullPath)) {
    const current = readFileSync(fullPath, 'utf-8');
    if (md5(current) !== expectedHash) {
      return NextResponse.json({ ok: false, error: 'File was modified externally. Reload and try again.' }, { status: 409 });
    }
  }

  writeFileSync(fullPath, content, 'utf-8');
  return NextResponse.json({ ok: true, hash: md5(content) });
}
