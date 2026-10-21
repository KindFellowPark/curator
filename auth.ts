import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { isAllowed } from '@/lib/allowlist';

/**
 * Application-layer Google OAuth against a two-account allowlist.
 *
 * The allowlist is checked in three places on purpose. `signIn` refuses the account at
 * the door; `jwt` re-checks on every token refresh so that removing an email from the
 * env var ejects a session that is already open rather than waiting for it to expire;
 * and `session` refuses to expose an identity that no longer passes. Any one of them
 * alone would leave a window.
 *
 * No database adapter: sessions are JWTs. The Neon store is disposable by design, and
 * keeping auth out of it means an emptied database never signs anybody out.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // Read explicitly rather than relying on Auth.js's AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET
    // inference. A bare `Google` silently initialises with undefined credentials when the
    // env vars are named anything else, and the only symptom is `client_id=undefined`
    // buried in the authorize URL — every visible surface reports a generic
    // Configuration error instead.
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: {
    signIn: '/signin',
    error: '/denied',
  },
  callbacks: {
    async signIn({ profile }) {
      // Google sets email_verified; an unverified address must not satisfy the allowlist.
      if (profile && profile.email_verified === false) return false;
      return isAllowed(profile?.email);
    },
    async jwt({ token }) {
      if (!isAllowed(token.email)) return null;
      return token;
    },
    async session({ session }) {
      if (session.user && !isAllowed(session.user.email)) {
        // Blanking the email is what currentActor() reads as "nobody": there is then no
        // identity to attribute a staged row to, which is how every route treats
        // unauthenticated. Deleting the user object instead would fight the adapter type
        // for no added safety.
        session.user.email = '';
      }
      return session;
    },
  },
});

/**
 * The signed-in identity, or null. Every write attributes to this — never to a value
 * supplied by the client, which is why the actor is resolved server-side here rather
 * than read off a request body.
 */
export async function currentActor(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email;
  return isAllowed(email) ? email!.trim().toLowerCase() : null;
}
