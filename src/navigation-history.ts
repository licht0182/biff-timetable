export type AppTab = 'films' | 'timetable' | 'curator'

export type BiffNavigationState = {
  tab: AppTab
  settingsOpen: boolean
  curatorSlug: string | null
}

const HISTORY_KEY = 'biffNavigation'
const DEFAULT_NAVIGATION: BiffNavigationState = {
  tab: 'films',
  settingsOpen: false,
  curatorSlug: null,
}

function isAppTab(value: unknown): value is AppTab {
  return value === 'films' || value === 'timetable' || value === 'curator'
}

function rawHistoryState(state: unknown = window.history.state) {
  return state && typeof state === 'object' && !Array.isArray(state)
    ? state as Record<string, unknown>
    : {}
}

export function hasNavigationState(state: unknown = window.history.state) {
  const source = rawHistoryState(state)
  return HISTORY_KEY in source
}

export function readNavigationState(state: unknown = window.history.state): BiffNavigationState {
  const source = rawHistoryState(state)
  const candidate = source[HISTORY_KEY]
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return { ...DEFAULT_NAVIGATION }

  const navigation = candidate as Partial<BiffNavigationState>
  return {
    tab: isAppTab(navigation.tab) ? navigation.tab : DEFAULT_NAVIGATION.tab,
    settingsOpen: typeof navigation.settingsOpen === 'boolean' ? navigation.settingsOpen : false,
    curatorSlug: typeof navigation.curatorSlug === 'string' && navigation.curatorSlug.trim().length > 0
      ? navigation.curatorSlug
      : null,
  }
}

function mergedHistoryState(navigation: BiffNavigationState) {
  return {
    ...rawHistoryState(),
    [HISTORY_KEY]: navigation,
  }
}

export function sameNavigationState(a: BiffNavigationState, b: BiffNavigationState) {
  return a.tab === b.tab
    && a.settingsOpen === b.settingsOpen
    && a.curatorSlug === b.curatorSlug
}

export function pushNavigationState(navigation: BiffNavigationState) {
  const current = readNavigationState()
  if (sameNavigationState(current, navigation) && hasNavigationState()) return false
  window.history.pushState(mergedHistoryState(navigation), '')
  return true
}

export function replaceNavigationState(navigation: BiffNavigationState) {
  window.history.replaceState(mergedHistoryState(navigation), '')
}
