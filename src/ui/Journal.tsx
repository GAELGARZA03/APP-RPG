import { useLiveQuery } from 'dexie-react-hooks'
import { BookHeart, Flag, NotebookPen, Skull, Trophy } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { db } from '../data/appDb'
import { deleteEvidence, getJournal, type JournalEntry, type TaskRef } from '../data/gameStore'
import type { GameDay } from '../game/gameDay'
import { Diary } from './Diary'
import { formatDay } from './formatDay'
import { PhotoViewer } from './EvidenceSection'
import { Badge } from './kit/Badge'
import { cardSurface } from './kit/Card'
import { cn } from './kit/cn'

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

type Section = 'diary' | 'progress'
const SECTION_KEY = 'bitacora:seccion'

function savedSection(): Section {
  try {
    return localStorage.getItem(SECTION_KEY) === 'progress' ? 'progress' : 'diary'
  } catch {
    return 'diary'
  }
}

/**
 * Pestaña Bitácora, con dos partes: el Diario (una nota por día con algo épico o algo por lo que das gracias)
 * y el Progreso (las fotos y notas de tus misiones).
 */
export function JournalTab({ today, onOpen }: { today: GameDay; onOpen: (ref: TaskRef) => void }) {
  const [section, setSectionState] = useState<Section>(savedSection)
  function setSection(next: Section) {
    setSectionState(next)
    try {
      localStorage.setItem(SECTION_KEY, next)
    } catch {
      // Sin almacenamiento, la sección simplemente no se recuerda.
    }
  }

  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Bitácora</h1>
      <div
        role="tablist"
        aria-label="Secciones de la bitácora"
        className="grid grid-cols-2 gap-1 rounded-2xl bg-raised/70 p-1"
      >
        {(
          [
            { id: 'diary', label: 'Diario', icon: BookHeart },
            { id: 'progress', label: 'Progreso', icon: Trophy },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={section === option.id}
            onClick={() => setSection(option.id)}
            className={cn(
              'flex min-h-10 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors',
              section === option.id ? 'bg-signal text-on-signal' : 'text-muted active:text-ink',
            )}
          >
            <option.icon aria-hidden className="size-4" />
            {option.label}
          </button>
        ))}
      </div>
      {section === 'diary' ? <Diary today={today} /> : <Progress onOpen={onOpen} />}
    </>
  )
}

/** Progreso: todas las fotos y notas de tus misiones, de la más reciente a la más antigua. */
function Progress({ onOpen }: { onOpen: (ref: TaskRef) => void }) {
  const entries = useLiveQuery(() => getJournal(db), [])
  const [viewing, setViewing] = useState<JournalEntry | null>(null)
  const photoCount = entries?.filter((entry) => entry.photo).length ?? 0
  const noteCount = (entries?.length ?? 0) - photoCount

  return (
    <>
      {entries && entries.length > 0 && (
        <p className="-mt-2 text-sm text-muted">
          {photoCount} {photoCount === 1 ? 'foto' : 'fotos'} · {noteCount} {noteCount === 1 ? 'nota' : 'notas'} de tus
          misiones
        </p>
      )}
      <div className="flex flex-col gap-5">
        {entries && entries.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="grid size-20 place-items-center rounded-full bg-signal/15 ring-2 ring-signal/40">
              <NotebookPen aria-hidden className="size-9 text-signal" />
            </span>
            <p className="font-display text-xl font-semibold">Aún no hay progreso registrado</p>
            <p className="text-sm text-muted">
              Al completar una misión, agrega una foto o una nota desde su detalle. Aquí quedará el registro de tu
              aventura.
            </p>
          </div>
        )}

        {groupEntries(entries ?? []).map((group) => (
          <section key={group.day} aria-label={formatDay(group.day)} className="flex flex-col gap-2.5">
            <h2 className="sticky top-[env(safe-area-inset-top)] z-10 -mx-4 bg-void/85 px-4 py-1.5 font-display text-sm font-semibold tracking-wide text-muted uppercase backdrop-blur">
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
    </>
  )
}
