// Detalle de un hábito: calendario grande de todo su historial, estadísticas de largo plazo y consejos.
import { useLiveQuery } from 'dexie-react-hooks'
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Lightbulb,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Pencil,
  ThumbsUp,
  TrendingUp,
  Trophy,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { runHabitAnalysis } from '../../ai/habitAnalysis'
import { aiSession } from '../../ai/session'
import { db } from '../../data/appDb'
import type { Habit } from '../../data/db'
import { formatClock, getHabitStats, MIN_TIME_SAMPLES, type HabitInsight } from '../../data/gameStore'
import { addDays, weekdayOf, type GameDay } from '../../game/gameDay'
import { isScheduledOn } from '../../data/store/shared'
import { Button } from '../kit/Button'
import { cardSurface, SectionLabel } from '../kit/Card'
import { cn } from '../kit/cn'
import { PrincipleChip } from '../library/PrincipleChip'
import { Screen } from '../Screen'

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

function shiftMonth(month: string, amount: number): string {
  const [year, number] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, number - 1 + amount, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

const shortDate = (day: GameDay) => {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}
const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)} %`)

export function HabitDetailScreen(props: {
  habitId: string
  today: GameDay
  onClose: () => void
  onEdit: (habit: Habit) => void
}) {
  const { habitId, today } = props
  const stats = useLiveQuery(() => getHabitStats(db, habitId, today), [habitId, today])
  const [month, setMonth] = useState(today.slice(0, 7))

  if (stats === null) {
    return (
      <Screen title="Hábito" onClose={props.onClose}>
        <p className="px-4 text-sm text-muted">Este hábito ya no existe.</p>
      </Screen>
    )
  }
  const habit = stats?.habit
  const unit = stats?.weekly ? 'semanas' : 'días'

  return (
    <Screen
      title={habit ? `${habit.emoji ? `${habit.emoji} ` : ''}${habit.title}` : 'Hábito'}
      eyebrow="Hábito"
      onClose={props.onClose}
      action={
        habit && (
          <Button variant="ghost" size="icon" aria-label="Editar hábito" onClick={() => props.onEdit(habit)}>
            <Pencil aria-hidden />
          </Button>
        )
      }
    >
      {stats && habit && (
        <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-10">
          <div className="grid grid-cols-2 gap-2">
            <Tile
              icon={Flame}
              label="Racha actual"
              value={`${stats.streak} ${stats.streak === 1 ? unit.slice(0, -1) : unit}`}
              accent
            />
            {stats.weekly ? (
              <Tile icon={Trophy} label="Semanas cumplidas" value={`${stats.weeksMet} de ${stats.weeksTotal}`} />
            ) : (
              <Tile icon={Trophy} label="Mejor racha" value={`${stats.best} ${stats.best === 1 ? 'día' : 'días'}`} />
            )}
            <Tile icon={CalendarCheck} label="Cumplimiento total" value={percent(stats.rate)} />
            <Tile icon={TrendingUp} label="Últimos 30 días" value={percent(stats.rate30)} />
          </div>

          <p className="text-sm text-muted">
            Desde el {shortDate(stats.start)}
            {stats.weekly ? `, ${stats.weekly} veces por semana` : ''}: {stats.done}{' '}
            {stats.done === 1 ? 'hecho' : 'hechos'}
            {stats.half > 0 && `, ${stats.half} a medias`}
            {stats.missed > 0 && `, ${stats.missed} sin hacer`}
            {stats.unregistered > 0 && `, ${stats.unregistered} sin registrar`}.
          </p>

          <HabitCalendar
            habit={habit}
            logs={stats.logs}
            month={month}
            today={today}
            canGoBack={month > stats.start.slice(0, 7)}
            onMonth={(amount) => setMonth(shiftMonth(month, amount))}
          />

          {stats.weekdays && stats.scheduled >= 7 && (
            <section aria-label="Por día de la semana" className="flex flex-col gap-2">
              <SectionLabel>Por día de la semana</SectionLabel>
              <div className={cn(cardSurface, 'grid grid-cols-7 items-end gap-2 p-4')}>
                {stats.weekdays.map((item) => (
                  <div key={item.weekday} className="flex flex-col items-center gap-1.5">
                    <span className="text-[10px] text-muted tabular-nums">
                      {item.rate === null ? '' : Math.round(item.rate * 100)}
                    </span>
                    <div className="flex h-20 w-full items-end overflow-hidden rounded-md bg-white/[0.05]">
                      <div
                        className={cn('w-full rounded-md', (item.rate ?? 0) >= 0.8 ? 'bg-signal' : 'bg-info/70')}
                        style={{ height: `${Math.max(4, (item.rate ?? 0) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold">{WEEKDAY_LETTERS[item.weekday]}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section aria-label="Hora" className={cn(cardSurface, 'flex items-center gap-3 p-4')}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info/15 text-info">
              <Clock aria-hidden className="size-5" />
            </span>
            <p className="text-sm leading-snug">
              {stats.averageTime && stats.averageTime.samples >= MIN_TIME_SAMPLES ? (
                <>
                  Lo marcas en promedio a las <strong>{formatClock(stats.averageTime.minutes)}</strong>
                  <span className="block text-xs text-muted">Según {stats.averageTime.samples} días con hora.</span>
                </>
              ) : (
                <>
                  Hora promedio: todavía sin datos suficientes
                  <span className="block text-xs text-muted">
                    Se guarda la hora cada vez que lo marcas el mismo día ({stats.averageTime?.samples ?? 0} de{' '}
                    {MIN_TIME_SAMPLES}).
                  </span>
                </>
              )}
            </p>
          </section>

          {stats.insights.length > 0 && (
            <section aria-label="Consejos" className="flex flex-col gap-2">
              <SectionLabel icon={Lightbulb}>Cómo vas</SectionLabel>
              {stats.insights.map((insight) => (
                <Insight key={insight.text} insight={insight} />
              ))}
            </section>
          )}

          <AiAnalysis habit={habit} today={today} />
        </div>
      )}
    </Screen>
  )
}

