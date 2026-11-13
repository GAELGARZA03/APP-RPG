import { useLiveQuery } from 'dexie-react-hooks'
import { Castle, Check, ChevronDown, ChevronRight, Crown, Flag, ListTodo, Lock, Plus, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { db } from '../data/appDb'
import type { SideQuest } from '../data/db'
import {
  completeQuest,
  getMissions,
  undoSideQuest,
  type CampaignView,
  type Outcome,
  type TaskRef,
} from '../data/gameStore'
import { baseXp } from '../game/rules'
import { Button } from './kit/Button'
import { Card, cardSurface } from './kit/Card'
import { cn } from './kit/cn'
import { ProgressBar } from './kit/controls'
import { TaskRow } from './kit/TaskRow'

export function MissionsTab(props: {
  onGenerate: () => void
  onCreateCampaign: () => void
  onOpenCampaign: (campaignId: string) => void
  onCreateQuest: (campaignId: string | null) => void
  onOpen: (ref: TaskRef) => void
  onOutcome: (outcome: Outcome, ref: TaskRef, fromDetail: boolean) => void
}) {
  const { onGenerate, onCreateCampaign, onOpenCampaign, onCreateQuest, onOpen, onOutcome } = props
  const missions = useLiveQuery(() => getMissions(db), [])

  async function toggle(quest: SideQuest) {
    if (quest.completedDay !== null) await undoSideQuest(db, quest.id)
    else onOutcome(await completeQuest(db, quest.id), { kind: 'sideQuest', id: quest.id }, false)
  }

  if (!missions) return null
  // Una campaña está completada cuando no le queda ningún acto abierto (y tiene al menos una misión).
  const isFinished = (campaign: CampaignView) => campaign.currentAct === null && campaign.sideQuests.length > 0
  const finished = missions.campaigns.filter(isFinished)
  const active = missions.campaigns.filter((campaign) => !isFinished(campaign))

  return (
    <>
      <Button variant="primary" size="lg" onClick={onGenerate} className="w-full">
        <Sparkles aria-hidden />
        Generar campaña con IA
      </Button>

      {finished.length > 0 && <FinishedCampaigns campaigns={finished} onOpen={onOpenCampaign} />}

      {missions.campaigns.length === 0 && (
        <Card label="Campañas" icon={Flag}>
          <p className="mb-3 text-sm text-muted">
            Una campaña es una meta grande convertida en un camino por actos, con una misión jefe al final.
          </p>
          <Button variant="dashed" onClick={onCreateCampaign} className="w-full">
            <Plus aria-hidden />
            Nueva campaña vacía
          </Button>
        </Card>
      )}

      {active.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} onOpen={() => onOpenCampaign(campaign.id)} />
      ))}

      {missions.campaigns.length > 0 && (
        <Button variant="dashed" onClick={onCreateCampaign} className="w-full">
          <Plus aria-hidden />
          Nueva campaña vacía
        </Button>
      )}

      <Card label="Side Quests sueltas" icon={ListTodo}>
        {missions.looseSideQuests.length === 0 && (
          <p className="mb-3 text-sm text-muted">Tareas únicas que no pertenecen a ninguna campaña.</p>
        )}
        {missions.looseSideQuests.length > 0 && (
          <ul className="mb-3 flex flex-col gap-2">
            {missions.looseSideQuests.map((quest) => (
              <TaskRow
                key={quest.id}
                layoutId={`task-${quest.id}`}
                title={quest.title}
                difficulty={quest.difficulty}
                xp={baseXp(quest.difficulty)}
                done={quest.completedDay !== null}
                stepCount={quest.steps?.length ?? 0}
                stepsDone={quest.stepsDone?.length ?? 0}
                onToggle={() => void toggle(quest)}
                onOpen={() => onOpen({ kind: 'sideQuest', id: quest.id })}
              />
            ))}
          </ul>
        )}
        <Button variant="dashed" onClick={() => onCreateQuest(null)} className="w-full">
          <Plus aria-hidden />
          Side Quest suelta
        </Button>
      </Card>
    </>
  )
}

