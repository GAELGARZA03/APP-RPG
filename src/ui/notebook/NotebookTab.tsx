// Libreta de hábitos: una fila por hábito y una casilla por día, con vistas de 3 días, 7 días o el mes.
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronLeft, ChevronRight, Flame, ListChecks, NotebookPen, Plus, Route, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { db } from '../../data/appDb'
import type { HabitState } from '../../data/db'
import {
  getDiaryRange,
  getHabitGrid,
  getRoute,
  nextHabitState,
  setHabitState,
  type NotebookCell,
  type NotebookHabit,
  type Outcome,
  type TaskRef,
  noteCover,
} from '../../data/gameStore'
import { addDays, type GameDay } from '../../game/gameDay'
import { haptic } from '../../platform/haptics'
import { Button } from '../kit/Button'
import { cn } from '../kit/cn'
import { RouteOfferCard } from '../route/RouteOfferCard'
import { SleepChart } from '../sleep/SleepChart'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]
const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const STATE_LABEL: Record<HabitState, string> = { done: 'hecho', half: 'a medias', missed: 'no hecho' }

type View = '3' | '7' | 'month'
const VIEWS: Array<{ id: View; label: string }> = [
  { id: '3', label: '3 días' },
  { id: '7', label: '7 días' },
  { id: 'month', label: 'Mes' },
]
const VIEW_KEY = 'libreta:vista'

function savedView(): View {
  try {
    const value = localStorage.getItem(VIEW_KEY)
    return value === '3' || value === '7' || value === 'month' ? value : '7'
  } catch {
    return '7'
  }
}

const dayNumber = (day: GameDay) => Number(day.slice(8))
const monthIndex = (day: GameDay) => Number(day.slice(5, 7)) - 1

/** Primer y último día que se ven, según la vista y el día de referencia. */
function rangeOf(view: View, anchor: GameDay): [GameDay, GameDay] {
  if (view === 'month') {
    const first = `${anchor.slice(0, 7)}-01`
    const [year, month] = anchor.split('-').map(Number)
    return [first, addDays(first, new Date(Date.UTC(year, month, 0)).getUTCDate() - 1)]
  }
  return [addDays(anchor, -(Number(view) - 1)), anchor]
}

function periodLabel(view: View, [first, last]: [GameDay, GameDay]): string {
  if (view === 'month') return `${MONTH_NAMES[monthIndex(first)]} ${first.slice(0, 4)}`
  const start = `${dayNumber(first)}${monthIndex(first) === monthIndex(last) ? '' : ` ${MONTHS[monthIndex(first)]}`}`
  return `${start} – ${dayNumber(last)} ${MONTHS[monthIndex(last)]}`
}

