# LottoLens PH

A mobile-first static web app for checking Philippine Lotto 6-number tickets from a photo, comparing play lines with published results, and generating clearly-labeled entertainment-only number suggestions.

## What works

- Camera/photo upload on mobile.
- In-browser OCR using Tesseract.js; ticket images are not sent to this repository/server.
- Editable OCR output before checking.
- Match highlighting for Lotto 6/42, Mega Lotto 6/45, Super Lotto 6/49, Grand Lotto 6/55, and Ultra Lotto 6/58.
- A rolling 12-month result history that works on GitHub Pages.
- Scheduled GitHub Action that refreshes the five latest results, recovers recent missing days, and prunes history older than 12 months.
- Manual GitHub Actions date retrieval with published progress, cancellation of waiting, and source links. Older draws stay outside the rolling history.
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

## Manual archive lookup on GitHub (JavaScript)

No Cloudflare deployment is needed. The browser checks the retained year first. For older or missing dates, it polls a public status file on GitHub every 10 seconds for up to 10 minutes. Clicking **Find this draw** does not submit a request or start a workflow. The page accurately shows awaiting manual retrieval until the repository owner runs it.

1. Push these changes to `main` (`git push origin main`).
2. In GitHub open **Actions → Retrieve archived draw → Run workflow** on `main`.
3. Enter the exact draw date, such as `2023-01-03`, and select the game, such as `6/42`.
4. On the website select that game/date and click **Find this draw**. Leave it open while the workflow searches and publishes its status. If waiting times out, click again after the workflow finishes.

The workflow uses Node.js 22 JavaScript and the repository's built-in `GITHUB_TOKEN`; no personal token, API key, Cloudflare subscription, or npm install is required. Repository Actions must permit write access, and branch rules must allow the workflow bot to push to `main`. Inputs go through environment variables and are validated before publication. Visitors without repository write access cannot initiate retrieval. Cancel stops browser waiting, not an already running workflow.

One manual result is published at a time in `data/manual-archive.json`, overwritten by the next retrieval. It expires for website use after 24 hours and is cleared by daily maintenance. It is public lottery data; **previous versions remain in Git history**, so expiry is not permanent deletion from GitHub. The rolling 12-month limit applies to the active history, not repository commit history. Ticket images and entered numbers are never published.

The browser reads the status directly from `raw.githubusercontent.com` because bot commits using `GITHUB_TOKEN` do not trigger branch-based Pages rebuilds. GitHub caching may delay visible progress. Source stages and final results are published; the page does not invent percentages. Errors and absent reports do not substitute another date. Manual results never enter history, suggestions, or the offline cache. Always verify important results with PCSO.

The browser also reads rolling history directly from GitHub and falls back to the deployed copy when GitHub is unavailable. The latest cards use the most recent available draw for each game, including date-scoped reports recovered by the scheduled backfill.

If you fork the repository, update the history, status, and workflow URLs in `config.js`. The previous live API is retained as an optional future alternative, but GitHub mode is the default and never calls it.

### Local development

```bash
npm ci
npm start
```

Open `http://localhost:8080` with Node.js 22 or newer. Local development uses the same GitHub status source by default. To retrieve a date locally without publishing or committing:

```bash
node scripts/retrieve_archive.mjs 2023-01-03 6/42
```

This writes only the separate temporary status file. To test that local file in the browser, set `window.LOTTO_ARCHIVE_STATUS` to `data/manual-archive.json` in `config.js`, then restore the GitHub URL before pushing.

### Validation

```bash
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
npx playwright install chromium
npx playwright test
node scripts/check_archive.mjs
```

The last command makes real publisher requests; unit and mobile UI tests use recorded snippets/mocked GitHub status files. Browser tests cover 320–430px layouts, stored dates, progress, cancellation, errors, matching, and excluding old draws from history.

## Not affiliated with PCSO

This project is independent and is not endorsed by the Philippine Charity Sweepstakes Office. Official PCSO sources should control if any result differs from this site.
