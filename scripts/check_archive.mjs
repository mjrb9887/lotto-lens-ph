import assert from 'node:assert/strict';
import {fetchDraw} from '../worker/archive.mjs';
for (const [date, game, expected] of [
  ['2026-01-01', '6/42', [34,35,38,1,18,41]],
  ['2023-01-03', '6/42', [40,25,28,13,36,39]]
]) {
  const result = await fetchDraw(date, game, event => console.log(event.message));
  assert.equal(result.type, 'result');
  assert.deepEqual(result.result.numbers, expected);
  console.log(`PASS ${game} ${date} — ${result.result.source_label}`);
}