function Tile(props: { icon: LucideIcon; label: string; value: string; accent?: boolean }) {
  const Icon = props.icon
  return (
    <div className={cn(cardSurface, 'flex flex-col gap-1 p-3')}>
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Icon aria-hidden className={cn('size-3.5', props.accent && 'text-signal')} />
        {props.label}
      </span>
      <span className={cn('font-display text-2xl font-bold tabular-nums', props.accent && 'text-signal')}>
        {props.value}
      </span>
    </div>
  )
}

const TONES: Record<HabitInsight['tone'], { icon: LucideIcon; className: string }> = {
  good: { icon: ThumbsUp, className: 'bg-signal/15 text-signal' },
  warn: { icon: TriangleAlert, className: 'bg-ember/15 text-ember' },
  info: { icon: Lightbulb, className: 'bg-info/15 text-info' },
}

function Insight({ insight }: { insight: HabitInsight }) {
  const tone = TONES[insight.tone]
  const Icon = tone.icon
  return (
    <div className={cn(cardSurface, 'flex items-start gap-3 p-3')}>
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', tone.className)}>
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm leading-snug">{insight.text}</p>
        <PrincipleChip id={insight.principle} />
      </div>
    </div>
  )
}

/** Calendario grande de un mes: hecho, a medias, sin hacer y sin registrar. */
function HabitCalendar(props: {
  habit: Habit
  logs: Map<GameDay, string>
  month: string
  today: GameDay
  canGoBack: boolean
  onMonth: (amount: -1 | 1) => void
}) {
  const { habit, logs, month, today } = props
  const [year, number] = month.split('-').map(Number)
  const first = `${month}-01`
  const length = new Date(Date.UTC(year, number, 0)).getUTCDate()
  const days = Array.from({ length }, (_, index) => addDays(first, index))
  const doneInMonth = days.filter((day) => logs.get(day) === 'done' || logs.get(day) === 'half').length

  return (
    <section aria-label="Calendario del hábito" className={cn(cardSurface, 'p-3')}>
      <header className="mb-2 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Mes anterior"
          disabled={!props.canGoBack}
          onClick={() => props.onMonth(-1)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <div className="text-center">
          <p className="font-display text-base font-semibold">
            {MONTH_NAMES[number - 1]} {year}
          </p>
          <p className="text-[11px] text-muted">
            {doneInMonth} {doneInMonth === 1 ? 'día hecho' : 'días hechos'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Mes siguiente"
          disabled={month >= today.slice(0, 7)}
          onClick={() => props.onMonth(1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </header>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {WEEKDAY_LETTERS.map((letter) => (
          <span key={letter} aria-hidden className="pb-1 text-[10px] text-muted">
            {letter}
          </span>
        ))}
        {Array.from({ length: weekdayOf(first) }, (_, index) => (
          <span key={`vacío-${index}`} />
        ))}
        {days.map((day) => {
          const state = logs.get(day)
          const scheduled = isScheduledOn(habit, day)
          const past = day < today
          const label =
            state === 'done'
              ? 'hecho'
              : state === 'half'
                ? 'a medias'
                : state === 'missed'
                  ? 'sin hacer'
                  : scheduled && past
                    ? 'sin registrar'
                    : ''
          return (
            <div
              key={day}
              aria-label={`${Number(day.slice(8))}${label ? `: ${label}` : ''}`}
              className={cn(
                'relative grid aspect-square place-items-center rounded-lg text-xs font-semibold tabular-nums',
                state === 'done' && 'bg-signal text-void',
                state === 'half' && 'bg-signal/35 text-ink',
                state === 'missed' && 'bg-ember/15 text-ember',
                !state && scheduled && past && 'border border-dashed border-white/15 text-muted',
                !state && (!scheduled || !past) && 'text-muted/40',
                day === today && 'ring-2 ring-info/70',
              )}
            >
              {state === 'missed' ? <X aria-hidden className="size-4" /> : Number(day.slice(8))}
            </div>
          )
        })}
      </div>
      <p className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm bg-signal" /> Hecho
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm bg-signal/35" /> A medias
        </span>
        <span className="flex items-center gap-1">
          <X aria-hidden className="size-3 text-ember" /> Sin hacer
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm border border-dashed border-white/30" /> Sin registrar
        </span>
      </p>
    </section>
  )
}

/** Análisis a fondo con el modelo rápido: manda todo el historial del hábito y guarda la respuesta. */
function AiAnalysis({ habit, today }: { habit: Habit; today: GameDay }) {
  const [hasKey, setHasKey] = useState(false)
  const [state, setState] = useState<{ loading: boolean; status?: string; error: string | null }>({
    loading: false,
    error: null,
  })
  const analysis = habit.analysis

  useEffect(() => {
    void aiSession().then((session) => setHasKey(session !== null))
  }, [])

  async function run() {
    setState({ loading: true, error: null })
    try {
      await runHabitAnalysis(habit.id, today, ({ stage, message }) => {
        if (stage === 'retry') setState((current) => (current.loading ? { ...current, status: message } : current))
      })
      setState({ loading: false, error: null })
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : 'No se pudo analizar.' })
    }
  }

  return (
    <section aria-label="Análisis con IA" className="flex flex-col gap-2">
      <SectionLabel icon={Sparkles}>Análisis a fondo</SectionLabel>
      {analysis ? (
        <div className={cn(cardSurface, 'flex flex-col gap-3 p-4')}>
          <p className="text-sm leading-relaxed">{analysis.summary}</p>
          {analysis.points.map((point) => (
            <div key={point.title} className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-3">
              <p className="text-sm font-semibold">{point.title}</p>
              <p className="text-sm leading-snug text-ink/85">{point.text}</p>
              <PrincipleChip id={point.principle} />
            </div>
          ))}
          <p className="text-[11px] text-muted">
            Hecho el {new Date(analysis.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })} con
            el modelo rápido.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">
          La IA revisa todo el historial de este hábito (días, horas y tu sueño) y te da consejos más detallados,
          basados en la biblioteca. Usa una llamada al modelo rápido.
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-ember">
          {state.error}
        </p>
      )}
      {hasKey ? (
        <Button variant={analysis ? 'outline' : 'primary'} disabled={state.loading} onClick={() => void run()}>
          {state.loading ? (
            <LoaderCircle aria-hidden className="animate-spin" />
          ) : analysis ? (
            <RefreshCw aria-hidden />
          ) : (
            <Sparkles aria-hidden />
          )}
          {state.loading ? (state.status ?? 'Analizando…') : analysis ? 'Analizar de nuevo' : 'Analizar con IA'}
        </Button>
      ) : (
        <p className="text-xs text-muted">Guarda tu API key de Gemini en Ajustes para usarlo.</p>
      )}
    </section>
  )
}
