#!/usr/bin/env python3
"""Refresh the five latest 6-number PCSO LottoMatik results and append to history.

This intentionally uses a real browser because lottery result sites can be rendered
client-side and may reject plain HTTP scrapers. The parser is defensive and fails
rather than silently publishing suspicious data.
"""
from __future__ import annotations
import asyncio,json,re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
RESULTS=ROOT/'data/results.json'; HISTORY=ROOT/'data/history.json'
URL='https://lottomatik.pcso.gov.ph/lotto-results'
GAMES={
 '6/42':('Lotto 6/42',['LOTTO42','LOTTO 6/42','6/42'],42),
 '6/45':('Mega Lotto 6/45',['ML45','MEGA LOTTO 6/45','6/45'],45),
 '6/49':('Super Lotto 6/49',['SL49','SUPER LOTTO 6/49','6/49'],49),
 '6/55':('Grand Lotto 6/55',['GL55','GRAND LOTTO 6/55','6/55'],55),
 '6/58':('Ultra Lotto 6/58',['UL58','ULTRA LOTTO 6/58','6/58'],58),
}
DATE_PAT=re.compile(r'((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4})',re.I)
PESO_PAT=re.compile(r'₱\s*[\d,]+(?:\.\d{2})?')

def parse_block(text:str,maxnum:int):
    text=' '.join(text.split())
    dm=DATE_PAT.search(text)
    if not dm:return None
    date=datetime.strptime(dm.group(1),'%B %d, %Y').date().isoformat()
    after=text[dm.end():]
    pm=PESO_PAT.search(after); jackpot=pm.group(0).replace('₱ ','₱') if pm else None
    start=pm.end() if pm else 0
    nums=[int(x) for x in re.findall(r'(?<!\d)(\d{1,2})(?!\d)',after[start:]) if 1<=int(x)<=maxnum]
    # Prefer the first six distinct in-range values after jackpot/date.
    pick=[]
    for n in nums:
        if n not in pick:pick.append(n)
        if len(pick)==6:break
    if len(pick)!=6:return None
    # Winner count is usually before the date; keep optional.
    before=text[:dm.start()]
    wm=re.findall(r'(?<!\d)(\d+)(?!\d)\s+WINNERS?',before,re.I)
    winners=int(wm[-1]) if wm else None
    return {'date':date,'numbers':pick,'jackpot':jackpot,'winners':winners}

async def collect():
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        page=await browser.new_page(viewport={'width':1440,'height':1400},locale='en-PH')
        await page.goto(URL,wait_until='domcontentloaded',timeout=90000)
        await page.wait_for_timeout(7000)
        body=await page.locator('body').inner_text()
        html=await page.content()
        found={}
        # Strategy 1: image alt markers and nearby ancestor text.
        imgs=page.locator('img')
        for i in range(await imgs.count()):
            img=imgs.nth(i); alt=(await img.get_attribute('alt') or '').upper()
            for gid,(name,aliases,maxnum) in GAMES.items():
                if gid in found or not any(a in alt for a in aliases):continue
                node=img
                for _ in range(7):
                    try:
                        txt=await node.inner_text()
                    except: txt=''
                    parsed=parse_block(txt,maxnum)
                    if parsed:
                        found[gid]=parsed;break
                    node=node.locator('..')
        # Strategy 2: normalized text/html windows around known aliases.
        merged=' '.join(re.sub(r'<[^>]+>',' ',html).split())+' '+' '.join(body.split())
        upper=merged.upper()
        for gid,(name,aliases,maxnum) in GAMES.items():
            if gid in found:continue
            positions=[upper.find(a) for a in aliases if upper.find(a)>=0]
            for pos in sorted(positions):
                parsed=parse_block(merged[pos:pos+650],maxnum)
                if parsed:
                    found[gid]=parsed;break
        await browser.close()
        return found

def validate(found):
    missing=set(GAMES)-set(found)
    if missing:raise RuntimeError(f'Missing games: {sorted(missing)}')
    today=datetime.now(ZoneInfo('Asia/Manila')).date()
    for gid,r in found.items():
        maxnum=GAMES[gid][2]
        if len(r['numbers'])!=6 or len(set(r['numbers']))!=6 or any(n<1 or n>maxnum for n in r['numbers']):
            raise RuntimeError(f'Invalid number set for {gid}: {r}')
        d=datetime.fromisoformat(r['date']).date()
        if d>today:raise RuntimeError(f'Future result date for {gid}: {d}')

def merge(found):
    results=json.loads(RESULTS.read_text()) if RESULTS.exists() else {'games':{}}
    history=json.loads(HISTORY.read_text()) if HISTORY.exists() else {'games':{}}
    stamp=datetime.now(ZoneInfo('Asia/Manila')).isoformat(timespec='seconds')
    for gid,r in found.items():
        results['games'][gid]={'name':GAMES[gid][0],**r}
        hist=history.setdefault('games',{}).setdefault(gid,[])
        if not any(x.get('date')==r['date'] and x.get('numbers')==r['numbers'] for x in hist):
            hist.insert(0,{'date':r['date'],'numbers':r['numbers']})
        hist.sort(key=lambda x:x['date'],reverse=True)
    results.update({'source':URL,'source_label':'Official PCSO LottoMatik','updated_at':stamp,'status':'live-updated'})
    history.update({'source':'Official PCSO LottoMatik public results','updated_at':stamp})
    RESULTS.write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
    HISTORY.write_text(json.dumps(history,ensure_ascii=False,indent=2)+'\n')

async def main():
    found=await collect();print(json.dumps(found,indent=2,ensure_ascii=False));validate(found);merge(found)
if __name__=='__main__':asyncio.run(main())
