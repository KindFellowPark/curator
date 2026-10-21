# Curator

Curator is a phone-first web app for a two-person household. It does three things: it
keeps a shelf of what we have watched and what we thought of it, it holds a ranked
watchlist of what we might watch next, and it shows a short slate of recommendations we
can accept, dismiss or mark as already seen.

I built it by directing Claude Code. I wrote the requirements, made the design calls and
checked the results; Claude Code wrote the code. I did not hand-code it.

Stack: Next.js 16 (App Router), React 19, TypeScript, Auth.js v5 with Google sign-in, and
Postgres through Neon's serverless driver. There is no ORM: the schema in `db/schema.sql`
is the contract.

## The design choices that matter

**A spreadsheet stays the record; the app only stages.** Our watch history lives in a
spreadsheet, and that spreadsheet is canonical. Curator never writes to it. Every rating,
watchlist addition or verdict made in the app lands in a `pending_actions` table,
attributed to the signed-in account, and a separate sync script replays those rows into
the spreadsheet later. The sync and spreadsheet tooling are not part of this repository.
Losing the app's database costs only the changes that have not been synced yet, so the
database is treated as disposable.

**The database enforces the rules.** Ratings are stars from 0.5 to 5.0 in half steps, and
a tier from 1 to 5 is derived from the stars, never entered. That mapping exists exactly
once, as the Postgres function `tier_from_stars()`. A `star_rating` domain rejects
anything that is not a half step in range, and the `shelf` table carries a check that the
tier matches the stars wherever stars are present. The rate sheet shows the derived tier
live, but from a lookup table the database produces, so there is no second copy in
TypeScript to drift.

**No inference runs in the app.** Recommendations, similar titles and the occasional
question are generated outside the app and pushed into their tables. The app displays
them and records your answers; it never decides anything. An empty slate is shown as
empty, not filled by guessing.

**Sign-in fails closed.** Access is Google sign-in checked against an allowlist of two
email addresses held in an environment variable, never in source. If that variable is
unset or empty, nobody gets in. The check runs in three places: at sign-in, on every token
refresh (so removing an address ends a session that is already open), and when the
session is read. A deny-by-default routing layer (`proxy.ts`) redirects any page request
without an allowed session to sign-in and answers API requests with 401, and each API
route checks again on its own. The actor recorded
on a staged change always comes from the session, never from the request body.

The refusal cases are tested, not assumed. `lib/allowlist.test.ts` covers an unset list,
an empty list, case differences and near-miss addresses. Beyond the unit tests, the gate
was checked with a real Google account that passed Google's own consent screen and was
then refused by the app.

**Sensitive material stays out of third-party build services.** The app lives in its own
repository because the hosting service's GitHub integration reads an entire repository,
and our main private repository holds the household's private records. Giving a build
service read access to all of that to ship a watchlist was not a trade worth making.

## Lessons from the build

- **Auth.js infers credential variable names.** A bare Google provider looks for
  `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. With the variables named `GOOGLE_CLIENT_ID`
  and `GOOGLE_CLIENT_SECRET`, the provider started with undefined credentials while
  everything else looked healthy. The only symptom was `client_id=undefined` inside the
  authorize redirect. The provider now names its fields explicitly.
- **A redeploy on Vercel rebuilds the same commit,** not the latest one on the branch.
- **Environment variables reach only deployments built after they are saved.**
- **Vercel's Hobby plan refuses to build a push whose commit author it does not
  recognise.** Pushes sat unbuilt while the live site served an older version.
- **One column cannot hold two kinds of fact.** The recommendation slate once used a
  single state column both for "which card is on screen" and for "has this prediction
  been scored against a real rating". Marking a card as seen cleared it before the rating
  arrived, so the calibration record was silently lost. They are now separate columns.
- **Queries defined twice drift.** Pages and API routes each had their own copy of the
  read queries; one learned to join poster data and the other did not. The queries now
  live once, in `lib/db.ts`.

## Running it yourself

You need Node.js, a Postgres database (the code uses Neon's serverless driver, so a Neon
database is the simplest fit), a Google OAuth client, and a TMDB API key if you want title
search.

```
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `DATABASE_URL`: your Postgres connection string.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: from a Google Cloud OAuth client. Its
  authorized redirect URI must be exactly `http://localhost:3000/api/auth/callback/google`
  for local use.
- `AUTH_SECRET`: any random string, for example from `openssl rand -base64 32`.
- `CURATOR_ALLOWED_EMAILS`: a comma-separated list of the Google accounts allowed in,
  including your own. Leave it empty and nobody can sign in.
- `TMDB_API_KEY`: optional. Without it, search returns an error and you can still add
  titles as free text.

Apply the schema, then load the sample data. The sample is about fifteen fictional rows
(real film and series titles, invented ratings and two invented users) across the shelf,
watchlist, recommendation slate and pending changes:

```
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed_sample.sql
```

Then run it:

```
npm run dev        # http://localhost:3000
npm test           # allowlist and sort tests
npm run typecheck
```

There is no demo mode. You sign in with a Google account on your own allowlist.

Poster data comes from TMDB. This product uses the TMDB API but is not endorsed or
certified by TMDB.
