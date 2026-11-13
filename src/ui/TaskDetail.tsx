import { useLiveQuery } from 'dexie-react-hooks'
import {
  Check,
  Clock,
  FastForward,
  Flag,
  Lightbulb,
  LoaderCircle,
  Lock,
  Network,
  Pencil,
  Repeat,
  RotateCcw,
  Skull,
  Sparkles,
  Swords,
  Target,
  X,
  Zap,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { detailTask } from '../ai/gemini'
import { aiSession } from '../ai/session'
import { db } from '../data/appDb'
import {
  completeBounty,
  completeDaily,
  completeQuest,
  getTaskDetail,
  skipSideQuest,
  toggleStep,
  undoBounty,
  undoDaily,
  undoSideQuest,
  updateBounty,
  updateSideQuest,
  type Outcome,
  type TaskDetailView,
  type TaskRef,
} from '../data/gameStore'
import type { GameDay } from '../game/gameDay'
import { haptic } from '../platform/haptics'
import { httpRequest } from '../platform/http'
import { EvidenceSection } from './EvidenceSection'
import { Badge } from './kit/Badge'
import { Button } from './kit/Button'
import { SectionLabel } from './kit/Card'
import { cn } from './kit/cn'
import { DifficultyPips } from './kit/controls'

const DIFFICULTY_NAMES = ['', 'Fácil', 'Normal', 'Media', 'Difícil', 'Épica']
const KIND_LABELS = { bounty: 'Contrato diario', sideQuest: 'Side Quest', daily: 'Misión del día' }

function formatDay(day: string) {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
  })
}

/** Gemini (modelo rápido) escribe la descripción y los objetivos de una misión que no los tiene. */
function useAiDetail(view: TaskDetailView | null | undefined) {
  const [state, setState] = useState<{
    loading: boolean
    error: string | null
    status?: string
  }>({ loading: false, error: null })
  const [hasKey, setHasKey] = useState(false)

  useEffect(() => {
    void aiSession().then((session) => setHasKey(session !== null))
  }, [])

  async function run() {
    if (!view || view.kind === 'daily') return
    setState({ loading: true, error: null })
    try {
      const session = await aiSession()
      if (!session) throw new Error('Guarda tu API key de Gemini en Ajustes.')
      const detail = await detailTask(httpRequest, {
        apiKey: session.apiKey,
        model: session.fastModel,
        title: view.task.title,
        campaign: view.campaign,
        daily: view.kind === 'bounty',
        onStatus: ({ stage, message }) =>
          stage === 'retry' && setState((current) => (current.loading ? { ...current, status: message } : current)),
      })
      if (view.kind === 'bounty') await updateBounty(db, view.task.id, detail)
      else await updateSideQuest(db, view.task.id, detail)
      setState({ loading: false, error: null })
    } catch (error) {
      setState({
        loading: false,
        error: error instanceof Error ? error.message : 'No se pudo generar.',
      })
    }
  }

  return { ...state, hasKey, run }
}

function InfoRow({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-void/50 p-3 text-sm leading-snug">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-info/15 text-info">
        <Icon aria-hidden className="size-4" />
      </span>
      <p className="min-w-0 flex-1 pt-0.5">
        <span className="block text-xs font-medium text-muted">{label}</span>
        {children}
      </p>
    </div>
  )
}

