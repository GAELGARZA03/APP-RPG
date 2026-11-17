// Selector de hora propio (en lugar del reloj de Android): horas y minutos en botones grandes.
import { Clock, Minus, Plus } from 'lucide-react'
import { useId, useState } from 'react'
import { useBack } from '../backStack'
import { Sheet, SheetTitle } from '../Sheet'
import { Button } from './Button'
import { cn } from './cn'

const pad = (value: number) => String(value).padStart(2, '0')
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5)

/** «7:30 p. m.» para mostrar; el valor guardado sigue siendo «19:30». */
export function formatTime(value: string): string {
  const [hour, minute] = value.split(':').map(Number)
  const suffix = hour < 12 ? 'a. m.' : 'p. m.'
  return `${hour % 12 === 0 ? 12 : hour % 12}:${pad(minute)} ${suffix}`
}

export function TimeField(props: {
  value: string
  onChange: (value: string) => void
  /** Si se pasa, el campo puede quedar vacío («Sin recordatorio»). */
  onClear?: () => void
  label: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={props.value ? `${props.label}: ${formatTime(props.value)}` : props.label}
        className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-void px-3 text-left text-ink active:border-signal"
      >
        <Clock aria-hidden className="size-4 text-muted" />
        <span className={cn('tabular-nums', !props.value && 'text-muted')}>
          {props.value ? formatTime(props.value) : (props.placeholder ?? 'Elegir hora')}
        </span>
      </button>
      {open && (
        <TimePicker
          label={props.label}
          value={props.value || '08:00'}
          onClear={props.onClear}
          onClose={() => setOpen(false)}
          onChange={(value) => {
            props.onChange(value)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function TimePicker(props: {
  label: string
  value: string
  onChange: (value: string) => void
  onClear?: () => void
  onClose: () => void
}) {
  const headingId = useId()
  const [hour, setHour] = useState(Number(props.value.split(':')[0]))
  const [minute, setMinute] = useState(Number(props.value.split(':')[1]))
  // El botón atrás cierra solo este selector, no la hoja de abajo.
  useBack(true, props.onClose)

  const nudge = (amount: number) => {
    const total = (hour * 60 + minute + amount + 1440) % 1440
    setHour(Math.floor(total / 60))
    setMinute(total % 60)
  }

  return (
    <Sheet labelledBy={headingId} focusSheet onClose={props.onClose}>
      <div className="flex flex-col gap-4">
        <SheetTitle id={headingId} icon={<Clock aria-hidden className="size-5 text-signal" />}>
          {props.label}
        </SheetTitle>
        <div className="flex items-center justify-center gap-3">
          <Button size="icon" variant="secondary" aria-label="Un minuto menos" onClick={() => nudge(-1)}>
            <Minus aria-hidden />
          </Button>
          <output aria-live="polite" className="min-w-40 text-center font-display text-4xl font-semibold tabular-nums">
            {formatTime(`${pad(hour)}:${pad(minute)}`)}
          </output>
          <Button size="icon" variant="secondary" aria-label="Un minuto más" onClick={() => nudge(1)}>
            <Plus aria-hidden />
          </Button>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-muted">Hora</legend>
          <div className="grid grid-cols-6 gap-1.5">
            {HOURS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={hour === option}
                onClick={() => setHour(option)}
                className={cn(
                  'min-h-10 rounded-xl border text-sm font-semibold tabular-nums',
                  hour === option
                    ? 'border-signal bg-signal text-on-signal'
                    : 'border-white/[0.06] bg-void/50 text-muted',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-muted">Minutos</legend>
          <div className="grid grid-cols-6 gap-1.5">
            {MINUTES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={minute === option}
                onClick={() => setMinute(option)}
                className={cn(
                  'min-h-10 rounded-xl border text-sm font-semibold tabular-nums',
                  minute === option
                    ? 'border-signal bg-signal text-on-signal'
                    : 'border-white/[0.06] bg-void/50 text-muted',
                )}
              >
                :{pad(option)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">Para un minuto exacto, usa − y +.</p>
        </fieldset>

        <div className="flex gap-2">
          {props.onClear ? (
            <Button
              onClick={() => {
                props.onClear!()
                props.onClose()
              }}
              className="flex-1"
            >
              Quitar
            </Button>
          ) : (
            <Button onClick={props.onClose} className="flex-1">
              Cancelar
            </Button>
          )}
          <Button variant="primary" onClick={() => props.onChange(`${pad(hour)}:${pad(minute)}`)} className="flex-1">
            Listo
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
