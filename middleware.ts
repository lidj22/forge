export { auth as middleware } from '@/lib/auth';

export const config = {
  // Protect pages but allow API access (API auth handled per-route if needed)
  matcher: ['/((?!login|api|_next/static|_next/image|favicon.ico).*)'],
};
