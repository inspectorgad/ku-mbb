# Building KU Men's Basketball from this repo

A build plan for `inspectorgad/ku-wbb` → a Kansas men's basketball app.

You have read access to `inspectorgad/ku-wbb`. **Read it.** This document does not
restate schemas, formulas or file contents that you can open directly — it tells you
what the pieces are, which ones change for the men's game, which ones must not be
touched, and in what order to do the work. Where it says "read X", that is an
instruction, not a citation.

The decision already taken: **fork and adapt**, then **let the two apps diverge.**
You are not maintaining a shared upstream. Once the fork is made, a fix in one app
has to be found again in the other, and that is accepted.

---

## Where this repo has got to

This began as a plan for a port that had not started. The port has since been
carried out, here, so most of what follows is a record rather than instructions.
Read this section before anything below it.

| Step | State |
|---|---|
| §1 Verify the data sources | **Done.** `scripts/probe-ku-mbb.mjs` ran against the live NCAA API and passed, twice; §1 records what it found, including the NET slug and the linescore shape. |
| §2 Rename | **Done.** Identity, paths, URLs, bundle IDs, the database filename and the Keystore alias all say men's/MBB. The parser fixtures are genuine men's pages captured by the probe. |
| §3 Quarters → halves | **Done**, and it was not only labels — see the correction at the head of §3. |
| §4 Rebuild the seed | **Done.** The scrape runs six times a day and the seed carries a real season: 71 games, 36 of them this one, 29 players, the whole Big 12 table. |
| §5 Infrastructure | **Done** bar one step only a person can take — below. All nine workflows are live, Pages publishes the dashboard, the four Apple secrets pass all 13 checks, and the app has its own upload key. |
| §6-§9 | Unchanged guidance, and still worth reading — especially §6 on what not to change. |

### What is running

- **Dashboard** — <https://inspectorgad.github.io/ku-mbb>, redeployed whenever
  `docs/` changes.
- **Android** — the rolling `latest-apk` release carries `app-debug.apk`, the
  season data and the Ask pack. Installed apps sync their season from it, which
  is why §6 says to leave that release alone.
- **iPhone** — TestFlight, built by hand or from a branch. An internal tester
  group with automatic distribution means each build reaches the phone by itself.
  Every build so far has been checked on a real iPhone.
- **Android is the unproven one.** The APK builds, passes its unit tests and
  publishes, but has not yet been installed on a phone. The first run should
  check that it opens from cold, seeds its database, syncs from the release, and
  that Ask works with a key entered on the device. `scripts/adb-install.sh` is
  the supported install path.
- **The scrape** — six times a day at :37, and a game-night watcher that polls
  for a result once a game is under way.

### TestFlight tester group — done

This was the last step only a person could take: without an internal tester
group every build processed to `VALID` and reached nobody. The group exists now,
with automatic distribution. If builds ever stop arriving,
`scripts/ios_build_status.py`, run as the **iOS build status** workflow, says
where any build has got to and prints no secrets.

### Picking this up elsewhere — another machine, or another Claude account

Nothing of value lives outside this repository, and there is no session to move:
clone it, or point a new Claude Code session at it, and start. In particular:

- **The four Apple secrets** are GitHub Actions secrets *on this repository*, not
  on anybody's account, so they travel with it and need no re-entry.
- **The upload keystore** is committed as `upload.keystore.base64` with its
  password in `app/build.gradle.kts`. Deliberate — see §5 — and it is this app's
  own key, not an inherited one.
- **The Apple Developer account** is the one genuinely separate thing. Signing
  uses an App Store Connect API key of **Admin** role; APPLE-SETUP.md has the
  detail, and the keys check validates it in half a minute.
- **The reasoning** is in this file, in DATA-VALIDATION.md, and in the comments.
  Where the code looks odd there is usually a comment saying which bug put it
  that way. §8 is the short list of traps.

