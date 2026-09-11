# 2026 BIFF film database

`public/films-2026.json` is a structured snapshot of all **246 unique official 2026 BIFF selections** currently exposed by the Busan International Film Festival's official selection and film-detail pages.

The official all-films catalogue currently contains more section rows than unique films because some titles belong to multiple program sections. The database therefore preserves **all section memberships** instead of forcing every film into one section.

The film database deliberately stays separate from timetable data. Screening dates, start times, theaters, screening codes, GV/event timing, and schedule-specific information belong in `public/screenings.json` when the official timetable is available.

## Data groups

Each film record is divided into these groups:

- `id`, `festivalYear`: stable database identity for the 2026 snapshot.
- `biff`: BIFF internal IDs, premiere labels, the first official catalogue section for convenient sorting, and `sections[]` containing every official section membership.
  - `sections[].name`: exact catalogue section such as `비전 - 아시아`.
  - `sections[].group`: parent group such as `비전`.
  - `sections[].heading`: the complete official section heading/description visible above the catalogue table.
- `title`: normalized Korean title, English/international title, and display title.
- `classification`: the official `#작품검색` topic labels displayed on the film page. These are stored as `themes[]` without splitting labels such as `역사/전쟁`.
- `production`: country/region, production year, runtime, screening format, and color information.
- `editorial`: the official BIFF Program Note and its author when the byline is detectable.
- `director`: normalized Korean/English director names plus the complete text exposed in the Director area. This intentionally keeps adjacent official photo-credit text when present.
- `credits`: text and label/value pairs found in the Credit area. The current static 2026 pages expose the Credit heading but may expose no credit body, in which case the empty source state is preserved rather than invented.
- `media`: official image/CDN URLs, image metadata, page copyright notices, Photo-area text, and raw trailer/video/media-related page references. Image binaries are not copied into the repository.
- `rawSections`: source-order strings from Film Info, Program Note, Director, Credit, and Photo areas. These are retained so information is not lost when it cannot yet be normalized safely.
- `source`: canonical official film URL, all-films list URL, catalogue entries, selected HTML metadata/attributes, and a SHA-256 fingerprint of the source text.

The companion `public/films-2026.meta.json` stores:

- unique film count,
- official catalogue row / section-membership count,
- primary-section counts,
- all section-membership counts,
- field coverage checks,
- collection time,
- schema version.

## Normalization rules

1. The all-films catalogue is the authority for program section membership.
2. A title can have more than one official section, so `biff.sections[]` is authoritative. `biff.section` is only the first catalogue membership for convenience.
3. Film Info strings before `국가` are normalized as Korean title, English/international title, then zero or more official `#작품검색` themes after removing trailer controls and premiere labels.
4. Slash characters inside a theme are preserved. For example, `역사/전쟁` remains one official topic label.
5. Empty official fields remain empty. The collector does not infer or fabricate missing credits, themes, or other source data.
6. Official image files stay on BIFF/CDN infrastructure; only references and associated metadata are stored.

## Collection and validation

The collector reads only official BIFF pages and refuses to save a partial snapshot unless it:

- discovers exactly 246 unique official film detail URLs,
- successfully fetches all 246 detail pages,
- assigns every film at least one official catalogue section,
- produces unique film IDs and source URLs,
- preserves required title/production/director/Program Note/media data.

Run locally:

```bash
pip install -r scripts/requirements-biff-scrape.txt
python scripts/scrape-biff-films.py
npm run validate:films
```

The dedicated GitHub Actions workflow refreshes the database on the data branch, and the normal CI workflow validates the generated snapshot on every pull request.
