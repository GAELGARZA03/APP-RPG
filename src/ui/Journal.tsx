import { useLiveQuery } from 'dexie-react-hooks'
import { Award, BookHeart, Flag, NotebookPen, Skull, Star, Trophy, type LucideIcon } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useEffect, useState } from 'react'
import { db } from '../data/appDb'
import {
  deleteEvidence,
  getJournal,
  getMilestones,
  type JournalEntry,
  type MilestoneKind,
  type TaskRef,
} from '../data/gameStore'
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
export function JournalTab(props: {
  today: GameDay
  /** Abre el diario en este día (desde la libreta o un recuerdo de Hoy). */
  focus?: { day: GameDay; key: number }
  onOpen: (ref: TaskRef) => void
}) {
  const { today, focus, onOpen } = props
  const [section, setSectionState] = useState<Section>(focus ? 'diary' : savedSection)
  useEffect(() => {
    if (focus) setSectionState('diary')
  }, [focus])
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
      {section === 'diary' ? (
        <Diary key={focus?.key} today={today} initialDay={focus?.day} />
      ) : (
        <Progress onOpen={onOpen} />
      )}
    </>
  )
}

/** Progreso: todas las fotos y notas de tus misiones, de la más reciente a la más antigua. */
type ProgressFilter = 'all' | 'evidence' | 'milestones'
const FILTERS: Array<{ id: ProgressFilter; label: string }> = [
  { id: 'all', label: 'Todo' },
  { id: 'evidence', label: 'Evidencias' },
  { id: 'milestones', label: 'Hitos' },
]
const MILESTONE_ICON: Record<MilestoneKind, LucideIcon> = { level: Star, act: Flag, boss: Skull, mastery: Award }

function Progress({ onOpen }: { onOpen: (ref: TaskRef) => void }) {
  const allEntries = useLiveQuery(() => getJournal(db), [])
  const allMilestones = useLiveQuery(() => getMilestones(db), [])
  const [filter, setFilter] = useState<ProgressFilter>('all')
  const [viewing, setViewing] = useState<JournalEntry | null>(null)
  const entries = filter === 'milestones' ? [] : allEntries
  const milestones = filter === 'evidence' ? [] : (allMilestones ?? [])
  const photoCount = allEntries?.filter((entry) => entry.photo).length ?? 0
  const noteCount = (allEntries?.length ?? 0) - photoCount
  const groups = groupEntries(entries ?? [])
  const days = [...new Set([...groups.map((group) => group.day), ...milestones.map((item) => item.day)])].sort((a, b) =>
    b.localeCompare(a),
  )

  return (
    <>
      <div className="-mt-1 flex flex-wrap items-center gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={filter === option.id}
            onClick={() => setFilter(option.id)}
            className={cn(
              'min-h-9 rounded-full border px-3.5 text-sm',
              filter === option.id
                ? 'border-signal bg-signal/15 text-signal'
                : 'border-white/[0.08] bg-void/50 text-muted active:border-signal',
            )}
          >
            {option.label}
          </button>
        ))}
        {allEntries && allEntries.length > 0 && (
          <span className="text-xs text-muted">
            {photoCount} {photoCount === 1 ? 'foto' : 'fotos'} · {noteCount} {noteCount === 1 ? 'nota' : 'notas'}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-5">
        {allEntries && allMilestones && days.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="grid size-20 place-items-center rounded-full bg-signal/15 ring-2 ring-signal/40">
              <NotebookPen aria-hidden className="size-9 text-signal" />
            </span>
            <p className="font-display text-xl font-semibold">Aún no hay progreso registrado</p>
            <p className="text-sm text-muted">
              Aquí aparecen tus logros (niveles, actos, jefes y habilidades) y las fotos y notas de tus misiones.
            </p>
          </div>
        )}

        {days.map((day) => (
          <section key={day} aria-label={formatDay(day)} className="flex flex-col gap-2.5">
            <h2 className="sticky top-[env(safe-area-inset-top)] z-10 -mx-4 bg-void/85 px-4 py-1.5 font-display text-sm font-semibold tracking-wide text-muted uppercase backdrop-blur">
              {formatDay(day)}
            </h2>
            {milestones
              .filter((item) => item.day === day)
              .map((item) => {
                const Icon = MILESTONE_ICON[item.kind]
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border px-3 py-2.5',
                      item.kind === 'boss' ? 'border-ember/40 bg-ember/[0.06]' : 'border-signal/25 bg-signal/[0.05]',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-xl',
                        item.kind === 'boss' ? 'bg-ember/15 text-ember' : 'bg-signal/15 text-signal',
                      )}
                    >
                      <Icon aria-hidden className="size-4.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{item.title}</span>
                      {item.subtitle && <span className="block truncate text-xs text-muted">{item.subtitle}</span>}
                    </span>
                  </div>
                )
              })}
            {(groups.find((group) => group.day === day)?.tasks ?? []).map((task) => {
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
