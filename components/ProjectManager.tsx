'use client';

import { useState, useEffect, useCallback } from 'react';

interface Project {
  name: string;
  path: string;
  root: string;
  hasGit: boolean;
  language: string | null;
}

interface GitInfo {
  branch: string;
  changes: { status: string; path: string }[];
  remote: string;
  ahead: number;
  behind: number;
  lastCommit: string;
  log: { hash: string; message: string; author: string; date: string }[];
}

export default function ProjectManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [gitLoading, setGitLoading] = useState(false);
  const [gitResult, setGitResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [showClone, setShowClone] = useState(false);
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneLoading, setCloneLoading] = useState(false);
  const [fileTree, setFileTree] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLanguage, setFileLanguage] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [projectSkills, setProjectSkills] = useState<{ name: string; displayName: string; type: string; scope: string; version: string; installedVersion: string; hasUpdate: boolean }[]>([]);
  const [showSkillsDetail, setShowSkillsDetail] = useState(false);
  const [expandedSkillItem, setExpandedSkillItem] = useState<string | null>(null);
  const [skillItemFiles, setSkillItemFiles] = useState<{ path: string; size: number }[]>([]);
  const [skillFileContent, setSkillFileContent] = useState('');
  const [skillFileHash, setSkillFileHash] = useState('');
  const [skillActivePath, setSkillActivePath] = useState('');
  const [skillEditing, setSkillEditing] = useState(false);
  const [skillEditContent, setSkillEditContent] = useState('');
  const [skillSaving, setSkillSaving] = useState(false);

  // Fetch projects
  useEffect(() => {
    fetch('/api/projects').then(r => r.json())
      .then((p: Project[]) => { if (Array.isArray(p)) setProjects(p); })
      .catch(() => {});
  }, []);

  // Fetch git info when project selected
  const fetchGitInfo = useCallback(async (project: Project) => {
    if (!project.hasGit) { setGitInfo(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/git?dir=${encodeURIComponent(project.path)}`);
      const data = await res.json();
      if (!data.error) setGitInfo(data);
      else setGitInfo(null);
    } catch { setGitInfo(null); }
    setLoading(false);
  }, []);

  // Fetch file tree
  const fetchTree = useCallback(async (project: Project) => {
    try {
      const res = await fetch(`/api/code?dir=${encodeURIComponent(project.path)}`);
      const data = await res.json();
      setFileTree(data.tree || []);
    } catch { setFileTree([]); }
  }, []);

  const toggleSkillItem = useCallback(async (name: string, type: string) => {
    if (expandedSkillItem === name) {
      setExpandedSkillItem(null);
      setSkillEditing(false);
      return;
    }
    setExpandedSkillItem(name);
    setSkillItemFiles([]);
    setSkillFileContent('');
    setSkillActivePath('');
    setSkillEditing(false);
    const project = selectedProject?.path || '';
    try {
      const res = await fetch(`/api/skills/local?action=files&name=${encodeURIComponent(name)}&type=${type}&project=${encodeURIComponent(project)}`);
      const data = await res.json();
      setSkillItemFiles(data.files || []);
      // Auto-select first .md file
      const firstMd = (data.files || []).find((f: any) => f.path.endsWith('.md'));
      if (firstMd) loadSkillFile(name, type, firstMd.path, project);
    } catch {}
  }, [expandedSkillItem, selectedProject]);

  const loadSkillFile = async (name: string, type: string, path: string, project: string) => {
    setSkillActivePath(path);
    setSkillEditing(false);
    setSkillFileContent('Loading...');
    try {
      const res = await fetch(`/api/skills/local?action=read&name=${encodeURIComponent(name)}&type=${type}&path=${encodeURIComponent(path)}&project=${encodeURIComponent(project)}`);
      const data = await res.json();
      setSkillFileContent(data.content || '');
      setSkillFileHash(data.hash || '');
    } catch { setSkillFileContent('(Failed to load)'); }
  };

  const saveSkillFile = async (name: string, type: string, path: string) => {
    setSkillSaving(true);
    const project = selectedProject?.path || '';
    const res = await fetch('/api/skills/local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, project, path, content: skillEditContent, expectedHash: skillFileHash }),
    });
    const data = await res.json();
    if (data.ok) {
      setSkillFileContent(skillEditContent);
      setSkillFileHash(data.hash);
      setSkillEditing(false);
    } else {
      alert(data.error || 'Save failed');
    }
    setSkillSaving(false);
  };

  const handleUpdate = async (name: string) => {
    // Check for local modifications first
    const checkRes = await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check-modified', name }),
    });
    const checkData = await checkRes.json();
    if (checkData.modified) {
      if (!confirm('Local files have been modified. Overwrite with remote version?')) return;
    }
    // Re-install (update)
    const target = selectedProject?.path || 'global';
    await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'install', name, target, force: true }),
    });
    if (selectedProject) fetchProjectSkills(selectedProject.path);
  };

  const fetchProjectSkills = useCallback(async (projectPath: string) => {
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      const skills = (data.skills || []).filter((s: any) =>
        s.installedGlobal || (s.installedProjects || []).includes(projectPath)
      ).map((s: any) => ({
        name: s.name,
        displayName: s.displayName,
        type: s.type || 'command',
        version: s.version || '',
        installedVersion: s.installedVersion || '',
        hasUpdate: s.hasUpdate || false,
        scope: s.installedGlobal && (s.installedProjects || []).includes(projectPath) ? 'global + project'
          : s.installedGlobal ? 'global'
          : 'project',
      }));
      setProjectSkills(skills);
    } catch { setProjectSkills([]); }
  }, []);

  const selectProject = useCallback((p: Project) => {
    setSelectedProject(p);
    setSelectedFile(null);
    setFileContent(null);
    setGitResult(null);
    setCommitMsg('');
    fetchGitInfo(p);
    fetchTree(p);
    fetchProjectSkills(p.path);
  }, [fetchGitInfo, fetchTree, fetchProjectSkills]);

  const openFile = useCallback(async (path: string) => {
    if (!selectedProject) return;
    setSelectedFile(path);
    setFileLoading(true);
    try {
      const res = await fetch(`/api/code?dir=${encodeURIComponent(selectedProject.path)}&file=${encodeURIComponent(path)}`);
      const data = await res.json();
      setFileContent(data.content || null);
      setFileLanguage(data.language || '');
    } catch { setFileContent(null); }
    setFileLoading(false);
  }, [selectedProject]);

  // Git operations
  const gitAction = async (action: string, extra?: any) => {
    if (!selectedProject) return;
    setGitLoading(true);
    setGitResult(null);
    try {
      const res = await fetch('/api/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, dir: selectedProject.path, ...extra }),
      });
      const data = await res.json();
      setGitResult(data);
      if (data.ok) fetchGitInfo(selectedProject);
    } catch (e: any) {
      setGitResult({ error: e.message });
    }
    setGitLoading(false);
  };

  const handleClone = async () => {
    if (!cloneUrl.trim()) return;
    setCloneLoading(true);
    setGitResult(null);
    try {
      const res = await fetch('/api/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clone', repoUrl: cloneUrl.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setCloneUrl('');
        setShowClone(false);
        // Refresh project list
        const pRes = await fetch('/api/projects');
        const pData = await pRes.json();
        if (Array.isArray(pData)) setProjects(pData);
        setGitResult({ ok: true });
      } else {
        setGitResult(data);
      }
    } catch (e: any) {
      setGitResult({ error: e.message });
    }
    setCloneLoading(false);
  };

  // Group projects by root
  const roots = [...new Set(projects.map(p => p.root))];

  return (
    <div className="flex-1 flex min-h-0">
      {/* Left sidebar — project list */}
      <aside className="w-64 border-r border-[var(--border)] flex flex-col shrink-0">
        <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[var(--text-primary)]">Projects</span>
          <button
            onClick={() => setShowClone(v => !v)}
            className={`text-[10px] px-2 py-0.5 rounded ${showClone ? 'text-white bg-[var(--accent)]' : 'text-[var(--accent)] hover:bg-[var(--accent)]/10'}`}
          >
            + Clone
          </button>
        </div>

        {/* Clone form */}
        {showClone && (
          <div className="p-2 border-b border-[var(--border)] space-y-2">
            <input
              value={cloneUrl}
              onChange={e => setCloneUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleClone()}
              placeholder="https://github.com/user/repo.git"
              className="w-full text-xs bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1.5 text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              onClick={handleClone}
              disabled={cloneLoading || !cloneUrl.trim()}
              className="w-full text-[10px] px-2 py-1 bg-[var(--accent)] text-white rounded hover:opacity-90 disabled:opacity-50"
            >
              {cloneLoading ? 'Cloning...' : 'Clone Repository'}
            </button>
          </div>
        )}

        {/* Project list */}
        <div className="flex-1 overflow-y-auto">
          {roots.map(root => {
            const rootName = root.split('/').pop() || root;
            const rootProjects = projects.filter(p => p.root === root).sort((a, b) => a.name.localeCompare(b.name));
            return (
              <div key={root}>
                <div className="px-3 py-1 text-[9px] text-[var(--text-secondary)] uppercase bg-[var(--bg-tertiary)]">
                  {rootName}
                </div>
                {rootProjects.map(p => (
                  <button
                    key={p.path}
                    onClick={() => selectProject(p)}
                    className={`w-full text-left px-3 py-1.5 text-xs border-b border-[var(--border)]/30 flex items-center gap-2 ${
                      selectedProject?.path === p.path ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    {p.language && <span className="text-[8px] text-[var(--text-secondary)] ml-auto shrink-0">{p.language}</span>}
                    {p.hasGit && <span className="text-[8px] text-[var(--accent)] shrink-0">git</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedProject ? (
          <>
            {/* Project header */}
            <div className="px-4 py-2 border-b border-[var(--border)] shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{selectedProject.name}</span>
                {gitInfo?.branch && (
                  <span className="text-[9px] text-[var(--accent)] bg-[var(--accent)]/10 px-1.5 py-0.5 rounded">{gitInfo.branch}</span>
                )}
                {gitInfo?.ahead ? <span className="text-[9px] text-green-400">↑{gitInfo.ahead}</span> : null}
                {gitInfo?.behind ? <span className="text-[9px] text-yellow-400">↓{gitInfo.behind}</span> : null}
                {/* Action buttons */}
                <div className="flex items-center gap-1.5 ml-auto">
                  {/* Open Terminal */}
                  <button
                    onClick={() => {
                      if (!selectedProject) return;
                      // Navigate to terminal tab with this project
                      const event = new CustomEvent('forge:open-terminal', { detail: { projectPath: selectedProject.path, projectName: selectedProject.name } });
                      window.dispatchEvent(event);
                    }}
                    className="text-[9px] px-2 py-0.5 border border-[var(--accent)] text-[var(--accent)] rounded hover:bg-[var(--accent)] hover:text-white transition-colors"
                    title="Open terminal with claude -c"
                  >
                    Terminal
                  </button>
                  <button
                    onClick={() => { fetchGitInfo(selectedProject); fetchTree(selectedProject); if (selectedFile) openFile(selectedFile); }}
                    className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    title="Refresh"
                  >
                    ↻
                  </button>
                </div>
              </div>
              <div className="text-[9px] text-[var(--text-secondary)] mt-0.5">
                {selectedProject.path}
                {gitInfo?.remote && (
                  <span className="ml-2">{gitInfo.remote.replace(/^https?:\/\//, '').replace(/^git@github\.com:/, 'github.com/').replace(/\.git$/, '')}</span>
                )}
              </div>
              {projectSkills.length > 0 && (
                <div className="mt-1">
                  {/* Summary line — click to expand */}
                  <button
                    onClick={() => setShowSkillsDetail(v => !v)}
                    className="flex items-center gap-2 text-[9px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <span>{showSkillsDetail ? '▾' : '▸'}</span>
                    {(() => {
                      const skills = projectSkills.filter(s => s.type === 'skill');
                      const commands = projectSkills.filter(s => s.type === 'command');
                      const hasUpdates = projectSkills.some(s => s.hasUpdate);
                      return (
                        <span className="flex items-center gap-1.5">
                          {skills.length > 0 && <span className="text-purple-400">{skills.length} skill{skills.length > 1 ? 's' : ''}</span>}
                          {commands.length > 0 && <span className="text-blue-400">{commands.length} cmd{commands.length > 1 ? 's' : ''}</span>}
                          {hasUpdates && <span className="text-[var(--yellow)]">updates available</span>}
                        </span>
                      );
                    })()}
                  </button>
                  {/* Expanded detail */}
                  {showSkillsDetail && (
                    <div className="mt-1 border border-[var(--border)] rounded bg-[var(--bg-tertiary)]">
                      {projectSkills.map(s => (
                        <div key={s.name} className="border-b border-[var(--border)]/30 last:border-b-0">
                          {/* Item header */}
                          <div
                            className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-[var(--bg-secondary)]"
                            onClick={() => toggleSkillItem(s.name, s.type)}
                          >
                            <span className="text-[8px] text-[var(--text-secondary)]">{expandedSkillItem === s.name ? '▾' : '▸'}</span>
                            <span className={`text-[7px] px-1 rounded font-medium ${
                              s.type === 'skill' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                            }`}>{s.type === 'skill' ? 'S' : 'C'}</span>
                            <span className="text-[9px] text-[var(--text-primary)] flex-1 truncate">/{s.name}</span>
                            <span className="text-[8px] text-[var(--text-secondary)] font-mono">v{s.installedVersion || s.version}</span>
                            {s.hasUpdate && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleUpdate(s.name); }}
                                className="text-[7px] px-1.5 py-0.5 rounded bg-[var(--yellow)]/20 text-[var(--yellow)] hover:bg-[var(--yellow)]/30"
                              >
                                → v{s.version}
                              </button>
                            )}
                            <span className="text-[7px] text-[var(--text-secondary)]">{s.scope}</span>
                          </div>
                          {/* Expanded: file browser + editor */}
                          {expandedSkillItem === s.name && (
                            <div className="flex border-t border-[var(--border)] h-[200px]">
                              {/* File list */}
                              <div className="w-28 border-r border-[var(--border)] overflow-y-auto shrink-0">
                                {skillItemFiles.map(f => (
                                  <button
                                    key={f.path}
                                    onClick={() => loadSkillFile(s.name, s.type, f.path, selectedProject?.path || '')}
                                    className={`w-full text-left px-2 py-1 text-[9px] truncate ${
                                      skillActivePath === f.path ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                    }`}
                                    title={f.path}
                                  >
                                    {f.path}
                                  </button>
                                ))}
                              </div>
                              {/* Content / editor */}
                              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                                {skillActivePath && (
                                  <div className="flex items-center gap-2 px-2 py-1 border-b border-[var(--border)] shrink-0">
                                    <span className="text-[8px] text-[var(--text-secondary)] font-mono truncate flex-1">{skillActivePath}</span>
                                    {!skillEditing ? (
                                      <button
                                        onClick={() => { setSkillEditing(true); setSkillEditContent(skillFileContent); }}
                                        className="text-[8px] text-[var(--accent)] hover:underline"
                                      >Edit</button>
                                    ) : (
                                      <div className="flex gap-1">
                                        <button
                                          onClick={() => saveSkillFile(s.name, s.type, skillActivePath)}
                                          disabled={skillSaving}
                                          className="text-[8px] px-1.5 py-0.5 bg-[var(--accent)] text-white rounded hover:opacity-90 disabled:opacity-50"
                                        >{skillSaving ? '...' : 'Save'}</button>
                                        <button
                                          onClick={() => setSkillEditing(false)}
                                          className="text-[8px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                        >Cancel</button>
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div className="flex-1 overflow-auto">
                                  {skillEditing ? (
                                    <textarea
                                      value={skillEditContent}
                                      onChange={e => setSkillEditContent(e.target.value)}
                                      className="w-full h-full p-2 text-[10px] font-mono bg-[var(--bg-primary)] text-[var(--text-primary)] border-none outline-none resize-none"
                                      spellCheck={false}
                                    />
                                  ) : (
                                    <pre className="p-2 text-[10px] font-mono text-[var(--text-primary)] whitespace-pre-wrap break-words">
                                      {skillFileContent}
                                    </pre>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {gitInfo?.lastCommit && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] text-[var(--text-secondary)] font-mono truncate">{gitInfo.lastCommit}</span>
                  <button
                    onClick={() => setShowLog(v => !v)}
                    className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${showLog ? 'text-white bg-[var(--accent)]/30' : 'text-[var(--accent)] hover:bg-[var(--accent)]/10'}`}
                  >
                    History
                  </button>
                </div>
              )}
            </div>

            {/* Git log */}
            {showLog && gitInfo?.log && gitInfo.log.length > 0 && (
              <div className="max-h-48 overflow-y-auto border-b border-[var(--border)] bg-[var(--bg-tertiary)]">
                {gitInfo.log.map(c => (
                  <div key={c.hash} className="px-4 py-1.5 border-b border-[var(--border)]/30 text-xs flex items-start gap-2">
                    <span className="font-mono text-[var(--accent)] shrink-0 text-[10px]">{c.hash}</span>
                    <span className="text-[var(--text-primary)] truncate flex-1">{c.message}</span>
                    <span className="text-[var(--text-secondary)] text-[9px] shrink-0">{c.author}</span>
                    <span className="text-[var(--text-secondary)] text-[9px] shrink-0 w-16 text-right">{c.date}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Content area */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
              {/* File tree */}
              <div className="w-52 border-r border-[var(--border)] overflow-y-auto p-1 shrink-0">
                {fileTree.map((node: any) => (
                  <FileTreeNode key={node.path} node={node} depth={0} selected={selectedFile} onSelect={openFile} />
                ))}
              </div>

              {/* File content — independent scroll */}
              <div className="flex-1 min-w-0 overflow-auto bg-[var(--bg-primary)]">
                {fileLoading ? (
                  <div className="h-full flex items-center justify-center text-xs text-[var(--text-secondary)]">Loading...</div>
                ) : selectedFile && fileContent !== null ? (
                  <>
                    <div className="px-3 py-1 border-b border-[var(--border)] text-[10px] text-[var(--text-secondary)] sticky top-0 bg-[var(--bg-primary)] z-10">{selectedFile}</div>
                    <pre className="p-4 text-[12px] leading-[1.5] font-mono text-[var(--text-primary)] whitespace-pre" style={{ fontFamily: 'Menlo, Monaco, "Courier New", monospace', tabSize: 2 }}>
                      {fileContent.split('\n').map((line, i) => (
                        <div key={i} className="flex hover:bg-[var(--bg-tertiary)]/50">
                          <span className="select-none text-[var(--text-secondary)]/40 text-right pr-4 w-10 shrink-0">{i + 1}</span>
                          <span className="flex-1">{line || ' '}</span>
                        </div>
                      ))}
                    </pre>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-secondary)]">
                    Select a file to view
                  </div>
                )}
              </div>
            </div>

            {/* Git panel — bottom */}
            {gitInfo && (
              <div className="border-t border-[var(--border)] shrink-0">
                {/* Changes list */}
                {gitInfo.changes.length > 0 && (
                  <div className="max-h-32 overflow-y-auto border-b border-[var(--border)]">
                    <div className="px-3 py-1 text-[9px] text-[var(--text-secondary)] bg-[var(--bg-tertiary)] sticky top-0">
                      {gitInfo.changes.length} changes
                    </div>
                    {gitInfo.changes.map(g => (
                      <div key={g.path} className="px-3 py-0.5 text-xs flex items-center gap-2">
                        <span className={`text-[10px] font-mono w-4 ${
                          g.status.includes('M') ? 'text-yellow-500' :
                          g.status.includes('?') ? 'text-green-500' :
                          g.status.includes('D') ? 'text-red-500' : 'text-[var(--text-secondary)]'
                        }`}>
                          {g.status.includes('?') ? '+' : g.status[0]}
                        </span>
                        <span className="text-[var(--text-secondary)] truncate">{g.path}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Git actions */}
                <div className="px-3 py-2 flex items-center gap-2">
                  <input
                    value={commitMsg}
                    onChange={e => setCommitMsg(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && commitMsg.trim() && gitAction('commit', { message: commitMsg.trim() })}
                    placeholder="Commit message..."
                    className="flex-1 text-xs bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    onClick={() => commitMsg.trim() && gitAction('commit', { message: commitMsg.trim() })}
                    disabled={gitLoading || !commitMsg.trim() || gitInfo.changes.length === 0}
                    className="text-[10px] px-3 py-1.5 bg-[var(--accent)] text-white rounded hover:opacity-90 disabled:opacity-50 shrink-0"
                  >
                    Commit
                  </button>
                  <button
                    onClick={() => gitAction('push')}
                    disabled={gitLoading || gitInfo.ahead === 0}
                    className="text-[10px] px-3 py-1.5 border border-[var(--accent)] text-[var(--accent)] rounded hover:bg-[var(--accent)] hover:text-white disabled:opacity-50 shrink-0"
                  >
                    Push{gitInfo.ahead > 0 ? ` (${gitInfo.ahead})` : ''}
                  </button>
                  <button
                    onClick={() => gitAction('pull')}
                    disabled={gitLoading}
                    className="text-[10px] px-3 py-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0"
                  >
                    Pull{gitInfo.behind > 0 ? ` (${gitInfo.behind})` : ''}
                  </button>
                </div>

                {/* Result */}
                {gitResult && (
                  <div className={`px-3 py-1 text-[10px] ${gitResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                    {gitResult.ok ? '✅ Done' : `❌ ${gitResult.error}`}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
            <div className="text-center space-y-2">
              <p className="text-sm">Select a project</p>
              <p className="text-xs">{projects.length} projects across {roots.length} directories</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Simple file tree node
function FileTreeNode({ node, depth, selected, onSelect }: {
  node: { name: string; path: string; type: string; children?: any[] };
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.type === 'dir') {
    return (
      <div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full text-left flex items-center gap-1 px-1 py-0.5 hover:bg-[var(--bg-tertiary)] rounded text-xs"
          style={{ paddingLeft: depth * 12 + 4 }}
        >
          <span className="text-[10px] text-[var(--text-secondary)] w-3">{expanded ? '▾' : '▸'}</span>
          <span className="text-[var(--text-primary)]">{node.name}</span>
        </button>
        {expanded && node.children?.map((child: any) => (
          <FileTreeNode key={child.path} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`w-full text-left px-1 py-0.5 rounded text-xs truncate ${
        selected === node.path ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
      }`}
      style={{ paddingLeft: depth * 12 + 16 }}
    >
      {node.name}
    </button>
  );
}