~~One thing §1 could not settle: the overtime linescore shape.~~ **Settled.** The
second probe run, from GitHub's network, caught two overtime games among the 32:
`info.contests[0].linescores` holds one row per period with a `period` label, and
across the 32 games 30 have two rows and 2 have three, labelled `1`, `2`, `OT`.
That is what §3's halves work is built on. See DATA-VALIDATION.md.

---

## 0. What you are forking

An Android + iPhone + web app for one basketball team, built as:

| Piece | What it is |
|---|---|
| `shared/` | Kotlin Multiplatform. Compose UI, Room database, stats, the Ask Claude engine. ~70 files, all the real code. Compiles for Android **and** iOS. |
| `app/` | Android shell. `MainActivity.kt` + `AndroidDevice.kt` and the test suite. |
| `ios/` | Swift shell over the same Kotlin, generated by XcodeGen from `ios/project.yml`. |
| `scripts/` | The scrape (Node) and the seed build (Python). This is where the data comes from. |
| `docs/` | A single generated HTML dashboard published to GitHub Pages, plus the Ask pack and an .ics feed. |
| `.github/workflows/` | Nightly scrape, APK build, Pages deploy, TestFlight, a game-night watcher. |

Roughly 17,500 lines across the substantial files. **Most of it is sport-agnostic.**
The men's work is concentrated in three places: identity/renaming, the data sources,
and halves-instead-of-quarters. Everything else — the database, the sync, the stats
layer, Ask Claude, the dashboard, CI — ports unchanged.

Pinned toolchain (from `gradle/libs.versions.toml`; keep these, they are a working
set): Kotlin `2.4.21`, AGP `9.2.1`, Compose Multiplatform `1.12.2` with material3
`1.12.0-alpha03`, Room `2.8.5`, KSP `2.3.12`, Gradle `9.4.1`, Java 21.

---

## 1. Step zero: prove the men's data sources exist

**Do this before writing a line of code.** The entire app is downstream of two hosts.
If the men's endpoints are not what you assume, everything built on top is wrong, and
you will not find out until the first scrape.

The women's app reads:

| Source | Used for |
|---|---|
| `https://ncaa-api.henrygd.me` — a JSON wrapper around ncaa.com | Game discovery and box scores |
| `https://kuathletics.com/sports/womens-basketball/schedule` | The season schedule, venues, TV, tip times |
| `https://kuathletics.com/sports/womens-basketball/roster` | KU's roster and player bios |
| Opposing schools' own roster pages | Opponent rosters |

The exact NCAA paths in use (read `scripts/scrape-ku-mbb.mjs`):

```
/scoreboard/basketball-women/d1/{YYYY}/{MM}/{DD}
/game/{gameId}
/game/{gameId}/boxscore
/rankings/basketball-women/d1/associated-press
/rankings/basketball-women/d1/ncaa-womens-basketball-net-rankings
```

**VERIFIED — probe run #1, 18 Nov 2026, `PASS`.** Everything below was checked against
the live endpoints from GitHub Actions. Evidence is committed under `probe/`.

| Men's endpoint | Result |
|---|---|
| `/scoreboard/basketball-men/d1/{Y}/{M}/{D}` | works — found a full 2025-26 Kansas season |
| `/game/{id}` and `/game/{id}/boxscore` | works — 32/32 box scores captured, 0 failed |
| `/rankings/basketball-men/d1/associated-press` | works — 25 rows |
| `/rankings/basketball-men/d1/ncaa-mens-basketball-net-rankings` | **works — 365 rows** |
| `https://kuathletics.com/sports/mens-basketball/roster` | works — 17 players parsed |
| `https://kuathletics.com/sports/mens-basketball/schedule` | works — 8,360 chars captured |

Two NET slug candidates were tried and 404'd: `net-rankings` and
`ncaa-mens-basketball-net`. The women's pattern with one word changed is correct.

**Halves are confirmed, not assumed.** A real men's box score returns exactly two
linescore entries:

