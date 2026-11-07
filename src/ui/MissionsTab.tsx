import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/appDb'
import type { Campaign, SideQuest } from '../data/db'
import { completeSideQuest, getMissions, undoSideQuest } from '../data/gameStore'
import { baseXp } from '../game/rules'
import { AddButton, Panel, ProgressBar, SmallButton, TaskRow } from './parts'

export function MissionsTab(props: {
  onCreateCampaign: () => void
  onEditCampaign: (campaign: Campaign) => void
  onCreateQuest: (campaignId: string | null) => void
  onEditQuest: (quest: SideQuest) => void
  onReward: (xp: number | null) => void
}) {
  const { onCreateCampaign, onEditCampaign, onCreateQuest, onEditQuest, onReward } = props
  const missions = useLiveQuery(() => getMissions(db), [])

  async function toggle(quest: SideQuest) {
    if (quest.completedDay !== null) await undoSideQuest(db, quest.id)
    else onReward(await completeSideQuest(db, quest.id))
  }

  function questRows(quests: SideQuest[]) {
    return (
      <ul className="mb-3 flex flex-col gap-2">
        {quests.map((quest) => (
          <TaskRow
            key={quest.id}
            title={quest.title}
            difficulty={quest.difficulty}
            xp={baseXp(quest.difficulty)}
            done={quest.completedDay !== null}
            onToggle={() => void toggle(quest)}
            onEdit={() => onEditQuest(quest)}
          />
        ))}
      </ul>
    )
  }

  if (!missions) return null

  return (
    <>
      {missions.campaigns.length === 0 && (
        <Panel label="Campañas">
          <p className="mb-3 text-sm text-muted">
            Una campaña es una meta grande. Divídela en Side Quests y su barra avanzará con cada una.
          </p>
          <AddButton onClick={onCreateCampaign}>Nueva campaña</AddButton>
        </Panel>
      )}

      {missions.campaigns.map((campaign) => (
        <Panel
          key={campaign.id}
          label="Campaña"
          action={<SmallButton onClick={() => onEditCampaign(campaign)}>Editar</SmallButton>}
        >
          <p className="mb-2 text-lg leading-tight font-bold">{campaign.title}</p>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Progreso</span>
            <span>{campaign.progress}%</span>
          </div>
          <div className="mb-4">
            <ProgressBar value={campaign.progress} max={100} label={`Progreso de ${campaign.title}`} />
          </div>
          {questRows(campaign.sideQuests)}
          <AddButton onClick={() => onCreateQuest(campaign.id)}>Side Quest</AddButton>
        </Panel>
      ))}

      {missions.campaigns.length > 0 && <AddButton onClick={onCreateCampaign}>Nueva campaña</AddButton>}

      <Panel label="Side Quests sueltas">
        {missions.looseSideQuests.length === 0 && (
          <p className="mb-3 text-sm text-muted">Tareas únicas que no pertenecen a ninguna campaña.</p>
        )}
        {questRows(missions.looseSideQuests)}
        <AddButton onClick={() => onCreateQuest(null)}>Side Quest suelta</AddButton>
      </Panel>
    </>
  )
}
