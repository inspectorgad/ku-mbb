import unittest

from seed_text import fix_mojibake, norm_name, norm_team


class FixMojibake(unittest.TestCase):
    """Names the NCAA feed delivered corrupted, and what must come back."""

    def test_repairs_the_common_latin_1_case(self):
        self.assertEqual(fix_mojibake("AnaÃ«lle Dutat"), "Anaëlle Dutat")

    def test_repairs_a_name_carrying_a_euro_sign(self):
        # The case that was shipping wrong. Byte 0xA4 comes back as €, which
        # has no Latin-1 encoding at all, so the repair raised and gave up —
        # leaving this name visibly mangled in the Colorado box score.
        self.assertEqual(fix_mojibake("Isa HÃ€mÃ€lÃ€inen"), "Isa Hämäläinen")

    def test_does_not_take_the_cp1252_reading_of_a_euro_sign(self):
        # cp1252 can also encode €, to a different byte, and would rebuild this
        # as "HÀmÀlÀinen" — wrong, and clean enough to pass the sanity check.
        # Codec order is what prevents it, so pin the outcome.
        self.assertNotIn("À", fix_mojibake("Isa HÃ€mÃ€lÃ€inen"))

    def test_repairs_a_name_carrying_a_caron(self):
        self.assertEqual(fix_mojibake("Å½iva Labinjan"), "Živa Labinjan")

    def test_leaves_clean_names_alone(self):
        for name in ("Anaëlle Dutat", "S'Mya Nichols", "Živa Labinjan", ""):
            self.assertEqual(fix_mojibake(name), name)
        self.assertIsNone(fix_mojibake(None))

    def test_passes_through_what_it_cannot_repair(self):
        # A name mangled further by a bad guess stops matching that player's
        # other rows, which is worse than showing the wrong letters.
        self.assertEqual(fix_mojibake("Ãx"), "Ãx")


class NormName(unittest.TestCase):

    def test_folds_accents_case_and_punctuation(self):
        self.assertEqual(norm_name("Anaëlle Dutat"), norm_name("ANAELLE DUTAT"))
        self.assertEqual(norm_name("D'Shara Booker"), norm_name("DShara Booker"))

    def test_mojibake_happens_to_fold_to_the_same_key(self):
        # Not by design: NFKD decomposes Ã to A plus a combining tilde, the
        # mark is stripped, and € is dropped as a non-letter. It holds for the
        # a-family and not for others, which is why names are repaired before
        # they are keyed rather than relying on this.
        self.assertEqual(norm_name("Isa HÃ€mÃ€lÃ€inen"), norm_name("Isa Hämäläinen"))

    def test_distinct_players_stay_distinct(self):
        self.assertNotEqual(norm_name("Kyndall Hunter"), norm_name("Jemma Hunter"))


class NormTeam(unittest.TestCase):

    def test_state_and_st_are_one_school(self):
        self.assertEqual(norm_team("South Dakota State"), norm_team("South Dakota St."))
        self.assertEqual(norm_team("Iowa State"), norm_team("Iowa St."))

    def test_the_word_university_is_dropped(self):
        # Which is why an opponent-sites entry for this school is keyed "lamar"
        # — spelling it out there would never be looked up.
        self.assertEqual(norm_team("Lamar University"), "lamar")

    def test_poll_votes_are_stripped(self):
        self.assertEqual(norm_team("Baylor (12)"), "baylor")

    def test_an_exhibition_keeps_its_suffix(self):
        # These are a different fixture from a regular-season meeting and must
        # not collapse onto one; it also means a sites entry would need the
        # suffix to match, and an exhibition has no box score to attach to.
        self.assertEqual(norm_team("Northeastern State (exh.)"), "northeastern st (exh)")

    def test_an_abbreviated_state_name_matches_the_spelled_out_one(self):
        # The NCAA feed abbreviates a state name inside a school's name where
        # kuathletics spells it out. Keyed apart, the fixture and its own box
        # score become two games on the same night - which is what happened to
        # Middle Tennessee on 2026-11-06 as soon as the parser learned to read
        # games already played.
        self.assertEqual(norm_team("Middle Tennessee"), norm_team("Middle Tenn."))
        self.assertEqual(norm_team("North Carolina"), norm_team("North Caro."))
        self.assertEqual(norm_team("Western Kentucky"), norm_team("Western Ky."))

    def test_a_state_abbreviation_is_never_expanded_into_a_name(self):
        # Collapsing the long form cannot invent a word; expanding the short
        # one would. These are the two that would break.
        self.assertEqual(norm_team("Ole Miss"), "ole miss")
        self.assertEqual(norm_team("La Salle"), "la salle")


    def test_a_school_the_ncaa_renames_matches_the_page(self):
        # No rule reconciles these; each is an alias. Unmatched, Northern Iowa
        # had no win chance, and once played its "UNI" box score would have
        # keyed apart from the "Northern Iowa" fixture - two games on one night.
        self.assertEqual(norm_team("Northern Iowa"), norm_team("UNI"))
        self.assertEqual(norm_team("LSU New Orleans"), norm_team("New Orleans"))
        # An alias matches a whole name, never part of one.
        self.assertEqual(norm_team("Northern Iowa (exh.)"), "northern iowa (exh)")


class NormTeamKeepsTeamsApart(unittest.TestCase):
    """Any collapsing rule can merge two real schools. This proves it does not.

    Run over the whole Division I field rather than a handful of examples: if
    two of the NET table's names ever come out with the same key, every number
    computed for one of them is being attributed to the other.
    """

    def test_no_two_division_one_teams_share_a_key(self):
        import collections
        import json
        import os

        path = os.path.join(os.path.dirname(__file__), "..",
                            "scraped", "rankings-net.json")
        if not os.path.exists(path):
            self.skipTest("no NET table scraped yet")
        with open(path) as f:
            names = [r["School"] for r in json.load(f)["data"]]

        self.assertGreater(len(names), 300, "the NET table should be the whole field")

        by_key = collections.defaultdict(set)
        for name in names:
            by_key[norm_team(name)].add(name)
        collisions = {k: sorted(v) for k, v in by_key.items() if len(v) > 1}

        self.assertEqual(collisions, {}, f"these teams share a key: {collisions}")


if __name__ == "__main__":
    unittest.main()
