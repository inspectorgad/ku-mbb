# Data validation — KU Men's Basketball 2025-26

Result: **PASS**. A full men's season is retrievable from the same two-source
pipeline the women's app uses, and the data is internally consistent. Raw
evidence lives in `probe/`, captured by the `probe-data.yml` GitHub Actions
workflow on 2026-11-18 (commit `435b1b6`); every figure below was recomputed
from those files rather than copied from the probe's own summary.

> This file previously held the **women's** report — 36 games, a WBIT run,
> S'Mya Nichols — with "Men's" pasted on the title by the identifier rename.
> Every number in it was contradicted by the men's probe sitting in the same
> repository. It has been rewritten from that probe.

## Source 1: NCAA API (`ncaa-api.henrygd.me`)

- Scanned the daily scoreboard `basketball-men/d1` from 2025-11-01 to
  2026-04-10: **32 Kansas games found, 9 scan errors**. The errors are `502`s
  from the public API instance, not missing data — see the operational note
  below.
- **32/32 box scores captured** (`probe/games/`), 64 team-games. Every player
  line carries 24 fields: minutes, FGM/FGA, 3PM/3PA, FTM/FTA, offensive and
  total rebounds, assists, turnovers, steals, blocks, personal fouls, points,
  jersey number, position, starter flag, class year and eligibility.

### Consistency checks

- Per-player points formula `2×FG2 + 3×FG3 + FT = PTS`: **holds for every
  player line in all 32 games**, 0 violations.
- Sum of player points = official final score: **63 of 64 team-games**. The
  exception is Princeton on 2025-11-15, whose player lines total 61 against a
  final of 57. **So the feed is not perfectly self-consistent, and the importer
  must not assume it is.** `update-seed.py` already stores the final from the
  game record and the player rows as given, and derives neither from the other
  — see the comment at `scripts/update-seed.py:162`, which notes that official
  team totals are deliberately not the sum of the player lines because team
  rebounds and team turnovers belong to no player. Keep that.
- 16 distinct KU players appear across the 32 games.

### Linescores: two halves, and what overtime looks like

`info.contests[0].linescores` carries one row per period, labelled in a
`period` field. Across the 32 games: **30 games have 2 rows and 2 have 3**, and
the labels seen are `1`, `2` and `OT`. So the men's game reaches the feed as
two periods, a third appearing only for overtime — which is what the app's
halves work in `Splits.kt` and `ask_pack.py` is built on.

This settles a question §1 of `KU-MBB-PORT.md` recorded as open: the first
probe run happened to catch no overtime game, so the shape was unverified. The
second run caught two.

### Gotcha for the app

In the boxscore JSON, `box.teams[].teamId` is a **string** (`"1824"`) while
`box.teamBoxscore[].teamId` is a **number** (`1824`). Compare as strings. This
is unchanged from the women's feed.

## Source 2: kuathletics.com (Sidearm, headless Chromium)

- Roster page parsed cleanly: **17 players**, every one with name, jersey,
  position, class year, height, hometown and last school.
- Schedule page renders and is capturable; the 2026-27 season parses to 30
  fixtures. Both captures are frozen into `scripts/fixtures/` as the pages the
  parser tests run against.
- **Note:** the roster page shows the *current* (2026-27) roster, so it no
  longer lists players who have left since 2025-26. A past season's roster has
  to be derived from its box scores; the live page is only good for the season
  being played.

## Rankings

| Endpoint | Result |
|---|---|
| `rankings/basketball-men/d1/associated-press` | **OK** — 25 rows |
| `rankings/basketball-men/d1/ncaa-mens-basketball-net-rankings` | **OK** — 365 rows |
| `rankings/basketball-men/d1/net-rankings` | 404 |
| `rankings/basketball-men/d1/ncaa-mens-basketball-net` | 404 |

The NET slug is the long one. The two short candidates were guesses from the
women's naming and do not exist; they are kept in `scripts/probe-ku-mbb.mjs` so
a re-run proves it again rather than trusting this table.

## Operational note: the 502s

The public NCAA API instance returns intermittent `502`s — 9 of about 160
scoreboard days in this run, 7 in the previous one. That is why the probe found
32 games rather than a whole season: it has no retry and no index.

**The scraper already handles this correctly.** `scripts/scrape-ku-mbb.mjs`
marks a date scanned only on a `404`, and leaves it unscanned on any other
failure, so a transient error is retried the next night. Do not "simplify"
that.

## Conclusion

Green light. Note what the PASS does and does not say: the data is retrievable
and internally consistent to within the one mismatch above. It does not claim
completeness, because the probe cannot know what a 502 hid from it.
