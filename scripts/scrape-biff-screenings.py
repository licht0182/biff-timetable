#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urljoin, urlparse
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

YEAR = 2026
BASE_URL = "https://www.biff.kr"
DATE_URL = BASE_URL + "/kor/html/schedule/date.asp?day1={day}"
FILM_DB_PATH = Path("public/films-2026.json")
OUT_PATH = Path("public/screenings.json")
USER_AGENT = "biff-timetable/2026-screening-database (+https://github.com/licht0182/biff-timetable)"
DAYS = range(6, 16)


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("\ufeff", "")).strip()


def fetch(url: str) -> str:
    req = Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    })
    with urlopen(req, timeout=30) as response:
        raw = response.read()
        charset = response.headers.get_content_charset() or "utf-8"
        return raw.decode(charset, errors="replace")


def parse_idx(href: str) -> str:
    parsed = urlparse(urljoin(BASE_URL, href))
    return parse_qs(parsed.query).get("idx", [""])[0]


def extract_venue(li: Any) -> str:
    clone = BeautifulSoup(str(li), "html.parser")
    for item in clone.select("div.sch_it"):
        item.decompose()
    return clean(clone.get_text(" ", strip=True))


def main_title(item: Any) -> tuple[str, str]:
    film_tit = item.select_one(".film_tit")
    if film_tit is None:
        return "", ""
    clone = BeautifulSoup(str(film_tit), "html.parser")
    for pack in clone.select(".pack"):
        pack.decompose()
    ko_node = clone.select_one(".film_tit_kor")
    en_node = clone.select_one(".film_tit_eng")
    ko = clean(ko_node.get_text(" ", strip=True) if ko_node else "")
    en = clean(en_node.get_text(" ", strip=True) if en_node else "")
    return ko, en


def add_minutes(start: str, runtime: int) -> str:
    hh, mm = map(int, start.split(":"))
    total = hh * 60 + mm + runtime
    return f"{(total // 60) % 24:02d}:{total % 60:02d}"


def metadata_to_app(film: dict[str, Any]) -> dict[str, Any]:
    production = film.get("production") or {}
    classification = film.get("classification") or {}
    editorial = film.get("editorial") or {}
    director = film.get("director") or {}
    biff = film.get("biff") or {}
    title = film.get("title") or {}
    source = film.get("source") or {}

    app: dict[str, Any] = {
        "id": film["id"],
        "title": clean(title.get("ko") or title.get("display")),
        "screenings": [],
    }
    optional = {
        "englishTitle": clean(title.get("en")),
        "director": clean(director.get("display")),
        "country": " / ".join(clean(x) for x in production.get("countries", []) if clean(x)),
        "genre": " · ".join(clean(x) for x in classification.get("themes", []) if clean(x)),
        "section": clean(biff.get("section")),
        "runtime": production.get("runtimeMinutes"),
        "url": clean(source.get("url")),
        "synopsis": clean(editorial.get("programNote")),
        "year": production.get("year"),
    }
    for key, value in optional.items():
        if value not in ("", None, []):
            app[key] = value
    return app


