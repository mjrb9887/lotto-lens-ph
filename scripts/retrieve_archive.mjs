// GitHub Actions publishes one temporary public draw, never ticket details.
import {mkdir, writeFile, rename} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {GAMES, validateDate, fetchDraw} from '../worker/archive.mjs';

export async function retrieve(date, game, publish, fetcher = fetch) {
  validateDate(date);
  if (!Object.hasOwn(GAMES, game)) throw new Error('Choose a supported game.');
  const expires_at = new Date(Date.now() + 86400000).toISOString();
  const send = event => publish({...event, date, game, expires_at});
  await send({type:'progress', message:'Retrieval in progress on GitHub…'});
  let result;
  try { result = await fetchDraw(date, game, send, undefined, fetcher); }
  catch { result = {type:'error', message:'Retrieval failed. Retry the workflow or check PCSO directly.'}; }
  await send(result);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const date = process.env.DRAW_DATE || process.argv[2];
  const game = process.env.DRAW_GAME || process.argv[3];
  const shouldCommit = process.argv.includes('--commit');
  await retrieve(date, game, async state => {
    await mkdir('data', {recursive:true});
    await writeFile('data/manual-archive.json.tmp', JSON.stringify(state, null, 2) + '\n');
    await rename('data/manual-archive.json.tmp', 'data/manual-archive.json');
    console.log(state.message || `Published ${state.type} for ${date} ${game}`);
    if (shouldCommit) {
      execFileSync('git', ['add', 'data/manual-archive.json']);
      execFileSync('git', ['commit', '-m', `chore: publish archive lookup ${date} ${game}`], {stdio:'inherit'});
      execFileSync('git', ['pull', '--rebase', 'origin', 'main'], {stdio:'inherit'});
      execFileSync('git', ['push', 'origin', 'HEAD:main'], {stdio:'inherit'});
    }
  });
}
