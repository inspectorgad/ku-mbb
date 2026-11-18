package com.example.data

/**
 * Canonical key for matching one school's name across sources.
 *
 * No two sources spell a school the same way. The NCAA box score says "South
 * Dakota St." where kuathletics' schedule says "South Dakota State"; a poll
 * line arrives as "#12 TCU" and a standings row can carry the first-place
 * votes, "Baylor (3)". Comparing those strings directly is what made a fixture
 * and its own result look like two different games.
 *
 * So nothing compares team names directly. Everything compares this — the
 * seeder when it keys a game, and the screens when they group meetings with
 * one opponent.
 *
 * Note what is deliberately *not* stripped: "(exh.)". An exhibition is not a
 * meeting, and folding "Washburn (exh.)" into "Washburn" would put a result
 * that counts for nothing into a head-to-head record.
 */
fun normTeam(name: String): String {
    val n = name
        .replace(Regex("""\s*\(\d+\)\s*$"""), "")   // strip poll votes
        .lowercase()
        .replace(".", "")
        .replace(Regex("""\bstate\b"""), "st")
        .replace(Regex("""\buniversity\b"""), "")
        .replace(STATE_NAME) { STATES.getValue(it.groupValues[1]) }
        .replace(Regex("""\s+"""), " ")
        .trim()
    return ALIASES[n] ?: n
}

/*
 * The rest of the rule, kept word for word with norm_team() in
 * scripts/seed_text.py, which keys the seed - and with normTeam() in
 * docs/dashboard.template.html. The three must agree exactly: an opponent's
 * roster is stored under the seed's key and looked up here under this one, and
 * a game is matched to the row already on the phone by it. They did drift once.
 * This copy and the dashboard's never got the state-name rule, so for a while
 * "Middle Tenn." and "Middle Tennessee" were one school to the seed and two
 * here. scripts/fixtures/team-keys.json holds the seed's key for every Division
 * I name and every opponent ever scheduled, and TeamNamesTest, the dashboard
 * test and test_seed_text.py all check against it.
 *
 * The NCAA abbreviates a state inside a school's name ("Middle Tenn.") where
 * kuathletics spells it out. Collapsed to the short form, never expanded, since
 * expanding would turn Ole Miss into Ole Mississippi.
 */
private val STATES = mapOf(
    "alabama" to "ala", "arizona" to "ariz", "arkansas" to "ark", "california" to "calif",
    "carolina" to "caro", "colorado" to "colo", "connecticut" to "conn", "florida" to "fla",
    "georgia" to "ga", "illinois" to "ill", "indiana" to "ind", "kentucky" to "ky",
    "louisiana" to "la", "maryland" to "md", "massachusetts" to "mass", "michigan" to "mich",
    "minnesota" to "minn", "mississippi" to "miss", "missouri" to "mo", "nebraska" to "neb",
    "oklahoma" to "okla", "oregon" to "ore", "pennsylvania" to "pa", "tennessee" to "tenn",
    "virginia" to "va", "washington" to "wash", "wisconsin" to "wis",
)
private val STATE_NAME = Regex("""\b(""" + STATES.keys.joinToString("|") + """)\b""")

/** Whole names no rule reconciles: the page's on the left, the NCAA's on the right. */
private val ALIASES = mapOf(
    "northern iowa" to "uni",
    "lsu new orleans" to "new orleans",
)

/** True when two spellings name the same school. */
fun sameTeam(a: String, b: String): Boolean = normTeam(a) == normTeam(b)
