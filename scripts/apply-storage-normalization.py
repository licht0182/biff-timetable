from pathlib import Path

path = Path('src/App.tsx')
text = path.read_text()

old = '''function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}
'''
new = '''function readStorageValue(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)))
}

function normalizeTicketStatus(value: unknown): TicketStatusMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries = Object.entries(value).filter(([id, status]) => (
    id.trim().length > 0 && (status === 'planned' || status === 'booked')
  ))
  return Object.fromEntries(entries) as TicketStatusMap
}
'''
if old not in text:
    raise SystemExit('readStorage block not found')
text = text.replace(old, new, 1)

replacements = {
    "const [selected, setSelected] = useState<string[]>(() => readStorage(STORAGE_KEY, [] as string[]))": "const [selected, setSelected] = useState<string[]>(() => normalizeStringArray(readStorageValue(STORAGE_KEY)))",
    "const [favorites, setFavorites] = useState<string[]>(() => readStorage(FAVORITES_KEY, [] as string[]))": "const [favorites, setFavorites] = useState<string[]>(() => normalizeStringArray(readStorageValue(FAVORITES_KEY)))",
    "const [ticketStatus, setTicketStatus] = useState<TicketStatusMap>(() => readStorage(TICKET_STATUS_KEY, {} as TicketStatusMap))": "const [ticketStatus, setTicketStatus] = useState<TicketStatusMap>(() => normalizeTicketStatus(readStorageValue(TICKET_STATUS_KEY)))",
    "const [userSettings, setUserSettings] = useState<UserTimetableSettings>(() => normalizeUserSettings(readStorage(USER_SETTINGS_KEY, DEFAULT_USER_SETTINGS)))": "const [userSettings, setUserSettings] = useState<UserTimetableSettings>(() => normalizeUserSettings(readStorageValue(USER_SETTINGS_KEY)))",
}
for old_line, new_line in replacements.items():
    if old_line not in text:
        raise SystemExit(f'missing initializer: {old_line}')
    text = text.replace(old_line, new_line, 1)

path.write_text(text)
