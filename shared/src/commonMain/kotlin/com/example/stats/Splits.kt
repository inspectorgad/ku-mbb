package com.example.stats

import com.example.data.Game

/**
 * Season splits and half-by-half shape.
 *
 * Plain functions over plain data, deliberately outside the composables, so
 * the arithmetic can be tested without a screen — the answers here are claims
 * about the season ("a second-half team") that ought to be checkable.
 */

/** A won-lost record, and the scoring behind it. */
data class Record(
    val wins: Int = 0,
    val losses: Int = 0,
    val pointsFor: Int = 0,
    val pointsAgainst: Int = 0
) {
    val games: Int get() = wins + losses
    val winPct: Double get() = if (games == 0) 0.0 else wins.toDouble() / games
    val pointsForPerGame: Double get() = if (games == 0) 0.0 else pointsFor.toDouble() / games
    val pointsAgainstPerGame: Double get() = if (games == 0) 0.0 else pointsAgainst.toDouble() / games
    val margin: Double get() = pointsForPerGame - pointsAgainstPerGame
    override fun toString(): String = "$wins-$losses"
}

/** Only games with a final score; a fixture has no record to contribute. */
fun played(games: Collection<Game>): List<Game> =
    games.filter { it.teamScore != null && it.opponentScore != null }

fun recordOf(games: Collection<Game>): Record {
    var r = Record()
    for (g in played(games)) {
        val us = g.teamScore!!
        val them = g.opponentScore!!
        r = Record(
            wins = r.wins + if (us > them) 1 else 0,
            losses = r.losses + if (us > them) 0 else 1,
            pointsFor = r.pointsFor + us,
            pointsAgainst = r.pointsAgainst + them
        )
    }
    return r
}

/** A named slice of the season, e.g. "Home" -> 14-4. */
data class Split(val label: String, val record: Record)

/**
 * Home, away and neutral. Reported separately rather than folded into
 * home/away because a neutral floor is neither, and the NCAA's own splits
 * treat it as its own line.
 */
fun siteSplits(games: Collection<Game>): List<Split> =
    listOf("home" to "Home", "away" to "Road", "neutral" to "Neutral").mapNotNull { (key, label) ->
        val slice = played(games).filter { it.siteOrLegacy == key }
        if (slice.isEmpty()) null else Split(label, recordOf(slice))
    }

/**
 * Big 12 against everything else. The conference flag is the scraper's, which
 * counts only regular-season games against members — the conference tournament
 * is not part of the standings record.
 */
fun conferenceSplits(games: Collection<Game>): List<Split> {
    val all = played(games)
    val conference = all.filter { it.conference }
    val other = all.filterNot { it.conference }
    return buildList {
        if (conference.isNotEmpty()) add(Split("Big 12", recordOf(conference)))
        if (other.isNotEmpty()) add(Split("Non-conference", recordOf(other)))
    }
}

/** Blowouts, comfortable wins and coin flips, by final margin. */
fun marginSplits(games: Collection<Game>): List<Split> {
    val all = played(games)
    fun slice(label: String, test: (Int) -> Boolean): Split? {
        val s = all.filter { test(kotlin.math.abs(it.teamScore!! - it.opponentScore!!)) }
        return if (s.isEmpty()) null else Split(label, recordOf(s))
    }
    return listOfNotNull(
        slice("Within 5") { it <= 5 },
        slice("By 6-15") { it in 6..15 },
        slice("By 16+") { it >= 16 },
    )
}

// ---------------------------------------------------------------------------
// Halves
// ---------------------------------------------------------------------------

/** One half's scoring across a set of games. */
data class HalfSplit(
    val label: String,
    val pointsFor: Int = 0,
    val pointsAgainst: Int = 0,
    val won: Int = 0,
    val lost: Int = 0,
    val tied: Int = 0
) {
    val games: Int get() = won + lost + tied
    val margin: Int get() = pointsFor - pointsAgainst
    val forPerGame: Double get() = if (games == 0) 0.0 else pointsFor.toDouble() / games
    val againstPerGame: Double get() = if (games == 0) 0.0 else pointsAgainst.toDouble() / games
}