```json
"linescore": [
  {"period": "1", "home": "39", "visit": "32"},
  {"period": "2", "home": "32", "visit": "29"}
]
```

The player stat fields are identical to the women's feed — `points`,
`fieldGoalsMade/Attempted`, `threePointsMade/Attempted`, `freeThrowsMade/Attempted`,
`offensiveRebounds`, `totalRebounds`, `assists`, `steals`, `blockedShots`, `turnovers`,
`personalFouls`, `minutesPlayed`, `starter`. The whole stats layer ports untouched.
Points summed per player matched the final score in 64 of 64 team-games on the
first run, and 63 of 64 on a second run from GitHub's own network: that one re-ran
over a slightly different set of games and found Princeton's 2025-11-15 box score
summing to 61 against a final of 57. So **the feed is not perfectly self-consistent
and the importer must not assume it is** - which is what the women's app already
does: it stores the final score from the game record and the player rows as given,
and never derives one from the other. Keep that.

**One operational finding.** The public NCAA API instance returns intermittent `502`s —
7 of ~160 scoreboard days in the first run and 9 in the second. That is why the probe found 32 games rather than
the full season; it has no retry and no index. **The scraper already handles this
correctly** — `scripts/scrape-ku-mbb.mjs` marks a date scanned only on a 404, and
leaves it unscanned on any other failure so a transient error retries the next night.
Do not "simplify" that. Read the comment at the `catch`.

Note what the PASS does and does not say: the data is retrievable and internally
consistent. It does not claim completeness, because the probe cannot know what a 502
hid from it.

Still open, and cheap to settle when you get there:

- **The NET's season boundary.** The women's app knows the NET is last season's table
  until the NCAA publishes the first of the new season, and says so in the Ask prompt.
  The row above is a 365-team table with a 37-3 leader, i.e. a *final* table. Confirm
  the men's publication date and keep the caveat honest.
- **Postseason.** The women's app models the WBIT. Grep `WBIT` and decide what it
  becomes — the NCAA tournament and the NIT.

---

## 2. The rename inventory

Measured on the current tree, excluding `.git`, `node_modules`, `scraped/`, `probe/`:

| Token | Files | Occurrences |
|---|---|---|
| `wbb` (any case, substring) | 32 | 102 |
| `KU WBB` | 24 | 64 |
| `ku-wbb` | 21 | 80 |
| `Women's Basketball` | 21 | 100 |
| `women's basketball` | 11 | 15 |
| `basketball-women` | 4 | 7 |
| `womens-basketball` | 3 | 21 |
| `KUWBB` | 4 | 11 |
| `ku_wbb` | 4 | 6 |

Four files carry the sport in their **name** and must be renamed (done in this
repo; the ku-wbb names are given so the mapping is readable):

```
scripts/scrape-ku-wbb.mjs  ->  scripts/scrape-ku-mbb.mjs
scripts/probe-ku-wbb.mjs   ->  scripts/probe-ku-mbb.mjs
ios/App/KUWBBApp.swift     ->  ios/App/KUMBBApp.swift
docs/ku-wbb.ics            ->  docs/ku-mbb.ics
```

Identity values to change, with where they live:

| What | Current | Where |
|---|---|---|
| Android `applicationId` | `io.github.inspectorgad.kuwbb` | `app/build.gradle.kts` |
| iOS bundle id | `io.github.inspectorgad.kuwbb` | `ios/project.yml` |
| Xcode project name | `KUWBB` | `ios/project.yml` |
| App display name | `KU WBB` | `app/src/main/res/values/strings.xml` |
| Room database file | `ku_wbb.db` | `JayhawksDatabase.android.kt`, `JayhawksDatabase.ios.kt` |
| **Android Keystore alias** | `ku_wbb_ask_api_key` | `shared/src/androidMain/.../AndroidDevice.kt:87` |
| Browser storage keys | `ku-wbb-ask-*` | `docs/ask.js` |
| Pages URL | `inspectorgad.github.io/ku-wbb` | `AskEngine.kt` `PACK_URLS`, README, workflows |
| Release download URLs | `releases/latest/download/…` | `AskEngine.kt`, `SeasonSync.kt`, README |

