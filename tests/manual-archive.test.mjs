import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {retrieve} from '../scripts/retrieve_archive.mjs';

test('manual publication contains real progress, correct draw and bounded expiry', async () => {
  const html = await readFile(new URL('fixtures/summit.html', import.meta.url), 'utf8');
  const states = [];
  const result = await retrieve('2023-01-03', '6/42', state => states.push(state), async url =>
    url.includes('gmanetwork') ? new Response('', {status:404}) : new Response(html));
  assert.equal(result.type, 'result');
  assert.deepEqual(states.at(-1).result.numbers, [40,25,28,13,36,39]);
  assert.ok(states.slice(0,-1).every(state => state.type === 'progress'));
  assert.ok(states.every(state => state.date === '2023-01-03' && state.game === '6/42'));
  assert.ok(Date.parse(states.at(-1).expires_at) > Date.now());
  assert.ok(Date.parse(states.at(-1).expires_at) <= Date.now()+86400000);
});
test('invalid manual inputs never publish or fetch', async () => {
  const unexpected = () => {throw new Error('Should not be called');};
  await assert.rejects(() => retrieve('2023-02-30', '6/42', unexpected, unexpected));
  await assert.rejects(() => retrieve('2023-01-03', '6/99', unexpected, unexpected));
});
test('known conflict is published as a failure without guessed numbers', async () => {
  const states = [];
  await retrieve('2026-07-13', '6/55', state => states.push(state));
  assert.equal(states.at(-1).type, 'error');
  assert.equal(states.at(-1).result, undefined);
});