/**
 * Splits "38-31, 41-35" into ours/theirs pairs.
 *
 * Returns an empty list rather than a partial one if any period is malformed:
 * a half table built from part of a game is worse than no half table.
 */
fun parsePeriods(periodScores: String?): List<Pair<Int, Int>> {
    val text = periodScores?.trim().orEmpty()
    if (text.isEmpty()) return emptyList()
    val periods = text.split(",").map { it.trim() }.filter { it.isNotEmpty() }
    val parsed = periods.map { period ->
        val parts = period.split("-").map { it.trim() }
        if (parts.size != 2) return emptyList()
        val ours = parts[0].toIntOrNull() ?: return emptyList()
        val theirs = parts[1].toIntOrNull() ?: return emptyList()
        ours to theirs
    }
    return parsed
}

/** Regulation half labels, then OT periods as the data supplies them. */
private fun halfLabel(index: Int, total: Int): String = when {
    index < 2 -> "H${index + 1}"
    total == 3 -> "OT"
    else -> "${index - 1}OT"
}

/**
 * Scoring by half across a season. Overtime periods are kept separate from
 * regulation — pooling them would flatter the second half of games that
 * needed a third period.
 */
fun halfSplits(games: Collection<Game>): List<HalfSplit> {
    // Plain map, sorted on the way out: sortedMapOf is java.util.SortedMap
    // and the iPhone has no such thing.
    val byIndex = mutableMapOf<Int, HalfSplit>()
    for (g in played(games)) {
        val periods = parsePeriods(g.periodScores)
        periods.forEachIndexed { i, (ours, theirs) ->
            val current = byIndex[i] ?: HalfSplit(halfLabel(i, periods.size))
            byIndex[i] = current.copy(
                // A game that goes to three periods labels its third "OT";
                // one that goes to four labels the same slot "2OT". The first
                // sighting names it, which is the common case either way.
                label = current.label,
                pointsFor = current.pointsFor + ours,
                pointsAgainst = current.pointsAgainst + theirs,
                won = current.won + if (ours > theirs) 1 else 0,
                lost = current.lost + if (ours < theirs) 1 else 0,
                tied = current.tied + if (ours == theirs) 1 else 0
            )
        }
    }
    return byIndex.keys.sorted().map { byIndex.getValue(it) }
}

/**
 * The scoring margin accumulated through each half — where a season's games
 * are actually decided, rather than how they finish.
 */
fun cumulativeHalfMargin(games: Collection<Game>): List<Pair<String, Int>> {
    var running = 0
    return halfSplits(games).map { q ->
        running += q.margin
        q.label to running
    }
}

/**
 * How the team fares when it leads, trails or is level at the half.
 *
 * Halftime is the end of the FIRST period, not the first two. The men's game
 * is two 20-minute halves, so periods[0] is the break; the women's app adds
 * periods[0] and periods[1] because for it that is Q1 + Q2. Carrying that sum
 * across would read the FINAL score and call it halftime, and this split would
 * then silently restate the win-loss record.
 */
fun halftimeSplits(games: Collection<Game>): List<Split> {
    val leading = mutableListOf<Game>()
    val trailing = mutableListOf<Game>()
    val level = mutableListOf<Game>()
    for (g in played(games)) {
        val periods = parsePeriods(g.periodScores)
        if (periods.isEmpty()) continue
        val (ours, theirs) = periods[0]
        when {
            ours > theirs -> leading += g
            ours < theirs -> trailing += g
            else -> level += g
        }
    }
    return listOfNotNull(
        leading.takeIf { it.isNotEmpty() }?.let { Split("Leading at half", recordOf(it)) },
        trailing.takeIf { it.isNotEmpty() }?.let { Split("Trailing at half", recordOf(it)) },
        level.takeIf { it.isNotEmpty() }?.let { Split("Level at half", recordOf(it)) },
    )
}
