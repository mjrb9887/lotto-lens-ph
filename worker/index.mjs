import {GAMES, fetchDraw, validateDate} from './archive.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const headers = new Headers({'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin'});
    if (origin && allowed.includes(origin)) headers.set('Access-Control-Allow-Origin', origin);
    if (origin && !allowed.includes(origin)) return new Response('Origin is not allowed.', {status: 403, headers});
    if (url.pathname !== '/api/archive') return new Response('Not found.', {status: 404, headers});
    if (request.method !== 'GET') return new Response('Use GET.', {status: 405, headers});
    const date = url.searchParams.get('date') || '', game = url.searchParams.get('game');
    try {
      validateDate(date);
      if (!Object.hasOwn(GAMES, game) || [...url.searchParams.keys()].some(k => !['date', 'game'].includes(k)) ||
          url.searchParams.getAll('date').length !== 1 || url.searchParams.getAll('game').length !== 1) {
        throw new Error('Choose one supported game and one date.');
      }
    } catch (error) { return new Response(error.message, {status: 400, headers}); }
    if (env.ARCHIVE_RATE_LIMITER) {
      const {success} = await env.ARCHIVE_RATE_LIMITER.limit({key: request.headers.get('CF-Connecting-IP') || 'local'});
      if (!success) return new Response('Too many lookups. Try again shortly.', {status: 429, headers});
    }
    const controller = new AbortController();
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(stream) {
        const emit = async event => {
          if (!controller.signal.aborted) stream.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        };
        try {
          await emit(await fetchDraw(date, game, emit, controller.signal));
        } catch (error) {
          if (!controller.signal.aborted) {
            console.error(JSON.stringify({event: 'archive_lookup_failed', date, reason: error.message}));
            await emit({type: 'error', message: 'Lookup failed. Please try again or search PCSO directly.'});
          }
        } finally { if (!controller.signal.aborted) stream.close(); }
      },
      cancel() { controller.abort(); }
    });
    headers.set('Content-Type', 'application/x-ndjson; charset=utf-8');
    return new Response(body, {headers});
  }
};
