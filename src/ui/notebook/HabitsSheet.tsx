// Administrar hábitos: orden de las columnas, editar, archivar y crear.
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArrowDown, ArrowUp, ListChecks, Pencil, Plus, RotateCcw } from 'lucide-react'
import { useId, useState } from 'react'
import { db } from '../../data/appDb'
import type { Habit, HabitFrequency } from '../../data/db'
import { getArchivedHabits, getHabits, moveHabit, restoreHabit } from '../../data/gameStore'
import type { GameDay } from '../../game/gameDay'
import { Button } from '../kit/Button'
import { DifficultyPips } from '../kit/controls'
import { Sheet, SheetTitle } from '../Sheet'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function frequencyLabel(frequency: HabitFrequency): string {
  if (frequency.kind === 'daily' || frequency.days.length === 7) return 'Todos los días'
  return frequency.days.map((day) => WEEKDAYS[day]).join(' · ')
}

export function HabitsSheet(props: {
  today: GameDay
  onClose: () => void
  onCreate: () => void
  onEdit: (habit: Habit) => void
}) {
  const headingId = useId()
  const habits = useLiveQuery(() => getHabits(db, props.today), [props.today])
  const archived = useLiveQuery(() => getArchivedHabits(db), [])
  const [showArchived, setShowArchived] = useState(false)

  return (
    <Sheet labelledBy={headingId} focusSheet onClose={props.onClose}>
      <div className="flex flex-col gap-4">
        <SheetTitle id={headingId} icon={<ListChecks aria-hidden className="size-5 text-signal" />}>
          Tus hábitos
        </SheetTitle>
        <p className="-mt-2 text-sm text-muted">
          El orden de esta lista es el de las columnas de la libreta. Archivar conserva su historial y su XP.
        </p>

        <ul className="flex flex-col gap-2">
          {habits?.map((habit, index) => (
            <li
              key={habit.id}
              className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-void/50 p-2 pl-3"
            >
              <span className="w-6 text-center text-lg">{habit.emoji ?? '•'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{habit.title}</span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {frequencyLabel(habit.frequency)}
                  <DifficultyPips value={habit.difficulty} />
                </span>
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Mover ${habit.title} a la izquierda`}
                disabled={index === 0}
                onClick={() => void moveHabit(db, habit.id, -1)}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Mover ${habit.title} a la derecha`}
                disabled={index === habits.length - 1}
                onClick={() => void moveHabit(db, habit.id, 1)}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Editar ${habit.title}`}
                onClick={() => props.onEdit(habit)}
              >
                <Pencil aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        {habits && habits.length === 0 && <p className="text-sm text-muted">Aún no tienes hábitos.</p>}

        <Button variant="dashed" onClick={props.onCreate}>
          <Plus aria-hidden />
          Nuevo hábito
        </Button>

        {archived && archived.length > 0 && (
          <section aria-label="Hábitos archivados" className="flex flex-col gap-2 border-t border-white/[0.06] pt-3">
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              aria-expanded={showArchived}
              className="flex min-h-11 items-center gap-2 text-left text-sm text-muted"
            >
              <Archive aria-hidden className="size-4" />
              Archivados · {archived.length}
            </button>
            {showArchived &&
              archived.map((habit) => (
                <div
                  key={habit.id}
                  className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-void/30 p-2 pl-3 text-muted"
                >
                  <span className="w-6 text-center text-lg">{habit.emoji ?? '•'}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{habit.title}</span>
                  <Button size="sm" variant="ghost" onClick={() => void restoreHabit(db, habit.id)}>
                    <RotateCcw aria-hidden />
                    Restaurar
                  </Button>
                </div>
              ))}
          </section>
        )}
      </div>
    </Sheet>
  )
}
