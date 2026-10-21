'use client';

/**
 * The chip row. Every chip is optional and skippable — this is capture-time enrichment,
 * not a form. The vocabulary itself lives in lib/reasons so the server routes that
 * validate a staged verdict against it are reading the same list, not a copy.
 */
import { REASONS } from '@/lib/reasons';

export { REASONS } from '@/lib/reasons';
export type { Reason } from '@/lib/reasons';

export default function ReasonChips({
  selected,
  onToggle,
  label,
}: {
  selected: string[];
  onToggle: (r: string) => void;
  label: string;
}) {
  return (
    <fieldset className="chips">
      <legend className="chips-legend">{label}</legend>
      {REASONS.map((r) => {
        const on = selected.includes(r);
        return (
          <button
            key={r}
            type="button"
            className={`chip ${on ? 'chip-on' : ''}`}
            aria-pressed={on}
            onClick={() => onToggle(r)}
          >
            {r}
          </button>
        );
      })}
    </fieldset>
  );
}
