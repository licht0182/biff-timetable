#!/usr/bin/env python3
from urllib.request import Request, urlopen
from bs4 import BeautifulSoup

URL = "https://www.biff.kr/kor/html/schedule/date.asp?day1=9"
req = Request(URL, headers={
    "User-Agent": "biff-timetable/2026-schedule-probe (+https://github.com/licht0182/biff-timetable)",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
})
with urlopen(req, timeout=30) as response:
    raw = response.read()
    html = raw.decode(response.headers.get_content_charset() or "utf-8", errors="replace")

print(f"schedule probe bytes={len(raw)}")
soup = BeautifulSoup(html, "html.parser")
items = soup.select("div.sch_it")
print(f"schedule items={len(items)}")

for index, item in enumerate(items[:8]):
    print(f"\n=== item {index} classes={item.get('class')} ===")
    print(item.prettify()[:12000])
    parent = item.find_parent("div", class_="sch_li")
    if parent is not None:
        print("--- sch_li text ---")
        print(parent.get_text(" | ", strip=True)[:2500])

venues = []
for li in soup.select("div.sch_li"):
    text = li.get_text(" ", strip=True)
    if text:
        venues.append(text[:300])
print(f"sch_li blocks={len(venues)}")
for i, text in enumerate(venues[:12]):
    print(f"SCHLI[{i}] {text}")
