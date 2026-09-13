# LottoLens PH

A mobile-first static web app for checking Philippine Lotto 6-number tickets from a photo, comparing play lines with published results, and generating clearly-labeled entertainment-only number suggestions.

## What works

- Camera/photo upload on mobile.
- In-browser OCR using Tesseract.js; ticket images are not sent to this repository/server.
- Editable OCR output before checking.
- Match highlighting for Lotto 6/42, Mega Lotto 6/45, Super Lotto 6/49, Grand Lotto 6/55, and Ultra Lotto 6/58.
- Static result/history JSON that works on GitHub Pages.
- Scheduled GitHub Action that attempts to refresh the five latest results from official PCSO LottoMatik and append new draws to local history.
- Three number-generator modes: history-inspired, balanced random, and pure random. None claims to improve winning odds.
- PWA/offline shell, privacy/methodology/responsible-play pages, and an AdSense placeholder.

## Deploy on GitHub Pages

1. Create a new GitHub repository and upload/push this folder to the `main` branch.
2. Open **Settings → Pages** and set the source to **GitHub Actions**.
3. The included `pages.yml` workflow will deploy the site.
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

The repository ships with a small starter sample sourced from PCSO LottoMatik public result pages. It is intentionally not described as a complete historical archive. The scheduled updater adds future latest draws when the official page can be parsed.

For a serious public launch, backfill a fuller verified history into `data/history.json` using the same schema:

```json
{"date":"2026-09-04","numbers":[26,38,17,35,11,16]}
```

## Important product wording

Avoid phrases such as “AI predicts winning numbers,” “best numbers to win,” or “guaranteed winning picks.” Past draw frequency does not improve the probability of a number in a fair independent draw. The number lab is an entertainment/statistics feature.

## Local test

Any static server works:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Not affiliated with PCSO

This project is independent and is not endorsed by the Philippine Charity Sweepstakes Office. Official PCSO sources should control if any result differs from this site.
