/**
 * Legacy compatibility shim.
 *
 * The timetable now owns a fixed pixel-per-hour geometry and participates in
 * normal document scrolling. Keep this export because App calls it while
 * switching sections, but intentionally do not install viewport locks,
 * resize interception, or overflow mutations.
 */
export function releaseTimetableViewportLock() {
  // No-op by design.
}