The Kotlin package stays `com.example` (the namespace is `com.example`; only the
`applicationId` is the real identity). Renaming the package is optional churn — it
touches every file for no functional gain. Leave it.

**What the rename does not cover: the icon.** `scripts/icon-art.mjs` draws a
basketball on KU blue with no lettering, so it ports across unchanged and correctly -
and that means a phone with both apps installed shows the same icon twice, told apart
only by the label underneath. Nothing breaks; it is a decision to take, not a bug.
Changing it is a few lines in `icon-art.mjs` and a re-run of `make-icons.mjs` and
`make-web-icons.mjs`.

**The one rename that is not cosmetic:** the Keystore alias and the database filename.
Because this is a new app with a new `applicationId`, it installs alongside the
women's app rather than over it, so there is no migration concern — but keep the two
distinct anyway so a device with both does not have them fighting over one database
file name in its own sandbox. (They would not, being separate app sandboxes, but the
log lines are confusing enough that it is worth the five seconds.)

---

## 3. Quarters → halves: the one real domain change

> **Done in this repo, and two things below were wrong.** Read this first.
>
> **(a) It is not all labels.** Three places add `periods[0] + periods[1]` to get the
> halftime score, which is right for Q1 + Q2 and is *the final score* for a men's
> game: `halftimeSplits()` in `Splits.kt`, the "Came from behind" fact in
> `GameFacts.kt`, and the "At the half" card in `dashboard.template.html`. Left as
> labels-only, the "At the half" split would have silently restated the win-loss
> record — every game "leading at half", by definition — and nothing would have
> failed. All three now read `periods[0]`. `GameFacts` also gated its whole block on
> `periods.size >= 4`, so for a two-period game it produced no facts at all.
>
> **(b) Point 3 below is wrong: no table collapses.** There is no scoring-by-half
> table next to the quarter table. "At the half" is a *record* split — how the team
> fares when leading, trailing or level at the break — and "By quarter" is a
> *scoring* table. They measure different things, nothing duplicates, and both stay.
>
> One judgement call the plan did not raise: `GameFacts` prints "Outscored them
> 26-17 in the third" when a period margin reaches 8. Across a 20-minute half rather
> than a 10-minute quarter that fires on almost every game, so the threshold is now
> `HALF_SWING = 12`, defined in both `GameFacts.kt` and `dashboard.template.html`
> with the reasoning.

**Men's college basketball plays two 20-minute halves. Women's plays four 10-minute
quarters.** Confirmed against a real box score in step 1 — the feed returns two
linescore periods. This is the only genuine sporting difference that reaches the code,
and it is smaller than it first looks — about 20 files mention a quarter, but very few
actually assume *four of them*.

### What is already generic

`periodScores` is a plain comma-separated string — `"20-15, 18-12, 17-16, 23-20"` for
women, `"38-31, 41-35"` for men. Nothing parsing it assumes a count. The `periods`
table, the overtime detection in `scripts/update-seed.py` (which reads the linescore's
own `OT`/`2OT` labels), the Room column, the seed format and the sync all carry through
unchanged.

### The places that hardcode four

1. **`scripts/ask_pack.py`, `_periods(game_base, period_scores, regulation=4)`** —
   already parameterised. Pass `regulation=2` and change the label from `f"Q{n}"` to
   `f"H{n}"`. One function.

2. **`shared/src/commonMain/kotlin/com/example/stats/Splits.kt`**, the private
   `quarterLabel(index, total)`:
   ```kotlin
   private fun quarterLabel(index: Int, total: Int): String = when {
       index < 4 -> "Q${index + 1}"
       total == 5 -> "OT"
       else -> "${index - 3}OT"
   }
   ```
   Becomes `index < 2 -> "H${index + 1}"`, `total == 3 -> "OT"`, else `"${index - 1}OT"`.
   Rename the function and `QuarterSplit`/`quarterSplits` while you are there.