export function NotebookTab(props: {
  today: GameDay
  onManage: () => void
  onRoute: () => void
  onOpenDiary: (day: GameDay) => void
  onOpenHabit: (habitId: string) => void
  onCreate: () => void
  onOutcome: (outcome: Outcome, ref: TaskRef, fromDetail: boolean) => void
}) {
  const { today } = props
  const [view, setViewState] = useState<View>(savedView)
  // En 3 y 7 días, el último día visible; en la vista de mes, cualquier día de ese mes.
  const [anchor, setAnchor] = useState(today)
  const range = rangeOf(view, anchor)
  const grid = useLiveQuery(() => getHabitGrid(db, range[0], range[1], today), [range[0], range[1], today])
  const diary = useLiveQuery(() => getDiaryRange(db, range[0], range[1]), [range[0], range[1]])
  const route = useLiveQuery(() => getRoute(db, today), [today])
  const scroller = useRef<HTMLDivElement>(null)
  const todayHeader = useRef<HTMLDivElement>(null)

  function setView(next: View) {
    setViewState(next)
    setAnchor(today)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // Sin almacenamiento, la vista simplemente no se recuerda.
    }
  }

  function shift(direction: -1 | 1) {
    if (view === 'month') {
      const [year, month] = anchor.split('-').map(Number)
      const date = new Date(Date.UTC(year, month - 1 + direction, 1))
      const next = date.toISOString().slice(0, 10)
      setAnchor(next > today ? today : next)
    } else {
      const next = addDays(anchor, direction * Number(view))
      setAnchor(next > today ? today : next)
    }
  }

  // En la vista de mes, la cuadrícula se desplaza sola hasta hoy.
  useEffect(() => {
    if (view !== 'month' || !scroller.current || !todayHeader.current) return
    scroller.current.scrollLeft = Math.max(0, todayHeader.current.offsetLeft - scroller.current.clientWidth / 2)
  }, [view, grid === undefined, range[0]])

  async function toggle(habit: NotebookHabit, cell: NotebookCell) {
    if (!cell.scheduled || cell.access === 'none') return
    const xp = await setHabitState(db, habit.id, cell.day, nextHabitState(cell.state))
    haptic('tap')
    if (xp && xp > 0) props.onOutcome({ ok: true, xp }, { kind: 'habit', id: habit.id }, false)
  }

  const habits = grid?.habits ?? []
  const compact = view === 'month'
  const atPresent = range[1] >= today

  return (
    <>
      <header className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold">Libreta</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={props.onRoute}>
            <Route aria-hidden />
            Ruta
          </Button>
          <Button size="sm" variant="outline" onClick={props.onManage}>
            <ListChecks aria-hidden />
            Hábitos
          </Button>
        </div>
      </header>

      {route
        ?.filter((step) => step.offer)
        .map((step) => (
          <RouteOfferCard key={step.id} step={step} />
        ))}

      <div role="radiogroup" aria-label="Vista" className="grid grid-cols-3 gap-1 rounded-2xl bg-raised/70 p-1">
        {VIEWS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={view === option.id}
            onClick={() => setView(option.id)}
            className={cn(
              'min-h-10 rounded-xl text-sm font-medium transition-colors',
              view === option.id ? 'bg-signal text-on-signal' : 'text-muted active:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="-my-1 flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" aria-label="Anterior" onClick={() => shift(-1)}>
          <ChevronLeft aria-hidden />
        </Button>
        <button
          type="button"
          onClick={() => setAnchor(today)}
          disabled={atPresent}
          className="font-display text-base font-semibold disabled:cursor-default"
          aria-live="polite"
        >
          {periodLabel(view, range)}
          {!atPresent && <span className="ml-2 text-xs font-normal text-signal">Ir a hoy</span>}
        </button>
        <Button variant="ghost" size="icon" aria-label="Siguiente" disabled={atPresent} onClick={() => shift(1)}>
          <ChevronRight aria-hidden />
        </Button>
      </div>

      {grid && habits.length === 0 && (
        <div className="notebook-paper flex flex-col items-center gap-3 rounded-3xl border border-white/[0.08] px-6 py-12 text-center">
          <p className="font-display text-xl font-semibold">Tu libreta está en blanco</p>
          <p className="text-sm text-muted">
            Agrega los hábitos que quieres llevar. Cada uno será una fila, y cada día, una casilla.
          </p>
          <Button variant="primary" onClick={props.onCreate}>
            <Plus aria-hidden />
            Nuevo hábito
          </Button>
        </div>
      )}

      {grid && habits.length > 0 && (
        <>
          <div
            ref={scroller}
            className={cn('notebook-paper rounded-3xl border border-white/[0.08]', compact && 'overflow-x-auto')}
          >
            <div role="grid" aria-label="Hábitos" className={cn('flex flex-col', compact && 'w-max min-w-full')}>
              <div role="row" className="flex border-b border-white/[0.06]">
                <div
                  role="columnheader"
                  className={cn(
                    'sticky left-0 z-10 flex shrink-0 items-end rounded-tl-3xl bg-panel/95 px-3 pb-2 text-[11px] text-muted',
                    view === '3' ? 'w-32' : view === '7' ? 'w-[6.5rem]' : 'w-28',
                  )}
                >
                  Hábito
                </div>
                {grid.days.map((info) => (
                  <div
                    key={info.day}
                    ref={info.isToday ? todayHeader : undefined}
                    role="columnheader"
                    aria-label={info.isToday ? 'Hoy' : undefined}
                    className={cn(
                      'flex flex-col items-center py-2 leading-tight',
                      compact ? 'w-9 shrink-0' : 'min-w-0 flex-1',
                      info.isToday ? 'text-signal' : info.future ? 'text-muted/50' : 'text-muted',
                    )}
                  >
                    <span className="text-[10px]">{WEEKDAY_LETTERS[info.weekday]}</span>
                    <span
                      className={cn(
                        'grid size-6 place-items-center rounded-full text-xs font-semibold tabular-nums',
                        info.isToday && 'bg-signal text-on-signal',
                      )}
                    >
                      {dayNumber(info.day)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Fila del diario: los días con nota llevan su marca; tocar un día abre su página. */}
              <div role="row" className="flex border-b border-white/[0.06]">
                <div
                  role="rowheader"
                  className={cn(
                    'sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-panel/95 py-1 pr-1 pl-3 text-[13px] font-medium',
                    view === '3' ? 'w-32' : view === '7' ? 'w-[6.5rem]' : 'w-28',
                  )}
                >
                  <NotebookPen aria-hidden className="size-4 text-info" />
                  Diario
                </div>
                {grid.days.map((info) => {
                  const note = diary?.get(info.day)
                  return (
                    <div
                      key={info.day}
                      role="gridcell"
                      className={cn(
                        'grid place-items-center py-1',
                        view === 'month' ? 'w-9 shrink-0' : 'min-w-0 flex-1',
                        info.isToday && 'bg-signal/[0.07]',
                      )}
                    >
                      <button
                        type="button"
                        disabled={info.future}
                        onClick={() => props.onOpenDiary(info.day)}
                        aria-label={`Diario del día ${dayNumber(info.day)}${note ? ', con nota' : ', sin nota'}`}
                        className={cn(
                          'relative grid place-items-center overflow-hidden rounded-md',
                          view === '3' ? 'size-12' : view === '7' ? 'size-[26px]' : 'size-7',
                          note ? 'bg-info/20 text-info' : 'text-muted/40',
                        )}
                      >
                        {noteCover(note) ? (
                          <img src={noteCover(note)} alt="" className="absolute inset-0 size-full object-cover" />
                        ) : note ? (
                          <NotebookPen aria-hidden className="size-3.5" />
                        ) : (
                          !info.future && <span aria-hidden className="size-1 rounded-full bg-current" />
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>

              {habits.map((habit, row) => (
                <div
                  key={habit.id}
                  role="row"
                  className={cn('flex', row > 0 && 'border-t border-white/[0.04]', habit.archived && 'opacity-50')}
                >
                  <button
                    type="button"
                    role="rowheader"
                    onClick={() => props.onOpenHabit(habit.id)}
                    aria-label={`${habit.title}: ver estadísticas`}
                    className={cn(
                      'sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-panel/95 py-1.5 pr-1 pl-3 text-left active:bg-raised',
                      view === '3' ? 'w-32' : view === '7' ? 'w-[6.5rem]' : 'w-28',
                    )}
                  >
                    {habit.emoji && <span className="text-lg leading-none">{habit.emoji}</span>}
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-[13px] leading-tight font-medium">{habit.title}</span>
                      <span className="flex items-center gap-1.5 text-[10px] text-muted tabular-nums">
                        <span className={cn('flex items-center', habit.streak > 0 && 'text-signal')}>
                          <Flame aria-hidden className="size-3" />
                          {habit.streak}
                        </span>
                        {habit.rate !== null && <span>{habit.rate}%</span>}
                      </span>
                    </span>
                  </button>
                  {habit.cells.map((cell, index) => (
                    <Cell
                      key={cell.day}
                      habit={habit}
                      cell={cell}
                      size={view}
                      today={grid.days[index].isToday}
                      onToggle={() => void toggle(habit, cell)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <Legend />
        </>
      )}

      {grid && <SleepChart first={range[0]} last={range[1]} today={today} />}
    </>
  )
}

function Cell(props: { habit: NotebookHabit; cell: NotebookCell; size: View; today: boolean; onToggle: () => void }) {
  const { cell, habit, size } = props
  const disabled = !cell.scheduled || cell.access === 'none'
  const label = !cell.scheduled
    ? `${habit.title}: no toca el día ${dayNumber(cell.day)}`
    : `${habit.title}, día ${dayNumber(cell.day)}: ${cell.state ? STATE_LABEL[cell.state] : 'sin registrar'}`

  return (
    <div
      role="gridcell"
      className={cn(
        'grid place-items-center',
        size === '3' ? 'py-1.5' : 'py-1',
        size === 'month' ? 'w-9 shrink-0' : 'min-w-0 flex-1',
        props.today && 'bg-signal/[0.07]',
      )}
    >
      <motion.button
        type="button"
        whileTap={disabled ? undefined : { scale: 0.85 }}
        disabled={disabled}
        aria-label={label}
        onClick={props.onToggle}
        className={cn(
          'relative grid place-items-center overflow-hidden border font-bold transition-colors',
          size === '3'
            ? 'size-12 rounded-xl text-sm'
            : size === '7'
              ? 'size-[26px] rounded-md text-[10px]'
              : 'size-7 rounded-md text-[10px]',
          !cell.scheduled && 'border-transparent',
          cell.scheduled && cell.state === null && 'border-white/15',
          cell.scheduled && cell.state === null && cell.access === 'none' && 'border-white/[0.06]',
          cell.state === 'done' && 'border-signal bg-signal text-on-signal',
          cell.state === 'half' && 'border-signal text-signal',
          cell.state === 'missed' && 'border-ember/50 text-ember',
          props.today && cell.scheduled && cell.state === null && 'border-signal/60',
        )}
      >
        {!cell.scheduled && <span aria-hidden className="size-1 rounded-full bg-white/15" />}
        {cell.state === 'done' && (
          <Check aria-hidden className={size === '3' ? 'size-4' : 'size-3.5'} strokeWidth={3.5} />
        )}
        {cell.state === 'half' && (
          <>
            <span aria-hidden className="absolute inset-y-0 left-0 w-1/2 bg-signal/60" />
            <span aria-hidden className="relative">
              ½
            </span>
          </>
        )}
        {cell.state === 'missed' && <X aria-hidden className={size === '3' ? 'size-4' : 'size-3.5'} strokeWidth={3} />}
      </motion.button>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-col gap-2 text-xs text-muted">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-1.5">
          <span className="grid size-5 place-items-center rounded-md bg-signal text-on-signal">
            <Check aria-hidden className="size-3" strokeWidth={3.5} />
          </span>
          Hecho
        </span>
        <span className="flex items-center gap-1.5">
          <span className="relative grid size-5 place-items-center overflow-hidden rounded-md border border-signal text-[9px] font-bold text-signal">
            <span className="absolute inset-y-0 left-0 w-1/2 bg-signal/60" />
            <span className="relative">½</span>
          </span>
          A medias
        </span>
        <span className="flex items-center gap-1.5">
          <span className="grid size-5 place-items-center rounded-md border border-ember/50 text-ember">
            <X aria-hidden className="size-3" strokeWidth={3} />
          </span>
          No hecho
        </span>
        <span className="flex items-center gap-1.5">
          <span className="grid size-5 place-items-center">
            <span className="size-1 rounded-full bg-white/25" />
          </span>
          No toca
        </span>
      </div>
      <p>Toca una casilla para cambiarla. Hoy y ayer dan XP; los días anteriores solo se registran.</p>
    </div>
  )
}
