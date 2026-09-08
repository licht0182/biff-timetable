from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    return text.replace(old, new, 1)

app_path = Path('src/App.tsx')
app = app_path.read_text()

app = replace_once(
    app,
    """  function conflicts(film: Film, screening: Screening) {\n    const start = toMinutes(screening.start)\n    const end = endMinutes(film, screening)\n    return selectedItems.some(({ film: otherFilm, screening: other }) => {\n      if (other.id === screening.id || other.date !== screening.date) return false\n      return start < endMinutes(otherFilm, other) && toMinutes(other.start) < end\n    })\n  }\n""",
    """  function conflictingSelections(film: Film, screening: Screening) {\n    const start = toMinutes(screening.start)\n    const end = endMinutes(film, screening)\n    return selectedItems.filter(({ film: otherFilm, screening: other }) => {\n      if (other.id === screening.id || other.date !== screening.date) return false\n      return start < endMinutes(otherFilm, other) && toMinutes(other.start) < end\n    })\n  }\n\n  function conflicts(film: Film, screening: Screening) {\n    return conflictingSelections(film, screening).length > 0\n  }\n""",
    'conflict helper',
)

app = replace_once(
    app,
    """    if (conflicts(film, screening)) {\n      window.alert('이미 선택한 회차와 시간이 겹칩니다.\\n겹치는 기존 회차를 먼저 제거한 뒤 추가해 주세요.')\n      return\n    }\n""",
    """    const overlapping = conflictingSelections(film, screening)\n    if (overlapping.length) {\n      const conflictDetails = overlapping.map(({ film: otherFilm, screening: other }) => {\n        const code = other.code ? `[${other.code}] ` : ''\n        return `• ${code}${otherFilm.title} · ${formatDate(other.date)} ${other.start}–${endLabel(otherFilm, other)} · ${other.venue}`\n      }).join('\\n')\n      window.alert(`이미 선택한 다음 회차와 시간이 겹칩니다.\\n${conflictDetails}\\n\\n겹치는 기존 회차를 먼저 제거한 뒤 추가해 주세요.`)\n      return\n    }\n""",
    'detailed conflict alert',
)

app = replace_once(
    app,
    """              const status = ticketStatus[screening.id] ?? 'planned'\n              return <div className={`screening-row ${hasConflict ? 'conflict' : ''} ${travel ? 'travel-warning' : ''}`} key={screening.id}>\n                <div><strong>{screening.code ? `[${screening.code}] ` : ''}{formatDate(screening.date)} {screening.start}</strong><span>{screening.venue} · {screening.start}–{endLabel(film, screening)}{screening.gv ? ' · GV' : ''}</span>{hasConflict && <small>선택한 회차와 시간이 겹칩니다.</small>}{travel && <small className=\"travel-text\">이동 여유 {travel.gap}분 · 권장 {travel.buffer}분</small>}</div>\n""",
    """              const status = ticketStatus[screening.id] ?? 'planned'\n              const rowNote = hasConflict ? '선택한 회차와 시간이 겹칩니다.' : travel ? `이동 여유 ${travel.gap}분 · 권장 ${travel.buffer}분` : ''\n              return <div className={`screening-row ${hasConflict ? 'conflict' : ''} ${travel ? 'travel-warning' : ''}`} key={screening.id}>\n                <div><strong>{screening.code ? `[${screening.code}] ` : ''}{formatDate(screening.date)} {screening.start}</strong><span>{screening.venue} · {screening.start}–{endLabel(film, screening)}{screening.gv ? ' · GV' : ''}</span><small className={`screening-note ${travel ? 'travel-text' : ''}`} title={rowNote || undefined}>{rowNote}</small></div>\n""",
    'consistent screening note slot',
)

app_path.write_text(app)

styles_path = Path('src/styles.css')
styles = styles_path.read_text()
styles = replace_once(
    styles,
    ".screening-row{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:10px 0;border-bottom:1px solid #f0f0f0}.screening-row:last-child{border-bottom:0;padding-bottom:0}",
    ".screening-row{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:10px 0;border-bottom:1px solid #f0f0f0}.screening-row:last-child{border-bottom:0}",
    'last row padding',
)
styles = replace_once(
    styles,
    ".screening-row strong{font-size:13px;letter-spacing:-.02em}.screening-row span{font-size:11px;color:#8a8a8a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.screening-row small{color:var(--accent);font-size:10px;font-weight:700}",
    ".screening-row strong{font-size:13px;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.screening-row span{font-size:11px;color:#8a8a8a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.screening-row small{color:var(--accent);font-size:10px;font-weight:700}.screening-row .screening-note{display:block;min-height:15px;line-height:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.screening-row .screening-note:empty{visibility:hidden}",
    'screening note sizing',
)
styles = replace_once(
    styles,
    ".screening-row{align-items:center;padding:9px 0;gap:8px}.screening-row strong{font-size:11px}",
    ".screening-row{align-items:center;padding:9px 0;gap:8px}.screening-row strong{font-size:11px}.screening-row .screening-note{min-height:14px;line-height:14px}",
    'mobile note sizing',
)
styles_path.write_text(styles)

features_path = Path('src/features.css')
features = features_path.read_text()
features = replace_once(
    features,
    ".screening-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-shrink:0}",
    ".screening-row>.screening-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-shrink:0}",
    'desktop screening actions specificity',
)
features = replace_once(
    features,
    "  .screening-actions{display:grid;justify-items:end;gap:4px}",
    "  .screening-row>.screening-actions{display:flex;align-items:center;justify-content:flex-end;gap:4px}",
    'mobile screening actions layout',
)
features_path.write_text(features)
