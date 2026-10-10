# LottoLens PH

A mobile-first static web app for checking Philippine Lotto 6-number tickets from a photo, comparing play lines with published results, and generating clearly-labeled entertainment-only number suggestions.

## What works

- Camera/photo upload on mobile.
- In-browser OCR using Tesseract.js; ticket images are not sent to this repository/server.
- Editable OCR output before checking.
- Match highlighting for Lotto 6/42, Mega Lotto 6/45, Super Lotto 6/49, Grand Lotto 6/55, and Ultra Lotto 6/58.
- A rolling 12-month result history that works on GitHub Pages.
- Scheduled GitHub Action that refreshes the five latest results, recovers recent missing days, and prunes history older than 12 months.
- Manual date lookup with streamed progress, cancellation, source links, and a JavaScript archive API. Older results stay temporary.
- Three number-generator modes: history-inspired, balanced random, and pure random. None claims to improve winning odds.
- PWA/offline shell, privacy/methodology/responsible-play pages, and an AdSense placeholder.

## Deploy on GitHub Pages

1. Create a new GitHub repository and upload/push this folder to the `main` branch.
2. Open **Settings → Pages** and deploy from the `main` branch, root folder.
3. The current repository uses this branch deployment; `pages.yml.disabled` is retained only as an alternative workflow.
4. Test **Actions → Update PCSO results → Run workflow**. PCSO/LottoMatik can change markup or anti-bot behavior; if the scraper fails, inspect the workflow log and update `scripts/update_results.py` rather than publishing guessed data.
5. Buy your domain, add it under **Settings → Pages → Custom domain**, then create the DNS records GitHub tells you to use. Turn on **Enforce HTTPS** when available.

## AdSense launch checklist

- Do **not** paste fake ad code into the project. After your domain is live and AdSense approves it, paste the exact script Google gives you into the `<head>` of each page where needed.
- Replace `ads.txt.example` with `ads.txt` containing the exact publisher line from AdSense.
- Replace the starter Privacy page with your real legal/business details and accurately disclose AdSense, analytics, cookies/consent, and any other vendors you actually use.
- Keep useful original content (methodology, result explanations, responsible play, FAQs) rather than turning the site into ad-only pages.
- Do not place ads so they look like Scan/Check buttons or otherwise encourage accidental clicks.
- This site should remain informational; it does not sell tickets, accept wagers, or promise winning predictions.

## Result data

`data/results.json` contains the current local latest result for each supported game. `data/history.json` contains the historical draw sample used by the suggestion engine.

The active history retains a rolling **12 calendar months**, calculated in Philippine time. On October 10, 2026 the retention boundary is October 10, 2025. Daily maintenance prunes older records; the browser also filters the stored sample to this window. Latest results remain in `results.json` separately.

The backfill covers the five supported six-number games (6/42, 6/45, 6/49, 6/55, 6/58), including 2026 to October 9. It does not cover digit games. Each row records its source. Most imported rows are GMA News reports; existing PCSO LottoMatik rows and manually reviewed publisher reports keep their own provenance. Publisher reports are not official ticket validation.

`data/coverage.json` records retrieved reports, reviewed dates, source gaps, and reported suspensions. April 2–4, 2026 were reported Holy Week suspensions. Grand Lotto 6/55 on July 13, 2026 is withheld pending official verification: The Philippine Star reports a 23 where Scratch It Blog reports a 26. Other games on that day remain available. No complete official archive is claimed.

Backfill or resume the last year (Python standard library only):

```bash
python3 scripts/backfill_history.py
```

Use `--start YYYY-MM-DD --end YYYY-MM-DD` for a specific retained range. Imports checkpoint after each day and refuse conflicts against stored combinations. `--force` retries previously reviewed days; use it only after resolving source disagreements. The scheduled workflow retries the last seven days and trims both history and coverage. The latest-only scraper can still miss draws during prolonged outages; backfill recovers those dates from publisher reports.

Example row:

```json
{"date":"2026-09-04","numbers":[26,38,17,35,11,16],"source_label":"GMA News Online","source":"https://www.gmanetwork.com/news/lotto/results-september-04-2026/"}
```

## Important product wording

Avoid phrases such as “AI predicts winning numbers,” “best numbers to win,” or “guaranteed winning picks.” Past draw frequency does not improve the probability of a number in a fair independent draw. The number lab is an entertainment/statistics feature.

## Manual archive lookup (JavaScript)

The browser first checks retained history. If the requested game/date is absent, it requests `GET /api/archive?date=YYYY-MM-DD&game=6%2F42`. The JavaScript API streams newline-delimited progress messages as it searches GMA News and The Summit Express, verifies the page/card date, validates the six-number set, and returns the selected game only. Errors and missing reports never fall back to a different date.

Old results are held only in the active page session. They are never written to history, used in suggestions, or cached by the service worker. Only game/date are sent, not ticket images or entered numbers. Some dates may be unavailable or withheld due to publisher disagreements; the interface links to the official PCSO search.

Direct browser scraping is unsuitable when the publisher does not permit CORS. The API is server-side JavaScript, packaged as a small Cloudflare Worker with allowed origins, request limits, source timeouts, and bounded response sizes. No database is needed for old draws.

### Local app and API

```bash
npm ci
npm start
```

Use Node.js 22 or newer. Open `http://localhost:8080`. Set `PORT` if that port is occupied. A plain static server works for stored history, but cannot execute the archive API.

### API deployment alongside GitHub Pages

The API is prepared but **not deployed** by these changes. To enable old-date lookup on the live Pages site:

1. Authenticate Wrangler with your Cloudflare account.
2. Check `ALLOWED_ORIGINS` in `wrangler.jsonc`; add your custom site origin if needed.
3. Run `npm run check:worker`, then `npm run deploy:worker`.
4. Put the returned HTTPS Worker origin in `config.js` as `window.LOTTO_ARCHIVE_API`.
5. Deploy the static files through the existing GitHub Pages branch configuration.

The Pages frontend and Worker can remain separate. `npm run dev:worker` tests the Worker runtime locally; set `config.js` to its local URL when testing from another origin.

### Validation

```bash
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
npx playwright install chromium
npx playwright test
node scripts/check_archive.mjs
```

The last command makes real publisher requests; unit and mobile UI tests use recorded snippets/mocked streams. Browser tests cover 320–430px layouts, stored dates, progress, cancellation, errors, matching, and excluding old draws from history.

## Not affiliated with PCSO

This project is independent and is not endorsed by the Philippine Charity Sweepstakes Office. Official PCSO sources should control if any result differs from this site.
