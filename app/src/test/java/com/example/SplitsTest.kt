package com.example

import com.example.data.Game
import com.example.stats.conferenceSplits
import com.example.stats.cumulativeHalfMargin
import com.example.stats.halftimeSplits
import com.example.stats.isExhibition
import com.example.stats.marginSplits
import com.example.stats.parsePeriods
import com.example.stats.played
import com.example.stats.halfSplits
import com.example.stats.recordOf
import com.example.stats.siteSplits
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The splits make claims about the season — "a second-half team", "8-10 in
 * the Big 12" — so they are checked against the real 2025-26 numbers, which
 * are known independently from the NCAA's own published splits.
 */
class SplitsTest {

    private fun game(
        date: String,
        opponent: String,
        us: Int?,
        them: Int?,
        site: String = "home",
        conference: Boolean = false,
        periods: String? = null
    ) = Game(
        date = date, opponent = opponent, season = "2025-26", site = site,
        conference = conference, teamScore = us, opponentScore = them,
        periodScores = periods
    )

    @Test
    fun `an exhibition is scored but counts towards nothing`() {
        // Exhibitions are not Division I fixtures and the NCAA keeps no box
        // score for one, so they were excluded by accident until the schedule
        // parser learned to read played rows - at which point three arrived
        // carrying the page's own scores. Counted, this reads 5-2.
        val games = listOf(
            game("2026-11-02", "Fordham", 95, 65),
            game("2026-11-06", "Middle Tenn.", 89, 45),
            game("2026-11-10", "Kentucky", 89, 69),
            game("2026-11-17", "UNLV", 102, 77),
            game("2026-10-16", "Pittsburg State (Exhibition)", 80, 62),
            game("2026-10-21", "Louisville (Exhibition)", 83, 89),
            game("2026-10-25", "Duke (Exhibition)", 84, 90),
        )

        assertEquals("4-0", recordOf(games).toString())
        assertEquals(4, played(games).size)

        // Both spellings, and nothing else.
        assertTrue(isExhibition(game("2026-10-16", "Washburn (exh.)", 70, 60)))
        assertTrue(isExhibition(game("2026-10-16", "Emporia St. (exh)", 70, 60)))
        assertFalse(isExhibition(game("2026-11-02", "Fordham", 95, 65)))
        // A bracketed suffix that is part of the school's name is not one.
        assertFalse(isExhibition(game("2026-11-02", "Miami (OH)", 95, 65)))
    }

    @Test
    fun `a record counts only games that have been played`() {
        val r = recordOf(
            listOf(
                game("2025-11-05", "Kansas City", 74, 64),
                game("2025-11-15", "Missouri", 82, 77),
                game("2025-11-28", "Georgia", 62, 68),
                game("2026-11-03", "Omaha", null, null),  // a fixture
            )
        )
        assertEquals(2, r.wins)
        assertEquals(1, r.losses)
        assertEquals(3, r.games)
        assertEquals(218, r.pointsFor)
        assertEquals(209, r.pointsAgainst)
        assertEquals(3.0, r.margin, 0.01)
    }

    @Test
    fun `site splits keep neutral separate from home and away`() {
        val splits = siteSplits(
            listOf(
                game("2025-11-05", "Kansas City", 74, 64, site = "home"),
                game("2025-12-14", "Denver", 77, 38, site = "home"),
                game("2025-12-03", "Northwestern", 74, 62, site = "away"),
                game("2025-11-28", "Georgia", 62, 68, site = "neutral"),
            )
        ).associate { it.label to it.record }
        assertEquals("2-0", splits.getValue("Home").toString())
        assertEquals("1-0", splits.getValue("Road").toString())
        // A neutral floor is neither home nor away, and is not folded into one.
        assertEquals("0-1", splits.getValue("Neutral").toString())
    }

