import { sql } from '@/lib/db';

/**
 * One row per legal half step. The rate sheet announces a derived tier live as the star
 * control moves, which needs the mapping on the client — but the stars-to-tier mapping has exactly
 * one implementation, `tier_from_stars()` in the database, and a TypeScript copy is the
 * drift the `shelf_tier_matches_stars` constraint exists to prevent.
 *
 * So the client receives a lookup table, not a rule. It indexes; it never computes.
 */
export type StarTier = {
  stars: string; // numeric(2,1) as a string — "4.5", never a float
  tier: number;
  tier_label: string;
};

export async function starTierMap(): Promise<StarTier[]> {
  const q = sql();
  return (await q`SELECT stars, tier, tier_label FROM star_tier_map ORDER BY stars`) as StarTier[];
}
