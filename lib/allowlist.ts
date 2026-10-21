/**
 * The access gate's only rule.
 *
 * Vercel's platform-edge protection does not cover a production domain below Enterprise,
 * so this is the gate itself and not a supplement to one. It therefore fails
 * closed in every ambiguous case: an unset or empty CURATOR_ALLOWED_EMAILS admits nobody
 * rather than everybody, which is the failure mode a misconfigured deploy would otherwise
 * take. A gate that opens when its config goes missing is not a gate.
 *
 * The allowlist is never committed. It lives only in the Vercel environment and in a
 * local, gitignored .env.local.
 */

export function allowedEmails(): string[] {
  return (process.env.CURATOR_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = allowedEmails();
  if (list.length === 0) return false; // fail closed
  return list.includes(email.trim().toLowerCase());
}
