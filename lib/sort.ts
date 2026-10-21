/**
 * Shelf ordering. Extracted from the view because a comparator with a direction
 * multiplier and a tie-break is exactly the shape typecheck cannot see and a build
 * cannot fail on: a dropped `|| byTitle` still compiles, still renders, and only
 * shows up as a grid that reshuffles itself between renders.
 */

export type SortKey = 'tierAsc' | 'tierDesc' | 'title';

/** Label table, in the order the segmented control renders them. */
export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'tierAsc', label: 'T1 first' },
  { key: 'tierDesc', label: 'T5 first' },
  { key: 'title', label: 'A–Z' },
];

/** Everything ordering needs. Deliberately narrower than ShelfRow so tests stay small. */
export type Sortable = { title: string; tier: number };

const byTitle = (a: Sortable, b: Sortable) => a.title.localeCompare(b.title);

/**
 * Title is always the tie-break, never the incidental order the rows arrived in — two
 * titles in the same tier must land the same way on every render.
 */
export function comparator(sort: SortKey): (a: Sortable, b: Sortable) => number {
  if (sort === 'title') return byTitle;
  const dir = sort === 'tierDesc' ? -1 : 1;
  return (a, b) => (a.tier - b.tier) * dir || byTitle(a, b);
}
