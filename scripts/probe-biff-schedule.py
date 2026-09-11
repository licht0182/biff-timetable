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
anchors = [a for a in soup.find_all("a", href=True) if "prog_view.asp" in a["href"]]
print(f"film anchors={len(anchors)}")

for index, anchor in enumerate(anchors[:8]):
    print(f"\n--- anchor {index} ---")
    print("href=", anchor.get("href"))
    print("text=", anchor.get_text(" ", strip=True))
    node = anchor
    for depth in range(1, 6):
        node = node.parent
        if node is None:
            break
        print("depth", depth, "tag", node.name, "class", node.get("class"), "id", node.get("id"))
    block = anchor.find_parent(["li", "tr", "div"])
    if block is not None:
        print(str(block)[:6000])
