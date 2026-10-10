import {test, expect} from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.result-card')).toHaveCount(5);
});

test('mobile form fits at 320–430px and stored 2026 draws need no API', async ({page}) => {
  for (const width of [320, 375, 430]) {
    await page.setViewportSize({width, height:812});
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({tag:el.tagName,class:el.className,right:el.getBoundingClientRect().right})));
    expect(overflow).toEqual([]);
  }
  await page.selectOption('#scanGame', '6/42');
  await page.fill('#lookupDate', '2026-01-01');
  await expect(page.locator('#checkTicket')).toBeDisabled();
  await page.click('#pullDraw');
  await expect(page.locator('#lookupMessage')).toContainText('Loaded stored results');
  await expect(page.locator('#checkTicket')).toBeEnabled();
  await expect(page.locator('#drawSelect option:checked')).toContainText('Jan 1, 2026');
});

test('older results show progress, match the selected date, and stay out of history', async ({page}) => {
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = (url, options) => {
      if (!String(url).includes('/api/archive')) return original(url, options);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({type:'progress',message:'Searching The Summit Express for 2023-01-03…'})+'\n'));
        const timer = setTimeout(() => {
          controller.enqueue(encoder.encode(JSON.stringify({type:'result',game:'6/42',result:{date:'2023-01-03',numbers:[40,25,28,13,36,39],source_label:'The Summit Express',source:'https://www.thesummitexpress.com/2023/01/pcso-lotto-result-today-january-3-2023-official.html'}})+'\n'));
          controller.close();
        }, 700);
        options.signal.addEventListener('abort', () => { clearTimeout(timer); controller.error(new DOMException('Aborted','AbortError')); });
      }});
      return Promise.resolve(new Response(stream, {headers:{'Content-Type':'application/x-ndjson'}}));
    };
  });
  await page.selectOption('#scanGame', '6/42');
  const before = await page.evaluate(() => allDraws('6/42').length);
  await page.fill('#lookupDate', '2023-01-03');
  await page.click('#pullDraw');
  await expect(page.locator('#lookupMessage')).toContainText('Searching The Summit Express');
  await expect(page.locator('#lookupProgress')).toBeVisible();
  await expect(page.locator('#checkTicket')).toBeDisabled();
  await expect(page.locator('#lookupMessage')).toContainText('Results ready');
  expect(await page.evaluate(() => allDraws('6/42').length)).toBe(before);
  for (const [i, n] of [40,25,28,13,36,39].entries()) await page.locator('.number-inputs input').nth(i).fill(String(n));
  await page.click('#checkTicket');
  await expect(page.locator('#checkResults')).toContainText('6/6 matched');
  await expect(page.locator('#checkResults')).toContainText('Jan 3, 2023');
  await page.fill('#lookupDate', '2023-01-05');
  await expect(page.locator('#checkTicket')).toBeDisabled();
  await expect(page.locator('#checkResults')).toBeEmpty();
});

test('cancelled requests cannot change the selected draw', async ({page}) => {
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = (url, options) => String(url).includes('/api/archive')
      ? new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted','AbortError'))))
      : original(url, options);
  });
  const previous = await page.locator('#drawSelect').inputValue();
  await page.fill('#lookupDate', '2023-01-03');
  await page.click('#pullDraw');
  await expect(page.locator('#cancelLookup')).toBeVisible();
  await page.click('#cancelLookup');
  await expect(page.locator('#lookupMessage')).toContainText('cancelled');
  await expect(page.locator('#checkTicket')).toBeDisabled();
  expect(await page.locator('#drawSelect').inputValue()).toBe(previous);
});

test('failed archive lookups show an error and never silently check latest draw', async ({page}) => {
  await page.route('**/api/archive?**', route => route.fulfill({status:200,contentType:'application/x-ndjson',body:JSON.stringify({type:'error',message:'The archives could not provide a verified result.'})+'\n'}));
  await page.fill('#lookupDate', '2023-01-03');
  await page.click('#pullDraw');
  await expect(page.locator('#lookupMessage')).toContainText('could not provide');
  await expect(page.locator('#checkTicket')).toBeDisabled();
  await expect(page.locator('#lookupProgress')).toBeHidden();
});
test('known source conflict is visible and cannot be checked', async ({page}) => {
  await page.selectOption('#scanGame', '6/55');
  await page.fill('#lookupDate', '2026-07-13');
  await page.click('#pullDraw');
  await expect(page.locator('#lookupMessage')).toContainText('disagree');
  await expect(page.locator('#checkTicket')).toBeDisabled();
});
