// Progreso por etapas mientras el modelo diseña.
import type { CallStatus } from '../../ai/gemini'
import { cn } from '../kit/cn'
import { Check, LoaderCircle, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'

/** Pasos que se muestran mientras el modelo principal diseña. Avanzan con el tiempo; el último espera la respuesta. */
const DESIGN_STAGES = [
  'Analizando tu meta y tus respuestas',
  'Trazando los actos del camino',
  'Diseñando las misiones del Acto 1',
  'Forjando la misión jefe',
]
const STAGE_SECONDS = 6

export function DesignProgress({ fast, status }: { fast: boolean; status: CallStatus | null }) {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const timer = setInterval(
      () => setStage((value) => Math.min(value + 1, DESIGN_STAGES.length - 1)),
      (fast ? 2 : STAGE_SECONDS) * 1000,
    )
    return () => clearInterval(timer)
  }, [fast])

  return (
    <div role="status" aria-label="Diseñando tu campaña" className="flex flex-col gap-4 py-4">
      <div className="mx-auto grid size-20 place-items-center rounded-full bg-signal/15 shadow-[0_0_44px_-8px_var(--color-signal)] ring-2 ring-signal/50">
        <motion.span
          animate={{ rotate: [0, 12, -12, 0], scale: [1, 1.08, 1] }}
          transition={{ repeat: Infinity, duration: 2.4 }}
        >
          <Sparkles aria-hidden className="size-9 text-signal" />
        </motion.span>
      </div>
      <ol className="flex flex-col gap-2">
        {DESIGN_STAGES.map((label, index) => {
          const done = index < stage
          const active = index === stage
          return (
            <motion.li
              key={label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: done || active ? 1 : 0.4, x: 0 }}
              transition={{ delay: index * 0.08 }}
              className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-void/50 p-3 text-sm"
            >
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full',
                  done
                    ? 'bg-signal text-on-signal'
                    : active
                      ? 'bg-signal/15 text-signal'
                      : 'bg-white/[0.06] text-muted',
                )}
              >
                {done ? (
                  <Check aria-hidden className="size-4" strokeWidth={3} />
                ) : active ? (
                  <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                    <LoaderCircle aria-hidden className="size-4" />
                  </motion.span>
                ) : (
                  <span className="font-display text-xs font-bold">{index + 1}</span>
                )}
              </span>
              <span className={cn(active && 'font-medium text-ink', !active && !done && 'text-muted')}>{label}</span>
            </motion.li>
          )
        })}
      </ol>
      {/* Mientras todo va bien se explica la espera; si hay reintentos o respaldo, se cuenta qué pasa. */}
      {status && (status.stage === 'retry' || status.stage === 'fallback') ? (
        <p
          aria-live="polite"
          className="rounded-2xl border border-ember/40 bg-ember/10 p-3 text-center text-sm text-ember"
        >
          {status.message}
        </p>
      ) : (
        <p className="text-center text-xs text-muted">
          {fast
            ? 'Diseñando con el modelo rápido…'
            : 'El modelo principal está pensando a fondo. Puede tardar hasta un minuto.'}
        </p>
      )}
    </div>
  )
}
