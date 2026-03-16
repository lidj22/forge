import { NextResponse } from 'next/server';
import { listPipelines, listWorkflows, startPipeline } from '@/lib/pipeline';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import YAML from 'yaml';

const FLOWS_DIR = join(homedir(), '.forge', 'flows');

// GET /api/pipelines — list all pipelines + available workflows
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');

  if (type === 'workflows') {
    return NextResponse.json(listWorkflows());
  }

  return NextResponse.json(listPipelines().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

// POST /api/pipelines — start a pipeline or save a workflow
export async function POST(req: Request) {
  const body = await req.json();

  // Save workflow YAML from visual editor
  if (body.action === 'save-workflow' && body.yaml) {
    try {
      mkdirSync(FLOWS_DIR, { recursive: true });
      const parsed = YAML.parse(body.yaml);
      const name = parsed.name || 'unnamed';
      const filePath = join(FLOWS_DIR, `${name}.yaml`);
      writeFileSync(filePath, body.yaml, 'utf-8');
      return NextResponse.json({ ok: true, name, path: filePath });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  // Start pipeline
  const { workflow, input } = body;
  if (!workflow) {
    return NextResponse.json({ error: 'workflow name required' }, { status: 400 });
  }

  try {
    const pipeline = startPipeline(workflow, input || {});
    return NextResponse.json(pipeline);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
