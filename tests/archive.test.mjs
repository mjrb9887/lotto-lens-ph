import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parsePage, sourcesFor, validateDate, fetchDraw, boundedText} from '../worker/archive.mjs';
import worker from '../worker/index.mjs';

const gma = await readFile(new URL('fixtures/gma.html', import.meta.url), 'utf8');
const summit = await readFile(new URL('fixtures/summit.html', import.meta.url), 'utf8');

test('2026 cards have the requested date, winning numbers and provenance', () => {
  const found = parsePage(gma, '2026-01-01', sourcesFor('2026-01-01')[0]);
  assert.deepEqual(found['6/42'].numbers, [34,35,38,1,18,41]);
  assert.equal(found['6/42'].source_label, 'GMA News Online');
  assert.equal(found['6/42'].winners, null);
});
test('2023 table lookup returns the selected game', () => {
  const found = parsePage(summit, '2023-01-03', sourcesFor('2023-01-03')[1]);
  assert.deepEqual(found['6/42'].numbers, [40,25,28,13,36,39]);
  assert.equal(found['6/42'].winners, 0);
});
test('parser rejects wrong dates and invalid combinations', () => {
  const source = sourcesFor('2026-01-01')[0];
  assert.throws(() => parsePage(gma, '2026-01-02', source));
  assert.throws(() => parsePage(gma.replace('data-date="January 01, 2026"','data-date="January 02, 2026"'), '2026-01-01', source));
  for (const numbers of ['34 35 38 01 18 18', '34 35 38 01 18 43', '34 35 38 01 18', '34 35 38 01 18 41 02']) {
    assert.throws(() => parsePage(gma.replace('34 35 38 01 18 41', numbers), '2026-01-01', source));
  }
  assert.throws(() => parsePage('<title>January 01, 2026</title><p>34 35 38 01 18 41</p>', '2026-01-01', source));
});
test('invalid dates are refused before fetching', () => {
  for (const date of ['2026-02-30', '2030-01-01', '2026-1-01', '1990-01-01', '../secret']) assert.throws(() => validateDate(date));
});
test('old lookup streams real stages and falls back from GMA to Summit', async () => {
  const stages = [], urls = [];
  const result = await fetchDraw('2023-01-03', '6/42', event => stages.push(event), undefined, async url => {
    urls.push(url);
    return urls.length === 1 ? new Response('', {status:404}) : new Response(summit);
  });
  assert.equal(result.type, 'result');
  assert.equal(result.result.date, '2023-01-03');
  assert.equal(stages.filter(e => e.type === 'progress').length, 3);
});
test('missing game never returns another game or latest draw', async () => {
  const result = await fetchDraw('2026-01-01', '6/55', () => {}, undefined, async () => new Response(gma));
  assert.equal(result.type, 'not_found');
});
test('unavailable sources produce an error rather than a no-draw claim', async () => {
  const result = await fetchDraw('2026-01-01', '6/42', () => {}, undefined, async () => new Response('', {status:503}));
  assert.equal(result.type, 'error');
});
test('oversized archive bodies are refused', async () => {
  await assert.rejects(() => boundedText(new Response('12345'), 4));
});
test('Worker rejects malformed requests and disallowed browser origins', async () => {
  const env = {ALLOWED_ORIGINS: 'https://mjrb9887.github.io'};
  assert.equal((await worker.fetch(new Request('https://api.test/api/archive?date=2026-02-30&game=6/42'), env)).status, 400);
  assert.equal((await worker.fetch(new Request('https://api.test/api/archive?date=2026-01-01&game=6/42&game=6/45'), env)).status, 400);
  assert.equal((await worker.fetch(new Request('https://api.test/api/archive?date=2026-01-01&game=6/42', {headers:{Origin:'https://other.test'}}), env)).status, 403);
});
test('Worker handles rate limiting', async () => {
  const response = await worker.fetch(new Request('https://api.test/api/archive?date=2026-01-01&game=6/42'),
    {ARCHIVE_RATE_LIMITER: {limit: async () => ({success:false})}});
  assert.equal(response.status, 429);
});
test('known publisher disagreements are withheld', async () => {
  const result = await fetchDraw('2026-07-13', '6/55', () => {}, undefined, async () => {throw new Error('Should not fetch');});
  assert.equal(result.type, 'error');
  assert.match(result.message, /disagree/);
});
