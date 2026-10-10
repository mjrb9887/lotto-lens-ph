export const GAMES = {'6/42': 42, '6/45': 45, '6/49': 49, '6/55': 55, '6/58': 58};
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function todayPH() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const part = key => parts.find(p => p.type === key).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a valid draw date.');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Choose a valid draw date.');
  }
  if (value < '1995-01-01' || value > todayPH()) throw new Error('Choose a past draw date from 1995 onwards.');
  return parsed;
}

export function sourcesFor(value) {
  const date = validateDate(value);
  const month = MONTHS[date.getUTCMonth()], day = date.getUTCDate(), year = date.getUTCFullYear();
  return [
    {label: 'GMA News Online', url: `https://www.gmanetwork.com/news/lotto/results-${month}-${String(day).padStart(2, '0')}-${year}/`},
    {label: 'The Summit Express', url: `https://www.thesummitexpress.com/${year}/${String(date.getUTCMonth()+1).padStart(2,'0')}/pcso-lotto-result-today-${month}-${day}-${year}-official.html`}
  ];
}

function plain(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

function record(game, combination, date, source, jackpot, winners = null) {
  if (!/^\d{1,2}(?:[\s-]+\d{1,2}){5}$/.test(combination)) throw new Error('Invalid combination format.');
  const numbers = combination.match(/\d+/g).map(Number);
  if (new Set(numbers).size !== 6 || numbers.some(n => n < 1 || n > GAMES[game])) {
    throw new Error('Invalid winning numbers.');
  }
  return {date, numbers, jackpot, winners, source: source.url, source_label: source.label};
}

export function parsePage(html, date, source) {
  const parsed = validateDate(date);
  const expected = new RegExp(`${MONTHS[parsed.getUTCMonth()]}\\s+0?${parsed.getUTCDate()},?\\s+${parsed.getUTCFullYear()}\\b`, 'i');
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!title || !expected.test(plain(title[1]))) throw new Error('Requested date was not confirmed.');
  const found = {};
  if (source.label === 'GMA News Online') {
    const cards = /<a\b(?=[^>]*class="lotto-type-link")([^>]*)>[\s\S]*?<\/a>\s*<p\b[^>]*>([\s\S]*?)<\/p>\s*<p\b[^>]*>([\s\S]*?)<\/p>/gi;
    for (const [, attrs, combination, jackpot] of html.matchAll(cards)) {
      const game = attrs.match(/data-type="[^"<>]*?(6\/(?:42|45|49|55|58))"/)?.[1];
      if (!game) continue;
      const drawDate = attrs.match(/data-date="([^"]+)"/)?.[1];
      if (!drawDate || !expected.test(drawDate)) throw new Error('Result card date did not match.');
      found[game] = record(game, plain(combination), date, source, plain(jackpot).replace(/^P/, '₱'));
    }
  } else {
    for (const [table] of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
      const fields = {};
      for (const [, row] of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => plain(m[1]));
        if (cells.length === 2) fields[cells[0].toUpperCase()] = cells[1];
      }
      const game = fields['LOTTO GAME']?.match(/6\/(?:42|45|49|55|58)/)?.[0];
      if (!game || !fields.COMBINATIONS) continue;
      const winners = /^\d+$/.test(fields['WINNER/S']) ? Number(fields['WINNER/S']) : null;
      found[game] = record(game, fields.COMBINATIONS, date, source,
        fields['JACKPOT PRIZE']?.replace(/^Php\s*/, '₱') || null, winners);
    }
  }
  if (!Object.keys(found).length) throw new Error('No supported results could be parsed.');
  return found;
}

export async function boundedText(response, limit = 1500000) {
  if (!response.body) throw new Error('Empty response.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Response exceeded the size limit.');
      text += decoder.decode(value, {stream: true});
    }
    return text + decoder.decode();
  } finally { await reader.cancel(); }
}

export async function fetchDraw(date, game, emit, signal, fetcher = fetch) {
  // Withhold a known publisher disagreement until official verification.
  if (date === '2026-07-13' && game === '6/55') {
    return {type: 'error', message: 'Published sources disagree on this draw. Please verify the combination in the official PCSO archive.'};
  }
  let retrievedReport = false;
  for (const source of sourcesFor(date)) {
    if (signal?.aborted) throw new Error('Lookup cancelled.');
    await emit({type: 'progress', message: `Searching ${source.label} for ${date}…`});
    try {
      const response = await fetcher(source.url, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
        redirect: 'error', headers: {'User-Agent': 'LottoLensPH/1.0 (public draw result lookup)'}
      });
      if (!response.ok) throw new Error(`Publisher returned ${response.status}.`);
      const html = await boundedText(response);
      await emit({type: 'progress', message: 'Checking the draw date and winning numbers…'});
      const found = parsePage(html, date, source);
      retrievedReport = true;
      if (found[game]) return {type: 'result', game, result: found[game]};
    } catch (error) {
      if (signal?.aborted) throw error;
      console.log(JSON.stringify({event: 'archive_source_unavailable', source: source.label, date, reason: error.message}));
    }
  }
  return retrievedReport
    ? {type: 'not_found', message: 'The retrieved reports have no result for this game on this date. Confirm the draw date or check PCSO directly.'}
    : {type: 'error', message: 'The archives could not provide a verified result. Try again or search PCSO directly.'};
}