3. **The "by the half" split collapses.** For women, first half = Q1+Q2 and second =
   Q3+Q4, so the Season screen shows *both* a quarter table and a half split. For men
   the halves **are** the periods — the two tables become one. Delete the half split
   rather than leaving a table that duplicates the one above it. Same on the dashboard:
   `docs/dashboard.template.html` has both a "By quarter" card and an "At the half"
   card, and the second becomes redundant.

4. **Labels and prose**, all mechanical: `GamesScreen.kt` ("Quarters: …", the
   `GameDialog` field label and its `20-15, 18-12, …` placeholder), `SeasonScreen.kt`,
   `Glossary.kt`, `GameFacts.kt` ("which quarter decided it"), `ics_feed.py`,
   `README.md`, `metadata.json`, the dashboard template.

5. **Tests that pin the labels**: `SplitsTest.kt`, `test_ask_pack.py`,
   `AskFromGameTest.kt`, `docs/ask.test.mjs`.

6. **The Ask system prompt.** `scripts/ask_pack.py` `SYSTEM_RULES` describes `periods`
   as "one row per quarter". Change it, and change the Preview/Recap question wording
   in `AskScreen.kt` and `docs/ask.js` — both say "how each quarter went". Those two
   strings must stay **word for word identical** across the Kotlin and the JavaScript;
   `docs/ask.test.mjs` fails the build if they drift.

### Also check

Men's basketball fouls out at 5 and has a 1-and-1 bonus rule the women's game dropped;
neither reaches the box-score columns, so the stats layer is unaffected. Verify the
NCAA box score returns the same field names for men — read a real men's box score
during step 1 and diff its keys against a women's one.

---

## 4. Data and content reset

A fork arrives carrying a complete women's season. None of it is yours.

- `app/src/main/assets/seed.json` — 68 games, 19 players. Delete the contents, keep
  the shape. The first real scrape rebuilds it.
- `scraped/` — 52 files of captured pages and API responses. Delete all of it. Its
  `*-index.json` files are caches keyed by game id and date; stale entries would
  suppress fetches you need.
- `probe/` — the women's captured sample pages. Delete. (This repo's `probe/` is
  the *men's* capture from step 1 and is kept on purpose: it is the evidence behind
  every claim in section 1.)
- `docs/ask-data.json`, `docs/dashboard.html`, `docs/ku-wbb.ics` — all generated.
  Delete; CI regenerates them.
- `scripts/fixtures/` — the frozen schedule page the parser tests run against. You need
  a **men's** capture here, or `schedule-parser.test.mjs` is testing the women's page
  layout. Capture one during step 1.
- `.env.example` — contains a `GEMINI_API_KEY` placeholder that no *code* in this
  repo reads. **Do not delete it.** An earlier draft of this plan said to, and doing
  so broke the Android build before it compiled a line: `app/build.gradle.kts` names
  it as the Secrets Gradle plugin's `defaultPropertiesFileName`, and the plugin fails
  configuration when the file is absent. The placeholder is vestigial; the file is
  not.

**Seasons.** `SEASONS: '2025 2026'` in `scrape-data.yml` are season *start* years.
Set what you want; the men's and women's NCAA season boundaries are the same.

**Big 12.** Men's is also **16 teams × 18 conference games**, so the standings maths
and its validation (144 conference games) carry across unchanged. The conference
membership list is the same. Verify the tournament dates and venue.

---

## 5. Infrastructure

### Secrets

Only four, all Apple, all per-account and reusable if you already ship an iOS app:

```
APPLE_TEAM_ID       your Apple Developer team id
ASC_ISSUER_ID       App Store Connect API key issuer
ASC_KEY_ID          App Store Connect API key id
ASC_KEY_P8          the .p8 private key, pasted whole
```

