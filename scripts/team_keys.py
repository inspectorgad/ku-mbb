#!/usr/bin/env python3
"""Writes scripts/fixtures/team-keys.json: the seed's key for every team name
the apps have to match.

norm_team() here keys the seed. The Kotlin normTeam() and the dashboard's keep
their own copies, because neither can call Python, and they must give the same
answer for every name, or an opponent's roster stored under the seed's key is
never found and a game stops matching the row already on a phone. They drifted
once: the state-name rule reached this copy and not the other two.

So the answer is written down once, here, from this copy, and TeamNamesTest.kt,
docs/team-names.test.mjs and test_seed_text.py each check against it. The
names: the whole Division I field from both NET tables, every opponent the
seed has ever carried, the poll, and the cases each rule exists for.

Run it after changing norm_team(): python3 scripts/team_keys.py
"""
import json
import os
import subprocess

from seed_text import norm_team

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "scripts", "fixtures", "team-keys.json")

# The shapes each rule is there for, in case the scraped tables ever stop
# carrying an example of one.
CASES = [
    "South Dakota State", "South Dakota St.", "Lamar University", "Baylor (12)",
    "Northeastern State (exh.)", "Duke (Exhibition)", "Middle Tennessee",
    "Middle Tenn.", "North Carolina", "North Caro.", "Ole Miss", "La Salle",
    "Miami (OH)", "Northern Iowa", "UNI", "LSU New Orleans", "New Orleans",
    "Northern Iowa (exh.)", "  Kansas   State ", "", "TBD", "Houston/Florida",
]


def names():
    found = set(CASES)
    scraped = os.path.join(ROOT, "scraped")
    for f in ("rankings-net.json", "rankings-net-2025-26.json"):
        try:
            with open(os.path.join(scraped, f)) as fh:
                found.update(r["School"] for r in json.load(fh)["data"])
        except (OSError, KeyError, json.JSONDecodeError):
            pass
    try:
        with open(os.path.join(scraped, "rankings-ap.json")) as fh:
            for r in json.load(fh).get("data", []):
                found.update(v for k, v in r.items() if k.lower() in ("school", "team") and v)
    except (OSError, json.JSONDecodeError):
        pass
    # Every opponent any committed seed has carried, so a name a phone may
    # still hold from an old sync is covered too.
    seed = "app/src/main/assets/seed.json"
    revs = subprocess.run(["git", "-C", ROOT, "log", "--format=%h", "--", seed],
                          capture_output=True, text=True).stdout.split()
    for rev in revs:
        out = subprocess.run(["git", "-C", ROOT, "show", f"{rev}:{seed}"],
                             capture_output=True, text=True).stdout
        try:
            found.update(g["opponent"] for g in json.loads(out).get("games", []))
        except json.JSONDecodeError:
            pass
    return found


def build(all_names):
    return {n: norm_team(n) for n in sorted(all_names)}


if __name__ == "__main__":
    keys = build(names())
    with open(OUT, "w") as fh:
        json.dump(keys, fh, indent=0, ensure_ascii=False, sort_keys=True)
        fh.write("\n")
    print(f"{OUT}: {len(keys)} names")
