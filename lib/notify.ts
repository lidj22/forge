/**
 * Notification module — sends task updates via Telegram.
 */

import { loadSettings } from './settings';
import type { Task } from '@/src/types';

export async function notifyTaskComplete(task: Task) {
  // Skip pipeline tasks
  try { const { pipelineTaskIds } = require('./pipeline'); if (pipelineTaskIds.has(task.id)) return; } catch {}

  const settings = loadSettings();
  if (!settings.notifyOnComplete) return;

  const cost = task.costUSD != null ? `$${task.costUSD.toFixed(4)}` : 'unknown';
  const duration = task.startedAt && task.completedAt
    ? formatDuration(new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime())
    : 'unknown';
  const model = task.log?.find(e => e.subtype === 'init' && e.content.startsWith('Model:'))?.content.replace('Model: ', '') || 'unknown';

  await sendTelegram(
    `✅ *Task Done*\n\n` +
    `*Project:* ${esc(task.projectName)}\n` +
    `*Task:* ${esc(task.prompt.slice(0, 200))}\n` +
    `*Model:* ${esc(model)}\n` +
    `*Duration:* ${duration}\n` +
    `*Cost:* ${cost}\n\n` +
    `${task.resultSummary ? `*Result:*\n${esc(task.resultSummary.slice(0, 500))}` : '_No summary_'}`
  );
}

export async function notifyTaskFailed(task: Task) {
  // Skip pipeline tasks
  try { const { pipelineTaskIds } = require('./pipeline'); if (pipelineTaskIds.has(task.id)) return; } catch {}

  const settings = loadSettings();
  if (!settings.notifyOnFailure) return;

  await sendTelegram(
    `❌ *Task Failed*\n\n` +
    `*Project:* ${esc(task.projectName)}\n` +
    `*Task:* ${esc(task.prompt.slice(0, 200))}\n` +
    `*Error:* ${esc(task.error || 'Unknown error')}`
  );
}

async function sendTelegram(text: string) {
  const settings = loadSettings();
  const { telegramBotToken, telegramChatId } = settings;

  if (!telegramBotToken || !telegramChatId) return;

  try {
    const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      console.error('[notify] Telegram error:', res.status, await res.text());
    }
  } catch (err) {
    console.error('[notify] Telegram send failed:', err);
  }
}

// Escape Markdown special characters
function esc(s: string): string {
  return s.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}
