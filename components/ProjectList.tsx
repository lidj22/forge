'use client';

import { useState, useEffect } from 'react';

interface LocalProject {
  name: string;
  path: string;
  hasGit: boolean;
  hasClaudeMd: boolean;
  language: string | null;
  lastModified: string;
}

interface ClaudeProcess {
  id: string;
  projectName: string;
  status: string;
}

const langIcons: Record<string, string> = {
  java: 'JV',
  kotlin: 'KT',
  typescript: 'TS',
  python: 'PY',
  go: 'GO',
  rust: 'RS',
};

export default function ProjectList({
  onLaunch,
  claudeProcesses,
}: {
  onLaunch: (projectName: string) => void;
  claudeProcesses: ClaudeProcess[];
}) {
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(setProjects);
  }, []);

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(filter.toLowerCase())
  );

  const getProcessForProject = (name: string) =>
    claudeProcesses.find(p => p.projectName === name && p.status === 'running');

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-[var(--border)]">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter projects..."
          className="w-full px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map(p => {
          const proc = getProcessForProject(p.name);
          return (
            <div
              key={p.name}
              className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] hover:bg-[var(--bg-tertiary)] group"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {p.language && (
                    <span className="text-[9px] px-1 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)] font-mono">
                      {langIcons[p.language] || p.language.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="text-xs font-medium truncate">{p.name}</span>
                  {p.hasClaudeMd && (
                    <span className="text-[9px] text-[var(--accent)]" title="Has CLAUDE.md">C</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {proc ? (
                  <span className="text-[9px] text-[var(--green)]">● running</span>
                ) : (
                  <button
                    onClick={() => onLaunch(p.name)}
                    className="text-[10px] px-2 py-0.5 bg-[var(--accent)] text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Launch Claude
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && projects.length === 0 && (
        <div className="p-4 text-center text-xs text-[var(--text-secondary)] space-y-2">
          <p>No projects found</p>
          <p className="text-[10px]">Go to Settings to add project directories</p>
        </div>
      )}
      <div className="p-2 border-t border-[var(--border)] text-[10px] text-[var(--text-secondary)]">
        {projects.length} projects
      </div>
    </div>
  );
}