def special_item(
    code: str,
    title_ko: str,
    title_en: str,
    date_value: str,
    start: str,
    venue: str,
    gv: bool,
    source_url: str,
    section: str,
    synopsis: str = "",
    url: str = "",
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    film: dict[str, Any] = {
        "id": f"biff2026-event-{code}",
        "title": title_ko or f"BIFF 2026 프로그램 {code}",
        "section": section,
        "url": url or source_url,
        "screenings": [{
            "id": f"biff2026-{code}",
            "date": date_value,
            "start": start,
            "venue": venue,
            "gv": gv,
            "code": code,
        }],
    }
    if title_en:
        film["englishTitle"] = title_en
    if synopsis:
        film["synopsis"] = synopsis
    if extra:
        for key in ("director", "country", "genre", "year"):
            value = extra.get(key)
            if value not in ("", None):
                film[key] = value
    return film


def parse_schedule(films_by_idx: dict[str, dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    canonical: dict[str, dict[str, Any]] = {}
    special: list[dict[str, Any]] = []
    seen_codes: dict[str, dict[str, Any]] = {}
    unmatched: list[dict[str, Any]] = []
    venue_counts = Counter()
    date_counts = Counter()
    gv_count = 0
    package_count = 0

    for day in DAYS:
        source_url = DATE_URL.format(day=day)
        html = fetch(source_url)
        soup = BeautifulSoup(html, "html.parser")
        page_text = clean(soup.get_text(" ", strip=True))

        if "2026" not in page_text:
            raise RuntimeError(f"{source_url} does not identify the 2026 festival")
        date_value = f"{YEAR}-10-{day:02d}"
        page_actual = 0
        for li in soup.select("div.sch_li"):
            venue = extract_venue(li)
            if not venue:
                continue

            for item in li.select("div.sch_it"):
                code_node = item.select_one(".code[data-scode]")
                if code_node is None:
                    continue
                code = clean(code_node.get("data-scode") or code_node.get_text(" ", strip=True))
                time_node = item.select_one(".time")
                start = clean(time_node.get_text(" ", strip=True) if time_node else "")
                if not re.fullmatch(r"\d{3}", code):
                    raise RuntimeError(f"Unexpected screening code {code!r} on {source_url}")
                if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", start):
                    raise RuntimeError(f"Unexpected start time {start!r} for code {code}")

                ko, en = main_title(item)
                anchors = [
                    anchor for anchor in item.select('.film_tit a[href*="prog_view.asp"]')
                    if parse_idx(anchor.get("href", ""))
                ]
                idxs = []
                for anchor in anchors:
                    idx = parse_idx(anchor.get("href", ""))
                    if idx and idx not in idxs:
                        idxs.append(idx)

                is_package = item.select_one(".pack") is not None or "묶" in clean(item.get_text(" ", strip=True))
                grade_text = clean((item.select_one(".grade") or item).get_text(" ", strip=True))
                is_opening = "개막식" in grade_text or "개막식" in clean(item.get_text(" ", strip=True))
                is_closing = "폐막식" in grade_text or "폐막식" in clean(item.get_text(" ", strip=True))
                gv = item.select_one(".ico_gv") is not None

                record = {
                    "code": code,
                    "date": date_value,
                    "start": start,
                    "venue": venue,
                    "title": ko,
                    "englishTitle": en,
                    "idxs": idxs,
                    "package": is_package,
                    "gv": gv,
                }
                if code in seen_codes:
                    raise RuntimeError(f"Duplicate screening code {code}: {seen_codes[code]} vs {record}")
                seen_codes[code] = record
                page_actual += 1
                date_counts[date_value] += 1
                venue_counts[venue] += 1
                gv_count += int(gv)

                if is_package or len(idxs) > 1:
                    package_count += 1
                    components = [films_by_idx[idx] for idx in idxs if idx in films_by_idx]
                    missing = [idx for idx in idxs if idx not in films_by_idx]
                    if missing:
                        raise RuntimeError(f"Package {code} contains unknown film idx(s): {missing}")
                    component_ko = [clean((film.get("title") or {}).get("ko")) for film in components]
                    component_en = [clean((film.get("title") or {}).get("en")) for film in components]
                    display_ko = ko or "묶음상영"
                    display_en = en
                    if component_ko:
                        display_ko = f"{display_ko} ({' · '.join(component_ko)})"
                    if component_en:
                        display_en = f"{display_en} ({' · '.join(component_en)})" if display_en else " · ".join(component_en)
                    sections = [clean((film.get("biff") or {}).get("section")) for film in components]
                    sections = [value for value in sections if value]
                    section = sections[0] if sections and len(set(sections)) == 1 else "묶음상영"
                    synopsis = "묶음상영 구성: " + " · ".join(
                        clean((film.get("title") or {}).get("display")) for film in components
                    )
                    special.append(special_item(
                        code, display_ko, display_en, date_value, start, venue, gv,
                        source_url, section, synopsis=synopsis,
                    ))
                    continue

                if is_opening or is_closing:
                    linked = films_by_idx.get(idxs[0]) if idxs else None
                    base = metadata_to_app(linked) if linked else {}
                    label = "개막식" if is_opening else "폐막식"
                    base_ko = clean(base.get("title") or ko)
                    base_en = clean(base.get("englishTitle") or en)
                    special.append(special_item(
                        code,
                        f"{label} + {base_ko}" if base_ko else label,
                        base_en,
                        date_value,
                        start,
                        venue,
                        gv,
                        source_url,
                        "개·폐막식",
                        synopsis=clean(base.get("synopsis")),
                        url=clean(base.get("url")),
                        extra=base,
                    ))
                    continue

                if len(idxs) == 1 and idxs[0] in films_by_idx:
                    rich = films_by_idx[idxs[0]]
                    app = canonical.setdefault(idxs[0], metadata_to_app(rich))
                    screening: dict[str, Any] = {
                        "id": f"biff2026-{code}",
                        "date": date_value,
                        "start": start,
                        "venue": venue,
                        "gv": gv,
                        "code": code,
                    }
                    runtime = app.get("runtime")
                    if isinstance(runtime, int) and runtime > 0:
                        screening["end"] = add_minutes(start, runtime)
                    app["screenings"].append(screening)
                    continue

                if idxs:
                    unmatched.append(record)
                    continue

                # Schedule-only events/classes without a film detail page.
                if not ko:
                    text = clean(item.get_text(" ", strip=True))
                    text = re.sub(rf"^{re.escape(code)}\s+{re.escape(start)}\s*", "", text)
                    ko = text or f"BIFF 2026 프로그램 {code}"
                special.append(special_item(
                    code, ko, en, date_value, start, venue, gv, source_url, "행사"
                ))

        if page_actual == 0:
            raise RuntimeError(f"No screenings parsed from {source_url}")

    if unmatched:
        raise RuntimeError(f"{len(unmatched)} single-film screenings could not be matched to the official 2026 film DB: {unmatched[:5]}")

    if "001" not in seen_codes or seen_codes["001"]["date"] != "2026-10-06" or seen_codes["001"]["start"] != "18:00":
        raise RuntimeError("Official opening screening cross-check failed for code 001")
    if "002" not in seen_codes or seen_codes["002"]["date"] != "2026-10-15":
        raise RuntimeError("Official closing screening cross-check failed for code 002")
    if "163" not in seen_codes:
        raise RuntimeError("Cross-check screening 163 is missing")
    sample_163 = seen_codes["163"]
    if sample_163["date"] != "2026-10-09" or sample_163["start"] != "20:00" or "루프씨어터" not in sample_163["venue"] or "스파이럴" not in sample_163["title"]:
        raise RuntimeError(f"Official date/theater cross-check failed for code 163: {sample_163}")

    if len(seen_codes) < 500:
        raise RuntimeError(f"Parsed only {len(seen_codes)} screening codes; refusing a likely partial schedule")
    if set(date_counts) != {f"2026-10-{day:02d}" for day in DAYS}:
        raise RuntimeError(f"Date coverage is incomplete: {dict(date_counts)}")

    films = [film for film in canonical.values() if film.get("screenings")]
    films.extend(special)
    films.sort(key=lambda film: (
        min(screening["date"] + screening["start"] for screening in film["screenings"]),
        film["title"],
    ))

    # Every official code must map to exactly one app screening/ticket unit.
    output_codes = [
        screening.get("code")
        for film in films
        for screening in film.get("screenings", [])
    ]
    if len(output_codes) != len(seen_codes) or len(set(output_codes)) != len(output_codes):
        raise RuntimeError(
            f"Screening-code mapping mismatch: official={len(seen_codes)} app={len(output_codes)} unique={len(set(output_codes))}"
        )

    summary = {
        "filmEntries": len(films),
        "canonicalFilmEntries": len(canonical),
        "specialOrPackageEntries": len(special),
        "screeningCount": len(seen_codes),
        "packageCount": package_count,
        "gvScreeningCount": gv_count,
        "dateCounts": dict(sorted(date_counts.items())),
        "venueCounts": dict(sorted(venue_counts.items())),
    }
    return films, summary


def main() -> int:
    rich_films = json.loads(FILM_DB_PATH.read_text(encoding="utf-8"))
    films_by_idx = {
        str((film.get("biff") or {}).get("idx")): film
        for film in rich_films
        if (film.get("biff") or {}).get("idx")
    }
    if len(rich_films) != 246 or len(films_by_idx) != 246:
        raise RuntimeError(
            f"Expected the validated 246-film official 2026 DB, got films={len(rich_films)} idx={len(films_by_idx)}"
        )

    films, summary = parse_schedule(films_by_idx)
    payload = {
        "note": "BIFF 2026 공식 날짜별 상영시간표와 공식 작품정보를 결합한 데이터입니다. 묶음상영은 하나의 티켓/시간표 항목으로 표현합니다.",
        "source": "https://www.biff.kr/kor/html/schedule/date.asp",
        "films": films,
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("BIFF 2026 official screenings generated:")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
