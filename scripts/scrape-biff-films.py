#!/usr/bin/env python3
from __future__ import annotations

import concurrent.futures
import hashlib
import json
import re
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urljoin, urlparse
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup, Tag

YEAR = 2026
BASE_URL = "https://www.biff.kr"
LIST_URL = f"{BASE_URL}/kor/html/program/prog_all_list.asp?allYear={YEAR}"
EXPECTED_OFFICIAL_COUNT = 246
OUT_PATH = Path("public/films-2026.json")
META_PATH = Path("public/films-2026.meta.json")
USER_AGENT = "biff-timetable/2026-film-database (+https://github.com/licht0182/biff-timetable)"

SECTION_PREFIXES = [
    "개·폐막작", "개막작", "폐막작", "경쟁", "갈라 프레젠테이션", "아이콘",
    "비전 - 아시아", "비전 - 한국", "비전", "아시아영화의 창",
    "한국영화의 오늘 - 스페셜 프리미어", "한국영화의 오늘 - 파노라마", "한국영화의 오늘",
    "월드 시네마", "플래시 포워드", "와이드 앵글", "오픈 시네마",
    "미드나잇 패션", "온 스크린", "특별기획 프로그램", "특별상영",
]
PAGE_SECTION_MARKERS = ["영화 정보", "Program Note", "Director", "Credit", "Photo", "Screening"]
INFO_LABELS = ["국가", "제작연도", "러닝타임", "상영포맷", "컬러"]
PREMIERE_LABELS = ["World Premiere", "International Premiere", "Korean Premiere", "Asian Premiere"]


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def fetch(url: str, attempts: int = 4) -> str:
    last_error = None
    for attempt in range(attempts):
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8"})
            with urlopen(req, timeout=30) as response:
                raw = response.read()
                charset = response.headers.get_content_charset() or "utf-8"
                try:
                    return raw.decode(charset)
                except UnicodeDecodeError:
                    return raw.decode("utf-8", errors="replace")
        except Exception as exc:
            last_error = exc
            time.sleep(1.0 + attempt * 1.5)
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def normalize_detail_url(href: str) -> str | None:
    if not href:
        return None
    href = href.replace("&amp;", "&")
    if "prog_view.asp" not in href:
        return None
    absolute = urljoin(BASE_URL, href)
    parsed = urlparse(absolute)
    query = parse_qs(parsed.query)
    if not query.get("idx"):
        return None
    c_idx = query.get("c_idx", [""])[0]
    idx = query["idx"][0]
    return f"{BASE_URL}/kor/html/program/prog_view.asp?c_idx={c_idx}&idx={idx}"


def normalized_section(text: str) -> str:
    text = clean(text)
    for prefix in sorted(SECTION_PREFIXES, key=len, reverse=True):
        if text.startswith(prefix):
            return prefix
    return text[:160]


def nearest_section(anchor: Tag) -> tuple[str, str]:
    heading = anchor.find_previous(["h2", "h3", "h4", "h5"])
    if not heading:
        return "", ""
    full = clean(heading.get_text(" ", strip=True))
    return normalized_section(full), full


