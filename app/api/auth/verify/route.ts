import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

// In-memory valid tokens — shared across API routes in the same process
const tokenKey = Symbol.for('forge-api-tokens');
const g = globalThis as any;
if (!g[tokenKey]) g[tokenKey] = new Set<string>();
export const validTokens: Set<string> = g[tokenKey];

/** Verify a token is valid (for use in other API routes) */
export function isValidToken(req: Request): boolean {
  // Check header
  const headerToken = new Headers(req.headers).get('x-forge-token');
  if (headerToken && validTokens.has(headerToken)) return true;
  // Check cookie
  const cookieHeader = new Headers(req.headers).get('cookie') || '';
  const match = cookieHeader.match(/forge-api-token=([^;]+)/);
  if (match && validTokens.has(match[1])) return true;
  return false;
}

export async function POST(req: Request) {
  const body = await req.json();
  const { password } = body;

  if (!password) {
    return NextResponse.json({ error: 'password required' }, { status: 400 });
  }

  const { verifyAdmin } = await import('@/lib/password');
  if (!verifyAdmin(password)) {
    return NextResponse.json({ error: 'invalid password' }, { status: 401 });
  }

  const token = randomUUID();
  validTokens.add(token);

  const res = NextResponse.json({ ok: true, token });
  res.cookies.set('forge-api-token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 86400,
    path: '/',
  });
  return res;
}
