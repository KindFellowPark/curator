/**
 * The reason vocabulary, in a module with no 'use client' boundary so both the chip
 * component and the server routes that validate against it can import the same list.
 * A second copy in a route handler is exactly the drift this split prevents.
 *
 * `wasn't the mood` is the one entry that is not about the title. It attributes the miss
 * to the evening, so synthesis can discount the sample rather than ingesting a mood as
 * taste — a whole class of false negative bought for one tap.
 *
 * This is the only structured vocabulary in v1 (by design:
 * no genre or facet taxonomy — synthesis mines the rest from notes and verdicts).
 */
export const REASONS = [
  'pacing',
  'tone',
  'characters',
  'no payoff',
  'teen-register',
  'bloat',
  "wasn't the mood",
] as const;

export type Reason = (typeof REASONS)[number];
