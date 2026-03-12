'use client';

import { useState, useEffect } from 'react';

interface Project {
  name: string;
  path: string;
  language: string | null;
}

export default function NewTaskModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: { projectName: string; prompt: string; priority?: number; newSession?: boolean }) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [prompt, setPrompt] = useState('');
  const [priority, setPriority] = useState(0);
  const [sessionMode, setSessionMode] = useState<'continue' | 'new'>('continue');
  const [existingSessionId, setExistingSessionId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then((p: Project[]) => {
      setProjects(p);
      if (p.length > 0) setSelectedProject(p[0].name);
    });
  }, []);

  // Fetch existing session when project changes
  useEffect(() => {
    if (!selectedProject) {
      setExistingSessionId(null);
      return;
    }
    fetch(`/api/tasks/session?project=${encodeURIComponent(selectedProject)}`)
      .then(r => r.json())
      .then(data => setExistingSessionId(data.conversationId || null))
      .catch(() => setExistingSessionId(null));
  }, [selectedProject]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !prompt.trim()) return;
    onCreate({
      projectName: selectedProject,
      prompt: prompt.trim(),
      priority,
      newSession: sessionMode === 'new',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg w-[560px] max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold">New Task</h2>
          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
            Submit a task for Claude Code to work on autonomously
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Project select */}
          <div>
            <label className="text-[11px] text-[var(--text-secondary)] block mb-1">Project</label>
            <select
              value={selectedProject}
              onChange={e => setSelectedProject(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              {projects.map(p => (
                <option key={p.name} value={p.name}>
                  {p.name} {p.language ? `(${p.language})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Session mode */}
          <div>
            <label className="text-[11px] text-[var(--text-secondary)] block mb-1">Session</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSessionMode('continue')}
                className={`text-[11px] px-3 py-1 rounded border transition-colors ${
                  sessionMode === 'continue'
                    ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                    : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
                }`}
              >
                Continue Session
              </button>
              <button
                type="button"
                onClick={() => setSessionMode('new')}
                className={`text-[11px] px-3 py-1 rounded border transition-colors ${
                  sessionMode === 'new'
                    ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                    : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
                }`}
              >
                New Session
              </button>
            </div>
            {sessionMode === 'continue' && (
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                {existingSessionId
                  ? <>Continuing session <span className="font-mono text-[var(--accent)]">{existingSessionId.slice(0, 12)}...</span></>
                  : 'No existing session — will start a new one'}
              </p>
            )}
            {sessionMode === 'new' && (
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                Will start a fresh session with no prior context
              </p>
            )}
          </div>

          {/* Task prompt */}
          <div>
            <label className="text-[11px] text-[var(--text-secondary)] block mb-1">What should Claude do?</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Refactor the authentication module to use JWT tokens instead of session cookies. Update all tests."
              rows={6}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded text-xs text-[var(--text-primary)] resize-none focus:outline-none focus:border-[var(--accent)]"
              autoFocus
            />
          </div>

          {/* Priority */}
          <div>
            <label className="text-[11px] text-[var(--text-secondary)] block mb-1">Priority</label>
            <div className="flex gap-2">
              {[
                { value: 0, label: 'Normal' },
                { value: 1, label: 'High' },
                { value: 2, label: 'Urgent' },
              ].map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`text-[11px] px-3 py-1 rounded border transition-colors ${
                    priority === p.value
                      ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                      : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedProject || !prompt.trim()}
              className="text-xs px-4 py-1.5 bg-[var(--accent)] text-white rounded hover:opacity-90 disabled:opacity-50"
            >
              Submit Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
