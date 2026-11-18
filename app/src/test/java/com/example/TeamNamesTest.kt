package com.example

import com.example.data.normTeam
import com.example.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * normTeam() must key every team exactly as the seed's norm_team() does.
 *
 * Opponent rosters are stored under the seed's key and looked up here under
 * this one, and a synced game is matched to the row on the phone by it. The
 * two drifted: the state-name rule reached the seed's copy and not this one,
 * so "Middle Tenn." and "Middle Tennessee" were one school to the seed and two
 * on the phone. scripts/fixtures/team-keys.json is the seed's own answer for
 * the whole Division I field and every opponent a seed has carried.
 * test_seed_text.py checks that the file is current, and the dashboard's copy
 * is checked against the same file by docs/team-names.test.mjs.
 */
class TeamNamesTest {

    private fun fixture(): JSONObject {
        // Gradle runs these from the app module's directory.
        val file = listOf("../scripts/fixtures/team-keys.json", "scripts/fixtures/team-keys.json")
            .map(::File).firstOrNull { it.exists() }
        assertTrue("scripts/fixtures/team-keys.json not found from ${File(".").absolutePath}", file != null)
        return JSONObject(file!!.readText())
    }

    @Test
    fun `every team is keyed exactly as the seed keys it`() {
        val keys = fixture()
        assertTrue("the fixture should hold the whole field", keys.length() > 365)
        val wrong = keys.keys().asSequence()
            .filter { normTeam(it) != keys.getString(it) }
            .map { "\"$it\": seed \"${keys.getString(it)}\", app \"${normTeam(it)}\"" }
            .toList()
        assertEquals(emptyList<String>(), wrong)
    }

    @Test
    fun `the cases each rule is for`() {
        assertEquals(normTeam("Middle Tenn."), normTeam("Middle Tennessee"))
        assertEquals(normTeam("UNI"), normTeam("Northern Iowa"))
        assertEquals(normTeam("New Orleans"), normTeam("LSU New Orleans"))
        // Collapsed, never expanded: these two would break.
        assertEquals("ole miss", normTeam("Ole Miss"))
        assertEquals("la salle", normTeam("La Salle"))
        // An exhibition is not a meeting.
        assertNotEquals(normTeam("Duke"), normTeam("Duke (Exhibition)"))
        // An alias is a whole name, never part of one.
        assertEquals("northern iowa (exh)", normTeam("Northern Iowa (exh.)"))
    }
}