The key must be an **Admin** role key — a lesser role cannot use the team's
cloud-managed distribution certificate, and it fails at upload rather than at the keys
check. `.github/workflows/apple-keys-check.yml` validates them; run it first.

No certificate is stored in the repo. Signing happens at `xcodebuild -exportArchive`
time using the App Store Connect key ("cloud signing"), which is why this works with a
new developer account and no registered devices. Read `APPLE-SETUP.md` — it is accurate
and you will need an App ID and an app record created at developer.apple.com.

### Keystores

`debug.keystore.base64` and `upload.keystore.base64` are committed, and the upload
password is in `app/build.gradle.kts` in plain text. That is deliberate — Play App
Signing holds the real key, so the upload key is a replaceable credential. **Generate
your own upload keystore anyway.** Do not ship a second app signed by the first app's
upload key.

**Done in this repo.** The fork arrived carrying `kuvb-upload-2026`, the volleyball
app's password, two apps removed by then — a small illustration of how fork artefacts
survive. `upload.keystore.base64` is now this app's own key and the password is
`kumbb-upload-2026`. It matters more than it looks: the first AAB uploaded to the Play
Console is what *establishes* the upload key for that app, and changing it afterwards
is a support request rather than a setting.

### Pages

Enable GitHub Pages on the fork, source = GitHub Actions. `pages.yml` deploys from
`main` only. Until it runs, Ask Claude in the app has no pack to read.

---

## 6. What not to change

These are the parts that look arbitrary and are not. Each one is a bug that shipped.

**The site is three-valued, not a boolean.** A game is home, away or **neutral**. The
schedule page's "vs"/"at" only says whether KU travelled, not who hosted — KU plays
"vs Nebraska" at a neutral floor in Sioux Falls. `siteOf()` derives the site from the
venue. Keep it.

**A poll rank is not part of a team's name.** The schedule page writes `#25 Nebraska`.
`normTeam()` deliberately keeps a leading `#`, so if the rank reaches the name the
fixture keys differently from its own box score, the win model cannot find the team in
the NET, and the game silently shows no win chance. `scripts/schedule-parser.mjs`
splits the rank off as `opponentRank`. Keep that.

**The schedule page has two listings that can disagree.** A site-wide "Upcoming Event"
rotator *and* a schedule table. The rotator says `TBD` while a bracket is undrawn; the
table already names the team. They are merged **by date alone** — never by date plus
opponent — because a disagreement about the name otherwise reads as two games, and the
ghost (no venue) then renders as a home game. Two *table* rows on one date are still
two games. Read the comment block in `parseSchedule`.

**A sync only adds and updates; it never deletes a game.** Because a game entered by
hand has to survive one. The consequence: when the source *renames* an opponent, you
get a stale row forever unless something handles it. `Seeder.kt` has three guards —
`healRankedNames` (a stored `#25 Nebraska`), the placeholder sweep (a stored `TBD`),
and adoption (a fixture renamed at the source is taken over rather than duplicated).
Read all three and the comments explaining why each exists.

**The adoption guards are the substance, not the feature.** A row is only adopted if it
is on the same date, has no result, has no stat lines, is not claimed by another game
in the same payload, shares the venue or the tip time, and — critically — the incoming
name is one the repair would not itself delete. Without that last condition, a real
fixture gets renamed to `TBD` and deleted on the next sync. Every table pointing at a
game is `ON DELETE CASCADE`.

**Feed-owned vs user-owned fields.** Some columns a sync overwrites (site, TV,
conference flag, win probability); some it must never clobber (a hand-entered result,
stat lines). The distinction is annotated field by field in `Seeder.kt`'s update
branch. Preserve it.

