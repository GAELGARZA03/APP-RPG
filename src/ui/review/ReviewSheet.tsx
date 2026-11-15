// Revisión semanal: se genera al abrirla (una vez por semana) y muestra logros, atascos, ajustes y foco.
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Check,
  ChevronRight,
  Crosshair,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Trophy,
  TriangleAlert,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { AiError, type CallStatus } from '../../ai/gemini'
import { createWeeklyReview } from '../../ai/weeklyReview'
import { db } from '../../data/appDb'
import type { ReviewAdjustment, WeeklyReview } from '../../data/db'
import { applyAdjustment, dismissAdjustment, getReview, listReviews, type TaskRef } from '../../data/gameStore'
import type { GameDay } from '../../game/gameDay'
import { haptic } from '../../platform/haptics'
import { Badge } from '../kit/Badge'
import { Button } from '../kit/Button'
import { SectionLabel } from '../kit/Card'
import { cn } from '../kit/cn'
import { DifficultyPips } from '../kit/controls'
import { Sheet, SheetTitle } from '../Sheet'
import { weekLabel } from './format'

type Generation =
  | { kind: 'idle' }
  | { kind: 'running'; fast: boolean }
  | { kind: 'failed'; message: string; offerFast: boolean; noKey: boolean }

export function ReviewSheet(props: {
  weekStart: GameDay
  onClose: () => void
  onOpenQuest: (ref: TaskRef) => void
  onOpenSettings: () => void
}) {
  const headingId = useId()
  const [weekStart, setWeekStart] = useState(props.weekStart)
  const review = useLiveQuery(() => getReview(db, weekStart), [weekStart])
  const history = useLiveQuery(() => listReviews(db), [])
  const [generation, setGeneration] = useState<Generation>({ kind: 'idle' })
  const [status, setStatus] = useState<CallStatus | null>(null)
  const started = useRef<GameDay | null>(null)
  const alive = useRef(true)
  useEffect(() => () => void (alive.current = false), [])

  async function generate(fast: boolean) {
    setGeneration({ kind: 'running', fast })
    setStatus(null)
    try {
      await createWeeklyReview(weekStart, { fast, onStatus: (next) => alive.current && setStatus(next) })
      if (alive.current) setGeneration({ kind: 'idle' })
      haptic('unlock')
    } catch (error) {
      if (!alive.current) return
      const aiError = error instanceof AiError ? error : null
      setGeneration({
        kind: 'failed',
        message: aiError?.message ?? 'No se pudo preparar la revisión.',
        offerFast: !fast && Boolean(aiError?.modelRelated),
        noKey: aiError?.kind === 'invalid-key',
      })
    }
  }

  // Se genera al abrir, una sola vez por semana; si ya existe, se muestra la guardada.
  useEffect(() => {
    if (review === null && started.current !== weekStart) {
      started.current = weekStart
      void generate(false)
    }
  }, [review, weekStart])

  return (
    <Sheet labelledBy={headingId} focusSheet onClose={props.onClose}>
      <div className="flex flex-col gap-4">
        <SheetTitle id={headingId} icon={<ScrollText aria-hidden className="size-5 text-info" />}>
          Revisión semanal
        </SheetTitle>
        <p className="-mt-3 text-sm text-muted">Semana del {weekLabel(weekStart)}</p>

        {review === null && generation.kind === 'running' && (
          <div role="status" className="flex flex-col items-center gap-3 py-10 text-info">
            <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
              <LoaderCircle aria-hidden className="size-9" />
            </motion.span>
            <p className="font-display tracking-wide">Revisando tu semana…</p>
            <p aria-live="polite" className="text-center text-sm text-muted">
              {status?.stage === 'retry' || status?.stage === 'fallback'
                ? status.message
                : generation.fast
                  ? 'Con el modelo rápido.'
                  : 'El mentor está pensando. Puede tardar hasta un minuto.'}
            </p>
          </div>
        )}

        {review === null && generation.kind === 'failed' && (
          <>
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-ember/50 bg-ember/10 p-3 text-sm"
            >
              {generation.noKey ? (
                <KeyRound aria-hidden className="mt-0.5 size-5 shrink-0 text-ember" />
              ) : (
                <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-ember" />
              )}
              <div>
                <p className="font-semibold text-ember">No se pudo preparar la revisión</p>
                <p className="mt-0.5 text-ink/90">
                  {generation.noKey ? 'Guarda tu API key de Gemini en Ajustes.' : generation.message}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {generation.noKey ? (
                <Button variant="primary" onClick={props.onOpenSettings}>
                  Ir a Ajustes
                </Button>
              ) : (
                <Button variant="primary" onClick={() => void generate(false)}>
                  <RotateCcw aria-hidden />
                  Reintentar
                </Button>
              )}
              {generation.offerFast && (
                <Button variant="outline" onClick={() => void generate(true)}>
                  <Zap aria-hidden />
                  Usar modelo rápido
                </Button>
              )}
              <Button onClick={props.onClose}>Cerrar</Button>
            </div>
          </>
        )}

        {review && !review.empty && <ReviewBody review={review} onOpenQuest={props.onOpenQuest} />}

        {history && history.length > 1 && (
          <section aria-label="Revisiones anteriores" className="flex flex-col gap-2 border-t border-white/[0.06] pt-4">
            <SectionLabel>Revisiones anteriores</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {history.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setWeekStart(item.id)}
                  aria-pressed={item.id === weekStart}
                  className={cn(
                    'min-h-11 rounded-full border px-3.5 text-sm',
                    item.id === weekStart
                      ? 'border-info bg-info/15 text-info'
                      : 'border-white/[0.08] bg-void/50 text-muted active:border-info',
                  )}
                >
                  {weekLabel(item.id)}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </Sheet>
  )
}

function ReviewBody({ review, onOpenQuest }: { review: WeeklyReview; onOpenQuest: (ref: TaskRef) => void }) {
  return (
    <>
      <p className="rounded-2xl border border-info/25 bg-info/[0.06] p-3.5 leading-relaxed">{review.summary}</p>

      {review.wins.length > 0 && (
        <section aria-label="Logros" className="flex flex-col gap-2">
          <SectionLabel icon={Trophy}>Logros de la semana</SectionLabel>
          <ul className="flex flex-col gap-1.5 text-sm">
            {review.wins.map((win) => (
              <li key={win} className="flex items-start gap-2">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={3} />
                {win}
              </li>
            ))}
          </ul>
        </section>
      )}

      {review.stuck.length > 0 && (
        <section aria-label="Dónde te atoraste" className="flex flex-col gap-2">
          <SectionLabel icon={TriangleAlert}>Dónde te atoraste</SectionLabel>
          <ul className="flex flex-col gap-2 text-sm">
            {review.stuck.map((item) => (
              <li key={item.title} className="rounded-2xl border border-white/[0.06] bg-void/50 p-3">
                <span className="block font-medium">{item.title}</span>
                <span className="text-muted">{item.cause}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {review.adjustments.length > 0 && (
        <section aria-label="Ajustes sugeridos" className="flex flex-col gap-2">
          <SectionLabel icon={Wrench}>Ajustes sugeridos</SectionLabel>
          {review.adjustments.map((adjustment) => (
            <AdjustmentCard key={adjustment.id} weekStart={review.id} adjustment={adjustment} />
          ))}
        </section>
      )}

      {review.focus.length > 0 && (
        <section aria-label="Foco de la próxima semana" className="flex flex-col gap-2">
          <SectionLabel icon={Crosshair}>Foco de esta semana</SectionLabel>
          {review.focus.map((item) =>
            item.questId ? (
              <motion.button
                key={item.title}
                type="button"
                whileTap={{ scale: 0.985 }}
                onClick={() => onOpenQuest({ kind: 'sideQuest', id: item.questId! })}
                className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-void/50 p-3 text-left text-sm"
              >
                <FocusText title={item.title} why={item.why} />
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
              </motion.button>
            ) : (
              <div key={item.title} className="flex rounded-2xl border border-white/[0.06] bg-void/50 p-3 text-sm">
                <FocusText title={item.title} why={item.why} />
              </div>
            ),
          )}
        </section>
      )}
    </>
  )
}

function FocusText({ title, why }: { title: string; why: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block font-medium">{title}</span>
      <span className="text-muted">{why}</span>
    </span>
  )
}

const KIND_LABEL: Record<ReviewAdjustment['kind'], string> = {
  split: 'Dividir misión',
  difficulty: 'Cambiar dificultad',
  archiveBounty: 'Archivar contrato',
  addBounty: 'Nuevo contrato diario',
}

function AdjustmentCard({ weekStart, adjustment }: { weekStart: GameDay; adjustment: ReviewAdjustment }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function apply() {
    setBusy(true)
    const result = await applyAdjustment(db, weekStart, adjustment.id)
    setBusy(false)
    if (result.ok) haptic('complete')
    else setError(result.message)
  }

  const resolved = adjustment.status !== 'pending'
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-2xl border p-3 text-sm',
        resolved ? 'border-white/[0.06] bg-void/30 opacity-70' : 'border-white/[0.08] bg-void/50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-xs font-semibold tracking-wide text-info uppercase">
          {KIND_LABEL[adjustment.kind]}
        </span>
        {adjustment.status === 'applied' && (
          <Badge tone="signal">
            <Check aria-hidden />
            Aplicado
          </Badge>
        )}
        {adjustment.status === 'dismissed' && <Badge tone="muted">Descartado</Badge>}
      </div>
      {adjustment.targetTitle && <p className="font-medium">{adjustment.targetTitle}</p>}
      {adjustment.kind === 'difficulty' && adjustment.difficulty && (
        <p className="flex items-center gap-2 text-muted">
          Nueva dificultad <DifficultyPips value={adjustment.difficulty} />
        </p>
      )}
      {adjustment.kind === 'split' && adjustment.parts && (
        <ol className="flex flex-col gap-1 border-l-2 border-info/30 pl-3">
          {adjustment.parts.map((part) => (
            <li key={part.title} className="flex items-center justify-between gap-2">
              <span>{part.title}</span>
              <DifficultyPips value={part.difficulty} />
            </li>
          ))}
        </ol>
      )}
      {adjustment.kind === 'addBounty' && adjustment.bounty && (
        <p className="flex items-center justify-between gap-2 font-medium">
          {adjustment.bounty.title}
          <DifficultyPips value={adjustment.bounty.difficulty} />
        </p>
      )}
      <p className="text-muted">{adjustment.reason}</p>
      {error && (
        <p role="alert" className="text-ember">
          {error}
        </p>
      )}
      {!resolved && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => void dismissAdjustment(db, weekStart, adjustment.id)}>
            <X aria-hidden />
            Descartar
          </Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void apply()}>
            <Sparkles aria-hidden />
            Aplicar
          </Button>
        </div>
      )}
    </div>
  )
}
