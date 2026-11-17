// Selector de hora propio, estilo ruedas del iPhone: hora, minuto y a. m./p. m. que se giran con el dedo.
import { Clock } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../../platform/haptics'
import { useBack } from '../backStack'
import { Sheet, SheetTitle } from '../Sheet'
import { Button } from './Button'
import { cn } from './cn'

const pad = (value: number) => String(value).padStart(2, '0')
const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1))
const MINUTES = Array.from({ length: 60 }, (_, minute) => pad(minute))
const PERIODS = ['a. m.', 'p. m.']

/** Alto de cada renglón de una rueda y cuántos se ven (el del centro es el elegido). */
const ROW = 44
const VISIBLE = 5

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
      {/* Va en un portal: dentro del <label> de un campo, tocar fuera «tocaba» el botón y lo reabría. */}
      {open &&
        createPortal(
          <TimePicker
            label={props.label}
            value={props.value || '08:00'}
            onClear={props.onClear}
            onClose={() => setOpen(false)}
            onChange={(value) => {
              props.onChange(value)
              setOpen(false)
            }}
          />,
          document.body,
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
  const [initialHour, initialMinute] = props.value.split(':').map(Number)
  const [hour12, setHour12] = useState(((initialHour + 11) % 12) + 1)
  const [minute, setMinute] = useState(initialMinute)
  const [pm, setPm] = useState(initialHour >= 12)
  const hourRef = useRef(((initialHour + 11) % 12) + 1)

  /** Como en un reloj de 12 horas: pasar de 11 a 12 (o de 12 a 11) cambia entre a. m. y p. m. */
  function changeHour(next: number) {
    const previous = hourRef.current
    if ((previous === 11 && next === 12) || (previous === 12 && next === 11)) setPm((value) => !value)
    hourRef.current = next
    setHour12(next)
  }
  // El botón atrás cierra solo este selector, no la hoja de abajo.
  useBack(true, props.onClose)

  const hour24 = (hour12 % 12) + (pm ? 12 : 0)
  const value = `${pad(hour24)}:${pad(minute)}`

  return (
    <Sheet labelledBy={headingId} focusSheet onClose={props.onClose}>
      <div className="flex flex-col gap-4">
        <SheetTitle id={headingId} icon={<Clock aria-hidden className="size-5 text-signal" />}>
          {props.label}
        </SheetTitle>

        <div className="relative flex justify-center gap-1" style={{ height: ROW * VISIBLE }}>
          {/* Banda del centro: lo que quede ahí es lo elegido. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-2 rounded-2xl bg-white/[0.07]"
            style={{ top: ROW * 2, height: ROW }}
          />
          <Wheel
            label="Hora"
            items={HOURS}
            index={hour12 - 1}
            onChange={(index) => changeHour(index + 1)}
            loop
            className="w-20"
          />
          <span aria-hidden className="relative z-10 self-center font-display text-2xl font-semibold text-muted">
            :
          </span>
          <Wheel label="Minuto" items={MINUTES} index={minute} onChange={setMinute} loop className="w-20" />
          <Wheel
            label="a. m. o p. m."
            items={PERIODS}
            index={pm ? 1 : 0}
            onChange={(index) => setPm(index === 1)}
            className="w-24"
          />
        </div>

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
          <Button variant="primary" onClick={() => props.onChange(value)} className="flex-1">
            Listo · {formatTime(value)}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/**
 * Una rueda: se desliza hacia arriba o abajo y se acomoda sola en el renglón más cercano (scroll-snap).
 * Con `loop`, da vueltas sin fin (después de 12 viene 1; después de 59, 00): los valores se dibujan tres veces
 * y, al detenerse cerca de una orilla, la rueda salta sin que se note a la copia del centro.
 * También responde a las flechas del teclado y a tocar un renglón.
 */
function Wheel(props: {
  label: string
  items: string[]
  index: number
  onChange: (index: number) => void
  loop?: boolean
  className?: string
}) {
  const { items, index, onChange, loop = false } = props
  const count = items.length
  const copies = loop ? 3 : 1
  const base = loop ? count : 0
  const scroller = useRef<HTMLDivElement>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const current = useRef(index)

  // Al abrir, la rueda se coloca en el valor actual (en la copia del centro) sin animación.
  useEffect(() => {
    scroller.current?.scrollTo({ top: (base + index) * ROW })
  }, [])

  // Si el valor cambia desde fuera (por ejemplo, a. m./p. m. al dar la vuelta a la hora), la rueda gira sola.
  useEffect(() => {
    if (index === current.current) return
    current.current = index
    scroller.current?.scrollTo({ top: (base + index) * ROW, behavior: 'smooth' })
  }, [index, base])

  function handleScroll() {
    const element = scroller.current
    if (!element) return
    const position = Math.min(count * copies - 1, Math.max(0, Math.round(element.scrollTop / ROW)))
    const next = position % count
    if (next !== current.current) {
      current.current = next
      haptic('tap')
      onChange(next)
    }
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      // Si quedó en la primera o la última copia, salta a la del centro: el contenido es igual, no se nota.
      if (loop && (position < count || position >= count * 2)) element.scrollTo({ top: (count + next) * ROW })
      else element.scrollTo({ top: position * ROW, behavior: 'smooth' })
    }, 140)
  }

  /** Mueve la rueda `steps` renglones (negativo, hacia arriba). */
  function move(steps: number) {
    const element = scroller.current
    if (!element) return
    const position = Math.round(element.scrollTop / ROW)
    const target = loop ? position + steps : Math.min(count - 1, Math.max(0, position + steps))
    element.scrollTo({ top: target * ROW, behavior: 'smooth' })
  }

  return (
    <div
      ref={scroller}
      role="listbox"
      aria-label={props.label}
      aria-activedescendant={`${props.label}-${base + index}`}
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') move(1)
        if (event.key === 'ArrowUp') move(-1)
      }}
      className={cn(
        'relative z-10 h-full snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        props.className,
      )}
      style={{
        paddingBlock: ROW * 2,
        // Los renglones se desvanecen hacia arriba y hacia abajo, como en una rueda.
        maskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)',
      }}
    >
      {Array.from({ length: count * copies }, (_, position) => {
        const value = position % count
        return (
          <div
            key={position}
            id={`${props.label}-${position}`}
            role="option"
            aria-selected={value === index}
            aria-hidden={loop && (position < count || position >= count * 2) ? true : undefined}
            onClick={(event) => {
              const element = scroller.current
              if (!element) return
              event.stopPropagation()
              move(position - Math.round(element.scrollTop / ROW))
            }}
            className={cn(
              'grid snap-center place-items-center font-display tabular-nums transition-colors',
              value === index ? 'text-2xl font-semibold text-ink' : 'text-xl text-muted',
            )}
            style={{ height: ROW }}
          >
            {items[value]}
          </div>
        )
      })}
    </div>
  )
}
