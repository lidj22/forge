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
    // Local password — for development / self-hosted
    Credentials({
      name: 'Local',
      credentials: {
        password: { label: 'Password', type: 'password' },
      },
      authorize(credentials) {
        const localPassword = process.env.MW_PASSWORD || 'admin';
        if (credentials?.password === localPassword) {
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
  },
});
