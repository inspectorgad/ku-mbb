// Runs the schedule parser on a real saved page and on small hand-written
// rows, so a change that loses fixtures, tip times or venues shows up here
// instead of as a quieter schedule in the app.
//
// The page is a frozen copy in scripts/fixtures, not the live
// scraped/schedule-page.txt: that one changes as games are played, so testing
// against it would fail — and block the scrape it guards — the morning after
// the opener drops off the upcoming list.
//
// Run with:  node --test scripts/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { splitRank, parseSchedule, siteOf, to24h, postalCity } from './schedule-parser.mjs';

const page = fs.readFileSync(
  new URL('./fixtures/schedule-page-2026-11-18.txt', import.meta.url), 'utf8'
);

test('tip times read in 24-hour form, and nothing else counts as one', () => {
  assert.equal(to24h('6:30 p.m. CT'), '18:30');
  assert.equal(to24h('11 a.m. CT'), '11:00');
  assert.equal(to24h('12 p.m. CT'), '12:00');
  assert.equal(to24h('12 a.m.'), '00:00');
  assert.equal(to24h('3 p.m. CT'), '15:00');
  assert.equal(to24h('History'), null);
  assert.equal(to24h('(Sat)'), null);
  assert.equal(to24h(''), null);
});

test('AP-style regions become postal codes, unknown ones pass through', () => {
  assert.equal(postalCity('Lawrence, Kan.'), 'Lawrence, KS');
  assert.equal(postalCity('Sioux Falls, S.D.'), 'Sioux Falls, SD');
  assert.equal(postalCity('Morgantown, W. Va.'), 'Morgantown, WV');
  // Not a US state: left exactly as the page wrote it rather than mangled.
  assert.equal(postalCity('Cancun, Mexico'), 'Cancun, Mexico');
});

test('a row carries its venue, city, tip time and channel', () => {
  const row = ['MarketBeat Invitational', 'vs', 'Nebraska', '', 'Sanford Pentagon',
    'Sioux Falls, S.D.', '', 'TV: BTN+', '', 'Nov 14', '(Sat)', '', '3:30 p.m. CT',
    '', 'History'].join('\n');
  const [f] = parseSchedule(`2026-27 Men's Basketball Schedule\n${row}`);
  assert.equal(f.date, '2026-11-14');
  assert.equal(f.time, '15:30');
  assert.equal(f.venue, 'Sanford Pentagon');
  assert.equal(f.city, 'Sioux Falls, SD');
  assert.equal(f.tv, 'BTN+');
  assert.equal(f.event, 'MarketBeat Invitational');
});

test('a ranked opponent keeps its name and carries the rank beside it', () => {
  // The schedule page prints "#25 Nebraska". Left on the name, the fixture
  // keys differently from its own box score (which says "Nebraska"), the win
  // model cannot find the team in the NET table - the Nov 14 game silently
  // lost its win chance that way - and the non-Division-I check would call a
  // ranked team non-Division I.
  assert.deepEqual(splitRank('#25 Nebraska'), { opponent: 'Nebraska', opponentRank: 25 });
  assert.deepEqual(splitRank('#1 South Carolina'), { opponent: 'South Carolina', opponentRank: 1 });
  assert.deepEqual(splitRank('Nebraska'), { opponent: 'Nebraska', opponentRank: null });
  // Not every parenthesis or hash is a rank.
  assert.deepEqual(splitRank('Miami (OH)'), { opponent: 'Miami (OH)', opponentRank: null });
  assert.deepEqual(splitRank(''), { opponent: '', opponentRank: null });

  const row = ['vs', '#25 Nebraska', '', 'Sanford Pentagon', 'Sioux Falls, S.D.', '',
    'Nov 14', '(Sat)', '', '3:30 p.m. CT', '', 'History'].join('\n');
  const [f] = parseSchedule(`2026-27 Men's Basketball Schedule\n${row}`);
  assert.equal(f.opponent, 'Nebraska');
  assert.equal(f.opponentRank, 25);
});

test('the rotator and the table are one game even when they disagree on the name', () => {
  // kuathletics showed the Cancun Challenge games as "versus TBD" in its
  // site-wide rotator while the schedule table below already named the teams.
  // Keyed on date AND opponent, that made one game two: the real fixture, and
  // a ghost with no venue that siteOf then called a home game. Both reached
  // the seed, the dashboard and every phone - and a phone kept its copy after
  // the page filled the name in, because a sync only adds and updates.
  const page = [
    "2026-27 Men's Basketball Schedule",
    "Upcoming Event: Men's Basketball versus TBD on November 26, 2026",
    'Cancun Challenge', 'vs', 'Washington State', '', 'Hard Rock Hotel Rivera Maya',
    'Cancun, Mexico', '', 'TV: FloSports', '', 'Nov 26', '(Thu)', '', '3 p.m. CT', '', 'History',
  ].join('\n');

  const got = parseSchedule(page);

  assert.equal(got.length, 1);
  assert.equal(got[0].opponent, 'Washington State');
  assert.equal(got[0].venue, 'Hard Rock Hotel Rivera Maya');
  assert.equal(siteOf(got[0]), 'neutral');
});

