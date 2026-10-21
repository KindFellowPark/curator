import Link from 'next/link';

/**
 * Auth.js routes every sign-in failure here, not only a refused account, so this page
 * has to separate the two cases it would otherwise conflate: an account that is simply
 * not on the allowlist, and an app that is misconfigured. Reading those as the same
 * thing costs a debugging session every time.
 *
 * What it still does not do is say who IS allowed, or whether the address tried was
 * close to one. A gate that narrates its own contents helps enumerate it.
 */
const REFUSED = 'AccessDenied';

export default async function DeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  if (!error || error === REFUSED) {
    return (
      <div className="gate">
        <h1>Not this account</h1>
        <p className="muted">This app is limited to two accounts.</p>
        <Link href="/signin">Try a different account</Link>
      </div>
    );
  }

  // Anything else is the app's fault, not the visitor's. The code is Auth.js's own
  // (Configuration, OAuthCallback, OAuthSignin…) and is the first thing worth knowing.
  return (
    <div className="gate">
      <h1>Sign-in didn&rsquo;t complete</h1>
      <p className="muted">
        This is a setup problem, not a rejected account.
      </p>
      <p className="faint">
        Reason: <code>{error}</code>
      </p>
      <Link href="/signin">Try again</Link>
    </div>
  );
}
