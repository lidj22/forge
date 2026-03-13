import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    // Google OAuth — for production use
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    // Local password — set by init.ts on startup (auto-generated if not configured)
    Credentials({
      name: 'Local',
      credentials: {
        password: { label: 'Password', type: 'password' },
      },
      authorize(credentials) {
        const localPassword = process.env.MW_PASSWORD;
        if (localPassword && credentials?.password === localPassword) {
          return { id: 'local', name: 'zliu', email: 'local@my-workflow' };
        }
        return null;
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth;
    },
    // Allow redirects to tunnel URLs (*.trycloudflare.com) after login
    redirect({ url, baseUrl }) {
      // Same origin — always allow
      if (url.startsWith(baseUrl)) return url;
      // Relative path — prepend base
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      // Cloudflare tunnel URLs — allow
      if (url.includes('.trycloudflare.com')) return url;
      return baseUrl;
    },
  },
});
