/**
 * Next.js instrumentation — runs once when the server starts.
 * Sets MW_PASSWORD before any request is handled.
 */
export async function register() {
  // Only run on server, not Edge
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getPassword } = await import('./lib/password');
    const password = getPassword();
    process.env.MW_PASSWORD = password;
    console.log(`[init] Login password: ${password}`);
    console.log('[init] Forgot password? Run: mw password');
  }
}
