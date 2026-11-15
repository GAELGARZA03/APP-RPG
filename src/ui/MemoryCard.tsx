import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, History } from 'lucide-react'
import { motion } from 'motion/react'
import { db } from '../data/appDb'
import { getMemory } from '../data/gameStore'
import type { GameDay } from '../game/gameDay'

/** Recuerdo discreto en Hoy: lo que escribiste el mismo día de hace un año o de hace un mes. */
export function MemoryCard({ today, onOpen }: { today: GameDay; onOpen: (day: GameDay) => void }) {
  const memory = useLiveQuery(() => getMemory(db, today), [today])
  if (!memory) return null
  const { label, note } = memory

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(note.id)}
      whileTap={{ scale: 0.985 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      aria-label={`${label}: abrir esa página del diario`}
      className="flex items-center gap-3 rounded-3xl border border-white/[0.08] bg-raised/60 p-3 text-left"
    >
      {note.photo ? (
        <img src={note.photo} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-info/15 text-info">
          <History aria-hidden className="size-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold tracking-wide text-info uppercase">{label}</span>
        <span className="line-clamp-2 text-sm">{note.text || 'Una foto de ese día'}</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
    </motion.button>
  )
}