def parse_list_page(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    records: dict[str, dict[str, Any]] = {}

    for anchor in soup.find_all("a", href=True):
        url = normalize_detail_url(anchor.get("href", ""))
        if not url:
            continue
        parsed = parse_qs(urlparse(url).query)
        idx = parsed["idx"][0]
        c_idx = parsed.get("c_idx", [""])[0]
        row = anchor.find_parent("tr")
        cells = [clean(td.get_text(" ", strip=True)) for td in row.find_all(["th", "td"], recursive=False)] if row else []
        section, section_heading = nearest_section(anchor)
        anchor_text = clean(anchor.get_text(" ", strip=True))

        title_cell = cells[0] if cells else anchor_text
        director_cell = cells[1] if len(cells) > 1 else ""
        countries_cell = cells[2] if len(cells) > 2 else ""
        title_cell = re.sub(r"\s*트레일러\s*$", "", title_cell).strip()

        records[idx] = {
            "idx": idx,
            "cIdx": c_idx,
            "url": url,
            "section": section,
            "sectionHeading": section_heading,
            "listTitle": title_cell,
            "listDirector": director_cell,
            "listCountries": countries_cell,
        }

    if not records:
        # Fallback for links embedded in scripts/onclick.
        for match in re.findall(r"""(?:https?://[^"'\s]+)?/?kor/html/program/prog_view\.asp\?[^"'<>\s]+""", html, re.I):
            url = normalize_detail_url(match)
            if not url:
                continue
            parsed = parse_qs(urlparse(url).query)
            idx = parsed["idx"][0]
            records[idx] = {
                "idx": idx,
                "cIdx": parsed.get("c_idx", [""])[0],
                "url": url,
                "section": "",
                "sectionHeading": "",
                "listTitle": "",
                "listDirector": "",
                "listCountries": "",
            }

    return list(records.values())


def split_bilingual(raw: str) -> tuple[str, str]:
    raw = clean(raw)
    if " / " in raw:
        left, right = raw.split(" / ", 1)
        return clean(left), clean(right)
    return raw, ""


def string_segment(strings: list[str], start: str, end: str | None) -> list[str]:
    try:
        start_idx = strings.index(start) + 1
    except ValueError:
        return []
    if end is None:
        return strings[start_idx:]
    try:
        end_idx = strings.index(end, start_idx)
    except ValueError:
        end_idx = len(strings)
    return strings[start_idx:end_idx]


def read_labeled_value(segment: list[str], label: str) -> str:
    for i, value in enumerate(segment):
        if value == label and i + 1 < len(segment):
            return clean(segment[i + 1])
        if value.startswith(label + " "):
            return clean(value[len(label):])
    return ""


def extract_pairs(soup: BeautifulSoup) -> list[dict[str, str]]:
    pairs: list[dict[str, str]] = []
    seen = set()
    for dt in soup.find_all("dt"):
        dd = dt.find_next_sibling("dd")
        if dd:
            key, value = clean(dt.get_text(" ", strip=True)), clean(dd.get_text(" ", strip=True))
            if key and value and (key, value) not in seen:
                seen.add((key, value))
                pairs.append({"key": key, "value": value})
    for row in soup.find_all("tr"):
        cells = row.find_all(["th", "td"], recursive=False)
        if len(cells) == 2:
            key, value = clean(cells[0].get_text(" ", strip=True)), clean(cells[1].get_text(" ", strip=True))
            if key and value and len(key) < 100 and (key, value) not in seen:
                seen.add((key, value))
                pairs.append({"key": key, "value": value})
    return pairs


def media_from_page(soup: BeautifulSoup) -> dict[str, Any]:
    images = []
    seen_images = set()
    for img in soup.find_all("img", src=True):
        src = urljoin(BASE_URL, img.get("src", ""))
        if "cloudfront.net" not in src and "/upload/" not in src and "/Upload/" not in src:
            continue
        if src in seen_images:
            continue
        seen_images.add(src)
        parent_text = clean(img.parent.get_text(" ", strip=True)) if img.parent else ""
        copyright_match = re.search(r"©\s*[^|]{1,120}", parent_text)
        images.append({
            "url": src,
            "alt": clean(img.get("alt", "")),
            "title": clean(img.get("title", "")),
            "copyrightOrCaption": clean(copyright_match.group(0)) if copyright_match else "",
        })

    media_refs = []
    seen_refs = set()
    for tag in soup.find_all(True):
        for key, value in tag.attrs.items():
            values = value if isinstance(value, list) else [value]
            for item in values:
                text = str(item)
                lower = text.lower()
                if any(token in lower for token in ("youtube", "youtu.be", "vimeo", "trailer", "video", "movie")):
                    ref = {"tag": tag.name, "attribute": key, "value": text}
                    sig = (tag.name, key, text)
                    if sig not in seen_refs:
                        seen_refs.add(sig)
                        media_refs.append(ref)
    return {"images": images, "mediaReferences": media_refs}


def data_attributes(soup: BeautifulSoup) -> list[dict[str, Any]]:
    output = []
    for tag in soup.find_all(True):
        attrs = {}
        for key, value in tag.attrs.items():
            if key.startswith("data-") or key in {"onclick", "href", "src"}:
                text = " ".join(value) if isinstance(value, list) else str(value)
                if any(token in text.lower() for token in ("prog_", "trailer", "video", "youtube", "vimeo", "movie")):
                    attrs[key] = text
        if attrs:
            output.append({"tag": tag.name, "attrs": attrs})
    return output[:100]


def parse_detail(record: dict[str, Any]) -> dict[str, Any]:
    html = fetch(record["url"])
    soup = BeautifulSoup(html, "html.parser")
    strings = [clean(s) for s in soup.stripped_strings if clean(s)]

    info_segment = string_segment(strings, "영화 정보", "Program Note")
    program_note_parts = string_segment(strings, "Program Note", "Director")
    director_parts = string_segment(strings, "Director", "Credit")
    credit_parts = string_segment(strings, "Credit", "Photo")
    photo_parts = string_segment(strings, "Photo", "BIFF NEWSLETTER")

    title_ko, title_en = split_bilingual(record.get("listTitle", ""))
    director_ko, director_en = split_bilingual(record.get("listDirector", ""))

    country_raw = read_labeled_value(info_segment, "국가") or record.get("listCountries", "")
    year_raw = read_labeled_value(info_segment, "제작연도")
    runtime_raw = read_labeled_value(info_segment, "러닝타임")
    format_raw = read_labeled_value(info_segment, "상영포맷")
    color_raw = read_labeled_value(info_segment, "컬러")

    # The genre is normally the standalone string immediately before the country label.
    genre_raw = ""
    if "국가" in info_segment:
        idx = info_segment.index("국가")
        candidates = [x for x in info_segment[:idx] if x not in {"트레일러 재생"} and "©" not in x]
        candidates = [x for x in candidates if x not in {record.get("listTitle", ""), title_ko, title_en}]
        if candidates:
            genre_raw = candidates[-1]

    runtime_match = re.search(r"(\d+)", runtime_raw)
    year_match = re.search(r"(19|20)\d{2}", year_raw)
    premiere = [label for label in PREMIERE_LABELS if label in strings]

    note_text = clean(" ".join(program_note_parts))
    note_author = ""
    author_match = re.search(r"\(([^()]{2,30})\)\s*$", note_text)
    if author_match:
        note_author = clean(author_match.group(1))

    meta_tags = {}
    for meta in soup.find_all("meta"):
        key = meta.get("property") or meta.get("name")
        value = meta.get("content")
        if key and value and (str(key).startswith("og:") or str(key).lower() in {"description", "keywords"}):
            meta_tags[str(key)] = str(value)

    all_pairs = extract_pairs(soup)
    media = media_from_page(soup)

    parsed = {
        "id": f"biff-{YEAR}-{record['idx']}",
        "festivalYear": YEAR,
        "biff": {
            "idx": record["idx"],
            "cIdx": record.get("cIdx", ""),
            "section": record.get("section", ""),
            "sectionHeading": record.get("sectionHeading", ""),
            "premiere": premiere,
        },
        "title": {
            "ko": title_ko,
            "en": title_en,
            "display": record.get("listTitle", ""),
        },
        "classification": {
            "genres": [clean(x) for x in re.split(r"\s*/\s*", genre_raw) if clean(x)],
            "genreRaw": genre_raw,
        },
        "production": {
            "countries": [clean(x) for x in re.split(r"\s*/\s*", country_raw) if clean(x)],
            "countriesRaw": country_raw,
            "year": int(year_match.group(0)) if year_match else None,
            "runtimeMinutes": int(runtime_match.group(1)) if runtime_match else None,
            "runtimeRaw": runtime_raw,
            "screeningFormat": format_raw,
            "color": color_raw,
        },
        "editorial": {
            "programNote": note_text,
            "programNoteAuthor": note_author,
        },
        "director": {
            "nameKo": director_ko,
            "nameEn": director_en,
            "display": record.get("listDirector", ""),
            "sectionText": clean(" ".join(director_parts)),
        },
        "credits": {
            "sectionText": clean(" ".join(credit_parts)),
            "labeledPairs": all_pairs,
        },
        "media": media,
        "rawSections": {
            "filmInfo": info_segment,
            "programNote": program_note_parts,
            "director": director_parts,
            "credit": credit_parts,
            "photo": photo_parts,
        },
        "source": {
            "url": record["url"],
            "listUrl": LIST_URL,
            "meta": meta_tags,
            "relevantAttributes": data_attributes(soup),
            "textSha256": hashlib.sha256(clean(" ".join(strings)).encode("utf-8")).hexdigest(),
        },
    }
    return parsed


def main() -> int:
    list_html = fetch(LIST_URL)
    list_records = parse_list_page(list_html)
    print(f"Discovered {len(list_records)} unique film detail URLs from {LIST_URL}")

    if len(list_records) != EXPECTED_OFFICIAL_COUNT:
        sample = [r.get("url") for r in list_records[:5]]
        print(json.dumps({"expected": EXPECTED_OFFICIAL_COUNT, "actual": len(list_records), "sample": sample}, ensure_ascii=False, indent=2))
        raise RuntimeError("Official film count mismatch; refusing to save a partial database.")

    films: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(parse_detail, record): record for record in list_records}
        for i, future in enumerate(concurrent.futures.as_completed(futures), 1):
            record = futures[future]
            try:
                films.append(future.result())
            except Exception as exc:
                errors.append({"url": record["url"], "error": str(exc)})
            if i % 25 == 0 or i == len(futures):
                print(f"Processed {i}/{len(futures)} detail pages")

    if errors:
        print(json.dumps(errors[:20], ensure_ascii=False, indent=2))
        raise RuntimeError(f"{len(errors)} film detail pages failed; refusing to save partial data.")

    films.sort(key=lambda film: (film["biff"]["section"], film["title"]["ko"], film["biff"]["idx"]))
    ids = [film["id"] for film in films]
    urls = [film["source"]["url"] for film in films]
    if len(ids) != len(set(ids)) or len(urls) != len(set(urls)):
        raise RuntimeError("Duplicate film ids or detail URLs detected.")

    missing_title = [film["source"]["url"] for film in films if not film["title"]["display"]]
    if missing_title:
        raise RuntimeError(f"{len(missing_title)} films are missing titles.")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(films, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    section_counts = Counter(film["biff"]["section"] or "(unclassified)" for film in films)
    with_notes = sum(bool(film["editorial"]["programNote"]) for film in films)
    with_images = sum(bool(film["media"]["images"]) for film in films)
    with_director = sum(bool(film["director"]["display"]) for film in films)
    collected_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    meta = {
        "festivalYear": YEAR,
        "source": LIST_URL,
        "expectedOfficialCount": EXPECTED_OFFICIAL_COUNT,
        "filmCount": len(films),
        "collectedAtUtc": collected_at,
        "sectionCounts": dict(sorted(section_counts.items())),
        "coverage": {
            "withProgramNote": with_notes,
            "withDirector": with_director,
            "withImages": with_images,
        },
        "databaseFile": str(OUT_PATH),
        "schemaVersion": 1,
    }
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(meta, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