/** Campañas ya terminadas: plegadas por defecto para dar prioridad a las que siguen en curso. */
function FinishedCampaigns({ campaigns, onOpen }: { campaigns: CampaignView[]; onOpen: (campaignId: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <section aria-label="Campañas completadas" className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-12 items-center gap-3 rounded-2xl border border-signal/25 bg-signal/[0.06] px-4 text-left active:bg-signal/10"
      >
        <Crown aria-hidden className="size-5 shrink-0 text-signal" />
        <span className="flex-1 font-display text-sm font-semibold tracking-wide uppercase">
          Completadas · {campaigns.length}
        </span>
        <ChevronDown aria-hidden className={cn('size-5 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="finished"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3">
              {campaigns.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} onOpen={() => onOpen(campaign.id)} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/** Tarjeta de campaña: muestra el camino por actos en miniatura y abre el mapa al tocarla. */
function CampaignCard({ campaign, onOpen }: { campaign: CampaignView; onOpen: () => void }) {
  const finished = campaign.currentAct === null && campaign.sideQuests.length > 0
  const next = campaign.sideQuests.find(
    (quest) => quest.completedDay === null && (quest.skippedDay ?? null) === null && !quest.lock,
  )
  const currentAct = campaign.currentAct ? campaign.actViews[campaign.currentAct - 1] : null
  const hasBoss = campaign.sideQuests.some((quest) => quest.boss)

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={{ scale: 0.985 }}
      aria-label={`Abrir el mapa de ${campaign.title}`}
      className={cn(cardSurface, 'flex w-full flex-col gap-3 p-4 text-left')}
    >
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-display text-xs font-semibold tracking-wide text-muted uppercase">
            <Flag aria-hidden className="size-3.5 text-signal" />
            {campaign.legacy
              ? `Campaña · ${campaign.sideQuests.length} Side Quests`
              : finished
                ? 'Campaña completada'
                : `Campaña · Acto ${campaign.currentAct} de ${campaign.actViews.length}`}
          </span>
          <span className="mt-1 block font-display text-xl leading-tight font-semibold">{campaign.title}</span>
        </span>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-muted">
          <ChevronRight aria-hidden className="size-5" />
        </span>
      </span>

      {!campaign.legacy && (
        <span aria-hidden className="flex items-center gap-1">
          {campaign.actViews.map((act, index) => (
            <span key={act.id} className="flex flex-1 items-center gap-1">
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full border text-[11px] font-bold',
                  act.state === 'done' && 'border-signal bg-signal text-on-signal',
                  act.state === 'current' && 'border-signal bg-signal/15 text-signal shadow-[0_0_12px_-3px_var(--color-signal)]',
                  act.state === 'locked' && 'border-white/10 text-muted/70',
                )}
              >
                {act.state === 'done' ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : act.state === 'locked' ? (
                  <Lock className="size-3" />
                ) : (
                  act.number
                )}
              </span>
              <span
                className={cn(
                  'h-1 flex-1 rounded-full',
                  act.state === 'done' ? 'bg-signal' : 'bg-white/[0.08]',
                  index === campaign.actViews.length - 1 && !hasBoss && 'hidden',
                )}
              />
            </span>
          ))}
          {hasBoss && (
            <span
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-xl border',
                finished ? 'border-ember bg-ember text-void' : 'border-ember/40 bg-ember/10 text-ember',
              )}
            >
              {finished ? <Crown className="size-4" /> : <Castle className="size-4" />}
            </span>
          )}
        </span>
      )}

      <ProgressBar
        size="lg"
        value={campaign.progress}
        max={100}
        text={`${campaign.resolved} / ${campaign.sideQuests.length} · ${campaign.progress}%`}
        label={`Progreso de ${campaign.title}`}
      />

      {!finished && (next || currentAct?.status === 'planned') && (
        <span className="flex items-center gap-2 text-sm text-muted">
          <span className="shrink-0 text-xs font-semibold text-signal uppercase">Sigue</span>
          <span className="truncate">
            {next ? next.title : `Generar las misiones del Acto ${currentAct!.number}`}
          </span>
        </span>
      )}
    </motion.button>
  )
}
