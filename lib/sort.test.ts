import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparator, SORTS, type Sortable } from './sort.ts';

const rows: Sortable[] = [
  { title: 'Anchorman', tier: 2 },
  { title: 'The Midnight Club', tier: 4 },
  { title: '30 Rock', tier: 1 },
  { title: 'Zodiac', tier: 2 },
  { title: 'Bad Movie', tier: 5 },
];

const order = (k: Parameters<typeof comparator>[0]) =>
  [...rows].sort(comparator(k)).map((r) => r.title);

test('tierAsc leads with T1 — the browse order', () => {
  assert.deepEqual(order('tierAsc'), [
    '30 Rock',
    'Anchorman',
    'Zodiac',
    'The Midnight Club',
    'Bad Movie',
  ]);
});

test('tierDesc leads with T5 — the backfill order the Unrated chip defaults to', () => {
  assert.deepEqual(order('tierDesc'), [
    'Bad Movie',
    'The Midnight Club',
    'Anchorman',
    'Zodiac',
    '30 Rock',
  ]);
});

test('title sorts alphabetically and ignores tier entirely', () => {
  assert.deepEqual(order('title'), [
    '30 Rock',
    'Anchorman',
    'Bad Movie',
    'The Midnight Club',
    'Zodiac',
  ]);
});

test('title is the tie-break inside a tier, in both directions', () => {
  // Anchorman before Zodiac in BOTH — reversing tier must not reverse the tie-break.
  for (const k of ['tierAsc', 'tierDesc'] as const) {
    const o = order(k);
    assert.ok(o.indexOf('Anchorman') < o.indexOf('Zodiac'), `${k} broke the tie-break`);
  }
});

test('the comparator is stable against input order', () => {
  const shuffled = [...rows].reverse().sort(comparator('tierAsc')).map((r) => r.title);
  assert.deepEqual(shuffled, order('tierAsc'));
});

test('every rendered option has a comparator', () => {
  for (const o of SORTS) assert.equal(typeof comparator(o.key), 'function');
});
