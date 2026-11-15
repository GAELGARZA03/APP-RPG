// Gráfica de línea de las horas dormidas en el periodo visible de la libreta, con la meta y el promedio.
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Moon, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { db } from '../../data/appDb'
import { getSleepRange, setSleep } from '../../data/gameStore'
import { weekdayOf, type GameDay } from '../../game/gameDay'
import { haptic } from '../../platform/haptics'
import { Button } from '../kit/Button'
import { formatHours, SleepStepper } from './SleepStepper'

const W = 320
const H = 132
const PAD = { left: 24, right: 8, top: 12, bottom: 22 }
const MAX_Y = 12
const LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function SleepChart({ first, last, today }: { first: GameDay; last: GameDay; today: GameDay }) {
  const range = useLiveQuery(() => getSleepRange(db, first, last), [first, last])
  const [selected, setSelected] = useState<GameDay | null>(null)
  const [draft, setDraft] = useState<number | null>(null)
  if (!range) return null

  const count = range.days.length
  const step = (W - PAD.left - PAD.right) / count
  const x = (index: number) => PAD.left + step * index + step / 2
  const y = (hours: number) => PAD.top + (1 - Math.min(hours, MAX_Y) / MAX_Y) * (H - PAD.top - PAD.bottom)

  // Tramos de línea entre días seguidos con registro; un día sin dato corta la línea.
  const segments: Array<Array<[number, number]>> = []
  range.days.forEach((item, index) => {
    if (item.hours === null) return
    const previous = range.days[index - 1]
    if (!previous || previous.hours === null) segments.push([])
    segments[segments.length - 1].push([x(index), y(item.hours)])
  })

  const chosen = selected ? range.days.find((item) => item.day === selected) : undefined
  const value = draft ?? chosen?.hours ?? 7.5
  const labelEvery = count <= 7 ? 1 : 5

  function select(day: GameDay) {
    if (day > today) return
    setSelected(day === selected ? null : day)
    setDraft(null)
  }

  async function save(hours: number | null) {
    if (!selected) return
    await setSleep(db, selected, hours)
    haptic('tap')
    setSelected(null)
    setDraft(null)
  }

  return (
    <section
      aria-label="Sueño"
      className="notebook-paper flex flex-col gap-2 rounded-3xl border border-white/[0.08] p-3"
    >
      <header className="flex items-center justify-between gap-2 px-1">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide uppercase">
          <Moon aria-hidden className="size-4 text-info" />
          Sueño
        </h2>
        <p className="text-xs text-muted">
          {range.average === null ? 'Sin registros' : `Promedio ${formatHours(Math.round(range.average * 2) / 2)}`}
          {' · '}Meta {range.goal} h
        </p>
      </header>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Horas dormidas por día">
        {[4, 8, 12].map((hours) => (
          <g key={hours}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(hours)}
              y2={y(hours)}
              stroke="currentColor"
              className={hours === range.goal ? 'text-signal/60' : 'text-white/[0.07]'}
              strokeDasharray={hours === range.goal ? '4 4' : undefined}
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={y(hours) + 3} textAnchor="end" className="fill-muted text-[9px]">
              {hours}
            </text>
          </g>
        ))}
        {segments.map((points, index) =>
          points.length > 1 ? (
            <polyline
              key={index}
              points={points.map(([px, py]) => `${px},${py}`).join(' ')}
              fill="none"
              stroke="var(--color-info)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null,
        )}
        {range.days.map((item, index) => (
          <g key={item.day}>
            {item.day === selected && (
              <rect
                x={x(index) - step / 2}
                y={PAD.top - 4}
                width={step}
                height={H - PAD.top - PAD.bottom + 8}
                rx={4}
                className="fill-info/10"
              />
            )}
            {item.hours !== null && (
              <circle
                cx={x(index)}
                cy={y(item.hours)}
                r={count > 14 ? 3 : 4}
                fill="var(--color-info)"
                stroke="var(--color-panel)"
                strokeWidth={2}
              />
            )}
            {(index % labelEvery === 0 || item.day === today) && (
              <text
                x={x(index)}
                y={H - 6}
                textAnchor="middle"
                className={item.day === today ? 'fill-signal text-[9px] font-bold' : 'fill-muted text-[9px]'}
              >
                {count <= 7 ? `${LETTERS[weekdayOf(item.day)]}${Number(item.day.slice(8))}` : Number(item.day.slice(8))}
              </text>
            )}
            {/* Zona tocable más grande que el punto: toda la columna del día. */}
            <rect
              x={x(index) - step / 2}
              y={0}
              width={step}
              height={H}
              fill="transparent"
              className={item.day > today ? undefined : 'cursor-pointer'}
              onClick={() => select(item.day)}
            >
              <title>
                {item.hours === null
                  ? `Día ${Number(item.day.slice(8))}: sin registro`
                  : `Día ${Number(item.day.slice(8))}: ${formatHours(item.hours)}`}
              </title>
            </rect>
          </g>
        ))}
      </svg>

      {selected && (
        <div className="flex flex-col gap-2 rounded-2xl bg-void/60 p-3">
          <p className="text-center text-xs text-muted">
            Noche anterior al día {Number(selected.slice(8))}
            {chosen?.hours !== null && chosen?.hours !== undefined ? ` · registrado ${formatHours(chosen.hours)}` : ''}
          </p>
          <SleepStepper value={value} onChange={setDraft} />
          <div className="flex justify-end gap-2">
            {chosen?.hours !== null && chosen?.hours !== undefined && (
              <Button size="sm" variant="ghost" onClick={() => void save(null)}>
                <Trash2 aria-hidden />
                Borrar
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={() => void save(value)}>
              <Check aria-hidden />
              Guardar
            </Button>
          </div>
        </div>
      )}
      {!selected && <p className="px-1 text-[11px] text-muted">Toca un día para registrar o corregir sus horas.</p>}
    </section>
  )
}
