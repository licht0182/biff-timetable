import { useRef, useState, type MouseEvent, type ReactNode } from 'react'

type TimetableOverflowMenuProps = {
  label: string
  className?: string
  children: ReactNode
}

export default function TimetableOverflowMenu({ label, className = '', children }: TimetableOverflowMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(false)

  const closeAfterAction = (event: MouseEvent<HTMLDetailsElement>) => {
    const target = event.target
    if (!(target instanceof Element) || !target.closest('button')) return

    queueMicrotask(() => {
      if (detailsRef.current) detailsRef.current.open = false
      setOpen(false)
    })
  }

  return (
    <details
      ref={detailsRef}
      className={`backup-menu timetable-more-menu ${className}`.trim()}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onClick={closeAfterAction}
    >
      <summary aria-label={open ? `${label} 메뉴 닫기` : `${label} 메뉴 열기`}>{label}</summary>
      <div>{children}</div>
    </details>
  )
}