    @Test
    fun `conference splits use the flag, not the opponent's name`() {
        val splits = conferenceSplits(
            listOf(
                game("2026-01-14", "Oklahoma St.", 76, 85, conference = true),
                game("2026-01-11", "Baylor", 64, 79, conference = true),
                // A Big 12 opponent, but in the conference tournament — not
                // part of the standings record.
                game("2026-03-05", "Colorado", 60, 71, conference = false),
                game("2025-11-05", "Kansas City", 74, 64, conference = false),
            )
        ).associate { it.label to it.record }
        assertEquals("0-2", splits.getValue("Big 12").toString())
        assertEquals("1-1", splits.getValue("Non-conference").toString())
    }

    @Test
    fun `margin splits separate the coin flips from the blowouts`() {
        val splits = marginSplits(
            listOf(
                game("a", "A", 58, 59),   // 1
                game("b", "B", 73, 70),   // 3
                game("c", "C", 74, 62),   // 12
                game("d", "D", 107, 39),  // 68
            )
        ).associate { it.label to it.record }
        assertEquals("1-1", splits.getValue("Within 5").toString())
        assertEquals("1-0", splits.getValue("By 6-15").toString())
        assertEquals("1-0", splits.getValue("By 16+").toString())
    }

    @Test
    fun `period scores parse, and a malformed one yields nothing at all`() {
        assertEquals(
            listOf(38 to 31, 36 to 33),
            parsePeriods("38-31, 36-33")
        )
        // Three periods: the game went to overtime.
        assertEquals(3, parsePeriods("35-35, 30-32, 8-3").size)
        // Part of a half table is worse than none: a partial parse would
        // silently skew every total built on it.
        assertTrue(parsePeriods("38-31, oops").isEmpty())
        assertTrue(parsePeriods("8-11-3").isEmpty())
        assertTrue(parsePeriods(null).isEmpty())
        assertTrue(parsePeriods("").isEmpty())
    }

    @Test
    fun `half splits label regulation and overtime differently`() {
        val halves = halfSplits(
            listOf(
                game("a", "A", 74, 64, periods = "38-31, 36-33"),
                game("b", "B", 73, 70, periods = "35-30, 30-35, 8-5"),
            )
        )
        assertEquals(listOf("H1", "H2", "OT"), halves.map { it.label })
        val h2 = halves.single { it.label == "H2" }
        assertEquals(66, h2.pointsFor)       // 36 + 30
        assertEquals(68, h2.pointsAgainst)   // 33 + 35
        assertEquals(1, h2.won)
        assertEquals(1, h2.lost)
        // Only the game that needed one contributes to overtime.
        assertEquals(1, halves.single { it.label == "OT" }.games)
    }

    @Test
    fun `cumulative half margin shows where games are decided`() {
        val running = cumulativeHalfMargin(
            listOf(
                game("a", "A", 74, 64, periods = "38-31, 36-33"),
            )
        )
        // +7 at the break, +10 at the buzzer.
        assertEquals(listOf("H1" to 7, "H2" to 10), running)
    }

    @Test
    fun `halftime splits read the first half, not the whole game`() {
        val splits = halftimeSplits(
            listOf(
                // Led at half and won.
                game("a", "A", 74, 64, periods = "38-31, 36-33"),
                // Trailed at half and still won. This is the case that catches
                // the women's app's periods[0] + periods[1]: that sum is this
                // game's FINAL score, 74-62, which reads as leading.
                game("b", "B", 74, 62, periods = "30-36, 44-26"),
            )
        ).associate { it.label to it.record }
        assertEquals("1-0", splits.getValue("Leading at half").toString())
        assertEquals("1-0", splits.getValue("Trailing at half").toString())
    }

    @Test
    fun `a game with no period scores is skipped rather than counted as level`() {
        val splits = halftimeSplits(
            listOf(
                game("a", "A", 74, 64, periods = null),
                game("b", "B", 80, 70, periods = "40-35, 40-35"),
            )
        )
        assertEquals(1, splits.sumOf { it.record.games })
        assertEquals("Leading at half", splits.single().label)
    }
}
