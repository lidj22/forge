/**
 * Telegram Bot — remote interface for My Workflow.
 *
 * Optimized for mobile:
 * - /tasks shows numbered list, reply with number to see details
 * - Reply to task messages to send follow-ups
 * - Plain text "project: instructions" to create tasks
 */

import { loadSettings } from './settings';
import { createTask, getTask, listTasks, cancelTask, retryTask, onTaskEvent } from './task-manager';
import { scanProjects } from './projects';
import { listClaudeSessions, getSessionFilePath, readSessionEntries } from './claude-sessions';
import type { Task, TaskLogEntry } from '@/src/types';

let polling = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let lastUpdateId = 0;

// Track which Telegram message maps to which task (for reply-based interaction)
const taskMessageMap = new Map<number, string>(); // messageId → taskId
const taskChatMap = new Map<string, number>();     // taskId → chatId

// Numbered lists — maps number (1-10) → id for quick selection
const chatNumberedTasks = new Map<number, Map<number, string>>();
// Session selection: two-tier — first pick project, then pick session
const chatNumberedSessions = new Map<number, Map<number, { projectName: string; sessionId: string }>>();
const chatNumberedProjects = new Map<number, Map<number, string>>();
// Track what the last numbered list was for
const chatListMode = new Map<number, 'tasks' | 'projects' | 'sessions'>();

// Buffer for streaming logs
const logBuffers = new Map<string, { entries: string[]; timer: ReturnType<typeof setTimeout> | null }>();

// ─── Start/Stop ──────────────────────────────────────────────

export function startTelegramBot() {
  if (polling) return;
  const settings = loadSettings();
  if (!settings.telegramBotToken || !settings.telegramChatId) return;

  polling = true;
  console.log('[telegram] Bot started');

  // Listen for task events → stream to Telegram
  onTaskEvent((taskId, event, data) => {
    const settings = loadSettings();
    if (!settings.telegramBotToken || !settings.telegramChatId) return;
    const chatId = Number(settings.telegramChatId);

    if (event === 'log') {
      bufferLogEntry(taskId, chatId, data as TaskLogEntry);
    } else if (event === 'status') {
      handleStatusChange(taskId, chatId, data as string);
    }
  });

  poll();
}

export function stopTelegramBot() {
  polling = false;
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
}

// ─── Polling ─────────────────────────────────────────────────

