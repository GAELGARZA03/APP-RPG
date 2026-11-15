import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCheck, NotebookTabs, Plus } from 'lucide-react'
import { db } from '../data/appDb'
import type { ProfileSettings } from '../data/db'
import {
  completeHabit,
  getTodayHabits,
  getWeek,
  undoHabit,
  type Hud,
  type Outcome,
  type TaskRef,
  type TodayHabit,
} from '../data/gameStore'
import type { GameDay } from '../game/gameDay'
import { DailyCard } from './DailyCard'
import { HudCard, StreakCard } from './HudCard'
import { Badge } from './kit/Badge'
import { Button } from './kit/Button'
import { Card } from './kit/Card'
import { TaskRow } from './kit/TaskRow'
import { ReviewCard } from './review/ReviewCard'

export function TodayTab(props: {
  today: GameDay
  hud: Hud
  title: string
  profile: ProfileSettings | undefined
  onProfile: () => void
  onCreate: () => void
  onNotebook: () => void
  onReview: (weekStart: GameDay) => void
  onOpen: (ref: TaskRef) => void
  onStreakInfo: () => void
  onOutcome: (outcome: Outcome, ref: TaskRef, fromDetail: boolean) => void
}) {
  const { today, hud, title, profile, onProfile, onCreate, onOpen, onStreakInfo, onOutcome } = props
  const habits = useLiveQuery(() => getTodayHabits(db, today), [today])
  const week = useLiveQuery(() => getWeek(db, today), [today])

  async function toggle(habit: TodayHabit) {
    if (habit.doneToday) await undoHabit(db, habit.id)
    else {
      const xp = await completeHabit(db, habit.id)
      onOutcome({ ok: xp !== null, xp: xp ?? 0 }, { kind: 'habit', id: habit.id }, false)
    }
  }

  const doneCount = habits?.filter((habit) => habit.doneToday).length ?? 0

  return (
    <>
      <HudCard hud={hud} title={title} profile={profile} onOpen={onProfile} />
      <StreakCard hud={hud} week={week} onInfo={onStreakInfo} />
      <DailyCard today={today} onOpen={onOpen} onOutcome={onOutcome} />
      <ReviewCard today={today} onOpen={props.onReview} />

      <Card
        label="Hábitos de hoy"
        icon={NotebookTabs}
        action={
          habits && habits.length > 0 ? (
            doneCount === habits.length ? (
              <Badge tone="signal">
                <CheckCheck aria-hidden />
                Todos hechos
              </Badge>
            ) : (
              <Badge>
                {doneCount} / {habits.length}
              </Badge>
            )
          ) : undefined
        }
      >
        {habits && habits.length === 0 && (
          <p className="mb-3 text-sm text-muted">
            Hoy no te toca ningún hábito. Agrégalos o revisa tu mes en la libreta.
          </p>
        )}
        <ul className="mb-3 flex flex-col gap-2">
          {habits?.map((habit) => (
            <TaskRow
              key={habit.id}
              layoutId={`task-${habit.id}`}
              title={habit.emoji ? `${habit.emoji} ${habit.title}` : habit.title}
              difficulty={habit.difficulty}
              xp={habit.state === 'half' ? Math.round(habit.xp / 2) : habit.xp}
              done={habit.doneToday}
              stepCount={habit.steps?.length ?? 0}
              stepsDone={habit.stepsDoneToday}
              onToggle={() => void toggle(habit)}
              onOpen={() => onOpen({ kind: 'habit', id: habit.id })}
            />
          ))}
        </ul>
        <div className="flex gap-2">
          <Button variant="outline" onClick={props.onNotebook} className="flex-1">
            <NotebookTabs aria-hidden />
            Ver libreta
          </Button>
          <Button variant="dashed" onClick={onCreate} className="flex-1">
            <Plus aria-hidden />
            Nuevo hábito
          </Button>
        </div>
      </Card>
    </>
  )
}
