# FIELDNOTES / make.fun

[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/rixkiw/fieldnotes-makefun/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/rixkiw/fieldnotes-makefun/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

FIELDNOTES is an independent, read-only editorial terminal for public make.fun competitions. It reads public API data in the browser and renders a bounty board, bounty detail, performance leaderboard and public profile. It is not an official make.fun product.

## Routes

| Hash route | View |
| --- | --- |
| `#/` | Bounty board with live search, category/status filters, sorting and pagination |
| `#/bounty/:slug` | Bounty detail, rewards, rules and entrant leaderboard link |
| `#/leaderboard/:slug` | Ranked entries, performance columns, filtering and pagination |
| `#/profile/:handle` | Public profile, placement totals and solution ledger |

Example deep links use `#/bounty/makefun-frontend-01`, `#/leaderboard/makefun-frontend-01` and `#/profile/rizki-abdillah`.

## Run locally

Node 22 is required; there is no build step or npm install. From this directory:

```sh
node serve.ts
# http://127.0.0.1:8317/
```

Set `PORT` to use another local port. `serve.ts` serves only files under `app/`, supports `GET`/`HEAD`, binds to `127.0.0.1`, and uses `Cache-Control: no-cache` so development edits appear immediately.

## Browser tests

The committed test scripts use Playwright Chromium. Install Playwright in a Python environment, then point `CHROME` at an installed Chromium executable if needed. With the dev server running:

```sh
python3 tests/browser_test.py
python3 tests/capture_screenshots.py
```

`browser_test.py` checks the four routes, search/sort/pagination, rule disclosure, leaderboards, profiles, API cache reuse, approved network hosts, console errors, and horizontal overflow at 390, 768, 900 and 1440 CSS pixels. Its runtime report is written to `tests/report.json` and excluded from source control.

`capture_screenshots.py` captures three genuine browser views from the running app at 1440×1050: `screenshots/1-board.jpg`, `screenshots/2-bounty.jpg` and `screenshots/3-leaderboard.jpg`. The manifest is `shots.json` at the repository root, outside the submission screenshot directory.

## Public API and caching

Browser reads are public `GET` requests to `https://make.fun/api/`; the app sends no credentials. Responses are cached in memory and `localStorage` for 60 seconds. Revalidation uses the API's `ETag` with `If-None-Match`, and concurrent identical requests are coalesced. `Retry-After` is surfaced for rate-limit errors. There is no write, sign-in or payment path.

## Deterministic packaging

The vendor dossier builder is copied unchanged at `vendor/makefun-frontend.ts`. Set an output directory and run:

```sh
MAKEFUN_OUTPUT_DIR=/tmp/fieldnotes-output node main.ts
```

`main.ts` copies `app/` and `screenshots/`, then writes `dossier.json` deterministically with the required caps. It never fetches live API data, so identical inputs produce identical output bytes. Do not place browser reports, credentials or runtime files in `app/` or `screenshots/`.

## Limitations

- Views depend on public API availability, schema and rate limits; stale cached data may be shown for up to 60 seconds.
- Rankings are provisional until make.fun finalizes them. Displayed rewards, pots and placements are API-derived and not guarantees.
- The app neither enters competitions nor promises, calculates or awards rewards. It is not affiliated with make.fun and does not guarantee any bounty or reward outcome.
- The client intentionally has four routes; there is no account, editing or submission interface.
