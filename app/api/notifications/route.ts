import { NextResponse } from 'next/server';
import {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification,
} from '@/lib/notifications';

// GET /api/notifications — list notifications + unread count
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  const notifications = getNotifications(limit, offset);
  const unread = getUnreadCount();

  return NextResponse.json({ notifications, unread });
}

// POST /api/notifications — actions: markRead, markAllRead, delete
export async function POST(req: Request) {
  const body = await req.json();

  if (body.action === 'markRead' && body.id) {
    markRead(body.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'markAllRead') {
    markAllRead();
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'delete' && body.id) {
    deleteNotification(body.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
