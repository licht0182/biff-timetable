# Mobile layout regression baseline

This branch targets the iOS Safari regressions reported on 2026-09-21. Automated
regression coverage is intentionally deferred to the next verification phase; this
file records the reproduction contract used for implementation.

## Reference viewport

- Primary: 393 × 852, WebKit/iPhone-class viewport
- Narrow: 320 × 740
- Secondary: 390 × 844

## Reproduction scenarios

1. Open **영화 찾기 → 검색·필터**.
   - The sheet must be viewport-anchored at the bottom.
   - Inputs and buttons must remain clickable.
   - Tapping the backdrop must close the sheet.
   - The page must not gain horizontal overflow.

2. Inspect the **검색 결과 N편** toolbar.
   - No refraction shard or compositing artifact may appear at its left edge.

3. Switch among **영화 찾기 / 내 시간표 / AI 도슨트 / 설정**.
   - The first visible content surface must use the same mobile top gap and gutter.

4. Start with an empty timetable.
   - JSON backup import must remain reachable without adding an event first.

5. Import a valid JSON backup.
   - The completion toast must remain a compact pill and must not stretch between
     simultaneous top and bottom anchors.

6. Enter timetable grid view, then leave for each other primary section.
   - `timetable-viewport-locked` must not remain on `html` or `body`.
   - The floating dock must return to its normal material and position.

7. In timetable grid view at 320–393 px width.
   - Primary actions must not squeeze the timetable or introduce horizontal overflow.
   - Secondary actions must be reachable from the overflow menu.

8. Open settings at mobile width.
   - The outer settings wrapper must not render as an extra nested glass card.
   - The transfer matrix may scroll horizontally inside its own container only.

## Layout ownership rule

- `liquid-glass.css`: color, transparency, blur, highlight, shadow.
- `mobile-layout-system.css`: mobile geometry, overlay position, page spacing,
  overflow, toast anchors, and timetable toolbar reflow.
- Timetable viewport locking is limited to grid view and must be released when the
  grid is no longer the active view.