async function poll() {
  if (!polling) return;

  try {
    const settings = loadSettings();
    const url = `https://api.telegram.org/bot${settings.telegramBotToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.ok && data.result) {
      for (const update of data.result) {
        lastUpdateId = update.update_id;
        if (update.message?.text) {
          await handleMessage(update.message);
        }
      }
    }
  } catch (err) {
    console.error('[telegram] Poll error:', err);
  }

  pollTimer = setTimeout(poll, 1000);
}

// ─── Message Handler ─────────────────────────────────────────

async function handleMessage(msg: any) {
  const chatId = msg.chat.id;
  const text: string = msg.text.trim();
  const replyTo = msg.reply_to_message?.message_id;

  // Check if replying to a task message → follow-up
  if (replyTo && taskMessageMap.has(replyTo)) {
    const taskId = taskMessageMap.get(replyTo)!;
    await handleFollowUp(chatId, taskId, text);
    return;
  }

  // Quick number selection (1-10) → context-dependent
  if (/^\d{1,2}$/.test(text)) {
    const num = parseInt(text);
    const mode = chatListMode.get(chatId);

    if (mode === 'projects') {
      const projMap = chatNumberedProjects.get(chatId);
      if (projMap?.has(num)) {
        await sendSessionList(chatId, projMap.get(num)!);
        return;
      }
    } else if (mode === 'sessions') {
      const sessMap = chatNumberedSessions.get(chatId);
      if (sessMap?.has(num)) {
        const { projectName, sessionId } = sessMap.get(num)!;
        await sendSessionContent(chatId, projectName, sessionId);
        return;
      }
    } else {
      const taskMap = chatNumberedTasks.get(chatId);
      if (taskMap?.has(num)) {
        await sendTaskDetail(chatId, taskMap.get(num)!);
        return;
      }
    }
  }

  // Commands
  if (text.startsWith('/')) {
    const [cmd, ...args] = text.split(/\s+/);
    switch (cmd) {
      case '/start':
      case '/help':
        await sendHelp(chatId);
        break;
      case '/tasks':
      case '/t':
        await sendNumberedTaskList(chatId, args[0]);
        break;
      case '/new':
      case '/task':
        await handleNewTask(chatId, args.join(' '));
        break;
      case '/sessions':
      case '/s':
        if (args[0]) {
          await sendSessionList(chatId, args[0]);
        } else {
          await sendProjectListForSessions(chatId);
        }
        break;
      case '/projects':
      case '/p':
        await sendProjectList(chatId);
        break;
      case '/cancel':
        await handleCancel(chatId, args[0]);
        break;
      case '/retry':
        await handleRetry(chatId, args[0]);
        break;
      default:
        await send(chatId, `Unknown command: ${cmd}\nUse /help to see available commands.`);
    }
    return;
  }

  // Plain text — try to parse as "project: task" format
  const colonIdx = text.indexOf(':');
  if (colonIdx > 0 && colonIdx < 30) {
    const projectName = text.slice(0, colonIdx).trim();
    const prompt = text.slice(colonIdx + 1).trim();
    if (prompt) {
      await handleNewTask(chatId, `${projectName} ${prompt}`);
      return;
    }
  }

  await send(chatId,
    `Send a task as:\nproject-name: your instructions\n\nOr use /help for all commands.`
  );
}

// ─── Command Handlers ────────────────────────────────────────

async function sendHelp(chatId: number) {
  await send(chatId,
    `🤖 My Workflow\n\n` +
    `📋 /tasks — numbered task list\n` +
    `/tasks running — filter by status\n` +
    `🔍 /sessions — browse session content\n` +
    `/sessions <project> — sessions for project\n\n` +
    `📝 Submit task:\nproject-name: your instructions\n\n` +
    `🔧 /cancel <id>  /retry <id>\n` +
    `/projects — list projects\n\n` +
    `Reply number to select, reply message to follow-up`
  );
}

async function sendNumberedTaskList(chatId: number, statusFilter?: string) {
  // Get running/queued first, then recent done/failed
  const allTasks = listTasks(statusFilter as any || undefined);

  // Sort: running first, then queued, then by recency
  const prioritized = [
    ...allTasks.filter(t => t.status === 'running'),
    ...allTasks.filter(t => t.status === 'queued'),
    ...allTasks.filter(t => t.status !== 'running' && t.status !== 'queued'),
  ].slice(0, 10);

  if (prioritized.length === 0) {
    await send(chatId, 'No tasks found.');
    return;
  }

  // Build numbered map
  const numMap = new Map<number, string>();
  const lines: string[] = [];

  prioritized.forEach((t, i) => {
    const num = i + 1;
    numMap.set(num, t.id);

    const icon = t.status === 'running' ? '🔄' : t.status === 'queued' ? '⏳' : t.status === 'done' ? '✅' : t.status === 'failed' ? '❌' : '⚪';
    const cost = t.costUSD != null ? ` $${t.costUSD.toFixed(3)}` : '';
    const prompt = t.prompt.length > 40 ? t.prompt.slice(0, 40) + '...' : t.prompt;

    lines.push(`${num}. ${icon} ${t.projectName}\n   ${prompt}${cost}`);
  });

  chatNumberedTasks.set(chatId, numMap);
  chatListMode.set(chatId, 'tasks');

  await send(chatId,
    `📋 Tasks — reply number to see details\n\n${lines.join('\n\n')}`
  );
}

async function sendTaskDetail(chatId: number, taskId: string) {
  const task = getTask(taskId);
  if (!task) {
    await send(chatId, `Task not found: ${taskId}`);
    return;
  }

  const icon = task.status === 'done' ? '✅' : task.status === 'running' ? '🔄' : task.status === 'failed' ? '❌' : '⏳';

  let text = `${icon} ${task.projectName} [${task.id}]\n`;
  text += `Status: ${task.status}\n`;
  text += `Task: ${task.prompt}\n`;

  if (task.startedAt) text += `Started: ${new Date(task.startedAt).toLocaleString()}\n`;
  if (task.completedAt) text += `Done: ${new Date(task.completedAt).toLocaleString()}\n`;
  if (task.costUSD != null) text += `Cost: $${task.costUSD.toFixed(4)}\n`;
  if (task.error) text += `\n❗ Error: ${task.error}\n`;

  if (task.resultSummary) {
    const result = task.resultSummary.length > 1500
      ? task.resultSummary.slice(0, 1500) + '...'
      : task.resultSummary;
    text += `\n--- Result ---\n${result}`;
  }

  // Show recent log summary for running tasks
  if (task.status === 'running' && task.log.length > 0) {
    const recent = task.log
      .filter(e => e.subtype === 'text' || e.subtype === 'tool_use')
      .slice(-5)
      .map(e => e.subtype === 'tool_use' ? `🔧 ${e.tool}` : e.content.slice(0, 80))
      .join('\n');
    if (recent) text += `\n--- Recent ---\n${recent}`;
  }

  const msgId = await send(chatId, text);
  if (msgId) {
    taskMessageMap.set(msgId, taskId);
  }

  // Show action hints
  if (task.status === 'done') {
    await send(chatId, `💬 Reply to the message above to send follow-up`);
  } else if (task.status === 'failed') {
    await send(chatId, `🔄 /retry ${task.id}`);
  } else if (task.status === 'running' || task.status === 'queued') {
    await send(chatId, `🛑 /cancel ${task.id}`);
  }
}

async function sendProjectListForSessions(chatId: number) {
  const projects = scanProjects();
  if (projects.length === 0) {
    await send(chatId, 'No projects found.');
    return;
  }

  const numMap = new Map<number, string>();
  const lines: string[] = [];

  projects.slice(0, 10).forEach((p, i) => {
    const num = i + 1;
    numMap.set(num, p.name);
    lines.push(`${num}. ${p.name}${p.language ? ` (${p.language})` : ''}`);
  });

  chatNumberedProjects.set(chatId, numMap);
  chatListMode.set(chatId, 'projects');

  await send(chatId,
    `📁 Select project — reply number\n\n${lines.join('\n')}`
  );
}

async function sendSessionList(chatId: number, projectName: string) {
  const sessions = listClaudeSessions(projectName);
  if (sessions.length === 0) {
    await send(chatId, `No sessions for ${projectName}`);
    return;
  }

  const numMap = new Map<number, { projectName: string; sessionId: string }>();
  const lines: string[] = [];

  sessions.slice(0, 10).forEach((s, i) => {
    const num = i + 1;
    numMap.set(num, { projectName, sessionId: s.sessionId });
    const label = s.summary || s.firstPrompt || s.sessionId.slice(0, 8);
    const msgs = s.messageCount != null ? ` (${s.messageCount} msgs)` : '';
    const date = s.modified ? new Date(s.modified).toLocaleDateString() : '';
    lines.push(`${num}. ${label}${msgs}\n   ${date} ${s.gitBranch || ''}`);
  });

  chatNumberedSessions.set(chatId, numMap);
  chatListMode.set(chatId, 'sessions');

  await send(chatId,
    `🔍 ${projectName} sessions — reply number\n\n${lines.join('\n\n')}`
  );
}

async function sendSessionContent(chatId: number, projectName: string, sessionId: string) {
  const filePath = getSessionFilePath(projectName, sessionId);
  if (!filePath) {
    await send(chatId, 'Session file not found');
    return;
  }

  const entries = readSessionEntries(filePath);
  if (entries.length === 0) {
    await send(chatId, 'Session is empty');
    return;
  }

  // Build a readable summary — show user messages and assistant text, skip tool details
  const parts: string[] = [];
  let charCount = 0;
  const MAX = 3500;

  // Walk from end to get most recent content
  for (let i = entries.length - 1; i >= 0 && charCount < MAX; i--) {
    const e = entries[i];
    let line = '';
    if (e.type === 'user') {
      line = `👤 ${e.content}`;
    } else if (e.type === 'assistant_text') {
      line = `🤖 ${e.content.slice(0, 500)}`;
    } else if (e.type === 'tool_use') {
      line = `🔧 ${e.toolName || 'tool'}`;
    }
    // Skip thinking, tool_result, system for brevity
    if (!line) continue;

    if (charCount + line.length > MAX) {
      line = line.slice(0, MAX - charCount) + '...';
    }
    parts.unshift(line);
    charCount += line.length;
  }

  const header = `🔍 Session: ${sessionId.slice(0, 8)}\nProject: ${projectName}\n${entries.length} entries\n\n`;

  // Split into chunks for Telegram's 4096 limit
  const fullText = header + parts.join('\n\n');
  const chunks = splitMessage(fullText, 4000);
  for (const chunk of chunks) {
    await send(chatId, chunk);
  }
}

async function handleNewTask(chatId: number, input: string) {
  if (!input) {
    await send(chatId, 'Usage:\nproject-name: instructions\n\nExample:\nmy-app: Fix the login bug');
    return;
  }

  const [projectName, ...rest] = input.split(/\s+/);
  const prompt = rest.join(' ');

  if (!prompt) {
    await send(chatId, 'Please provide instructions after the project name.');
    return;
  }

  const projects = scanProjects();
  const project = projects.find(p => p.name === projectName || p.name.toLowerCase() === projectName.toLowerCase());

  if (!project) {
    const available = projects.slice(0, 10).map(p => `  ${p.name}`).join('\n');
    await send(chatId, `Project not found: ${projectName}\n\nAvailable:\n${available}`);
    return;
  }

  const task = createTask({
    projectName: project.name,
    projectPath: project.path,
    prompt,
  });

  const msgId = await send(chatId,
    `📋 Task created: ${task.id}\n${task.projectName}: ${prompt}\n\nStatus: queued`
  );

  if (msgId) {
    taskMessageMap.set(msgId, task.id);
    taskChatMap.set(task.id, chatId);
  }
}

async function handleFollowUp(chatId: number, taskId: string, message: string) {
  const task = getTask(taskId);
  if (!task) {
    await send(chatId, 'Task not found.');
    return;
  }

  if (task.status === 'running') {
    await send(chatId, '⏳ Task still running, wait for it to finish.');
    return;
  }

  const newTask = createTask({
    projectName: task.projectName,
    projectPath: task.projectPath,
    prompt: message,
    conversationId: task.conversationId || undefined,
  });

  const msgId = await send(chatId,
    `🔄 Follow-up: ${newTask.id}\nContinuing ${task.projectName} session\n\n${message}`
  );

  if (msgId) {
    taskMessageMap.set(msgId, newTask.id);
    taskChatMap.set(newTask.id, chatId);
  }
}

async function sendProjectList(chatId: number) {
  const projects = scanProjects();
  const lines = projects.slice(0, 20).map(p =>
    `${p.name}${p.language ? ` (${p.language})` : ''}`
  );
  await send(chatId, `📁 Projects\n\n${lines.join('\n')}\n\n${projects.length} total`);
}

async function handleCancel(chatId: number, taskId?: string) {
  if (!taskId) { await send(chatId, 'Usage: /cancel <task-id>'); return; }
  const ok = cancelTask(taskId);
  await send(chatId, ok ? `🛑 Task ${taskId} cancelled` : `Cannot cancel task ${taskId}`);
}

async function handleRetry(chatId: number, taskId?: string) {
  if (!taskId) { await send(chatId, 'Usage: /retry <task-id>'); return; }
  const newTask = retryTask(taskId);
  if (!newTask) {
    await send(chatId, `Cannot retry task ${taskId}`);
    return;
  }
  const msgId = await send(chatId, `🔄 Retrying as ${newTask.id}`);
  if (msgId) {
    taskMessageMap.set(msgId, newTask.id);
    taskChatMap.set(newTask.id, chatId);
  }
}

// ─── Real-time Streaming ─────────────────────────────────────

function bufferLogEntry(taskId: string, chatId: number, entry: TaskLogEntry) {
  taskChatMap.set(taskId, chatId);

  let buf = logBuffers.get(taskId);
  if (!buf) {
    buf = { entries: [], timer: null };
    logBuffers.set(taskId, buf);
  }

  let line = '';
  if (entry.subtype === 'tool_use') {
    line = `🔧 ${entry.tool || 'tool'}: ${entry.content.slice(0, 80)}`;
  } else if (entry.subtype === 'text') {
    line = entry.content.slice(0, 200);
  } else if (entry.type === 'result') {
    line = `✅ ${entry.content.slice(0, 200)}`;
  } else if (entry.subtype === 'error') {
    line = `❗ ${entry.content.slice(0, 200)}`;
  }
  if (!line) return;

  buf.entries.push(line);

  if (!buf.timer) {
    buf.timer = setTimeout(() => flushLogBuffer(taskId, chatId), 3000);
  }
}

async function flushLogBuffer(taskId: string, chatId: number) {
  const buf = logBuffers.get(taskId);
  if (!buf || buf.entries.length === 0) return;

  const text = buf.entries.join('\n');
  buf.entries = [];
  buf.timer = null;

  await send(chatId, text);
}

async function handleStatusChange(taskId: string, chatId: number, status: string) {
  await flushLogBuffer(taskId, chatId);

  const task = getTask(taskId);
  if (!task) return;

  const targetChat = taskChatMap.get(taskId) || chatId;

  if (status === 'running') {
    const msgId = await send(targetChat,
      `🚀 Started: ${taskId}\n${task.projectName}: ${task.prompt.slice(0, 100)}`
    );
    if (msgId) taskMessageMap.set(msgId, taskId);
  } else if (status === 'done') {
    const cost = task.costUSD != null ? `Cost: $${task.costUSD.toFixed(4)}\n` : '';
    const result = task.resultSummary ? task.resultSummary.slice(0, 800) : '';
    const msgId = await send(targetChat,
      `✅ Done: ${taskId}\n${task.projectName}\n${cost}${result ? `\n${result}` : ''}\n\n💬 Reply to continue`
    );
    if (msgId) taskMessageMap.set(msgId, taskId);
  } else if (status === 'failed') {
    const msgId = await send(targetChat,
      `❌ Failed: ${taskId}\n${task.error || 'Unknown error'}\n\n/retry ${taskId}`
    );
    if (msgId) taskMessageMap.set(msgId, taskId);
  }
}

// ─── Telegram API ────────────────────────────────────────────

async function send(chatId: number, text: string): Promise<number | null> {
  const settings = loadSettings();
  if (!settings.telegramBotToken) return null;

  try {
    const url = `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('[telegram] Send error:', data.description);
      return null;
    }
    return data.result?.message_id || null;
  } catch (err) {
    console.error('[telegram] Send failed:', err);
    return null;
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  while (text.length > 0) {
    const cut = text.lastIndexOf('\n', maxLen);
    const splitAt = cut > 0 ? cut : maxLen;
    chunks.push(text.slice(0, splitAt));
    text = text.slice(splitAt).trimStart();
  }
  return chunks;
}
