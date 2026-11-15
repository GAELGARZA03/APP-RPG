import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Clock, Compass, Flag, LoaderCircle, Repeat, RotateCcw, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { ensureDailyMission, type DailyStatus } from '../ai/dailyMission'
import { db } from '../data/appDb'
import { completeDaily, getDailies, undoDaily, type DailyView, type Outcome, type TaskRef } from '../data/gameStore'
import type { GameDay } from '../game/gameDay'
import { Badge } from './kit/Badge'
import { cn } from './kit/cn'
import { CheckButton } from './kit/controls'

const KIND = {
  campaign: { label: 'Campaña', icon: Flag },
  habit: { label: 'Hábito', icon: Repeat },
  free: { label: 'Reto libre', icon: Compass },
} as const

/**
 * Misiones del día: tres retos pequeños generados una vez por día de juego.
 * Si no se pueden generar, la sección se oculta u ofrece reintentar; nunca se ve rota.
 */
export function DailyCard(props: {
  today: GameDay
  onOpen: (ref: TaskRef) => void
  onOutcome: (outcome: Outcome, ref: TaskRef, fromDetail: boolean) => void
}) {
  const { today, onOpen, onOutcome } = props
  const dailies = useLiveQuery(() => getDailies(db, today), [today])
  const [status, setStatus] = useState<DailyStatus | 'loading'>('loading')

  // Al abrir la app o al cambiar el día de juego se piden las misiones de hoy (si aún no existen).
  useEffect(() => {
    let current = true
    setStatus('loading')
    void ensureDailyMission().then((result) => current && setStatus(result))
    return () => {
      current = false
    }
  }, [today])

  async function retry() {
    setStatus('loading')
    setStatus(await ensureDailyMission(new Date(), true))
  }

  if (dailies === undefined) return null

  if (dailies.length === 0) {
    if (status === 'loading') {
      return (
        <div
          role="status"
          className="flex items-center gap-3 rounded-3xl border border-info/20 bg-info/[0.06] p-4 text-sm text-muted"
        >
          <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
            <LoaderCircle aria-hidden className="size-5 text-info" />
          </motion.span>
          Preparando tus misiones del día…
        </div>
      )
    }
    // 'waiting': ya se intentó hoy sin éxito; no se repite sola, pero se puede reintentar a mano.
    if (status === 'failed' || status === 'waiting') {
      return (
        <button
          type="button"
          onClick={() => void retry()}
          className="flex min-h-14 items-center gap-3 rounded-3xl border border-dashed border-white/15 p-4 text-left text-sm text-muted active:border-info"
        >
          <RotateCcw aria-hidden className="size-5 shrink-0 text-info" />
          <span>
            <span className="block font-medium text-ink">No se pudieron generar las misiones del día</span>
            Toca para reintentar.
          </span>
        </button>
      )
    }
    return null
  }

  const done = dailies.filter((daily) => daily.done).length
  return (
    <motion.section
      aria-label="Misiones del día"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'relative overflow-hidden rounded-3xl border p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]',
        done === dailies.length
          ? 'border-signal/40 bg-signal/[0.08]'
          : 'border-info/40 bg-gradient-to-br from-info/[0.16] via-raised to-panel shadow-[0_0_40px_-18px_var(--color-info)]',
      )}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide uppercase">
          <Zap aria-hidden className="size-4 text-info" />
          Misiones del día
        </h2>
        <Badge tone={done === dailies.length ? 'signal' : 'info'}>
          {done} / {dailies.length}
        </Badge>
      </header>
      <ul className="flex flex-col gap-1">
        {dailies.map((daily) => (
          <DailyRow key={daily.id} daily={daily} onOpen={onOpen} onOutcome={onOutcome} />
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted">50 % más de XP · caducan a las 4:00 a. m.</p>
    </motion.section>
  )
}

function DailyRow(props: {
  daily: DailyView
  onOpen: (ref: TaskRef) => void
  onOutcome: (outcome: Outcome, ref: TaskRef, fromDetail: boolean) => void
}) {
  const { daily } = props
  const ref: TaskRef = { kind: 'daily', id: daily.id }
  const kind = KIND[daily.kind ?? 'free']
  const stepCount = daily.steps?.length ?? 0

  async function toggle() {
    if (daily.done) await undoDaily(db, daily.id)
    else props.onOutcome(await completeDaily(db, daily.id), ref, false)
  }

  return (
    <li className="flex items-center gap-3">
      <CheckButton checked={daily.done} onToggle={() => void toggle()} label={daily.title} />
      <motion.button
        type="button"
        onClick={() => props.onOpen(ref)}
        whileTap={{ scale: 0.98 }}
        aria-label={`Ver detalle de ${daily.title}`}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'line-clamp-2 leading-tight font-semibold',
              daily.done && 'text-muted line-through decoration-signal/70',
            )}
          >
            {daily.title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <span className="flex items-center gap-1">
              <kind.icon aria-hidden className="size-3.5" />
              {kind.label}
            </span>
            {daily.estimate && (
              <span className="flex items-center gap-1">
                <Clock aria-hidden className="size-3.5" />
                {daily.estimate}
              </span>
            )}
            {stepCount > 0 && !daily.done && (
              <span>
                {daily.stepsDone?.length ?? 0} / {stepCount}
              </span>
            )}
            <span className="font-semibold text-info">+{daily.xp} XP</span>
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
      </motion.button>
    </li>
  )
}