test('a rotator game the table has not listed yet is still kept', () => {
  // The merge must not quietly drop a game that only one listing knows about.
  const page = [
    "2026-27 Men's Basketball Schedule",
    "Upcoming Event: Men's Basketball at Iowa State on January 9, 2027 at 2 p.m. CT",
  ].join('\n');

  const got = parseSchedule(page);

  assert.equal(got.length, 1);
  assert.deepEqual(
    [got[0].date, got[0].opponent, got[0].time, siteOf(got[0])],
    ['2027-01-09', 'Iowa State', '14:00', 'away']
  );
});

test('two table rows on one date stay two games', () => {
  // Only a rotator row collapses into a table row. Two real listings on the
  // same date are two real games, whatever the sport thinks of that.
  const rows = [
    'vs', 'Alpha', '', 'Allen Fieldhouse', 'Lawrence, Kan.', '', 'Dec 20', '(Sun)', '', 'History',
    'vs', 'Beta', '', 'Allen Fieldhouse', 'Lawrence, Kan.', '', 'Dec 20', '(Sun)', '', 'History',
  ].join('\n');

  const got = parseSchedule(`2026-27 Men's Basketball Schedule\n${rows}`);

  assert.deepEqual(got.map((f) => f.opponent).sort(), ['Alpha', 'Beta']);
});

test('a link label above a row is not mistaken for a tournament', () => {
  // The line above "vs" is where a tournament name sits, but it is also
  // where the page puts whatever link it last rendered. "Game Info" turned
  // up there after the fixture was captured and reached the schedule as
  // "Omaha Game Info" on the dashboard and in the app.
  const row = ['Game Info', 'vs', 'Omaha', '', 'Allen Fieldhouse',
    'Lawrence, Kan.', '', 'Nov 3', '(Tue)', '', '6:30 p.m. CT', '', 'History'].join('\n');
  const [f] = parseSchedule(`2026-27 Men's Basketball Schedule\n${row}`);
  assert.equal(f.opponent, 'Omaha');
  assert.equal(f.event, null);
});

test('a row with no tip time yet gets none, not the next row\'s', () => {
  const rows = [
    'at', 'West Virginia', '', 'WVU Coliseum', 'Morgantown, W. Va.', '', 'Dec 30', '(Wed)', '', 'History',
    'at', 'Cincinnati', '', 'Fifth Third Arena', 'Cincinnati, Ohio', '', 'Jan 2', '(Sat)', '', '1 p.m. CT',
  ].join('\n');
  const got = parseSchedule(`2026-27 Men's Basketball Schedule\n${rows}`);
  assert.equal(got.find((f) => f.opponent === 'West Virginia').time, null);
  assert.equal(got.find((f) => f.opponent === 'Cincinnati').time, '13:00');
});

test('a season spanning two years dates January from the later one', () => {
  const rows = [
    'vs', 'Texas Tech', '', 'Allen Fieldhouse', 'Lawrence, Kan.', '', 'Nov 28', '(Sat)', '', 'History',
    'at', 'Utah', '', 'Jon M. Huntsman Center', 'Salt Lake City, Utah', '', 'Jan 16', '(Sat)', '', 'History',
  ].join('\n');
  const got = parseSchedule(`2026-27 Men's Basketball Schedule\n${rows}`);
  assert.equal(got.find((f) => f.opponent === 'Texas Tech').date, '2026-11-28');
  assert.equal(got.find((f) => f.opponent === 'Utah').date, '2027-01-16');
});

test('site is home, away or neutral — "vs" alone does not mean home', () => {
  // The page says "vs Nebraska", but it is played at the Sanford Pentagon,
  // which is neither team's floor. Trusting "vs" is exactly the bug this fixes.
  assert.equal(siteOf({ away: false, venue: 'Allen Fieldhouse' }), 'home');
  assert.equal(siteOf({ away: false, venue: 'Sanford Pentagon' }), 'neutral');
  assert.equal(siteOf({ away: true, venue: 'The Barn' }), 'away');
  // A rotator-only row names no venue; the table row settles it on merge.
  assert.equal(siteOf({ away: false, venue: null }), 'home');
});

