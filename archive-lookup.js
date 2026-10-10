let lookupController = null;
let lookupDraw = null;
let archiveCoverage = null;

function manilaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function currentDraw() {
  if ($('#drawSelect').value === 'lookup') {
    return lookupDraw?.game === $('#scanGame').value ? lookupDraw.result : null;
  }
  return allDraws($('#scanGame').value)[Number($('#drawSelect').value) || 0];
}

function lookupStatus(message, busy = false, error = false) {
  $('#lookupStatus').classList.remove('hidden');
  $('#lookupStatus').classList.toggle('error', error);
  $('#lookupMessage').textContent = message;
  $('#lookupProgress').classList.toggle('hidden', !busy);
  $('#lookupStatus').setAttribute('aria-busy', String(busy));
}

function cancelLookup() {
  lookupController?.abort();
  lookupController = null;
  $('#pullDraw').disabled = false;
  $('#cancelLookup').classList.add('hidden');
  $('#lookupProgress').classList.add('hidden');
  $('#lookupStatus').setAttribute('aria-busy', 'false');
}

function invalidateLookup() {
  cancelLookup();
  $('#checkResults').replaceChildren();
  $('#checkTicket').disabled = true;
  $('#lookupSource').replaceChildren();
  lookupStatus('Select “Find this draw” to load results for the entered date.');
}

function resetDrawLookup() {
  cancelLookup();
  lookupDraw = null;
  $('#checkResults').replaceChildren();
  $('#lookupSource').replaceChildren();
  $('#lookupStatus').classList.add('hidden');
  const draw = currentDraw();
  $('#lookupDate').value = draw?.date || '';
  $('#checkTicket').disabled = !draw;
}

function validRemoteDraw(result, selected) {
  const max = GAMES[$('#scanGame').value].max;
  if (!result || result.date !== selected || !Array.isArray(result.numbers) ||
      result.numbers.length !== 6 || new Set(result.numbers).size !== 6 ||
      !result.numbers.every(n => Number.isInteger(n) && n >= 1 && n <= max)) return false;
  try {
    const url = new URL(result.source);
    return url.protocol === 'https:' &&
      ['www.gmanetwork.com', 'www.thesummitexpress.com', 'www.pcso.gov.ph'].includes(url.hostname);
  } catch { return false; }
}

async function pullDraw() {
  cancelLookup();
  $('#checkResults').replaceChildren();
  $('#lookupSource').replaceChildren();
  $('#checkTicket').disabled = true;
  const selected = $('#lookupDate').value;
  const game = $('#scanGame').value;
  if (archiveCoverage?.days?.[selected]?.missing_games?.includes(game)) {
    lookupStatus('Published sources disagree on this draw. Please verify it in the official PCSO archive.', false, true);
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selected) || selected > manilaToday() || selected < '1995-01-01') {
    lookupStatus('Choose a valid past draw date from 1995 onwards.', false, true);
    return;
  }
  const storedIndex = allDraws(game).findIndex(draw => draw.date === selected);
  if (storedIndex >= 0) {
    $('#drawSelect').value = String(storedIndex);
    $('#checkTicket').disabled = false;
    lookupStatus(`Loaded stored results for ${fmtDate(selected)}. Review your numbers, then check.`);
    showLookupSource(currentDraw());
    return;
  }
  const controller = new AbortController();
  lookupController = controller;
  $('#pullDraw').disabled = true;
  $('#cancelLookup').classList.remove('hidden');
  lookupStatus(`Connecting to the archives for ${fmtDate(selected)}…`, true);
  const timer = setTimeout(() => controller.abort('timeout'), 60000);
  try {
    const origin = (window.LOTTO_ARCHIVE_API || '').replace(/\/$/, '');
    const url = `${origin}/api/archive?${new URLSearchParams({date: selected, game})}`;
    const response = await fetch(url, {signal: controller.signal, cache: 'no-store'});
    if (!response.ok || !response.headers.get('content-type')?.includes('application/x-ndjson')) {
      throw new Error('Archive lookup is unavailable on this host. You can search the official PCSO archive below.');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '', complete = false;
    while (true) {
      const {value, done} = await reader.read();
      pending += decoder.decode(value, {stream: !done});
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'progress') lookupStatus(event.message, true);
        if (event.type === 'error' || event.type === 'not_found') throw new Error(event.message);
        if (event.type === 'result') {
          if (event.game !== game || !validRemoteDraw(event.result, selected)) {
            throw new Error('The archive response did not match this game and date. Check PCSO directly.');
          }
          lookupDraw = {game, result: event.result};
          $('#drawSelect').querySelector('option[value="lookup"]')?.remove();
          $('#drawSelect').add(new Option(`${fmtDate(selected)} — fetched archive result`, 'lookup'));
          $('#drawSelect').value = 'lookup';
          $('#checkTicket').disabled = false;
          lookupStatus(`Results ready for ${fmtDate(selected)}. Review your ticket numbers, then check.`);
          showLookupSource(event.result);
          complete = true;
        }
      }
      if (complete) { await reader.cancel(); break; }
      if (done) break;
      if (pending.length > 10000) throw new Error('The archive returned an invalid response.');
    }
    if (!complete) throw new Error('The lookup ended without a result. Please try again.');
  } catch (error) {
    if (lookupController !== controller) return;
    const message = controller.signal.aborted
      ? 'The lookup timed out. Try again or search PCSO directly.'
      : error.message;
    lookupStatus(message, false, true);
  } finally {
    clearTimeout(timer);
    if (lookupController === controller) cancelLookup();
  }
}

function showLookupSource(draw) {
  const container = $('#lookupSource');
  container.replaceChildren();
  if (!draw) return;
  const link = document.createElement('a');
  link.href = draw.source || resultsData?.source || 'https://www.pcso.gov.ph/SearchLottoResult.aspx';
  link.textContent = draw.source_label || 'PCSO LottoMatik';
  link.target = '_blank';
  link.rel = 'noopener';
  container.append('Published source: ', link, '. Confirm important results with PCSO.');
}

function initArchiveLookup() {
  fetch('data/coverage.json', {cache: 'no-store'}).then(async response => {
    if (!response.ok) return;
    archiveCoverage = await response.json();
    const gaps = Object.entries(archiveCoverage.days || {}).filter(([, d]) => ['partial', 'unavailable'].includes(d.status));
    $('#archiveCoverage').textContent = gaps.length
      ? `Rolling 12-month archive. Results need verification for: ${gaps.map(([date]) => fmtDate(date)).join(', ')}. Unverified combinations are withheld.`
      : 'Rolling 12-month archive. Source availability and reported draw suspensions determine coverage.';
  }).catch(() => {});
  $('#lookupDate').max = manilaToday();
  $('#lookupDate').addEventListener('input', invalidateLookup);
  $('#pullDraw').addEventListener('click', pullDraw);
  $('#cancelLookup').addEventListener('click', () => {
    cancelLookup();
    lookupStatus('Lookup cancelled. Select “Find this draw” to retry.');
  });
  $('#drawSelect').addEventListener('change', () => {
    cancelLookup();
    $('#checkResults').replaceChildren();
    const draw = currentDraw();
    $('#lookupDate').value = draw?.date || '';
    $('#checkTicket').disabled = !draw;
    $('#lookupStatus').classList.add('hidden');
    showLookupSource(draw);
  });
  $('#checkTicket').disabled = true;
}
