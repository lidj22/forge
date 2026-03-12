import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSettings } from './settings';

export interface LocalProject {
  name: string;
  path: string;
  root: string;              // Which project root it came from
  hasGit: boolean;
  hasClaudeMd: boolean;
  language: string | null;
  lastModified: string;
}

export function scanProjects(): LocalProject[] {
  const settings = loadSettings();
  const roots = settings.projectRoots;

  if (roots.length === 0) return [];

  const projects: LocalProject[] = [];

  for (const root of roots) {
    if (!existsSync(root)) continue;

    const entries = readdirSync(root, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;

      const projectPath = join(root, entry.name);

      try {
        const hasGit = existsSync(join(projectPath, '.git'));
        const hasClaudeMd = existsSync(join(projectPath, 'CLAUDE.md'));
        const language = detectLanguage(projectPath);
        const stat = statSync(projectPath);

        projects.push({
          name: entry.name,
          path: projectPath,
          root,
          hasGit,
          hasClaudeMd,
          language,
          lastModified: stat.mtime.toISOString(),
        });
      } catch {
        // Skip inaccessible directories
      }
    }
  }

  return projects.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

function detectLanguage(projectPath: string): string | null {
  const markers: [string, string][] = [
    ['pom.xml', 'java'],
    ['build.gradle', 'java'],
    ['build.gradle.kts', 'kotlin'],
    ['package.json', 'typescript'],
    ['tsconfig.json', 'typescript'],
    ['requirements.txt', 'python'],
    ['pyproject.toml', 'python'],
    ['go.mod', 'go'],
    ['Cargo.toml', 'rust'],
  ];

  for (const [file, lang] of markers) {
    if (existsSync(join(projectPath, file))) return lang;
  }
  return null;
}

export function getProjectInfo(name: string): LocalProject | null {
  const projects = scanProjects();
  return projects.find(p => p.name === name) || null;
}

export function getProjectClaudeMd(projectPath: string): string | null {
  const claudeMdPath = join(projectPath, 'CLAUDE.md');
  if (!existsSync(claudeMdPath)) return null;
  return readFileSync(claudeMdPath, 'utf-8');
}
