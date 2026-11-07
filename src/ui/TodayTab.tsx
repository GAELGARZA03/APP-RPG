import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/appDb'
import { completeBounty, getTodayBounties, undoBounty, type Hud, type TodayBounty } from '../data/gameStore'
import type { GameDay } from '../game/gameDay'
import { AddButton, Panel, ProgressBar, TaskRow } from './parts'

export function TodayTab(props: {
  today: GameDay
  hud: Hud
  title: string
  onCreate: () => void
  onEdit: (bounty: TodayBounty) => void
  onReward: (xp: number | null) => void
}) {
  const { today, hud, title, onCreate, onEdit, onReward } = props
  const bounties = useLiveQuery(() => getTodayBounties(db, today), [today])

  async function toggle(bounty: TodayBounty) {
    if (bounty.doneToday) await undoBounty(db, bounty.id)
    else onReward(await completeBounty(db, bounty.id))
  }

  const doneCount = bounties?.filter((bounty) => bounty.doneToday).length ?? 0

  return (
    <>
      <section aria-label="HUD del jugador" className="rounded-lg border border-line bg-panel p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-muted">
              NIVEL · <span className="text-signal">{title}</span>
            </p>
            <p className="text-5xl leading-none font-bold text-signal">{hud.level}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">RACHA</p>
            <p className="text-3xl leading-none font-bold text-ember">
              {hud.streak} <span className="text-sm font-normal text-muted">días</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              Bono Bounties: <span className="text-ember">+{hud.streakBonusPercent}%</span>
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>XP</span>
            <span>
              {hud.xpIntoLevel} / {hud.xpToNext}
            </span>
          </div>
          <ProgressBar
            value={hud.xpIntoLevel}
            max={hud.xpToNext}
            label="Experiencia para el siguiente nivel"
          />
        </div>
      </section>

      <Panel
        label="Contratos de hoy"
        action={
          bounties && bounties.length > 0 ? (
            <span className={`text-xs ${hud.todayFulfilled ? 'text-signal' : 'text-muted'}`}>
              {hud.todayFulfilled ? 'Día cumplido' : `${doneCount} / ${bounties.length}`}
            </span>
          ) : undefined
        }
      >
        {bounties && bounties.length === 0 && (
          <p className="mb-3 text-sm text-muted">
            Aún no tienes contratos. Crea tus hábitos diarios: completarlos todos mantiene viva tu racha.
          </p>
        )}
        <ul className="mb-3 flex flex-col gap-2">
          {bounties?.map((bounty) => (
            <TaskRow
              key={bounty.id}
              title={bounty.title}
              difficulty={bounty.difficulty}
              xp={bounty.xp}
              done={bounty.doneToday}
              onToggle={() => void toggle(bounty)}
              onEdit={() => onEdit(bounty)}
            />
          ))}
        </ul>
        <AddButton onClick={onCreate}>Nuevo contrato diario</AddButton>
      </Panel>
    </>
  )
}
