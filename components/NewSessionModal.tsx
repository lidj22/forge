'use client';

import { useState, useEffect } from 'react';
import type { SessionTemplate } from '@/src/types';

export default function NewSessionModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: { name: string; templateId: string }) => void;
}) {
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    fetch('/api/templates')
      .then(r => r.json())
      .then((t: SessionTemplate[]) => {
        setTemplates(t);
        if (t.length > 0) setSelectedTemplate(t[0].id);
      });
  }, []);

  const handleCreate = () => {
    if (!selectedTemplate) return;
    const finalName = name || `${selectedTemplate}-${Date.now().toString(36)}`;
    onCreate({ name: finalName, templateId: selectedTemplate });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg w-96 p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-sm font-bold">New Session</h2>

        {/* Template selection */}
        <div className="space-y-2">
          <label className="text-xs text-[var(--text-secondary)]">Template</label>
          <div className="grid grid-cols-2 gap-2">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTemplate(t.id)}
                className={`p-2 rounded border text-left text-xs transition-colors ${
                  selectedTemplate === t.id
                    ? 'border-[var(--accent)] bg-[var(--bg-tertiary)]'
                    : 'border-[var(--border)] hover:border-[var(--text-secondary)]'
                }`}
              >
                <div className="font-medium">{t.ui?.icon} {t.name}</div>
                <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                  {t.provider} · {t.memory.strategy}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div className="space-y-1">
          <label className="text-xs text-[var(--text-secondary)]">Session Name (optional)</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={selectedTemplate || 'auto-generated'}
            className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedTemplate}
            className="px-3 py-1.5 text-xs bg-[var(--accent)] text-white rounded hover:opacity-90 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
