import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarCheck, CheckCheck, Plus } from 'lucide-react'
import { db } from '../data/appDb'
import type { ProfileSettings } from '../data/db'
import {
  completeBounty,
  getTodayBounties,
  getWeek,
  undoBounty,
  type Hud,
  type Outcome,
  type TaskRef,
  type TodayBounty,
} from '../data/gameStore'
import type { GameDay } from '../game/gameDay'
import { DailyCard } from './DailyCard'
import { HudCard, StreakCard } from './HudCard'
import { Badge } from './kit/Badge'
import { Button } from './kit/Button'
import { Card } from './kit/Card'
import { TaskRow } from './kit/TaskRow'

export function TodayTab(props: {
  today: GameDay
  hud: Hud
  title: string
  profile: ProfileSettings | undefined
  onProfile: () => void
  onCreate: () => void
  onOpen: (ref: TaskRef) => void
  onStreakInfo: () => void
  onOutcome: (outcome: Outcome, ref: TaskRef, fromDetail: boolean) => void
}) {
  const { today, hud, title, profile, onProfile, onCreate, onOpen, onStreakInfo, onOutcome } = props
  const bounties = useLiveQuery(() => getTodayBounties(db, today), [today])
  const week = useLiveQuery(() => getWeek(db, today), [today])

  async function toggle(bounty: TodayBounty) {
    if (bounty.doneToday) await undoBounty(db, bounty.id)
    else {
      const xp = await completeBounty(db, bounty.id)
      onOutcome({ ok: xp !== null, xp: xp ?? 0 }, { kind: 'bounty', id: bounty.id }, false)
    }
  }

  const doneCount = bounties?.filter((bounty) => bounty.doneToday).length ?? 0

  return (
    <>
      <HudCard hud={hud} title={title} profile={profile} onOpen={onProfile} />
      <StreakCard hud={hud} week={week} onInfo={onStreakInfo} />
      <DailyCard today={today} onOpen={onOpen} onOutcome={onOutcome} />

      <Card
        label="Contratos de hoy"
        icon={CalendarCheck}
        action={
          bounties && bounties.length > 0 ? (
            hud.todayFulfilled ? (
              <Badge tone="signal">
                <CheckCheck aria-hidden />
                Día cumplido
              </Badge>
            ) : (
              <Badge>
                {doneCount} / {bounties.length}
              </Badge>
            )
          ) : undefined
        }
      >
        {bounties && bounties.length === 0 && (
          <p className="mb-3 text-sm text-muted">
            Crea tus hábitos diarios. Completarlos todos mantiene viva tu racha.
          </p>
        )}
        <ul className="mb-3 flex flex-col gap-2">
          {bounties?.map((bounty) => (
            <TaskRow
              key={bounty.id}
              layoutId={`task-${bounty.id}`}
              title={bounty.title}
              difficulty={bounty.difficulty}
              xp={bounty.xp}
              done={bounty.doneToday}
              stepCount={bounty.steps?.length ?? 0}
              stepsDone={bounty.stepsDoneToday}
              onToggle={() => void toggle(bounty)}
              onOpen={() => onOpen({ kind: 'bounty', id: bounty.id })}
            />
          ))}
        </ul>
        <Button variant="dashed" onClick={onCreate} className="w-full">
          <Plus aria-hidden />
          Nuevo contrato diario
        </Button>
      </Card>
    </>
  )
}