**`docs/dashboard.html` is generated.** The source is `docs/dashboard.template.html`,
which carries a `/*__DATA__*/` token that `scripts/build-dashboard.py` replaces with
the season JSON. Both are committed; CI regenerates the output. Editing
`dashboard.html` directly is always wrong — the next scrape overwrites it.

**The rolling release tag is load-bearing.** `SeasonSync`, `AskEngine.PACK_URLS` and
the README all read `releases/latest/download/…`. A branch build must **never** publish
there — it would point every installed app at a test build. Branch builds go to their
own pre-release, with their Ask pack pinned to that commit via
`scripts/pin_ask_pack.py`. Read `build-apk.yml` and `ios-testflight.yml`.

**The Ask table list exists in five places that must agree.** The `get_table` enum and
the `TABLES` constant in `AskEngine.kt`, the `TABLES` array in `docs/ask.js`, the prose
list in `ask_pack.py`'s `SYSTEM_RULES`, and the pack's own keys. A table present in the
pack but missing from a list is unreachable and silently so.
`scripts/test_ask_pack.py` checks both directions — do not weaken it.

**Ask Claude uses `web_search_20250305`, not the newer tool.** The newer web-search
tool runs searches inside code execution and collides with the app's
`code_execution_20260120` + programmatic `get_table` setup. Also: thinking blocks are
bound to the tool list for the life of a conversation, so adding web search partway
through is a 400 — the app fixes the tool list per conversation and starts a new one
instead. This is all commented in `AskEngine.kt`; read before touching.

**The reader's API key never leaves the device.** Android Keystore, iOS Keychain,
browser storage on the dashboard. Sent only to `api.anthropic.com`. Never log it.

---

## 7. Order of operations

Each step has a checkpoint. Do not proceed past a red one.

1. ~~**Verify the data sources** (§1).~~ **DONE** — probe run #1, `PASS`. Every endpoint
   in the table above is confirmed live, and `probe/` holds the evidence.
2. **Fork and rename** (§2). Mechanical. ✅ when `grep -ri wbb` is clean and the Android
   app builds.
3. **Purge the women's data** (§4). ✅ when `scraped/`, `probe/` and the seed are empty
   and the generated files are gone.
4. **Repoint the scraper.** Men's endpoints, men's kuathletics URLs. Capture a men's
   schedule page into `scripts/fixtures/` and fix `schedule-parser.test.mjs` against
   it. ✅ when `node --test scripts/*.test.mjs` passes and a manual scrape produces a
   plausible `scraped/`.
5. **Rebuild the seed.** `update-seed.py`, then `build-dashboard.py`, `ics_feed.py`,
   `ask_pack.py` — in that order; later steps read earlier output. ✅ when the seed has
   the right number of games and the win model rates every upcoming game that has a NET
   row.
6. **Halves** (§3). ✅ when `SplitsTest`, `test_ask_pack.py` and `ask.test.mjs` pass with
   H1/H2 and the Season screen shows one period table, not two.
7. **Infrastructure** (§5). Secrets, keystore, Pages. ✅ when `apple-keys-check.yml` is
   green and Pages has deployed a dashboard.
8. **Ship it.** Dispatch `build-apk.yml` for an APK; `ios-testflight.yml` for
   TestFlight. ✅ when both install and the app shows a real men's season.

---

## 8. Traps worth knowing in advance

- **Gradle may not run in your container.** If it does not, CI is your only compile
  check — a Kotlin mistake costs a 3-minute round trip. Read the Kotlin as a compiler
  would before pushing, and keep JS/Python tests local where they do run.
- **`sed -i` differs between Linux and macOS.** The Android build runs on Ubuntu, the
  iOS build on macOS, and BSD `sed -i` takes its next argument as a backup suffix. Any
  text edit shared by both workflows belongs in a script, not a shell one-liner. This
  repo already learned that: `scripts/pin_ask_pack.py`.
- **`internal` in `shared/` is invisible to `app/`.** Separate Gradle modules. A test in
  `app/src/test` cannot call an `internal` function in the shared module — test through
  the public surface.
