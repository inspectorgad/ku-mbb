// The team-name rule exists three times: norm_team() in scripts/seed_text.py,
// which keys the seed; normTeam() in TeamNames.kt, which the apps match games
// and rosters with; and normTeam() in the dashboard. They must agree exactly,
// because an opponent's roster is stored under the seed's key and looked up
// under this one. They did not agree for a while. The state-name rule reached
// the seed's copy only, so "Middle Tenn." and "Middle Tennessee" were one
// school to the seed and two everywhere else.
//
// scripts/fixtures/team-keys.json is the seed's key for every Division I name
// and every opponent the seed has carried. This runs the dashboard's own code,
// cut from the template, against all of it.
//
// Run with:  node --test docs/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const template = fs.readFileSync(new URL('./dashboard.template.html', import.meta.url), 'utf8');
const keys = JSON.parse(fs.readFileSync(
  new URL('../scripts/fixtures/team-keys.json', import.meta.url), 'utf8'));

function dashboardNormTeam() {
  const m = /\/\/ BEGIN normTeam\n([\s\S]*?)\/\/ END normTeam/.exec(template);
  assert.ok(m, 'the BEGIN/END normTeam markers are missing from dashboard.template.html');
  return new Function(`${m[1]}\nreturn normTeam;`)();
}

test('the dashboard keys every team exactly as the seed does', () => {
  const normTeam = dashboardNormTeam();
  assert.ok(Object.keys(keys).length > 365, 'the fixture should hold the whole field');
  const wrong = Object.entries(keys)
    .filter(([name, key]) => normTeam(name) !== key)
    .map(([name, key]) => `${JSON.stringify(name)}: seed "${key}", dashboard "${normTeam(name)}"`);
  assert.deepEqual(wrong, []);
});

test('the cases each rule is for', () => {
  const normTeam = dashboardNormTeam();
  assert.equal(normTeam('Middle Tennessee'), normTeam('Middle Tenn.'));
  assert.equal(normTeam('Northern Iowa'), normTeam('UNI'));
  assert.equal(normTeam('Ole Miss'), 'ole miss');
  assert.notEqual(normTeam('Duke (Exhibition)'), normTeam('Duke'));
  assert.equal(normTeam(null), '');
});
