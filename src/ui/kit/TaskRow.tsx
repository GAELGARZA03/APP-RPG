import { ChevronRight, ListChecks } from 'lucide-react'
import { motion } from 'motion/react'
import type { Difficulty } from '../../game/rules'
import { Badge } from './Badge'
import { cn } from './cn'
import { CheckButton, DifficultyPips } from './controls'

/**
 * Fila de misión. La casilla completa la tarea; tocar el resto de la fila abre el detalle.
 * `layoutId` permite que la fila "crezca" hasta la vista de detalle.
 */
export function TaskRow(props: {
  layoutId: string
  title: string
  difficulty: Difficulty
  xp: number
  done: boolean
  stepCount: number
  /** Objetivos ya marcados; se muestra como "2 / 3". */
  stepsDone?: number
  onToggle: () => void
  onOpen: () => void
}) {
  const { layoutId, title, difficulty, xp, done, stepCount, stepsDone = 0, onToggle, onOpen } = props

  return (
    <motion.li
      layoutId={layoutId}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 42 }}
      className={cn(
        'flex items-center gap-3 rounded-2xl border bg-void/50 py-2 pl-2 transition-colors',
        done ? 'border-signal/30' : 'border-white/[0.06]',
      )}
    >
      <CheckButton checked={done} onToggle={onToggle} label={title} />
      <motion.button
        type="button"
        onClick={onOpen}
        whileTap={{ scale: 0.98 }}
        aria-label={`Ver detalle de ${title}`}
        className="flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-xl py-0.5 pr-2 text-left active:bg-white/[0.04]"
      >
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'line-clamp-2 text-[15px] leading-snug transition-colors',
              done && 'text-muted line-through decoration-signal/70',
            )}
          >
            {title}
          </span>
          <span className="mt-1 flex items-center gap-2">
            <DifficultyPips value={difficulty} />
            <Badge tone="signal">+{xp} XP</Badge>
            {stepCount > 0 && (
              <Badge tone={stepsDone > 0 ? 'info' : 'muted'}>
                <ListChecks aria-hidden />
                {done ? stepCount : stepsDone} / {stepCount}
              </Badge>
            )}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
      </motion.button>
    </motion.li>
  )
}