- **A test that only runs one sync proves little.** Several of the sync bugs here only
  appear on the *second* merge. Where a repair runs at the start of a sync, merge twice
  in the test.
- **The NCAA scoreboard only shows games day-of**, which is why the schedule comes from
  kuathletics at all. Do not try to build the fixture list from the NCAA API.
- **A Big 12 opponent is not a Big 12 game, and the feed cannot tell you
  which.** Kansas met West Virginia and Houston in the Players Era in Las Vegas
  in November 2026. The feed's `conferenceGame` flag is set on every game
  between two members, including tournament games, so it is membership and
  nothing more. A fix that trusted it for played games stopped every scrape
  the night West Virginia went final. `update-seed.py` treats a KU game against
  a member at a neutral site as non-conference, for KU's record and the
  standings alike. It refuses to write a seed with more than 18 conference
  games in a season, and warns if any team's Big 12 record passes 18, which is
  how a neutral meeting of two other members would show.
- **A school can have two names no rule reconciles.** The NCAA's `UNI` is the
  page's Northern Iowa. Those go in `_ALIASES` in `scripts/seed_text.py`; the
  build raises a workflow warning for a named opponent with no NET row.
- **The team-name rule exists three times and they must agree exactly:**
  `norm_team()` in `seed_text.py`, `normTeam()` in `TeamNames.kt` and the
  dashboard's. They drifted once. The state-name rule reached only the seed's
  copy, which split Middle Tennessee in two on phones, and the hand-written
  keys in `opponent-sites.json` stopped matching five rosters (Arizona,
  Arizona State, Colorado, Oklahoma State, West Virginia) for the seed's own
  height lookup. Now `update-seed.py` runs every roster key through
  `norm_team()`. `scripts/fixtures/team-keys.json` holds the seed's key for
  the whole field, and `TeamNamesTest`, `docs/team-names.test.mjs` and
  `test_seed_text.py` all check against it. After changing `norm_team()`, run
  `python3 scripts/team_keys.py` and port the change to the other two.
- **An "upcoming" game can be in the past** — the date passed but the box score has not
  landed. Branch on whether there is a result, never on the date. The dashboard shows
  "awaiting result" for exactly this.
- ~~Check a men's box score for a `linescore` with two entries.~~ Confirmed in step 1,
  and the overtime shape with it: two of the 32 probed games carry a third row, and
  the labels are `1`, `2`, `OT`. The overtime detector reads those labels, so it has
  what it needs. A fourth period is presumed to read `2OT`, as the women's feed does;
  nothing in the 32 games shows one.

---

## 9. Where the real documentation is

Read these in the fork, in this order:

| File | Why |
|---|---|
| `README.md` | What the app does, screen by screen. Rewrite it for the men's team early — it is the spec you will argue with. |
| `scripts/scrape-ku-mbb.mjs` | The header comment explains every data source and why each one is used. |
| `scripts/schedule-parser.mjs` | The two-listing merge and the rank split, with the reasoning. |
| `shared/.../data/Seeder.kt` | The sync rules, the repairs, the feed-owned/user-owned split. |
| `shared/.../data/AskEngine.kt` | The Anthropic API loop. Long, heavily commented, worth the read before changing anything. |
| `scripts/ask_pack.py` | `SYSTEM_RULES` — the prompt that decides how good Ask Claude's answers are. |
| `DATA-VALIDATION.md` | The cross-checks the seed build runs. |
| `APPLE-SETUP.md`, `PLAY-SETUP.md` | Store setup, accurate as written. |
| `PORT-PLAN.md` (in ku-wbb, not here) | The plan used when that app moved to shared Kotlin. Useful as a model of how a port of this codebase is actually sequenced. It is about work already finished, so it was not copied across. |

The comments in this codebase explain *why*, not *what*. Where one looks
over-explained, it is usually load-bearing — it is there because the obvious thing was
tried first and was wrong.
