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

soup = BeautifulSoup(html, "html.parser")
print(f"schedule probe bytes={len(raw)}")
print(f"schedule items={len(soup.select('div.sch_it'))}")

first_li = soup.select_one("div.sch_li")
print("\n=== first sch_li ===")
print(first_li.prettify()[:16000] if first_li else "(none)")

packs = [item for item in soup.select("div.sch_it") if item.select_one(".pack")]
print(f"\npack items={len(packs)}")
for index, item in enumerate(packs[:5]):
    print(f"\n=== pack {index} ===")
    print(item.prettify()[:20000])

print("\n=== structural summary ===")
for i, li in enumerate(soup.select("div.sch_li")[:5]):
    print("sch_li", i)
    for child in li.find_all(recursive=False):
        print(" child", child.name, child.get("class"), repr(child.get_text(" ", strip=True)[:250]))
