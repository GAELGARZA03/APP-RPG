import { useLiveQuery } from 'dexie-react-hooks'
import {
  Castle,
  Check,
  Clock,
  Crown,
  FastForward,
  Flag,
  ListChecks,
  LoaderCircle,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Swords,
  Target,
  Zap,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { generateNextAct, useActRun } from '../ai/actRunner'
import { db } from '../data/appDb'
import type { Campaign } from '../data/db'
import { getCampaign, type ActView, type CampaignView, type QuestView, type TaskRef } from '../data/gameStore'
import { haptic } from '../platform/haptics'
import { useBack } from './backStack'
import { Badge } from './kit/Badge'
import { Button } from './kit/Button'
import { cardSurface, SectionLabel } from './kit/Card'
import { cn } from './kit/cn'
import { DifficultyPips, ProgressBar } from './kit/controls'
import { Screen } from './Screen'
import { Sheet, SheetTitle } from './Sheet'

const ROW_HEIGHT = 104
const STUB = 28
/** El camino serpentea: posición horizontal de cada punto, como fracción del ancho. */
const WAVE = [0.26, 0.68, 0.32, 0.74, 0.28, 0.7]

type NodeState = 'done' | 'skipped' | 'open' | 'locked'

function nodeState(quest: QuestView): NodeState {
  if (quest.completedDay !== null) return 'done'
  if ((quest.skippedDay ?? null) !== null) return 'skipped'
  return quest.lock ? 'locked' : 'open'
}

function QuestNode({ quest, state, focus }: { quest: QuestView; state: NodeState; focus: boolean }) {
  const size = quest.boss ? 'size-[4.5rem]' : 'size-14'
  const resolved = state === 'done' || state === 'skipped'

  return (
    <span className="relative grid place-items-center">
      {state === 'open' && (
        <motion.span
          aria-hidden
          className={cn('absolute rounded-full border-2', quest.boss ? 'border-ember' : 'border-signal', size)}
          animate={{ scale: [1, 1.45], opacity: [0.7, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeOut' }}
        />
      )}
      <motion.span
        // Al cambiar de estado (completar, desbloquear) el punto da un pequeño salto.
        key={state}
        initial={{ scale: 0.7 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
        className={cn(
          'relative grid place-items-center border-2',
          size,
          quest.boss ? 'rounded-[1.4rem]' : 'rounded-full',
          state === 'done' &&
            (quest.boss
              ? 'border-ember bg-ember text-void shadow-[0_0_30px_-4px_var(--color-ember)]'
              : 'border-signal bg-signal text-on-signal shadow-[0_0_24px_-4px_var(--color-signal)]'),
          state === 'skipped' && 'border-signal/60 bg-signal/20 text-signal',
          state === 'open' &&
            (quest.boss
              ? 'border-ember bg-ember/15 text-ember shadow-[0_0_30px_-6px_var(--color-ember)]'
              : 'border-signal bg-void text-signal shadow-[0_0_22px_-6px_var(--color-signal)]'),
          state === 'locked' && 'border-white/10 bg-raised text-muted/70',
          focus && 'ring-4 ring-signal/20',
        )}
      >
        {quest.boss ? (
          state === 'done' ? (
            <Crown aria-hidden className="size-8" />
          ) : (
            <Castle aria-hidden className="size-8" />
          )
        ) : state === 'done' ? (
          <Check aria-hidden className="size-7" strokeWidth={3} />
        ) : state === 'skipped' ? (
          <FastForward aria-hidden className="size-6" />
        ) : state === 'locked' ? (
          <Lock aria-hidden className="size-5" />
        ) : (
          <Swords aria-hidden className="size-6" />
        )}
        {quest.boss && state === 'locked' && (
          <span className="absolute -right-1.5 -bottom-1.5 grid size-6 place-items-center rounded-full border border-white/10 bg-panel">
            <Lock aria-hidden className="size-3" />
          </span>
        )}
      </motion.span>
      <span className="sr-only">{resolved ? 'Resuelta' : state === 'locked' ? 'Bloqueada' : 'Disponible'}</span>
    </span>
  )
}

/** Los puntos de un acto con el tramo de camino que los une. */
function ActPath(props: {
  act: ActView
  width: number
  offset: number
  legacy: boolean
  focusId: string | null
  focusRef: React.RefObject<HTMLButtonElement | null>
  onOpen: (ref: TaskRef) => void
}) {
  const { act, width, offset, focusId, focusRef, onOpen } = props
  const quests = act.quests
  // Un acto sin misiones (aún sin generar) deja un tramo corto para que el camino no se corte.
  if (quests.length === 0) {
    return props.legacy ? null : <div aria-hidden className="mx-auto h-7 w-2.5 rounded-full bg-white/[0.07]" />
  }

  const points = quests.map((quest, index) => ({
    quest,
    state: nodeState(quest),
    x: width * WAVE[(offset + index) % WAVE.length],
    y: STUB + index * ROW_HEIGHT + ROW_HEIGHT / 2,
  }))
  const height = STUB * 2 + quests.length * ROW_HEIGHT
  const center = width / 2

  // Cada tramo es una curva suave entre dos puntos; se ilumina cuando el punto de origen está resuelto.
  const curve = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const middle = (from.y + to.y) / 2
    return `M ${from.x} ${from.y} C ${from.x} ${middle}, ${to.x} ${middle}, ${to.x} ${to.y}`
  }
  const segments = [
    { key: 'in', d: curve({ x: center, y: 0 }, points[0]), lit: act.state !== 'locked' },
    ...points.slice(0, -1).map((point, index) => ({
      key: point.quest.id,
      d: curve(point, points[index + 1]),
      lit: point.state === 'done' || point.state === 'skipped',
    })),
    { key: 'out', d: curve(points[points.length - 1], { x: center, y: height }), lit: act.state === 'done' },
  ]

  return (
    <div className="relative" style={{ height }}>
      <svg aria-hidden width={width} height={height} className="absolute inset-0">
        {segments.map((segment) => (
          <path key={segment.key} d={segment.d} fill="none" strokeWidth={10} strokeLinecap="round" className="stroke-white/[0.07]" />
        ))}
        {segments.map(
          (segment) =>
            segment.lit && (
              <motion.path
                key={`lit-${segment.key}`}
                d={segment.d}
                fill="none"
                strokeWidth={5}
                strokeLinecap="round"
                className="stroke-signal"
                style={{ filter: 'drop-shadow(0 0 6px var(--color-signal))' }}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            ),
        )}
      </svg>

      {points.map(({ quest, state, x, y }) => {
        const labelLeft = x > center
        const stepCount = quest.steps?.length ?? 0
        const nodeHalf = quest.boss ? 36 : 28
        return (
          <button
            key={quest.id}
            ref={quest.id === focusId ? focusRef : undefined}
            type="button"
            onClick={() => onOpen({ kind: 'sideQuest', id: quest.id })}
            aria-label={`${quest.boss ? 'Misión jefe' : 'Misión'}: ${quest.title}${quest.lock ? `. ${quest.lock}` : ''}`}
            className="absolute right-0 left-0 flex items-center active:opacity-80"
            style={{ top: y - ROW_HEIGHT / 2, height: ROW_HEIGHT }}
          >
            <span className="absolute" style={{ left: x - nodeHalf }}>
              <QuestNode quest={quest} state={state} focus={quest.id === focusId} />
            </span>
            <span
              className={cn('absolute flex flex-col gap-1', labelLeft ? 'items-end text-right' : 'items-start text-left')}
              style={
                labelLeft
                  ? { right: width - x + nodeHalf + 10, left: 12 }
                  : { left: x + nodeHalf + 10, right: 12 }
              }
            >
              <span
                className={cn(
                  'line-clamp-2 text-[13px] leading-tight font-medium',
                  state === 'locked' && 'text-muted',
                  state === 'done' && 'text-ink/80',
                  quest.boss && state !== 'locked' && 'font-display text-[15px] font-semibold text-ember',
                )}
              >
                {quest.title}
              </span>
              <span className="flex items-center gap-1.5">
                <Badge tone={state === 'locked' ? 'muted' : quest.boss ? 'ember' : 'signal'}>+{quest.xp} XP</Badge>
                {stepCount > 0 && state !== 'locked' && (
                  <Badge tone={(quest.stepsDone?.length ?? 0) > 0 ? 'info' : 'muted'}>
                    <ListChecks aria-hidden />
                    {quest.stepsDone?.length ?? 0} / {stepCount}
                  </Badge>
                )}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ActHeader({ act, campaignDone }: { act: ActView; campaignDone: boolean }) {
  const resolved = act.quests.filter((quest) => quest.completedDay !== null || (quest.skippedDay ?? null) !== null).length

  return (
    <div
      className={cn(
        cardSurface,
        'relative z-10 flex items-center gap-3 p-3.5',
        act.state === 'current' && 'border-signal/40 shadow-[0_0_34px_-14px_var(--color-signal)]',
        act.state === 'locked' && 'opacity-80',
      )}
    >
      <motion.span
        // El candado se abre con un giro cuando el acto se desbloquea.
        key={act.state}
        initial={{ scale: 1.5, rotate: -25 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 14 }}
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-2xl',
          act.state === 'done' && 'bg-signal text-on-signal',
          act.state === 'current' && 'bg-signal/15 text-signal',
          act.state === 'locked' && 'bg-white/[0.06] text-muted',
        )}
      >
        {act.state === 'done' ? (
          <Check aria-hidden className="size-5" strokeWidth={3} />
        ) : act.state === 'current' ? (
          <LockOpen aria-hidden className="size-5" />
        ) : (
          <Lock aria-hidden className="size-5" />
        )}
      </motion.span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-display text-[11px] font-semibold tracking-wide text-muted uppercase">
          Acto {act.number}
          <DifficultyPips value={act.difficulty} />
        </p>
        <h2 className="font-display text-lg leading-tight font-semibold">{act.title}</h2>
        {act.goal && <p className="mt-0.5 text-[13px] leading-snug text-muted">{act.goal}</p>}
      </div>
      {act.state === 'done' ? (
        <Badge tone="signal">{campaignDone ? 'Hecho' : 'Completado'}</Badge>
      ) : act.state === 'current' && act.status === 'ready' ? (
        <Badge tone="info">
          {resolved} / {act.quests.length}
        </Badge>
      ) : act.state === 'locked' ? (
        <Badge>Bloqueado</Badge>
      ) : null}
    </div>
  )
}

/** Acto actual sin misiones: botón para generarlas, con reintento si falla. */
function GenerateAct({ campaignId, act, onAddQuest }: { campaignId: string; act: ActView; onAddQuest: () => void }) {
  const run = useActRun(campaignId)

  async function generate(fast: boolean) {
    if (await generateNextAct(campaignId, fast)) haptic('unlock')
  }

  return (
    <div className="relative z-10 mt-3 flex flex-col gap-3 rounded-3xl border border-dashed border-signal/40 bg-signal/[0.05] p-4 text-center">
      {run?.status === 'running' ? (
        <div role="status" className="flex flex-col items-center gap-2 py-3 text-signal">
          <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
            <LoaderCircle aria-hidden className="size-8" />
          </motion.span>
          <p className="font-display">Diseñando el Acto {act.number} según cómo te fue…</p>
          <p className="text-xs text-muted">
            {run.fast ? 'Usando el modelo rápido.' : 'El modelo principal está pensando. Puede tardar hasta un minuto.'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            ¡Llegaste al Acto {act.number}! Sus misiones se diseñan ahora, usando lo que completaste, saltaste y cuánto
            tardaste.
          </p>
          {run?.status === 'error' && (
            <div role="alert" className="flex items-start gap-2 rounded-2xl border border-ember/50 bg-ember/10 p-3 text-left text-sm">
              <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-ember" />
              <p>
                {run.message} <span className="text-muted">El acto sigue pendiente.</span>
              </p>
            </div>
          )}
          <Button variant="primary" size="lg" onClick={() => void generate(false)}>
            {run?.status === 'error' ? <RotateCcw aria-hidden /> : <Sparkles aria-hidden />}
            {run?.status === 'error' ? 'Reintentar' : `Generar Acto ${act.number}`}
          </Button>
          {run?.status === 'error' && run.offerFast && (
            <Button variant="outline" onClick={() => void generate(true)}>
              <Zap aria-hidden />
              Usar modelo rápido
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onAddQuest}>
            <Plus aria-hidden />
            Agregar misiones a mano
          </Button>
        </>
      )}
    </div>
  )
}

function AnalysisSheet({ campaign, onClose }: { campaign: CampaignView; onClose: () => void }) {
  const headingId = useId()
  const analysis = campaign.analysis
  useBack(true, onClose)
  if (!analysis) return null

  return (
    <Sheet labelledBy={headingId} focusSheet onClose={onClose}>
      <div className="flex flex-col gap-4">
        <SheetTitle id={headingId} icon={<Target aria-hidden className="size-5 text-signal" />}>
          Análisis de la campaña
        </SheetTitle>
        {analysis.duration && (
          <Badge tone="info" className="self-start px-2.5 py-1 text-xs">
            <Clock aria-hidden />
            Duración estimada: {analysis.duration}
          </Badge>
        )}
        {analysis.diagnosis && (
          <section>
            <SectionLabel>Diagnóstico</SectionLabel>
            <p className="mt-2 text-[15px] leading-relaxed text-ink/90">{analysis.diagnosis}</p>
          </section>
        )}
        {analysis.successCriteria && (
          <section className="rounded-2xl border border-signal/30 bg-signal/[0.07] p-3.5">
            <SectionLabel icon={Flag}>Cómo sabrás que lo lograste</SectionLabel>
            <p className="mt-2 text-[15px] leading-relaxed">{analysis.successCriteria}</p>
          </section>
        )}
        {analysis.obstacles.length > 0 && (
          <section>
            <SectionLabel icon={ShieldAlert}>Obstáculos probables</SectionLabel>
            <ul className="mt-2 flex flex-col gap-2">
              {analysis.obstacles.map((item) => (
                <li key={item.obstacle} className="rounded-2xl border border-white/[0.06] bg-void/50 p-3 text-sm leading-snug">
                  <p className="font-medium text-ember">{item.obstacle}</p>
                  <p className="mt-1 text-ink/90">{item.solution}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
        <Button onClick={onClose}>Listo</Button>
      </div>
    </Sheet>
  )
}

/** La campaña como mapa de mundos: un camino con un punto por misión, zonas por acto y el jefe al final. */
export function CampaignMap(props: {
  campaignId: string
  onClose: () => void
  onOpen: (ref: TaskRef) => void
  onEdit: (campaign: Campaign) => void
  onAddQuest: (campaignId: string) => void
}) {
  const { campaignId, onClose, onOpen, onEdit, onAddQuest } = props
  const campaign = useLiveQuery(() => getCampaign(db, campaignId), [campaignId])
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const focusRef = useRef<HTMLButtonElement>(null)
  const [width, setWidth] = useState(360)
  const scrolled = useRef(false)

  // Si la campaña se borra desde la edición, el mapa se cierra.
  useEffect(() => {
    if (campaign === null) onClose()
  }, [campaign, onClose])

  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    const measure = () => element.clientWidth > 0 && setWidth(element.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [campaign === undefined])

  const focusId = campaign?.sideQuests.find((quest) => nodeState(quest) === 'open')?.id ?? null

  // Al abrir, el mapa se coloca en la misión actual.
  useEffect(() => {
    if (!campaign || scrolled.current) return
    scrolled.current = true
    focusRef.current?.scrollIntoView?.({ block: 'center' })
  }, [campaign])

  if (!campaign) return null
  const done = campaign.currentAct === null && campaign.sideQuests.length > 0
  let offset = 0

  return (
    <Screen
      title={campaign.title}
      eyebrow={
        campaign.legacy
          ? `Campaña · ${campaign.sideQuests.length} misiones`
          : done
            ? 'Campaña completada'
            : `Campaña · Acto ${campaign.currentAct} de ${campaign.actViews.length}`
      }
      onClose={onClose}
      action={
        <Button variant="ghost" size="icon" aria-label={`Editar ${campaign.title}`} onClick={() => onEdit(campaign)}>
          <Pencil aria-hidden />
        </Button>
      }
    >
      <div className="mx-auto flex max-w-md flex-col gap-3 px-4">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <ProgressBar
              size="lg"
              value={campaign.progress}
              max={100}
              text={`${campaign.resolved} / ${campaign.sideQuests.length} · ${campaign.progress}%`}
              label={`Progreso de ${campaign.title}`}
            />
          </div>
          {campaign.analysis && (
            <Button variant="outline" size="sm" onClick={() => setAnalysisOpen(true)} className="min-h-11 shrink-0">
              <Target aria-hidden />
              Análisis
            </Button>
          )}
        </div>

        {done && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-3 rounded-3xl border border-signal/40 bg-signal/10 p-4"
          >
            <Crown aria-hidden className="size-8 shrink-0 text-signal" />
            <p className="font-display text-lg font-semibold text-signal">¡Campaña completada!</p>
          </motion.div>
        )}

        <div ref={container} className="pb-4">
          {campaign.actViews.map((act) => {
            const start = offset
            offset += act.quests.length
            return (
              <section key={act.id} aria-label={campaign.legacy ? 'Misiones' : `Acto ${act.number}: ${act.title}`}>
                {!campaign.legacy && <ActHeader act={act} campaignDone={done} />}
                {act.state === 'current' && act.status === 'planned' && (
                  <GenerateAct campaignId={campaign.id} act={act} onAddQuest={() => onAddQuest(campaign.id)} />
                )}
                <ActPath
                  act={act}
                  width={width}
                  offset={start}
                  legacy={campaign.legacy}
                  focusId={focusId}
                  focusRef={focusRef}
                  onOpen={onOpen}
                />
                {campaign.legacy && act.quests.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted">Esta campaña aún no tiene misiones.</p>
                )}
                {(campaign.legacy || (act.state === 'current' && act.status === 'ready')) && (
                  <Button variant="dashed" onClick={() => onAddQuest(campaign.id)} className="relative z-10 mb-3 w-full">
                    <Plus aria-hidden />
                    Agregar misión{campaign.legacy ? '' : ` al Acto ${act.number}`}
                  </Button>
                )}
              </section>
            )
          })}
        </div>
      </div>

      {analysisOpen && <AnalysisSheet campaign={campaign} onClose={() => setAnalysisOpen(false)} />}
    </Screen>
  )
}