export function TaskDetail(props: {
  taskRef: TaskRef
  initialView: TaskDetailView
  today: GameDay
  /** Recibe el id de la misión que se cierra: así un cierre tardío no cierra otro detalle recién abierto. */
  onClose: (taskId: string) => void
  onEdit: (view: TaskDetailView) => void
  onOutcome: (outcome: Outcome, ref: TaskRef, fromDetail: boolean) => void
}) {
  const { taskRef, initialView, today, onClose, onEdit, onOutcome } = props
  const titleId = useId()
  const closeButton = useRef<HTMLButtonElement>(null)
  const evidenceSection = useRef<HTMLDivElement>(null)
  // `initialView` llega ya cargado, así el primer cuadro de la animación tiene todo el contenido.
  const view = useLiveQuery(() => getTaskDetail(db, taskRef, today), [taskRef.kind, taskRef.id, today], initialView)
  const ai = useAiDetail(view)
  const [needsEvidence, setNeedsEvidence] = useState(false)
  // Al cerrar, la tarjeta se desvanece y luego se quita. No regresa a su fila: si la fila
  // ya no está (por ejemplo, tras cambiar de pestaña), esa animación nunca terminaba.
  const [closing, setClosing] = useState(false)
  const requestClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => onClose(taskRef.id), 180)
  }, [onClose, taskRef.id])

  // Si la misión se borra o se archiva desde la edición, el detalle se cierra.
  useEffect(() => {
    if (view === null) onClose(taskRef.id)
  }, [view, onClose, taskRef.id])

  useEffect(() => {
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && requestClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [requestClose])

  function report(outcome: Outcome) {
    if (outcome.blocked === 'evidence') {
      setNeedsEvidence(true)
      evidenceSection.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    } else setNeedsEvidence(false)
    onOutcome(outcome, taskRef, true)
  }

  async function complete() {
    if (!view) return
    if (view.kind === 'bounty') {
      const xp = await completeBounty(db, view.task.id)
      report({ ok: xp !== null, xp: xp ?? 0 })
    } else if (view.kind === 'daily') report(await completeDaily(db, view.task.id))
    else report(await completeQuest(db, view.task.id))
  }

  async function undo() {
    if (!view) return
    if (view.kind === 'bounty') await undoBounty(db, view.task.id)
    else if (view.kind === 'daily') await undoDaily(db, view.task.id)
    else await undoSideQuest(db, view.task.id)
  }

  async function checkStep(index: number) {
    if (!view || view.lock) return
    const wasChecked = view.stepsDone.includes(index)
    const outcome = await toggleStep(db, taskRef, index)
    if (outcome.ok && outcome.xp === 0 && !outcome.act && !wasChecked) haptic('tap')
    if (outcome.xp > 0 || outcome.act || outcome.blocked) report(outcome)
  }

  /** El jefe se completa solo al agregar la evidencia si ya tenía todos sus objetivos marcados. */
  async function evidenceAdded() {
    setNeedsEvidence(false)
    const current = await getTaskDetail(db, taskRef, today)
    if (!current || current.kind !== 'sideQuest' || !current.boss || current.done || current.lock) return
    const stepCount = current.task.steps?.length ?? 0
    if (needsEvidence || (stepCount > 0 && current.stepsDone.length === stepCount)) {
      report(await completeQuest(db, current.task.id))
    }
  }

  const steps = view?.task.steps ?? []
  const description = view?.task.description ?? ''
  const hasDetail = description.length > 0 || steps.length > 0
  const locked = Boolean(view?.lock)
  const resolved = Boolean(view && (view.done || view.skipped))
  const showEvidence = view && view.kind !== 'bounty' && !locked

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-40 flex items-center justify-center px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]"
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: 0.18 }}
        onClick={requestClose}
      />

      <motion.div
        layoutId={closing ? undefined : `task-${taskRef.id}`}
        animate={closing ? { opacity: 0, scale: 0.94 } : { opacity: 1, scale: 1 }}
        transition={closing ? { duration: 0.16 } : { type: 'spring', stiffness: 420, damping: 42 }}
        className={cn(
          'relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[2rem] border bg-gradient-to-b from-raised to-panel shadow-2xl shadow-black/60',
          view?.boss ? 'border-ember/40 shadow-[0_0_60px_-20px_var(--color-ember)]' : 'border-white/[0.08]',
        )}
      >
        {view && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.06, duration: 0.18 } }}
            className="flex min-h-0 flex-col"
          >
            <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-5">
              <header className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {view.boss ? (
                    <Badge tone="ember">
                      <Skull aria-hidden />
                      Misión jefe
                    </Badge>
                  ) : (
                    <Badge tone="info">
                      {view.kind === 'bounty' ? (
                        <Repeat aria-hidden />
                      ) : view.kind === 'daily' ? (
                        <Zap aria-hidden />
                      ) : (
                        <Swords aria-hidden />
                      )}
                      {KIND_LABELS[view.kind]}
                    </Badge>
                  )}
                  {view.campaign && (
                    <Badge>
                      <Flag aria-hidden />
                      {view.actLabel ? `${view.campaign} · ${view.actLabel}` : view.campaign}
                    </Badge>
                  )}
                </div>
                <Button
                  ref={closeButton}
                  variant="ghost"
                  size="icon"
                  aria-label="Cerrar"
                  onClick={requestClose}
                  className="-mt-2 -mr-2"
                >
                  <X aria-hidden />
                </Button>
              </header>

              <div>
                <h2 id={titleId} className="font-display text-2xl leading-tight font-semibold">
                  {view.task.title}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-muted">
                    <DifficultyPips value={view.task.difficulty} />
                    {DIFFICULTY_NAMES[view.task.difficulty]}
                  </span>
                  <Badge tone={view.boss ? 'ember' : 'signal'}>
                    +{view.xp} XP{view.boss ? ' · doble' : ''}
                  </Badge>
                  {view.task.estimate && (
                    <Badge>
                      <Clock aria-hidden />
                      {view.task.estimate}
                    </Badge>
                  )}
                  {view.done && (
                    <Badge tone="signal">
                      <Check aria-hidden />
                      {view.kind === 'bounty' ? 'Hecho hoy' : 'Completada'}
                    </Badge>
                  )}
                  {view.skipped && (
                    <Badge tone="info">
                      <FastForward aria-hidden />
                      Saltada · sin XP
                    </Badge>
                  )}
                </div>
                {view.skill && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                    <Network aria-hidden className="size-3.5 shrink-0 text-signal" />
                    <span className="truncate">{view.skill}</span>
                  </p>
                )}
              </div>

              {view.lock && (
                <div
                  role="status"
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-void/60 p-3 text-sm text-muted"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.06]">
                    <Lock aria-hidden className="size-4" />
                  </span>
                  {view.lock}
                </div>
              )}

              {description && <p className="text-[15px] leading-relaxed text-ink/90">{description}</p>}

              {steps.length > 0 && (
                <section aria-label="Objetivos">
                  <div className="flex items-center justify-between">
                    <SectionLabel>Objetivos</SectionLabel>
                    <span className="font-display text-sm font-semibold text-muted tabular-nums">
                      {view.stepsDone.length} / {steps.length}
                    </span>
                  </div>
                  <ol className="mt-3 flex flex-col gap-2">
                    {steps.map((step, index) => {
                      const checked = view.stepsDone.includes(index)
                      return (
                        <li key={`${index}-${step}`}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            disabled={locked || view.skipped}
                            onClick={() => void checkStep(index)}
                            className={cn(
                              'flex min-h-12 w-full items-start gap-3 rounded-2xl border p-3 text-left text-sm leading-snug transition-colors disabled:opacity-60',
                              checked ? 'border-signal/30 bg-signal/[0.07]' : 'border-white/[0.06] bg-void/50',
                            )}
                          >
                            <span
                              className={cn(
                                'grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
                                checked ? 'border-signal bg-signal text-on-signal' : 'border-white/20',
                              )}
                            >
                              {checked && <Check aria-hidden className="size-4" strokeWidth={3} />}
                            </span>
                            <span className={cn('pt-0.5', checked && 'text-muted line-through decoration-signal/60')}>
                              {step}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              )}

              {(view.task.why || view.task.tip) && (
                <div className="flex flex-col gap-2">
                  {view.task.why && (
                    <InfoRow icon={Target} label="Por qué importa">
                      {view.task.why}
                    </InfoRow>
                  )}
                  {view.task.tip && (
                    <InfoRow icon={Lightbulb} label="Consejo">
                      {view.task.tip}
                    </InfoRow>
                  )}
                </div>
              )}

              {!hasDetail && view.kind !== 'daily' && (
                <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-muted">
                  Esta misión aún no tiene detalles.{' '}
                  {ai.hasKey ? 'Deja que Gemini la vuelva concreta.' : 'Agrégalos al editarla.'}
                </div>
              )}

              {ai.hasKey && !locked && view.kind !== 'daily' && (!hasDetail || !view.task.why) && (
                <Button variant={hasDetail ? 'ghost' : 'outline'} disabled={ai.loading} onClick={() => void ai.run()}>
                  {ai.loading ? (
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{
                        repeat: Infinity,
                        duration: 1,
                        ease: 'linear',
                      }}
                    >
                      <LoaderCircle aria-hidden />
                    </motion.span>
                  ) : (
                    <Sparkles aria-hidden />
                  )}
                  {ai.loading ? 'Escribiendo detalles…' : hasDetail ? 'Regenerar detalles con IA' : 'Detallar con IA'}
                </Button>
              )}
              {ai.loading && ai.status && (
                <p aria-live="polite" className="text-sm text-ember">
                  {ai.status}
                </p>
              )}
              {ai.error && <p className="text-sm text-ember">{ai.error}</p>}

              {showEvidence && (
                <div
                  ref={evidenceSection}
                  className={cn('rounded-2xl transition-shadow', needsEvidence && 'ring-2 ring-ember/70 ring-offset-8 ring-offset-panel')}
                >
                  <EvidenceSection
                    taskRef={taskRef}
                    evidence={view.evidence}
                    required={view.boss}
                    onAdded={() => void evidenceAdded()}
                  />
                  {needsEvidence && (
                    <p role="alert" className="mt-2 text-sm text-ember">
                      Para derrotar al jefe, agrega al menos una foto o una nota.
                    </p>
                  )}
                </div>
              )}

              {view.canSkip && (
                <Button variant="ghost" size="sm" onClick={() => void skipSideQuest(db, view.task.id).then(report)}>
                  <FastForward aria-hidden />
                  Ya sé hacer esto (saltar sin XP)
                </Button>
              )}

              <p className="text-xs text-muted">
                {view.kind === 'bounty'
                  ? `Completado ${view.completions} ${view.completions === 1 ? 'vez' : 'veces'} · desde el ${formatDay(view.task.createdDay)}`
                  : view.kind === 'daily'
                    ? 'Caduca al cierre del día (4:00 a. m.). No afecta tu racha.'
                    : view.task.completedDay
                      ? `Completada el ${formatDay(view.task.completedDay)}`
                      : `Creada el ${formatDay(view.task.createdDay)}`}
              </p>
            </div>

            <footer className="flex gap-2 border-t border-white/[0.06] bg-void/40 p-4">
              {locked ? (
                <Button onClick={requestClose} className="flex-1">
                  Cerrar
                </Button>
              ) : (
                <>
                  {view.kind !== 'daily' && (
                    <Button onClick={() => onEdit(view)} className="flex-1">
                      <Pencil aria-hidden />
                      Editar
                    </Button>
                  )}
                  <Button
                    variant={resolved ? 'secondary' : 'primary'}
                    onClick={() => void (resolved ? undo() : complete())}
                    className="flex-[2] whitespace-nowrap px-3"
                  >
                    {resolved ? <RotateCcw aria-hidden /> : <Check aria-hidden />}
                    {view.skipped ? 'Deshacer salto' : view.done ? 'Deshacer' : `Completar +${view.xp} XP`}
                  </Button>
                </>
              )}
            </footer>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
