import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, Flag, ListTodo, Pencil, Plus, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { db } from '../data/appDb'
import type { Campaign, SideQuest } from '../data/db'
import { completeSideQuest, getMissions, undoSideQuest, type TaskRef } from '../data/gameStore'

type CampaignView = Awaited<ReturnType<typeof getMissions>>['campaigns'][number]
import { baseXp } from '../game/rules'
import { Button } from './kit/Button'
import { Card, cardSurface } from './kit/Card'
import { cn } from './kit/cn'
import { ProgressBar } from './kit/controls'
import { TaskRow } from './kit/TaskRow'

export function MissionsTab(props: {
  onGenerate: () => void
  onCreateCampaign: () => void
  onEditCampaign: (campaign: Campaign) => void
  onCreateQuest: (campaignId: string | null) => void
  onOpen: (ref: TaskRef) => void
  onReward: (xp: number | null) => void
}) {
  const { onGenerate, onCreateCampaign, onEditCampaign, onCreateQuest, onOpen, onReward } = props
  const missions = useLiveQuery(() => getMissions(db), [])

  async function toggle(quest: SideQuest) {
    if (quest.completedDay !== null) await undoSideQuest(db, quest.id)
    else onReward(await completeSideQuest(db, quest.id))
  }

  function questRows(quests: SideQuest[]) {
    if (quests.length === 0) return null
    return (
      <ul className="mb-3 flex flex-col gap-2">
        {quests.map((quest) => (
          <TaskRow
            key={quest.id}
            layoutId={`task-${quest.id}`}
            title={quest.title}
            difficulty={quest.difficulty}
            xp={baseXp(quest.difficulty)}
            done={quest.completedDay !== null}
            stepCount={quest.steps?.length ?? 0}
            onToggle={() => void toggle(quest)}
            onOpen={() => onOpen({ kind: 'sideQuest', id: quest.id })}
          />
        ))}
      </ul>
    )
  }

  if (!missions) return null

  return (
    <>
      <Button variant="primary" size="lg" onClick={onGenerate} className="w-full">
        <Sparkles aria-hidden />
        Generar campaña con IA
      </Button>

      {missions.campaigns.length === 0 && (
        <Card label="Campañas" icon={Flag}>
          <p className="mb-3 text-sm text-muted">
            Una campaña es una meta grande. Divídela en Side Quests y su barra avanzará con cada una.
          </p>
          <Button variant="dashed" onClick={onCreateCampaign} className="w-full">
            <Plus aria-hidden />
            Nueva campaña
          </Button>
        </Card>
      )}

      {missions.campaigns.map((campaign) => (
        <CampaignCard
          key={campaign.id}
          campaign={campaign}
          rows={questRows(campaign.sideQuests)}
          onEdit={() => onEditCampaign(campaign)}
          onAddQuest={() => onCreateQuest(campaign.id)}
        />
      ))}

      {missions.campaigns.length > 0 && (
        <Button variant="dashed" onClick={onCreateCampaign} className="w-full">
          <Plus aria-hidden />
          Nueva campaña
        </Button>
      )}

      <Card label="Side Quests sueltas" icon={ListTodo}>
        {missions.looseSideQuests.length === 0 && (
          <p className="mb-3 text-sm text-muted">Tareas únicas que no pertenecen a ninguna campaña.</p>
        )}
        {questRows(missions.looseSideQuests)}
        <Button variant="dashed" onClick={() => onCreateQuest(null)} className="w-full">
          <Plus aria-hidden />
          Side Quest suelta
        </Button>
      </Card>
    </>
  )
}

/** Campaña plegable: siempre empieza cerrada y se abre al tocar su encabezado. */
function CampaignCard(props: { campaign: CampaignView; rows: ReactNode; onEdit: () => void; onAddQuest: () => void }) {
  const { campaign } = props
  const [open, setOpen] = useState(false)
  const done = campaign.sideQuests.filter((quest) => quest.completedDay !== null).length

  return (
    <section aria-label={`Campaña ${campaign.title}`} className={cn(cardSurface, 'overflow-hidden')}>
      <div className="flex items-start gap-1 p-4 pb-3">
        <motion.button
          type="button"
          onClick={() => setOpen((value) => !value)}
          whileTap={{ scale: 0.985 }}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex items-center gap-2 font-display text-xs font-semibold tracking-wide text-muted uppercase">
            <Flag aria-hidden className="size-3.5 text-signal" />
            Campaña · {campaign.sideQuests.length} Side Quests
          </span>
          <span className="mt-1 flex items-center gap-2">
            <span className="font-display text-xl leading-tight font-semibold">{campaign.title}</span>
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 text-muted"
            >
              <ChevronDown aria-hidden className="size-5" />
            </motion.span>
          </span>
        </motion.button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Editar ${campaign.title}`}
          onClick={props.onEdit}
          className="-mt-1 -mr-2"
        >
          <Pencil aria-hidden />
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="block w-full px-4 pb-4"
        tabIndex={-1}
        aria-hidden
      >
        <ProgressBar
          size="lg"
          value={campaign.progress}
          max={100}
          text={`${done} / ${campaign.sideQuests.length} · ${campaign.progress}%`}
          label={`Progreso de ${campaign.title}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="quests"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              {props.rows}
              <Button variant="dashed" onClick={props.onAddQuest} className="w-full">
                <Plus aria-hidden />
                Side Quest
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
