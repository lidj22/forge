'use client';

import Markdown from 'react-markdown';

export default function MarkdownContent({ content }: { content: string }) {
  return (
    <Markdown
      components={{
        h1: ({ children }) => <h1 className="text-base font-bold text-[var(--text-primary)] mt-3 mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold text-[var(--text-primary)] mt-3 mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-xs font-bold text-[var(--text-primary)] mt-2 mb-1">{children}</h3>,
        p: ({ children }) => <p className="text-xs text-[var(--text-primary)] mb-1.5 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="text-xs text-[var(--text-primary)] mb-1.5 ml-4 list-disc space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="text-xs text-[var(--text-primary)] mb-1.5 ml-4 list-decimal space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>,
        em: ({ children }) => <em className="italic text-[var(--text-secondary)]">{children}</em>,
        a: ({ href, children }) => <a href={href} className="text-[var(--accent)] hover:underline" target="_blank" rel="noopener">{children}</a>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-[var(--accent)]/40 pl-3 my-1.5 text-[var(--text-secondary)] text-xs italic">{children}</blockquote>,
        code: ({ className, children }) => {
          const isBlock = className?.includes('language-');
          if (isBlock) {
            const lang = className?.replace('language-', '') || '';
            return (
              <div className="my-2 rounded border border-[var(--border)] overflow-hidden">
                {lang && (
                  <div className="px-3 py-1 bg-[var(--bg-tertiary)] border-b border-[var(--border)] text-[9px] text-[var(--text-secondary)] font-mono">
                    {lang}
                  </div>
                )}
                <pre className="p-3 bg-[var(--bg-tertiary)] overflow-x-auto">
                  <code className="text-[11px] font-mono text-[var(--text-primary)]">{children}</code>
                </pre>
              </div>
            );
          }
          return (
            <code className="text-[11px] font-mono bg-[var(--bg-tertiary)] text-[var(--accent)] px-1 py-0.5 rounded">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        hr: () => <hr className="my-3 border-[var(--border)]" />,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="text-xs border-collapse w-full">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border border-[var(--border)] px-2 py-1 bg-[var(--bg-tertiary)] text-left font-semibold text-[11px]">{children}</th>,
        td: ({ children }) => <td className="border border-[var(--border)] px-2 py-1 text-[11px]">{children}</td>,
      }}
    >
      {content}
    </Markdown>
  );
}
