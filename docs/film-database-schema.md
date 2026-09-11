# 2026 BIFF film database

`public/films-2026.json` is a structured snapshot of every official 2026 BIFF film page currently listed by the Busan International Film Festival.

The scraper deliberately keeps screening timetable data separate. Screening dates, times, theaters, screening codes, GV information and other schedule-specific fields belong in `public/screenings.json` once the official timetable is published.

## Data groups

Each film record is divided into these groups:

- `id`, `festivalYear`: stable database identity.
- `biff`: BIFF detail-page IDs, program section, original section heading, and premiere labels.
- `title`: Korean, English, and source display title.
- `classification`: genre/category information shown on the film page.
- `production`: country/region, production year, runtime, screening format, and color information.
- `editorial`: BIFF Program Note and the note author when detectable.
- `director`: director names from the official list and all text available in the Director section.
- `credits`: text from the Credit section plus label/value pairs recoverable from definition lists and two-column tables.
- `media`: official image/CDN references, captions or copyright text when detectable, plus trailer/video-related page references.
- `rawSections`: source-order strings for Film Info, Program Note, Director, Credit, and Photo sections. These preserve page information even when a field cannot yet be normalized safely.
- `source`: canonical official page URL, list URL, selected page metadata, relevant media/data attributes, and a SHA-256 fingerprint of page text.

The companion `public/films-2026.meta.json` stores record count, section counts, coverage checks, collection time, and schema version.

## Collection policy

The collector reads only the official BIFF website and refuses to save partial output unless it finds exactly the official 2026 invited-film count (246) and successfully fetches every discovered detail page. Image binaries are not copied into this repository; their official source URLs and associated metadata are stored instead.

Run manually with:

```bash
pip install -r scripts/requirements-biff-scrape.txt
python scripts/scrape-biff-films.py
```

The dedicated GitHub Actions workflow can also refresh the database on the data branch.
