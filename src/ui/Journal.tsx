import { useLiveQuery } from 'dexie-react-hooks'
import { Flag, NotebookPen, Skull } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { db } from '../data/appDb'
import { deleteEvidence, getJournal, type JournalEntry, type TaskRef } from '../data/gameStore'
import { PhotoViewer } from './EvidenceSection'
import { Badge } from './kit/Badge'
import { cardSurface } from './kit/Card'
import { cn } from './kit/cn'
import { Screen } from './Screen'

function formatDay(day: string) {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** Evidencias agrupadas por día y, dentro del día, por misión. */
function groupEntries(entries: JournalEntry[]) {
  const days: Array<{ day: string; tasks: Array<{ taskId: string; entries: JournalEntry[] }> }> = []
  for (const entry of entries) {
    let group = days[days.length - 1]
    if (!group || group.day !== entry.day) days.push((group = { day: entry.day, tasks: [] }))
    let task = group.tasks.find((item) => item.taskId === entry.taskId)
    if (!task) group.tasks.push((task = { taskId: entry.taskId, entries: [] }))
    task.entries.push(entry)
  }
  return days
}

/** Bitácora: todas las fotos y notas, de la más reciente a la más antigua. */
export function JournalScreen({ onClose, onOpen }: { onClose: () => void; onOpen: (ref: TaskRef) => void }) {
  const entries = useLiveQuery(() => getJournal(db), [])
  const [viewing, setViewing] = useState<JournalEntry | null>(null)
  const photoCount = entries?.filter((entry) => entry.photo).length ?? 0

  return (
    <Screen
      title="Bitácora"
      eyebrow={entries ? `${photoCount} fotos · ${entries.length - photoCount} notas` : undefined}
      onClose={onClose}
    >
      <div className="mx-auto flex max-w-md flex-col gap-5 px-4">
        {entries && entries.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="grid size-20 place-items-center rounded-full bg-signal/15 ring-2 ring-signal/40">
              <NotebookPen aria-hidden className="size-9 text-signal" />
            </span>
            <p className="font-display text-xl font-semibold">Tu bitácora está en blanco</p>
            <p className="text-sm text-muted">
              Al completar una misión, agrega una foto o una nota desde su detalle. Aquí quedará el registro de tu
              aventura.
            </p>
          </div>
        )}

        {groupEntries(entries ?? []).map((group) => (
          <section key={group.day} aria-label={formatDay(group.day)} className="flex flex-col gap-2.5">
            <h2 className="sticky top-0 z-10 -mx-4 bg-void/85 px-4 py-1.5 font-display text-sm font-semibold tracking-wide text-muted uppercase backdrop-blur">
              {formatDay(group.day)}
            </h2>
            {group.tasks.map((task) => {
              const [first] = task.entries
              const photos = task.entries.filter((entry) => entry.photo)
              const notes = task.entries.filter((entry) => entry.note)
              return (
                <article
                  key={task.taskId}
                  className={cn(cardSurface, 'flex flex-col gap-3 p-4', first.boss && 'border-ember/40')}
                >
                  <button
                    type="button"
                    onClick={() => onOpen({ kind: first.taskKind, id: first.taskId })}
                    className="flex min-h-11 flex-col items-start justify-center gap-1 text-left"
                  >
                    <span className="flex flex-wrap items-center gap-1.5">
                      {first.boss && (
                        <Badge tone="ember">
                          <Skull aria-hidden />
                          Jefe derrotado
                        </Badge>
                      )}
                      {first.campaign && (
                        <Badge>
                          <Flag aria-hidden />
                          {first.campaign}
                        </Badge>
                      )}
                      {first.taskKind === 'daily' && <Badge tone="info">Misión del día</Badge>}
                    </span>
                    <span className="font-display text-lg leading-tight font-semibold">{first.taskTitle}</span>
                  </button>

                  {photos.length > 0 && (
                    <ul className={cn('grid gap-2', photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
                      {photos.map((entry) => (
                        <li key={entry.id}>
                          <button
                            type="button"
                            onClick={() => setViewing(entry)}
                            aria-label={`Ver foto de ${entry.taskTitle}`}
                            className={cn(
                              'block w-full overflow-hidden rounded-2xl ring-1 ring-white/10 active:scale-[0.98]',
                              photos.length === 1 ? 'aspect-video' : 'aspect-square',
                            )}
                          >
                            <img src={entry.photo} alt="" loading="lazy" className="size-full object-cover" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {notes.map((entry) => (
                    <p
                      key={entry.id}
                      className="rounded-2xl border-l-2 border-signal/60 bg-void/50 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap"
                    >
                      {entry.note}
                    </p>
                  ))}
                </article>
              )
            })}
          </section>
        ))}
      </div>

      <AnimatePresence>
        {viewing?.photo && (
          <PhotoViewer
            photo={viewing.photo}
            onClose={() => setViewing(null)}
            onDelete={() => {
              void deleteEvidence(db, viewing.id)
              setViewing(null)
            }}
          />
        )}
      </AnimatePresence>
    </Screen>
  )
}
