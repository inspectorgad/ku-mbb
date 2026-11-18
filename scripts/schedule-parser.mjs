// Reads kuathletics.com's schedule page (as rendered text, one line per line)
// into fixtures. Lives apart from the scraper so it can be tested against a
// saved page — scripts/schedule-parser.test.mjs runs it on a frozen copy —
// because the only other way to find out a change broke it is a scrape that
// quietly finds fewer games.
//
// The page carries two independent listings. The site-wide rotator states the
// year outright but covers only the next few weeks and names no venue; the
// schedule table below it covers the whole season with venue, city and TV but
// has to infer the year. Both are read and merged.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// "6 p.m. CT", "12:30 p.m. CT". A row with no tip time yet (conference games
// before the TV windows are set) has none of these, and gets null rather than
// a guessed hour.
//
// The page is typed by hand and once printed Indiana State's tip on Dec 22 2026
// as "5 p.m.. CT". An exact pattern dropped the time without a word, so the
// trailing period may repeat. Nothing looser than that: "6:30 or 9 p.m. CT"
// must still read as no time.
const TIME = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.m\.+\s*(CT|ET|MT|PT)?$/i;

/** "6:30 p.m." -> "18:30", "11 a.m." -> "11:00"; null for anything else. */
export function to24h(text) {
  const m = TIME.exec((text || '').trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === 'p') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
}

// kuathletics writes cities AP-style ("Lawrence, Kan."); NCAA box scores use
// postal codes ("Lawrence, KS"). Normalizing here keeps one place from being
// spelled two ways in the same table once a fixture becomes a result. An
// abbreviation that is not in the map is left exactly as written.
const POSTAL = {
  Ala: 'AL', Alaska: 'AK', Ariz: 'AZ', Ark: 'AR', Calif: 'CA', Colo: 'CO',
  Conn: 'CT', Del: 'DE', Fla: 'FL', Ga: 'GA', Hawaii: 'HI', Idaho: 'ID',
  Ill: 'IL', Ind: 'IN', Iowa: 'IA', Kan: 'KS', Ky: 'KY', La: 'LA',
  Maine: 'ME', Md: 'MD', Mass: 'MA', Mich: 'MI', Minn: 'MN', Miss: 'MS',
  Mo: 'MO', Mont: 'MT', Neb: 'NE', Nev: 'NV', Ohio: 'OH', Okla: 'OK',
  Ore: 'OR', Pa: 'PA', Tenn: 'TN', Texas: 'TX', Utah: 'UT', Vt: 'VT',
  Va: 'VA', Wash: 'WA', Wis: 'WI', Wyo: 'WY',
  'N.C.': 'NC', 'N.D.': 'ND', 'N.H.': 'NH', 'N.J.': 'NJ', 'N.M.': 'NM',
  'N.Y.': 'NY', 'R.I.': 'RI', 'S.C.': 'SC', 'S.D.': 'SD', 'W. Va.': 'WV',
  'D.C.': 'DC',
};

/** "Sioux Falls, S.D." -> "Sioux Falls, SD"; unknown regions pass through. */
export function postalCity(text) {
  const m = /^(.*?),\s*(.+?)\.?$/.exec((text || '').trim());
  if (!m) return text || null;
  const region = m[2].trim();
  const code = POSTAL[region] ?? POSTAL[`${region}.`] ?? POSTAL[region.replace(/\.$/, '')];
  return code ? `${m[1]}, ${code}` : text.trim();
}

// "#25 Nebraska" is how the schedule page prints a ranked opponent. The rank
// is display, not part of the school's name, and leaving it on the name is not
// cosmetic: every other source writes plain "Nebraska", so the fixture keys
// differently from its own box score, the win model cannot find the team in
// the NET table, and the non-Division-I check would call it non-Division I.
// Split out here, at the one place the page is read, and carried as data.
const RANKED = /^#(\d{1,2})\s+/;
export function splitRank(name) {
  const t = (name || '').trim();
  const m = RANKED.exec(t);
  return m ? { opponent: t.slice(m[0].length).trim(), opponentRank: Number(m[1]) }
    : { opponent: t, opponentRank: null };
}

