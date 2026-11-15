import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, ScrollText } from 'lucide-react'
import { motion } from 'motion/react'
import { db } from '../../data/appDb'
import { dismissEmptyWeek, getReviewCard } from '../../data/gameStore'
import type { GameDay } from '../../game/gameDay'
import { Badge } from '../kit/Badge'
import { Button } from '../kit/Button'
import { cn } from '../kit/cn'
import { weekLabel } from './format'

/**
 * Tarjeta de Hoy con la revisión de la semana que terminó. La revisión no se genera aquí:
 * solo cuando el jugador la abre.
 */
export function ReviewCard({ today, onOpen }: { today: GameDay; onOpen: (weekStart: GameDay) => void }) {
  const card = useLiveQuery(() => getReviewCard(db, today), [today])
  if (!card) return null

  if (card.empty) {
    return (
      <section
        aria-label="Revisión semanal"
        className="flex flex-col gap-3 rounded-3xl border border-white/[0.08] bg-raised/60 p-4 text-sm"
      >
        <p className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide uppercase">
          <ScrollText aria-hidden className="size-4 text-info" />
          Semana tranquila
        </p>
        <p className="text-muted">
          Del {weekLabel(card.weekStart)} no hubo avances. No pasa nada: esta semana empieza con una misión pequeña y la
          racha vuelve sola.
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="self-end"
          onClick={() => void dismissEmptyWeek(db, card.weekStart)}
        >
          Entendido
        </Button>
      </section>
    )
  }

  const ready = card.review === null
  return (
    <motion.button
      type="button"
      onClick={() => onOpen(card.weekStart)}
      whileTap={{ scale: 0.985 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      aria-label={ready ? 'Abrir tu revisión semanal' : 'Ver tu revisión semanal'}
      className={cn(
        'flex items-center gap-3 rounded-3xl border p-4 text-left',
        ready
          ? 'border-info/40 bg-gradient-to-br from-info/[0.14] via-raised to-panel shadow-[0_0_40px_-18px_var(--color-info)]'
          : 'border-white/[0.08] bg-raised/60',
      )}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-info/15 text-info">
        <ScrollText aria-hidden className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-sm font-semibold tracking-wide uppercase">Tu revisión semanal</span>
        <span className="line-clamp-2 text-sm text-muted">
          {ready ? `Lo que salió bien y qué ajustar, del ${weekLabel(card.weekStart)}.` : card.review!.summary}
        </span>
      </span>
      {card.pending > 0 && (
        <Badge tone="info">
          {card.pending} {card.pending === 1 ? 'ajuste' : 'ajustes'}
        </Badge>
      )}
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
    </motion.button>
  )
}
