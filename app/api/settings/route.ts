import { NextResponse } from 'next/server';
import { loadSettings, saveSettings, type Settings } from '@/lib/settings';
import { restartTelegramBot } from '@/lib/init';

export async function GET() {
  return NextResponse.json(loadSettings());
}

export async function PUT(req: Request) {
  const body = await req.json() as Settings;
  saveSettings(body);
  // Restart Telegram bot in case token/chatId changed
  restartTelegramBot();
  return NextResponse.json({ ok: true });
}
