"""Date-scoped published results, provenance, and rolling 12-month retention.

Only the five six-number games supported by this app are imported. Publishers
are identified explicitly; their reports are not represented as PCSO validation.
"""
from __future__ import annotations

import calendar
import json
import re
from datetime import date, datetime, timedelta
from html import unescape
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
GAMES = {"6/42": 42, "6/45": 45, "6/49": 49, "6/55": 55, "6/58": 58}
MONTHS = ("", "january", "february", "march", "april", "may", "june",
          "july", "august", "september", "october", "november", "december")
OFFICIAL_URL = "https://www.pcso.gov.ph/SearchLottoResult.aspx"


class SourceUnavailable(Exception):
    pass


def today_ph():
    return datetime.now(ZoneInfo("Asia/Manila")).date()


def retention_start(today=None):
    today = today or today_ph()
    return today.replace(year=today.year - 1,
                         day=min(today.day, calendar.monthrange(today.year - 1, today.month)[1]))


def validate_date(value):
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Choose a valid draw date.")
    selected = date.fromisoformat(value)
    if selected > today_ph():
        raise ValueError("Future draws have no published results yet.")
    if selected.year < 1995:
        raise ValueError("Choose a date from 1995 onwards.")
    return selected


def source_urls(selected):
    month = MONTHS[selected.month]
    return [
        ("GMA News Online", f"https://www.gmanetwork.com/news/lotto/results-{month}-{selected.day:02d}-{selected.year}/"),
        ("The Summit Express", f"https://www.thesummitexpress.com/{selected.year}/{selected.month:02d}/pcso-lotto-result-today-{month}-{selected.day}-{selected.year}-official.html"),
    ]


def plain(fragment):
    return " ".join(unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def record(gid, combination, selected, source, url, jackpot=None, winners=None):
    if not re.fullmatch(r"\d{1,2}(?:[\s-]+\d{1,2}){5}", combination.strip()):
        raise SourceUnavailable("The publisher's combination format could not be validated.")
    numbers = [int(n) for n in re.findall(r"\d+", combination)]
    if len(set(numbers)) != 6 or any(n < 1 or n > GAMES[gid] for n in numbers):
        raise SourceUnavailable("The publisher returned an invalid combination.")
    return {"date": selected.isoformat(), "numbers": numbers, "jackpot": jackpot,
            "winners": winners, "source_label": source, "source": url}


def parse_page(html, selected, source, url):
    # A date in metadata alone is insufficient: require the visible page title.
    title = re.search(r"<title\b[^>]*>(.*?)</title>", html, re.I | re.S)
    expected = rf"{MONTHS[selected.month]}\s+0?{selected.day},?\s+{selected.year}\b"
    if not title or not re.search(expected, plain(title.group(1)), re.I):
        raise SourceUnavailable("The publisher did not return the requested date.")
    found = {}
    if source == "GMA News Online":
        pattern = r'<a\b(?=[^>]*class="lotto-type-link")([^>]*)>.*?</a>\s*<p\b[^>]*>(.*?)</p>\s*<p\b[^>]*>(.*?)</p>'
        for attrs, combination, jackpot in re.findall(pattern, html, re.I | re.S):
            gm = re.search(r'data-type="[^"<>]*?(6/(?:42|45|49|55|58))"', attrs)
            dm = re.search(r'data-date="([^"]+)"', attrs)
            if not gm:
                continue
            if not dm or not re.fullmatch(expected, dm.group(1), re.I):
                raise SourceUnavailable("A result card has the wrong draw date.")
            gid = gm.group(1)
            found[gid] = record(gid, plain(combination), selected, source, url,
                                plain(jackpot).replace("P", "₱", 1))
    else:
        for table in re.findall(r"<table\b[^>]*>.*?</table>", html, re.I | re.S):
            fields = {}
            for row in re.findall(r"<tr\b[^>]*>(.*?)</tr>", table, re.I | re.S):
                cells = [plain(x) for x in re.findall(r"<t[dh]\b[^>]*>(.*?)</t[dh]>", row, re.I | re.S)]
                if len(cells) == 2:
                    fields[cells[0].upper()] = cells[1]
            gm = re.search(r"6/(42|45|49|55|58)", fields.get("LOTTO GAME", ""))
            if gm and "COMBINATIONS" in fields:
                gid = gm.group(0)
                winners = fields.get("WINNER/S", "")
                found[gid] = record(gid, fields["COMBINATIONS"], selected, source, url,
                                    fields.get("JACKPOT PRIZE", "").replace("Php ", "₱"),
                                    int(winners) if winners.isdigit() else None)
    if not found:
        raise SourceUnavailable("No supported six-number results could be verified on this page.")
    return found


def fetch_day(selected, progress=lambda message: None):
    errors = []
    for source, url in source_urls(selected):
        progress(f"Searching {source} for {selected.isoformat()}…")
        try:
            request = Request(url, headers={"User-Agent": "LottoLensPH/1.0 (public draw result lookup)"})
            with urlopen(request, timeout=20) as response:
                if response.geturl().rstrip("/") != url.rstrip("/"):
                    raise SourceUnavailable("The archive redirected away from the requested date.")
                body = response.read(1_500_001)
                if len(body) > 1_500_000:
                    raise SourceUnavailable("The archive response is too large.")
            progress("Checking the draw date and winning numbers…")
            return parse_page(body.decode("utf-8"), selected, source, url)
        except (OSError, ValueError, SourceUnavailable) as exc:
            errors.append(f"{source}: {exc}")
    raise SourceUnavailable("No verified result was retrieved. Try again or search PCSO directly. " + "; ".join(errors))


def prune_history(history, today=None):
    today = today or today_ph()
    start = retention_start(today).isoformat()
    for gid, rows in history.get("games", {}).items():
        by_date = {}
        for row in rows:
            if start <= row["date"] <= today.isoformat():
                existing = by_date.get(row["date"])
                if existing and sorted(existing["numbers"]) != sorted(row["numbers"]):
                    raise ValueError(f"Conflicting results for {gid} on {row['date']}")
                by_date[row["date"]] = row
        history["games"][gid] = sorted(by_date.values(), key=lambda row: row["date"], reverse=True)
    history.update(retention_months=12, retention_start=start,
                   note="Rolling 12-month history. Older draws are fetched on demand and are not stored in this file.")
    return history


def write_json(path, data):
    temp = path.with_suffix(".json.tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    temp.replace(path)