test('the saved schedule page yields the whole season', () => {
  const got = parseSchedule(page);
  // As of the 18 Nov capture of the 2026-27 men's season: 30 fixtures, every
  // one of them with a venue and a city, and 24 with a tip time. The six
  // without a time are tournament games whose hour the page has not settled
  // - two of them print "6:30 or 9 p.m. CT", which is not an hour.
  assert.equal(got.length, 30);
  assert.equal(got.filter((f) => f.venue).length, 30);
  assert.equal(got.filter((f) => f.city).length, 30);
  assert.equal(got.filter((f) => f.time).length, 24);

  const opener = got.find((f) => f.opponent === 'UNLV');
  assert.deepEqual(
    [opener.date, opener.time, opener.venue, siteOf(opener)],
    ['2026-11-17', '20:30', 'Michelob Ultra Arena', 'neutral']
  );

  // A neutral floor is neither team's, and "vs" alone does not settle it.
  for (const [opponent, venue] of [
    ['Missouri', 'T-Mobile Center'],
    ['Ohio State', 'Madison Square Garden'],
    ['Big 12 Tournament', 'T-Mobile Center'],
  ]) {
    const f = got.find((x) => x.opponent === opponent);
    assert.equal(siteOf(f), 'neutral', `${opponent} should be neutral`);
    assert.equal(f.venue, venue);
  }

  // Allen Fieldhouse is home; a conference road game is away.
  assert.equal(siteOf(got.find((f) => f.opponent === 'Denver')), 'home');
  assert.equal(siteOf(got.find((f) => f.opponent === 'Houston')), 'away');
  assert.equal(siteOf(got.find((f) => f.opponent === 'Iowa State' && f.date === '2027-02-13')), 'away');

  // Kansas State twice, home and away, on different dates.
  const ksu = got.filter((f) => f.opponent === 'Kansas State');
  assert.equal(ksu.length, 2);
  assert.deepEqual(ksu.map((f) => siteOf(f)).sort(), ['away', 'home']);
});

test('a radio link above a row is not mistaken for a tournament', () => {
  // kuathletics puts "Listen" and "Game Center" where a tournament name
  // goes. Unfiltered, the Denver game came through as the "Listen" event -
  // the same shape as the "Game Info" leak this page threw before.
  const page = [
    "2026-27 Men's Basketball Schedule",
    'Game Center', 'Listen', 'vs', 'Denver', '', 'Allen Fieldhouse',
    'Lawrence, Kan.', '', 'Nov 23', '(Mon)', '', '7 p.m. CT', '', 'History',
  ].join('\n');

  const [f] = parseSchedule(page);

  assert.equal(f.opponent, 'Denver');
  assert.equal(f.event, null);
});

test('the real page carries only genuine tournament names', () => {
  const events = [...new Set(parseSchedule(page).map((f) => f.event).filter(Boolean))];
  assert.deepEqual(events.sort(), [
    'CBS Sports Classic',
    'Dillons Sunflower Showdown',
    'Phillips 66 Big 12 Tournament',
    'Players Era',
    'StorageMart Border Showdown',
  ]);
});

test('a tournament game the table has not drawn yet still gets its venue', () => {
  // The Players Era bracket is undrawn, so the page names the opponent
  // "Auburn/West Virginia" and "TBD" and prints NO "vs" line for either - it
  // does not yet know which side we are. Those rows are invisible to a scan
  // anchored on "vs"/"at", and the games then survived only as rotator
  // entries, which carry no venue. siteOf reads a fixture with no venue as a
  // home game, so two neutral floors in Las Vegas showed as Allen Fieldhouse.
  //
  // Both must come through with their venue, and must read neutral.
  const got = parseSchedule(page);
  const undrawn = got.filter((f) => ['2026-11-18', '2026-11-19'].includes(f.date));

  assert.equal(undrawn.length, 2);
  for (const f of undrawn) {
    assert.equal(f.venue, 'Michelob Ultra Arena', `${f.date} venue`);
    assert.equal(f.city, 'Las Vegas, NV', `${f.date} city`);
    assert.equal(siteOf(f), 'neutral', `${f.date} site`);
    // "6:30 or 9 p.m. CT" is not an hour, and must not be read as one.
    assert.equal(f.time, null, `${f.date} time`);
  }
  assert.deepEqual(undrawn.map((f) => f.opponent).sort(), ['Auburn/West Virginia', 'TBD']);

  // Nothing anywhere is left guessing a home floor it was never told about.
  assert.equal(got.filter((f) => !f.venue).length, 0);
});

test('the no-marker pass invents nothing and overwrites nothing', () => {
  // It fills blanks on fixtures that already exist. A page with a stray date
  // and venue block but no game on that date must not grow one.
  const stray = [
    "2026-27 Men's Basketball Schedule",
    'vs', 'Denver', '', 'Allen Fieldhouse', 'Lawrence, Kan.', '',
    'Nov 23', '(Mon)', '', '7 p.m. CT', '',
    // A block with no fixture of its own on that date.
    'Somewhere Arena', 'Tulsa, Okla.', '', 'Dec 05', '(Sat)', '', '6 p.m. CT',
  ].join('\n');

  const got = parseSchedule(stray);

  assert.equal(got.length, 1);
  assert.equal(got[0].opponent, 'Denver');
  assert.equal(got[0].venue, 'Allen Fieldhouse');
  assert.equal(got[0].time, '19:00');
});

