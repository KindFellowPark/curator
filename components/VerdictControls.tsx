'use client';

import { useState } from 'react';
import ReasonChips from '@/components/ReasonChips';

export type VerdictKind = 'queue' | 'not_interested' | 'seen_it';

/**
 * The three verdicts, and nothing else. Lives apart from the card because the detail
 * sheet needs the controls without the card: the sheet already shows the poster, title,
 * year and case above, and repeating them inside a "your call" block renders the same
 * title twice on one screen.
 *
 * `not interested` is the only verdict that opens anything inline. Its reason chips are
 * the scarce signal — the positive side is saturated, and a rejection teaches most per
 * entry — so they are asked for at the moment of the verdict. One tap later, on a card
 * that has already left the slate, gets them never. Queue and seen-it resolve straight
 * away: a queue needs no reason, and a seen-it hands to the rate sheet, which asks there.
 */
export default function VerdictControls({
  onVerdict,
  busy,
}: {
  onVerdict: (v: VerdictKind, reasons: string[]) => void;
  busy?: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);

  if (rejecting) {
    return (
      <div className="rec-reject">
        <ReasonChips
          selected={reasons}
          onToggle={(r) =>
            setReasons((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]))
          }
          label="Why not? (optional)"
        />
        <div className="sheet-actions">
          <button
            type="button"
            className="btn-quiet"
            disabled={busy}
            onClick={() => {
              setRejecting(false);
              setReasons([]);
            }}
          >
            Back
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => onVerdict('not_interested', reasons)}
          >
            {busy ? 'Staging…' : 'Not interested'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rec-verdicts">
      <button type="button" className="btn-quiet" disabled={busy} onClick={() => onVerdict('queue', [])}>
        Queue it
      </button>
      <button type="button" className="btn-quiet" disabled={busy} onClick={() => setRejecting(true)}>
        Not interested
      </button>
      <button type="button" className="btn-quiet" disabled={busy} onClick={() => onVerdict('seen_it', [])}>
        Seen it
      </button>
    </div>
  );
}
