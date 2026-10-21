import TabBar from '@/components/TabBar';
import PendingBanner from '@/components/PendingBanner';
import { currentActor } from '@/auth';
import { redirect } from 'next/navigation';
import { signOut } from '@/auth';

export const dynamic = 'force-dynamic';

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  // Middleware already gated this, but a layout that trusts middleware alone would be
  // undefended the moment a route is reached by any other path.
  const actor = await currentActor();
  if (!actor) redirect('/signin');

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="wordmark">Curator</h1>
        <span className="who">
          {actor}{' '}
          <form
            style={{ display: 'inline' }}
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/signin' });
            }}
          >
            <button className="btn-quiet" type="submit">
              Sign out
            </button>
          </form>
        </span>
      </header>

      <PendingBanner />

      <main className="app-main">{children}</main>

      {/* TMDB's terms require this notice even for non-commercial use. The notice
          sits in the shell so every tab carries it. */}
      <footer className="app-footer">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </footer>

      <TabBar />
    </div>
  );
}