export function parseSchedule(schedText) {
  const fixtures = [];

  // Source 1 — the rotator's accessibility labels:
  // "Upcoming Event: Men's Basketball versus Omaha on November 3, 2026 at 6:30 p.m. CT"
  const re = /Upcoming Event: Men's Basketball (versus|at) (.+?) on ([A-Z][a-z]+) (\d{1,2}), (\d{4})(?: at ([^\n]+?))?\s*$/gm;
  for (const m of schedText.matchAll(re)) {
    const month = MONTHS.indexOf(m[3]) + 1;
    if (month === 0) continue;
    const date = `${m[5]}-${String(month).padStart(2, '0')}-${String(m[4]).padStart(2, '0')}`;
    fixtures.push({
      date,
      ...splitRank(m[2]),
      away: m[1] === 'at',
      time: to24h(m[6]),
      venue: null,
      city: null,
      tv: null,
      event: null,
    });
  }

  // Source 2 — the schedule table's rows, which cover the whole season. Each
  // row puts the side and opponent BEFORE its date and the time after:
  //     MarketBeat Invitational / vs / Nebraska / Sanford Pentagon /
  //     Sioux Falls, S.D. / TV: BTN+ / Nov 14 / (Sat) / 3:30 p.m. CT / History
  //
  // A basketball season spans two calendar years, so the page title gives the
  // first ("2026-27 Men's Basketball Schedule") and Jan-Jul belongs to the
  // year after it.
  const seasonYear = Number(/\b(20\d{2})\b/.exec(schedText)?.[1]) || new Date().getUTCFullYear();
  // "Nov 23", and "Nov 6(Fri)" once the game has been played: a finished row
  // glues the weekday on, where an upcoming one puts it on its own line. With
  // the weekday optional this matches both. Anchored to the end on purpose -
  // without that the pattern would also take the first half of a date range.
  //
  // This is not cosmetic. Anchored to "Nov 6" alone it matched no finished
  // game at all, so the schedule page contributed nothing for anything
  // already played: six of this season's rows, three of them real games. The
  // NCAA feed usually covers those, but it does not always - a 502 hid Middle
  // Tennessee on 6 Nov, and with the page silent too, nothing had it.
  const SHORT = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(?:\s*\([A-Za-z]{3,}\.?\))?$/;
  // "Lawrence, Kan." / "Cancun, Mexico" — a place, then a region, nothing else.
  const CITY = /^[A-Z][A-Za-z.'\- ]*, ?[A-Z][A-Za-z. ]*\.?$/;
  // "W, 80-62" on a game that has been played. KU's points are always first,
  // whichever way it went. The W/L is redundant beside the numbers, which is
  // what makes it worth reading: if they disagree the row is not understood,
  // and no result at all beats a backwards one.
  const RESULT = /^([WL]), (\d{1,3})-(\d{1,3})$/;
  const lines = schedText.split('\n').map((l) => l.trim());
  // Which date lines this pass used, so the one below can tell a row it has
  // already read from a row it has never seen.
  const usedDates = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== 'vs' && lines[i] !== 'at') continue;
    let j = i + 1;
    while (j < lines.length && !lines[j]) j++;
    const { opponent, opponentRank } = splitRank(lines[j]);
    if (!opponent) continue;
    // The date follows within the venue/TV block; a bounded look-ahead keeps a
    // row without one from adopting the next row's date.
    let found = null;
    let dateAt = -1;
    for (let k = j + 1; k < Math.min(j + 14, lines.length); k++) {
      const m = SHORT.exec(lines[k]);
      if (m) { found = m; dateAt = k; break; }
    }
    if (!found) continue;
    const month = MONTHS.findIndex((name) => name.startsWith(found[1])) + 1;
    if (month === 0) continue;
    const year = month >= 8 ? seasonYear : seasonYear + 1;
    usedDates.add(dateAt);

    // Between the opponent and the date sits the venue, the city, and an
    // optional broadcast note.
    const between = [];
    let tv = null;
    let teamScore = null;
    let opponentScore = null;
    for (let k = j + 1; k < dateAt; k++) {
      const line = lines[k];
      if (!line) continue;
      if (line.startsWith('TV:')) { tv = line.slice(3).trim() || null; continue; }
      const r = RESULT.exec(line);
      if (r) {
        const ours = Number(r[2]);
        const theirs = Number(r[3]);
        // Keep it only if the letter and the numbers tell the same story.
        if ((r[1] === 'W') === (ours > theirs)) {
          teamScore = ours;
          opponentScore = theirs;
        }
        continue;
      }
      between.push(line);
    }
    // The tip time sits just after the date and its weekday. Looked for in the
    // next few lines only, so a row with no time cannot borrow the one below.
    let time = null;
    for (let k = dateAt + 1; k < Math.min(dateAt + 5, lines.length); k++) {
      if (SHORT.test(lines[k]) || lines[k] === 'vs' || lines[k] === 'at') break;
      const t = to24h(lines[k]);
      if (t) { time = t; break; }
    }
    // A tournament name sits on the line above "vs"/"at" when there is one
    // ("Cancun Challenge"). Anything that is obviously page furniture is not.
    const above = lines[i - 1] || '';
    const event = above && !/^(History|Skip Ad|MENU|Explore |Sponsored|Add To|Text Only|Live Stats|Game Info|Game Center|Listen)/.test(above) &&
      !SHORT.test(above) && !CITY.test(above) && above.length < 60 && /[A-Za-z]/.test(above)
      ? above : null;

    const cityAt = between.findIndex((line) => CITY.test(line));
    fixtures.push({
      date: `${year}-${String(month).padStart(2, '0')}-${String(found[2]).padStart(2, '0')}`,
      opponent,
      opponentRank,
      away: lines[i] === 'at',
      city: cityAt >= 0 ? postalCity(between[cityAt]) : null,
      venue: cityAt > 0 ? between[cityAt - 1] : null,
      time,
      tv,
      event,
      teamScore,
      opponentScore,
    });
  }

  // Source 3 — table rows with no "vs"/"at" line at all.
  //
  // kuathletics leaves the side marker off when it does not yet know which
  // side we are. An undrawn bracket prints the opponent as "TBD", or as both
  // teams who might win into it ("Auburn/West Virginia"), and no "vs":
  //
  //     Auburn/West Virginia / Michelob Ultra Arena / Las Vegas, Nev. /
  //     TV: ESPN Family / Nov 18 / (Wed) / 6:30 or 9 p.m. CT
  //
  // The loop above anchors every row on that marker, so those rows are
  // invisible to it. The game then survives only as its rotator entry, which
  // carries no venue - and siteOf reads a fixture with no venue as a home
  // game. Three of this season's first four are in Las Vegas, so that is not
  // a rounding error: the app showed two neutral-floor tournament games as
  // Allen Fieldhouse home games.
  //
  // Loosening the anchor above would start matching prose. Instead each date
  // line that pass did NOT consume is read for the same venue/city/TV block,
  // and what it finds fills the blanks on the fixture already standing on
  // that date. It never invents a fixture and never overwrites a value.
  for (let k = 0; k < lines.length; k++) {
    if (usedDates.has(k)) continue;
    const m = SHORT.exec(lines[k]);
    if (!m) continue;
    const month = MONTHS.findIndex((name) => name.startsWith(m[1])) + 1;
    if (month === 0) continue;
    const year = month >= 8 ? seasonYear : seasonYear + 1;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
    const waiting = fixtures.filter((f) => f.date === date && !f.venue);
    if (!waiting.length) continue;

    // Backwards to the row's own block, stopping at the previous date line so
    // one row cannot read the row above it.
    const block = [];
    let tv = null;
    for (let b = k - 1; b >= 0 && k - b < 14; b--) {
      if (SHORT.test(lines[b])) break;
      const line = lines[b];
      if (!line) continue;
      if (line.startsWith('TV:')) tv = line.slice(3).trim() || null;
      else block.unshift(line);
    }
    const cityAt = block.findIndex((line) => CITY.test(line));
    if (cityAt <= 0) continue;
    const venue = block[cityAt - 1];
    const city = postalCity(block[cityAt]);

    // The tip time, if the page has settled on one. A bracket that has not
    // been drawn often prints "6:30 or 9 p.m. CT", which to24h rejects - and
    // should, since neither hour is the answer.
    let time = null;
    for (let f = k + 1; f < Math.min(k + 5, lines.length); f++) {
      if (SHORT.test(lines[f])) break;
      const t = to24h(lines[f]);
      if (t) { time = t; break; }
    }

    for (const f of waiting) {
      f.venue = venue;
      if (!f.city) f.city = city;
      if (!f.tv) f.tv = tv;
      if (!f.time) f.time = time;
    }
  }

  // De-dup. The rotator repeats on every page view, and the games it names
  // are in the table below it too.
  //
  // A rotator row is matched to a table row by date ALONE, not by date and
  // opponent. The two listings can disagree about who it is: the rotator says
  // "TBD" while a tournament bracket is undrawn, and the table already names
  // the team it will be. Keyed on the name, that one game became two - a real
  // fixture and a ghost "vs TBD" with no venue, which siteOf then called a
  // home game. Both reached the seed, the dashboard and every phone, and a
  // phone kept its copy even after the page filled the name in, because a sync
  // only adds and updates.
  //
  // The table is the listing that settles who it is: it carries the venue, the
  // city and the broadcaster, while a rotator row carries none of them and is
  // only ever ahead on the tip time. Two TABLE rows on one date would be two
  // real games, so those are still kept apart by name.
  const fromTable = fixtures.filter((f) => f.venue);
  const fromRotator = fixtures.filter((f) => !f.venue);

  const byKey = new Map();
  for (const f of fromTable) byKey.set(`${f.date}|${f.opponent.toLowerCase()}`, f);

  const tableByDate = new Map();
  for (const f of fromTable) {
    if (!tableByDate.has(f.date)) tableByDate.set(f.date, []);
    tableByDate.get(f.date).push(f);
  }

  for (const f of fromRotator) {
    const sameDate = tableByDate.get(f.date);
    if (sameDate) {
      for (const t of sameDate) {
        for (const field of ['city', 'venue', 'time', 'tv', 'event']) {
          if (!t[field] && f[field]) t[field] = f[field];
        }
      }
      continue;
    }
    // A game the table has not listed yet: kept, as it always was.
    const k = `${f.date}|${f.opponent.toLowerCase()}`;
    if (!byKey.has(k)) byKey.set(k, f);
  }
  return [...byKey.values()];
}

/**
 * Home, away or neutral for a fixture.
 *
 * The page's own "vs"/"at" says whether KU is the visiting side, but not
 * whether the host is the opponent: KU plays "vs Nebraska" at the Sanford
 * Pentagon in Sioux Falls, which is neither team's floor. So "at" means away,
 * and a "vs" anywhere other than KU's own building is a neutral floor.
 */
export function siteOf(fixture, homeVenue = 'Allen Fieldhouse', homeCity = 'Lawrence, KS') {
  if (fixture.away) return 'away';
  if (fixture.venue) return fixture.venue === homeVenue ? 'home' : 'neutral';
  // No venue named. The page does that for a showcase it has not settled a
  // building for - the Champions Classic row carries "Chicago, Ill." and
  // nothing above it - and the city still answers the question: a "vs" game
  // played anywhere but Lawrence is on neither team's floor.
  //
  // Falling straight through to "home" here is how KU v Kentucky in Chicago
  // came out a home game.
  if (fixture.city && fixture.city !== homeCity) return 'neutral';
  return 'home';
}
