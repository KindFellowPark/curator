import { signIn, currentActor } from '@/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  if (await currentActor()) redirect('/shelf');

  return (
    <div className="gate">
      <h1>Curator</h1>
      <p className="muted">Private. Two accounts.</p>
      <form
        action={async () => {
          'use server';
          await signIn('google', { redirectTo: '/shelf' });
        }}
      >
        <button className="btn-primary" type="submit">
          Continue with Google
        </button>
      </form>
    </div>
  );
}
