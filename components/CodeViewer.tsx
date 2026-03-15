'use client';

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import type { WebTerminalHandle, WebTerminalProps } from './WebTerminal';

const WebTerminal = lazy(() => import('./WebTerminal'));

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: FileNode[];
}

// ─── File Tree ───────────────────────────────────────────

type GitStatusMap = Map<string, string>; // path → status

function TreeNode({ node, depth, selected, onSelect, gitMap }: {
  node: FileNode;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
  gitMap: GitStatusMap;
}) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.type === 'dir') {
    // Check if any child has git changes
    const dirHasChanges = node.children?.some(c => hasGitChanges(c, gitMap));
    return (
      <div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full text-left flex items-center gap-1 px-1 py-0.5 hover:bg-[var(--bg-tertiary)] rounded text-xs"
          style={{ paddingLeft: depth * 12 + 4 }}
        >
          <span className="text-[10px] text-[var(--text-secondary)] w-3">{expanded ? '▾' : '▸'}</span>
          <span className={dirHasChanges ? 'text-yellow-400' : 'text-[var(--text-primary)]'}>{node.name}</span>
        </button>
        {expanded && node.children?.map(child => (
          <TreeNode key={child.path} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} gitMap={gitMap} />
        ))}
      </div>
    );
  }

  const isSelected = selected === node.path;
  const gitStatus = gitMap.get(node.path);
  const gitColor = gitStatus
    ? gitStatus.includes('M') ? 'text-yellow-400'
    : gitStatus.includes('D') ? 'text-red-400'
    : 'text-green-400'  // A, ?, new
    : '';

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`w-full text-left flex items-center gap-1 px-1 py-0.5 rounded text-xs truncate ${
        isSelected ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
        : gitColor ? `hover:bg-[var(--bg-tertiary)] ${gitColor}`
        : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
      }`}
      style={{ paddingLeft: depth * 12 + 16 }}
      title={node.path}
    >
      {node.name}
    </button>
  );
}

function hasGitChanges(node: FileNode, gitMap: GitStatusMap): boolean {
  if (node.type === 'file') return gitMap.has(node.path);
  return node.children?.some(c => hasGitChanges(c, gitMap)) || false;
}

function flattenTree(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === 'file') result.push(node);
    if (node.children) result.push(...flattenTree(node.children));
  }
  return result;
}

const LANG_MAP: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript (JSX)', js: 'JavaScript', jsx: 'JavaScript (JSX)',
  py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin',
  css: 'CSS', scss: 'SCSS', html: 'HTML', json: 'JSON', yaml: 'YAML', yml: 'YAML',
  md: 'Markdown', sh: 'Shell', sql: 'SQL', toml: 'TOML', xml: 'XML',
};

// ─── Main Component ──────────────────────────────────────

