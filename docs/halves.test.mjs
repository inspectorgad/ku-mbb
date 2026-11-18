// The halves rules exist twice — once in the Kotlin the apps run, once in the
// JavaScript this dashboard runs — and they are supposed to agree. Nothing at
// build time joins them, so a change to one side is invisible until someone
// reads both files side by side. That is exactly how the bug this guards
// against got in: the women's app worked out the halftime score as
// periods[0] + periods[1], which is Q1 + Q2 for it and THE FINAL SCORE for a
// men's game, and the same line appears in three places.
//
// Left wrong, the "At the half" split silently restates the win-loss record —
// every win filed under "leading at half", by definition — and no test fails,
// because nothing crashes and every number still adds up.
//
// Run with:  node --test docs/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const TEMPLATE = new URL('./dashboard.template.html', import.meta.url);
const FACTS_KT = new URL(
  '../shared/src/commonMain/kotlin/com/example/stats/GameFacts.kt', import.meta.url
);
const SPLITS_KT = new URL(
  '../shared/src/commonMain/kotlin/com/example/stats/Splits.kt', import.meta.url
);

const template = fs.readFileSync(TEMPLATE, 'utf8');
const factsKt = fs.readFileSync(FACTS_KT, 'utf8');
const splitsKt = fs.readFileSync(SPLITS_KT, 'utf8');

test('both sides agree on how big a margin is worth printing', () => {
  const js = /const HALF_SWING = (\d+);/.exec(template);
  const kt = /private const val HALF_SWING = (\d+)/.exec(factsKt);

  assert.ok(js, 'HALF_SWING is not in dashboard.template.html');
  assert.ok(kt, 'HALF_SWING is not in GameFacts.kt');
  assert.equal(js[1], kt[1], 'the two HALF_SWING values have drifted apart');
});

test('neither side reads two periods as the half', () => {
  // The shape that was wrong: adding period 0 and period 1 and calling the sum
  // halftime. Written without spaces so formatting cannot hide it.
  const summed = /p(?:eriods)?\[0\]\s*(?:\.first|\[0\])?\s*\+\s*p(?:eriods)?\[1\]/;

  for (const [name, src] of [
    ['dashboard.template.html', template],
    ['GameFacts.kt', factsKt],
    ['Splits.kt', splitsKt],
  ]) {
    assert.doesNotMatch(src, summed, `${name} still adds two periods to get halftime`);
  }
});

test('the dashboard labels two halves, not four quarters', () => {
  // Both label sites: the season card and the single-game sheet.
  assert.match(template, /i < 2 \? `H\$\{i \+ 1\}`/);
  assert.doesNotMatch(template, /i < 4 \? `Q\$\{i \+ 1\}`/);
  // And the Kotlin's own label function.
  assert.match(splitsKt, /index < 2 -> "H\$\{index \+ 1\}"/);
});

test("the dashboard halftime split survives a real game", () => {
  // Lifted out of the template and run, so this is the shipped code rather
  // than a copy of it. KU trailed 30-36 at the break and won 74-62: a reading
  // that added both periods would see 74-62 and call it leading.
  const parse = /function parsePeriods\(text\) \{[\s\S]*?\n\}/.exec(template);
  assert.ok(parse, 'parsePeriods is not in the template');
  const parsePeriods = new Function(`${parse[0]}; return parsePeriods;`)();

  const p = parsePeriods('30-36, 44-26');
  assert.deepEqual(p, [[30, 36], [44, 26]]);

  const [ours, theirs] = p[0];
  assert.ok(ours < theirs, 'the first period is the half, and KU trailed in it');

  // Overtime adds a third period and must not disturb the first.
  assert.deepEqual(parsePeriods('35-30, 30-35, 8-5')[0], [35, 30]);
});
