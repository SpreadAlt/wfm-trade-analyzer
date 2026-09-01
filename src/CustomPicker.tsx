import { useEffect, useId, useRef, useState } from 'react'

export type PickerOption = {
  value: string
  label: string
  disabled?: boolean
}

export const CustomPicker = ({ value, options, onChange, label, disabled = false, compact = false, className = '' }: {
  value: string
  options: PickerOption[]
  onChange: (value: string) => void
  label: string
  disabled?: boolean
  compact?: boolean
  className?: string
}) => {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const listId = useId()
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value))
  const selected = options[selectedIndex] || options[0]

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    addEventListener('pointerdown', close)
    return () => removeEventListener('pointerdown', close)
  }, [open])

  const choose = (option: PickerOption) => {
    if (option.disabled) return
    onChange(option.value)
    setOpen(false)
    requestAnimationFrame(() => buttonRef.current?.focus())
  }

  const move = (step: number) => {
    if (!options.length) return
    let index = selectedIndex
    for (let count = 0; count < options.length; count += 1) {
      index = (index + step + options.length) % options.length
      if (!options[index].disabled) {
        onChange(options[index].value)
        return
      }
    }
  }

  return <div className={`custom-picker ${compact ? 'compact' : ''} ${open ? 'open' : ''} ${className}`.trim()} ref={rootRef}>
    <button
      ref={buttonRef}
      type="button"
      className="custom-picker-button"
      disabled={disabled || !options.length}
      aria-label={label}
      aria-haspopup="listbox"
      aria-controls={listId}
      aria-expanded={open}
      onClick={() => setOpen(current => !current)}
      onKeyDown={event => {
        if (event.key === 'Escape') { setOpen(false); return }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          move(event.key === 'ArrowDown' ? 1 : -1)
        }
      }}
    >
      <span>{selected?.label || value}</span>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 7.5 4.5 4.5 4.5-4.5"/></svg>
    </button>
    {open ? <div id={listId} className="custom-picker-menu" role="listbox" aria-label={label}>
      {options.map(option => <button
        type="button"
        role="option"
        aria-selected={option.value === value}
        disabled={option.disabled}
        className={option.value === value ? 'selected' : ''}
        key={option.value}
        onClick={() => choose(option)}
      ><span>{option.label}</span>{option.value === value ? <b aria-hidden="true">✓</b> : null}</button>)}
    </div> : null}
  </div>
}