export default function CodeViewer({ terminalRef }: { terminalRef: React.RefObject<WebTerminalHandle | null> }) {
  const [currentDir, setCurrentDir] = useState<string | null>(null);
  const [dirName, setDirName] = useState('');
  const [tree, setTree] = useState<FileNode[]>([]);
  const [gitBranch, setGitBranch] = useState('');
  const [gitChanges, setGitChanges] = useState<{ path: string; status: string }[]>([]);
  const [showGit, setShowGit] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [language, setLanguage] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [terminalHeight, setTerminalHeight] = useState(300);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const lastDirRef = useRef<string | null>(null);

  // When active terminal session changes, query its cwd
  useEffect(() => {
    if (!activeSession) return;
    let cancelled = false;

    const fetchCwd = async () => {
      try {
        const res = await fetch(`/api/terminal-cwd?session=${encodeURIComponent(activeSession)}`);
        const data = await res.json();
        if (!cancelled && data.path && data.path !== lastDirRef.current) {
          lastDirRef.current = data.path;
          setCurrentDir(data.path);
          setSelectedFile(null);
          setContent(null);
        }
      } catch {}
    };

    fetchCwd();
    // Poll cwd every 5s (user might cd to a different directory)
    const timer = setInterval(fetchCwd, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeSession]);

  // Fetch file tree when directory changes
  useEffect(() => {
    if (!currentDir) return;
    const fetchDir = () => {
      fetch(`/api/code?dir=${encodeURIComponent(currentDir)}`)
        .then(r => r.json())
        .then(data => {
          setTree(data.tree || []);
          setDirName(data.dirName || currentDir.split('/').pop() || '');
          setGitBranch(data.gitBranch || '');
          setGitChanges(data.gitChanges || []);
        })
        .catch(() => setTree([]));
    };
    fetchDir();
  }, [currentDir]);

  // Build git status map for tree coloring
  const gitMap: GitStatusMap = new Map(gitChanges.map(g => [g.path, g.status]));

  const openFile = useCallback(async (path: string) => {
    if (!currentDir) return;
    setSelectedFile(path);
    setLoading(true);
    const res = await fetch(`/api/code?dir=${encodeURIComponent(currentDir)}&file=${encodeURIComponent(path)}`);
    const data = await res.json();
    setContent(data.content || null);
    setLanguage(data.language || '');
    setLoading(false);
  }, [currentDir]);

  const allFiles = flattenTree(tree);
  const filtered = search
    ? allFiles.filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || f.path.toLowerCase().includes(search.toLowerCase()))
    : null;

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: terminalHeight };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      setTerminalHeight(Math.max(100, Math.min(600, dragRef.current.startH + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleActiveSession = useCallback((session: string | null) => {
    setActiveSession(session);
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* File browser + code viewer */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-56 border-r border-[var(--border)] flex flex-col shrink-0">
            {/* Directory name + git */}
            <div className="px-3 py-2 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
                  {dirName || 'No directory'}
                </span>
                {gitBranch && (
                  <span className="text-[9px] text-[var(--accent)] bg-[var(--accent)]/10 px-1.5 py-0.5 rounded shrink-0">
                    {gitBranch}
                  </span>
                )}
              </div>
              {gitChanges.length > 0 && (
                <button
                  onClick={() => setShowGit(v => !v)}
                  className="text-[10px] text-yellow-500 hover:text-yellow-400 mt-1 block"
                >
                  {gitChanges.length} changes {showGit ? '▾' : '▸'}
                </button>
              )}
            </div>

            {/* Git changes */}
            {showGit && gitChanges.length > 0 && (
              <div className="border-b border-[var(--border)] max-h-40 overflow-y-auto">
                {gitChanges.map(g => (
                  <button
                    key={g.path}
                    onClick={() => openFile(g.path)}
                    className={`w-full text-left px-3 py-1 text-xs flex items-center gap-2 hover:bg-[var(--bg-tertiary)] ${
                      selectedFile === g.path ? 'bg-[var(--accent)]/10' : ''
                    }`}
                  >
                    <span className={`text-[10px] font-mono w-4 shrink-0 ${
                      g.status.includes('M') ? 'text-yellow-500' :
                      g.status.includes('A') || g.status.includes('?') ? 'text-green-500' :
                      g.status.includes('D') ? 'text-red-500' :
                      'text-[var(--text-secondary)]'
                    }`}>
                      {g.status.includes('?') ? '+' : g.status[0]}
                    </span>
                    <span className="truncate text-[var(--text-secondary)]">{g.path}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="p-2 border-b border-[var(--border)]">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full text-xs bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {/* Tree */}
            <div className="flex-1 overflow-y-auto p-1">
              {!currentDir ? (
                <div className="text-xs text-[var(--text-secondary)] p-2">Open a terminal to see files</div>
              ) : filtered ? (
                filtered.length === 0 ? (
                  <div className="text-xs text-[var(--text-secondary)] p-2">No matches</div>
                ) : (
                  filtered.map(f => (
                    <button
                      key={f.path}
                      onClick={() => { openFile(f.path); setSearch(''); }}
                      className={`w-full text-left px-2 py-1 rounded text-xs truncate ${
                        selectedFile === f.path ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                      }`}
                      title={f.path}
                    >
                      <span className="text-[var(--text-primary)]">{f.name}</span>
                      <span className="text-[9px] text-[var(--text-secondary)] ml-1">{f.path.split('/').slice(0, -1).join('/')}</span>
                    </button>
                  ))
                )
              ) : (
                tree.map(node => (
                  <TreeNode key={node.path} node={node} depth={0} selected={selectedFile} onSelect={openFile} gitMap={gitMap} />
                ))
              )}
            </div>
          </aside>
        )}

        {/* Code viewer */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="px-3 py-1.5 border-b border-[var(--border)] shrink-0 flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className="text-[10px] px-1.5 py-0.5 text-gray-400 hover:text-white hover:bg-[var(--bg-tertiary)] rounded"
            >
              {sidebarOpen ? '◀' : '▶'}
            </button>
            {selectedFile ? (
              <>
                <span className="text-xs font-semibold text-[var(--text-primary)] truncate">{selectedFile}</span>
                {language && (
                  <span className="text-[9px] text-[var(--text-secondary)] ml-auto">{LANG_MAP[language] || language}</span>
                )}
              </>
            ) : (
              <span className="text-xs text-[var(--text-secondary)]">{dirName || 'Code'}</span>
            )}
          </div>

          {selectedFile && content !== null ? (
            <div className="flex-1 overflow-auto bg-[var(--bg-primary)]">
              {loading ? (
                <div className="p-4 text-xs text-[var(--text-secondary)]">Loading...</div>
              ) : (
                <pre className="p-4 text-[12px] leading-[1.5] font-mono text-[var(--text-primary)] whitespace-pre" style={{ fontFamily: 'Menlo, Monaco, "Courier New", monospace', tabSize: 2 }}>
                  {content.split('\n').map((line, i) => (
                    <div key={i} className="flex hover:bg-[var(--bg-tertiary)]/50">
                      <span className="select-none text-[var(--text-secondary)]/40 text-right pr-4 w-10 shrink-0">{i + 1}</span>
                      <span className="flex-1">{line || ' '}</span>
                    </div>
                  ))}
                </pre>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
              <p className="text-xs">{currentDir ? 'Select a file to view' : 'Terminal will show files for its working directory'}</p>
            </div>
          )}
        </main>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onDragStart}
        className="h-1 bg-[var(--border)] cursor-row-resize hover:bg-[var(--accent)]/50 shrink-0"
      />

      {/* Terminal */}
      <div className="shrink-0" style={{ height: terminalHeight }}>
        <Suspense fallback={<div className="h-full flex items-center justify-center text-[var(--text-secondary)] text-xs">Loading...</div>}>
          <WebTerminal ref={terminalRef} onActiveSession={handleActiveSession} />
        </Suspense>
      </div>
    </div>
  );
}
